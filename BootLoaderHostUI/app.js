"use strict";

const APP_BASE = 0x08004000;
const APP_CONFIG_PAGE = 0x0801F800;
const TARGET_MAGIC = 0x50435648;
const ENTRY_BYTE = 0x45;
const BAUD_RATE = 115200;
const SOF = [0x48, 0x56, 0x42, 0x4c];
const HEADER_SIZE = 16;
const FRAME_CRC_SIZE = 4;
const MAX_PAYLOAD = 576;

const TYPE_HELLO = 0x01;
const TYPE_READY = 0x02;
const TYPE_BEGIN = 0x03;
const TYPE_BEGIN_ACK = 0x04;
const TYPE_REQUEST = 0x05;
const TYPE_DATA = 0x06;
const TYPE_STATUS = 0x07;
const TYPE_ABORT = 0x09;

const STATUS_TEXT = new Map([
  [0, "OK"],
  [1, "BUSY"],
  [2, "BAD_FRAME"],
  [3, "BAD_CRC"],
  [4, "BAD_SEQUENCE"],
  [5, "BAD_OFFSET"],
  [6, "BAD_LENGTH"],
  [7, "FLASH_ERROR"],
  [8, "IMAGE_CRC_ERROR"],
  [9, "IMAGE_INVALID"],
  [10, "TIMEOUT"],
  [11, "ABORTED"],
  [12, "ERASE_LIMIT"]
]);

const ui = {
  connectButton: document.getElementById("connectButton"),
  disconnectButton: document.getElementById("disconnectButton"),
  fileInput: document.getElementById("fileInput"),
  flashButton: document.getElementById("flashButton"),
  abortButton: document.getElementById("abortButton"),
  clearLogButton: document.getElementById("clearLogButton"),
  linkStatus: document.getElementById("linkStatus"),
  fileName: document.getElementById("fileName"),
  imageAddress: document.getElementById("imageAddress"),
  imageSize: document.getElementById("imageSize"),
  imageCrc: document.getElementById("imageCrc"),
  progressFill: document.getElementById("progressFill"),
  progressText: document.getElementById("progressText"),
  phaseText: document.getElementById("phaseText"),
  logOutput: document.getElementById("logOutput")
};

let port = null;
let reader = null;
let writer = null;
let readLoopDone = null;
let keepReading = false;
let rxQueue = [];
let pendingReadResolvers = [];
let image = null;
let abortRequested = false;

const crcTable = makeCrcTable();

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
}

function crc32(data, seed = 0xffffffff) {
  let crc = seed >>> 0;
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function crc32AccumulateRaw(data, rawSeed) {
  let crc = rawSeed >>> 0;
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return crc >>> 0;
}

function frameCrc(header, payload) {
  let raw = crc32AccumulateRaw(header, 0xffffffff);
  raw = crc32AccumulateRaw(payload, raw);
  return (raw ^ 0xffffffff) >>> 0;
}

function log(message) {
  const stamp = new Date().toLocaleTimeString();
  ui.logOutput.textContent += `[${stamp}] ${message}\n`;
  ui.logOutput.scrollTop = ui.logOutput.scrollHeight;
}

function setPhase(text) {
  ui.phaseText.textContent = text;
}

function setProgress(done, total) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (done / total) * 100)) : 0;
  ui.progressFill.style.width = `${pct.toFixed(1)}%`;
  ui.progressText.textContent = `${pct.toFixed(1)}%`;
}

function setConnected(connected) {
  ui.linkStatus.textContent = connected ? "CONNECTED" : "DISCONNECTED";
  ui.linkStatus.classList.toggle("connected", connected);
  ui.connectButton.disabled = connected;
  ui.disconnectButton.disabled = !connected;
  updateFlashEnabled();
}

function updateFlashEnabled() {
  ui.flashButton.disabled = !(port && writer && image);
}

function hex32(value) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
}

function readLe16(buf, off) {
  return buf[off] | (buf[off + 1] << 8);
}

function readLe32(buf, off) {
  return ((buf[off]) |
    (buf[off + 1] << 8) |
    (buf[off + 2] << 16) |
    (buf[off + 3] << 24)) >>> 0;
}

function writeLe16(buf, off, value) {
  buf[off] = value & 0xff;
  buf[off + 1] = (value >>> 8) & 0xff;
}

function writeLe32(buf, off, value) {
  buf[off] = value & 0xff;
  buf[off + 1] = (value >>> 8) & 0xff;
  buf[off + 2] = (value >>> 16) & 0xff;
  buf[off + 3] = (value >>> 24) & 0xff;
}

function buildFrame(type, seq, payload = new Uint8Array(0)) {
  if (payload.length > MAX_PAYLOAD) throw new Error("Payload too large.");

  const header = new Uint8Array(HEADER_SIZE);
  header.set(SOF, 0);
  header[4] = type;
  header[5] = 0;
  writeLe16(header, 6, seq);
  writeLe16(header, 8, payload.length);
  writeLe16(header, 10, (~payload.length) & 0xffff);
  writeLe32(header, 12, 0);

  const crc = frameCrc(header, payload);
  const frame = new Uint8Array(HEADER_SIZE + payload.length + FRAME_CRC_SIZE);
  frame.set(header, 0);
  frame.set(payload, HEADER_SIZE);
  writeLe32(frame, HEADER_SIZE + payload.length, crc);
  return frame;
}

async function writeBytes(data) {
  if (!writer) throw new Error("Serial port is not connected.");
  await writer.write(data);
}

function enqueueBytes(data) {
  for (const byte of data) rxQueue.push(byte);
  while (pendingReadResolvers.length && rxQueue.length) {
    const resolver = pendingReadResolvers.shift();
    resolver(rxQueue.shift());
  }
}

function readByte(timeoutMs) {
  if (rxQueue.length) return Promise.resolve(rxQueue.shift());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = pendingReadResolvers.indexOf(onByte);
      if (idx >= 0) pendingReadResolvers.splice(idx, 1);
      reject(new Error("Serial read timeout."));
    }, timeoutMs);
    function onByte(byte) {
      clearTimeout(timer);
      resolve(byte);
    }
    pendingReadResolvers.push(onByte);
  });
}

async function readFrame(timeoutMs = 2000) {
  let sofIndex = 0;
  const header = new Uint8Array(HEADER_SIZE);

  while (sofIndex < 4) {
    const byte = await readByte(timeoutMs);
    if (byte === SOF[sofIndex]) {
      header[sofIndex++] = byte;
    } else {
      sofIndex = byte === SOF[0] ? 1 : 0;
      if (sofIndex) header[0] = byte;
    }
  }

  for (let i = 4; i < HEADER_SIZE; i++) {
    header[i] = await readByte(timeoutMs);
  }

  const len = readLe16(header, 8);
  const lenInv = readLe16(header, 10);
  if (((~len) & 0xffff) !== lenInv) throw new Error("Frame length check failed.");
  if (len > MAX_PAYLOAD) throw new Error("Frame payload is too large.");

  const payload = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    payload[i] = await readByte(timeoutMs);
  }

  const crcBytes = new Uint8Array(4);
  for (let i = 0; i < 4; i++) {
    crcBytes[i] = await readByte(timeoutMs);
  }

  const expected = readLe32(crcBytes, 0);
  const actual = frameCrc(header, payload);
  if (actual !== expected) throw new Error(`Frame CRC mismatch ${hex32(actual)} != ${hex32(expected)}.`);

  return {
    type: header[4],
    seq: readLe16(header, 6),
    payload
  };
}

async function connect() {
  if (!("serial" in navigator)) {
    throw new Error("This browser does not support Web Serial.");
  }
  port = await navigator.serial.requestPort();
  await port.open({ baudRate: BAUD_RATE, dataBits: 8, stopBits: 1, parity: "none", flowControl: "none", bufferSize: 4096 });
  if (port.setSignals) {
    await port.setSignals({ dataTerminalReady: false, requestToSend: false }).catch(() => {});
  }
  writer = port.writable.getWriter();
  rxQueue = [];
  pendingReadResolvers = [];
  keepReading = true;
  readLoopDone = readLoop();
  setConnected(true);
  log("Serial connected at 115200 8N1.");
}

async function readLoop() {
  // Web Serial surfaces recoverable transport faults (buffer overrun, framing,
  // parity, break) by *erroring the ReadableStream*. When that happens the
  // current reader is dead, but the port is still fine: release the lock, grab a
  // fresh reader, and keep going. Treating the first error as fatal (the old
  // behaviour) silently kills all reception for the rest of the session.
  while (port && port.readable && keepReading) {
    reader = port.readable.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) enqueueBytes(value);
      }
    } catch (error) {
      if (keepReading) log(`Serial read error (recovering): ${error.message}`);
    } finally {
      try { reader.releaseLock(); } catch (e) { /* already released */ }
      reader = null;
    }
  }
}

async function disconnect() {
  abortRequested = true;
  keepReading = false;
  if (reader) {
    // Unblocks the pending read(); readLoop's finally releases the lock.
    await reader.cancel().catch(() => {});
  }
  if (readLoopDone) {
    await readLoopDone.catch(() => {});
    readLoopDone = null;
  }
  if (writer) {
    writer.releaseLock();
    writer = null;
  }
  if (port) {
    await port.close().catch(() => {});
    port = null;
  }
  setConnected(false);
  log("Serial disconnected.");
}

function parseHexByte(text) {
  const value = Number.parseInt(text, 16);
  if (!Number.isFinite(value)) throw new Error(`Bad HEX byte: ${text}`);
  return value & 0xff;
}

function parseIntelHex(text) {
  const bytes = new Map();
  let upper = 0;
  let minAddr = 0xffffffff;
  let maxAddr = 0;

  const lines = text.split(/\r?\n/);
  for (let lineNo = 0; lineNo < lines.length; lineNo++) {
    const raw = lines[lineNo].trim();
    if (!raw) continue;
    if (!raw.startsWith(":")) throw new Error(`HEX line ${lineNo + 1}: missing ':'`);

    const count = parseHexByte(raw.slice(1, 3));
    const addr = Number.parseInt(raw.slice(3, 7), 16);
    const type = parseHexByte(raw.slice(7, 9));
    const expectedLen = 11 + count * 2;
    if (raw.length < expectedLen) throw new Error(`HEX line ${lineNo + 1}: too short`);

    let sum = count + ((addr >>> 8) & 0xff) + (addr & 0xff) + type;
    const data = [];
    for (let i = 0; i < count; i++) {
      const byte = parseHexByte(raw.slice(9 + i * 2, 11 + i * 2));
      data.push(byte);
      sum += byte;
    }
    const checksum = parseHexByte(raw.slice(9 + count * 2, 11 + count * 2));
    sum = (sum + checksum) & 0xff;
    if (sum !== 0) throw new Error(`HEX line ${lineNo + 1}: checksum failed`);

    if (type === 0x00) {
      const base = (upper + addr) >>> 0;
      for (let i = 0; i < data.length; i++) {
        const absolute = (base + i) >>> 0;
        bytes.set(absolute, data[i]);
        if (absolute < minAddr) minAddr = absolute;
        if ((absolute + 1) > maxAddr) maxAddr = absolute + 1;
      }
    } else if (type === 0x01) {
      break;
    } else if (type === 0x04) {
      if (count !== 2) throw new Error(`HEX line ${lineNo + 1}: bad extended linear address`);
      upper = (((data[0] << 8) | data[1]) << 16) >>> 0;
    } else if (type === 0x02) {
      if (count !== 2) throw new Error(`HEX line ${lineNo + 1}: bad extended segment address`);
      upper = (((data[0] << 8) | data[1]) << 4) >>> 0;
    } else if (type === 0x05 || type === 0x03) {
      continue;
    } else {
      throw new Error(`HEX line ${lineNo + 1}: unsupported record type ${type}`);
    }
  }

  if (bytes.size === 0) throw new Error("HEX contains no data.");
  if (minAddr < APP_BASE || maxAddr > APP_CONFIG_PAGE) {
    throw new Error(`HEX range ${hex32(minAddr)}-${hex32(maxAddr)} is outside App region.`);
  }

  const size = maxAddr - APP_BASE;
  const image = new Uint8Array(size);
  image.fill(0xff);
  for (const [addr, byte] of bytes) {
    image[addr - APP_BASE] = byte;
  }
  return { base: APP_BASE, minAddr, maxAddr, data: image };
}

async function loadFile(file) {
  const name = file.name || "";
  let parsed;
  if (name.toLowerCase().endsWith(".hex")) {
    parsed = parseIntelHex(await file.text());
  } else {
    const data = new Uint8Array(await file.arrayBuffer());
    if (data.length === 0) throw new Error("BIN file is empty.");
    if (APP_BASE + data.length > APP_CONFIG_PAGE) throw new Error("BIN is too large for App region.");
    parsed = { base: APP_BASE, minAddr: APP_BASE, maxAddr: APP_BASE + data.length, data };
  }

  image = {
    name,
    base: parsed.base,
    minAddr: parsed.minAddr,
    maxAddr: parsed.maxAddr,
    data: parsed.data,
    crc: crc32(parsed.data)
  };

  ui.fileName.textContent = image.name || "--";
  ui.imageAddress.textContent = `${hex32(image.minAddr)} - ${hex32(image.maxAddr)}`;
  ui.imageSize.textContent = `${image.data.length} bytes`;
  ui.imageCrc.textContent = hex32(image.crc);
  setProgress(0, image.data.length);
  setPhase("Ready");
  updateFlashEnabled();
  log(`Loaded ${image.name}: ${image.data.length} bytes, CRC ${hex32(image.crc)}.`);
}

function makeBeginPayload(ready) {
  const payload = new Uint8Array(20);
  writeLe32(payload, 0, image.data.length);
  writeLe32(payload, 4, image.crc);
  writeLe32(payload, 8, ready.appBase);
  writeLe32(payload, 12, image.minAddr);
  writeLe32(payload, 16, image.maxAddr);
  return payload;
}

function parseReady(payload) {
  if (payload.length < 24) throw new Error("READY payload is too short.");
  return {
    appBase: readLe32(payload, 0),
    appMaxSize: readLe32(payload, 4),
    pageSize: readLe32(payload, 8),
    chunkSize: readLe32(payload, 12),
    version: readLe32(payload, 16),
    flags: readLe32(payload, 20)
  };
}

function parseStatus(payload) {
  if (payload.length < 16) throw new Error("STATUS payload is too short.");
  return {
    status: readLe32(payload, 0),
    detail: readLe32(payload, 4),
    offset: readLe32(payload, 8),
    received: readLe32(payload, 12)
  };
}

function parseRequest(payload) {
  if (payload.length < 16) throw new Error("REQUEST payload is too short.");
  return {
    offset: readLe32(payload, 0),
    length: readLe32(payload, 4),
    received: readLe32(payload, 8),
    total: readLe32(payload, 12)
  };
}

async function entrySpam(signal) {
  const chunk = new Uint8Array([ENTRY_BYTE]);
  while (!signal.aborted) {
    await writeBytes(chunk);
    await delay(10);
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function flashFirmware() {
  if (!image) throw new Error("No firmware selected.");
  if (!writer) throw new Error("Serial port is not connected.");

  abortRequested = false;
  rxQueue = [];
  ui.flashButton.disabled = true;
  ui.abortButton.disabled = false;
  setProgress(0, image.data.length);
  setPhase("Waiting for reset");
  log("Sending 0x45 entry stream. Press the target RST now.");

  const spamController = new AbortController();
  const spamPromise = entrySpam(spamController.signal).catch(error => {
    if (!spamController.signal.aborted) log(`Entry stream stopped: ${error.message}`);
  });

  let ready = null;
  try {
    const hello = buildFrame(TYPE_HELLO, 0);
    let lastHello = 0;
    const start = performance.now();
    while (!ready) {
      if (abortRequested) throw new Error("Aborted by user.");
      if (performance.now() - start > 15000) throw new Error("Bootloader did not respond.");
      if (performance.now() - lastHello > 250) {
        await writeBytes(hello);
        lastHello = performance.now();
      }
      try {
        const frame = await readFrame(300);
        if (frame.type === TYPE_READY) {
          ready = parseReady(frame.payload);
          log(`Bootloader ready: App ${hex32(ready.appBase)}, max ${ready.appMaxSize} bytes, chunk ${ready.chunkSize}.`);
        }
      } catch {
        await delay(50);
      }
    }
  } finally {
    spamController.abort();
    await spamPromise;
  }

  if (ready.appBase !== APP_BASE) throw new Error(`Bootloader App base mismatch: ${hex32(ready.appBase)}.`);
  if (ready.flags !== TARGET_MAGIC) throw new Error(`Target pairing failed: ${hex32(ready.flags)}.`);
  if (image.data.length > ready.appMaxSize) throw new Error("Firmware exceeds bootloader App limit.");

  setPhase("Erasing");
  log("Sending manifest and waiting for erase.");
  await writeBytes(buildFrame(TYPE_BEGIN, 0, makeBeginPayload(ready)));
  let beginAck = null;
  const beginAckStart = performance.now();
  while (!beginAck) {
    if (performance.now() - beginAckStart > 12000) throw new Error("BEGIN_ACK timeout.");
    let frame;
    try {
      frame = await readFrame(1200);
    } catch (error) {
      if (error.message.includes("timeout")) continue;
      throw error;
    }
    if (frame.type === TYPE_READY) continue;
    if (frame.type === TYPE_BEGIN_ACK) {
      beginAck = frame;
      break;
    }
    if (frame.type === TYPE_STATUS) {
      const status = parseStatus(frame.payload);
      throw new Error(`BEGIN failed: ${STATUS_TEXT.get(status.status) || status.status}, detail ${status.detail}.`);
    }
    throw new Error("Expected BEGIN_ACK.");
  }
  const beginStatus = parseStatus(beginAck.payload);
  if (beginStatus.status !== 0) {
    throw new Error(`BEGIN failed: ${STATUS_TEXT.get(beginStatus.status) || beginStatus.status}, detail ${beginStatus.detail}.`);
  }

  setPhase("Programming");
  log("Programming started.");
  for (;;) {
    if (abortRequested) {
      await writeBytes(buildFrame(TYPE_ABORT, 0));
      throw new Error("Aborted by user.");
    }

    const frame = await readFrame(6000);
    if (frame.type === TYPE_REQUEST) {
      const req = parseRequest(frame.payload);
      if (req.offset + req.length > image.data.length) {
        throw new Error(`Bootloader requested invalid range ${req.offset}+${req.length}.`);
      }
      const chunk = image.data.slice(req.offset, req.offset + req.length);
      const payload = new Uint8Array(12 + chunk.length);
      writeLe32(payload, 0, req.offset);
      writeLe32(payload, 4, chunk.length);
      writeLe32(payload, 8, crc32(chunk));
      payload.set(chunk, 12);
      await writeBytes(buildFrame(TYPE_DATA, frame.seq, payload));
      setProgress(req.offset + req.length, image.data.length);
      setPhase(`Programming ${req.offset + req.length}/${image.data.length}`);
    } else if (frame.type === TYPE_READY) {
      continue;
    } else if (frame.type === TYPE_STATUS) {
      const status = parseStatus(frame.payload);
      if (status.status !== 0) {
        throw new Error(`Flash failed: ${STATUS_TEXT.get(status.status) || status.status}, detail ${status.detail}.`);
      }
      setProgress(image.data.length, image.data.length);
      setPhase("Done");
      log("Firmware programmed and verified. Target will reset.");
      break;
    }
  }
}

ui.connectButton.addEventListener("click", () => {
  connect().catch(error => log(`Connect failed: ${error.message}`));
});

ui.disconnectButton.addEventListener("click", () => {
  disconnect().catch(error => log(`Disconnect failed: ${error.message}`));
});

ui.fileInput.addEventListener("change", () => {
  const file = ui.fileInput.files && ui.fileInput.files[0];
  if (!file) return;
  loadFile(file).catch(error => {
    image = null;
    updateFlashEnabled();
    log(`File load failed: ${error.message}`);
  });
});

ui.flashButton.addEventListener("click", () => {
  flashFirmware()
    .catch(error => {
      setPhase("Failed");
      log(`Flash failed: ${error.message}`);
    })
    .finally(() => {
      ui.abortButton.disabled = true;
      updateFlashEnabled();
    });
});

ui.abortButton.addEventListener("click", () => {
  abortRequested = true;
  log("Abort requested.");
});

ui.clearLogButton.addEventListener("click", () => {
  ui.logOutput.textContent = "";
});

setConnected(false);

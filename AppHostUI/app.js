// ============================================================
// G474 HVCCPS HostUI2.0
// Main monitor stays visible; connect, run, and configuration
// live in separate drawers. Single-cycle waveform is a dedicated
// full-screen overlay (NOT a cramped subpanel).
// ============================================================

const protocol = window.HvccpsProtocol;
if (!protocol) throw new Error("HvccpsProtocol is not loaded.");
const historyLib = window.HvccpsHistory;
if (!historyLib) throw new Error("HvccpsHistory is not loaded.");

const {
  MAX_CV_V,
  MAX_CC_MA,
  MAX_CP_W,
  RUN_CONTINUOUS,
  SAMPLES_PER_PERIOD,
  ADC1_FULL_SCALE,
  ADC2_FULL_SCALE,
  CONFIG_FIELDS,
  CONFIG_STATUS,
  CONFIG_OP_GET_SNAPSHOT,
  CONFIG_OP_SET_FIELD,
  CONFIG_OP_APPLY_DRAFT,
  CONFIG_OP_SAVE_DRAFT,
  CONFIG_OP_LOAD_FLASH,
  CONFIG_OP_LOAD_DEFAULTS,
  CONFIG_OP_FACTORY_RESET,
  validateConfigForm,
  buildConfigRequest,
  buildConfigSetFieldRequest,
  buildCommandFrame,
  cloneDefaultSettings,
  createLatest,
  createHeartbeatDecoder,
  parseHeartbeatFrame,
  createConfigResponseDecoder,
  parseConfigResponseFrame
} = protocol;

const CHART_WINDOW_MS = 20000;
const CHART_SAMPLE_MS = 20;
const CHART_FRAME_MIN_MS = 1000 / 60;
const PACKET_RATE_WINDOW_MS = 1000;
const CONFIG_REQUEST_TIMEOUT_MS = 1800;
const AUTO_RECONNECT_DELAY_MS = 500;
const CHART_SELECTION_STORAGE_KEY = "g474-hvccps2-chart-selection-v1";
const CYCLE_PREFS_STORAGE_KEY = "g474-hvccps2-cycle-prefs-v1";
const DEFAULT_CHART_METRICS = ["vSecV", "iSecmA", "iPriAcA"];
const CHART_GROUP_ORDER = ["Voltage", "Current", "Power", "Temperature", "Control", "ISR", "Status", "Debug"];
const CPU_CLOCK_HZ = 170_000_000;
const CPU_CYCLE_NS = 1e9 / CPU_CLOCK_HZ;
const KEY_METRIC_KEYS = ["vSecV", "iSecmA", "iPriAcA", "iPriDcA", "vPriV", "cvTargetV", "ccTargetmA", "cpTargetW", "outputPowerW"];
const DEBUG_METRIC_KEYS = new Set([
  "statusFlags", "keyFlags", "controlMode",
  "configOk", "fixedDutyActive", "runSecondsRemaining"
]);

function formatSig(value, digits = 4) {
  if (!Number.isFinite(value)) return "0";
  if (Object.is(value, -0) || value === 0) return "0";
  const text = Number(value).toPrecision(digits);
  return text.includes("e") ? text : text.replace(/\.?0+$/, "");
}

function formatVoltageMv(mV) {
  return Math.abs(mV) < 1000 ? `${formatSig(mV)} mV` : `${formatSig(mV / 1000)} V`;
}

function formatCurrentMa(mA) {
  return Math.abs(mA) < 1000 ? `${formatSig(mA)} mA` : `${formatSig(mA / 1000)} A`;
}

function formatPowerMw(mW) {
  return Math.abs(mW) < 1000 ? `${formatSig(mW)} mW` : `${formatSig(mW / 1000)} W`;
}

function formatTemperatureMc(mC) {
  return `${formatSig(mC / 1000)} C`;
}

function formatPercentRatio(value) {
  return `${formatSig(value * 100)} %`;
}

function formatDurationMs(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "0 s";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${formatSig(ms / 1000)} s`;
}

function formatCyclesUs(cycles) {
  if (!Number.isFinite(cycles) || cycles === 0) return "0 us";
  return `${formatSig(cycles * CPU_CYCLE_NS / 1000)} us`;
}

function outputPowerMw(latest) {
  // P_out = Vsec * Isec. vSecMv [mV] * iSecMa [mA] = 1e-6 W = uW; /1000 -> mW.
  return (latest.vSecMv * latest.iSecMa) / 1000;
}

function efficiencyRatio(latest) {
  // Input power from the primary DC bus current (IPRI_DC). IPRI_AC carries
  // PSFB reactive current and is a peak-only protection readout, not real power.
  const inputPower = latest.iPriDcMa * latest.vPriMv;
  const outputPower = latest.iSecMa * latest.vSecMv;
  return inputPower === 0 ? NaN : outputPower / inputPower;
}

function createRunSummaryStats() {
  return {
    currentActive: false,
    currentStartedAt: 0,
    currentLastAt: 0,
    currentPackets: 0,
    currentDutySum: 0,
    currentIpriSumMa: 0,
    currentIsecSumMa: 0,
    currentVpriSumMv: 0,
    currentVsecSumMv: 0,
    currentFreqHz: 0,
    lastStartedAt: 0,
    lastEndedAt: 0,
    lastPackets: 0,
    lastDutySum: 0,
    lastIpriSumMa: 0,
    lastIsecSumMa: 0,
    lastVpriSumMv: 0,
    lastVsecSumMv: 0,
    lastFreqHz: 0,
    summaryVisible: false
  };
}

function formatUnit(value, unit) {
  return unit ? `${formatSig(value)} ${unit}` : formatSig(value);
}

function modeLabel(mode, enabled, fixedDuty) {
  if (!enabled) return "MODE --";
  if (fixedDuty) return "MODE FIXED";
  if (mode === 1) return "MODE CC";
  if (mode === 2) return "MODE CV";
  if (mode === 3) return "MODE CP";
  return "MODE ?";
}

function keyLabel(flags) {
  const labels = [];
  if ((flags & 0x01) !== 0) labels.push("A");
  if ((flags & 0x02) !== 0) labels.push("B");
  if ((flags & 0x04) !== 0) labels.push("C");
  if ((flags & 0x08) !== 0) labels.push("D");
  return labels.length > 0 ? `KEY ${labels.join(" ")}` : "KEY NONE";
}

const TELEMETRY_METRICS = [
  { key: "vSecV", label: "VSEC", group: "Voltage", color: "#b45309", axisLabel: "VSEC / V", read: (l) => l.vSecMv / 1000, format: (l) => formatVoltageMv(l.vSecMv) },
  { key: "vPriV", label: "VBUS", group: "Voltage", color: "#ca8a04", axisLabel: "VBUS / V", read: (l) => l.vPriMv / 1000, format: (l) => formatVoltageMv(l.vPriMv) },
  { key: "aux12V", label: "AUX12", group: "Voltage", color: "#7c3aed", axisLabel: "AUX12 / V", read: (l) => l.aux12Mv / 1000, format: (l) => formatVoltageMv(l.aux12Mv) },
  { key: "aux5V", label: "AUX5", group: "Voltage", color: "#9333ea", axisLabel: "AUX5 / V", read: (l) => l.aux5Mv / 1000, format: (l) => formatVoltageMv(l.aux5Mv) },
  { key: "vccV", label: "VCC", group: "Voltage", color: "#2563eb", axisLabel: "VCC / V", read: (l) => l.vccMv / 1000, format: (l) => formatVoltageMv(l.vccMv) },
  { key: "cvTargetV", label: "CV TARGET", group: "Voltage", color: "#0891b2", axisLabel: "CV TARGET / V", read: (l) => l.cvTargetMv / 1000, format: (l) => formatVoltageMv(l.cvTargetMv) },

  { key: "iSecmA", label: "ISEC", group: "Current", color: "#0f766e", axisLabel: "ISEC / mA", read: (l) => l.iSecMa, format: (l) => formatCurrentMa(l.iSecMa) },
  { key: "iPriAcA", label: "IPRI AC PK", group: "Current", color: "#16a34a", axisLabel: "IPRI AC PK / A", read: (l) => l.iPriAcMa / 1000, format: (l) => formatCurrentMa(l.iPriAcMa) },
  { key: "iPriDcA", label: "IPRI DC", group: "Current", color: "#15803d", axisLabel: "IPRI DC / A", read: (l) => l.iPriDcMa / 1000, format: (l) => formatCurrentMa(l.iPriDcMa) },
  { key: "ccTargetmA", label: "CC TARGET", group: "Current", color: "#0d9488", axisLabel: "CC TARGET / mA", read: (l) => l.ccTargetMa, format: (l) => formatCurrentMa(l.ccTargetMa) },

  { key: "cpTargetW", label: "CP TARGET", group: "Power", color: "#ea580c", axisLabel: "CP TARGET / W", read: (l) => l.cpTargetMw / 1000, format: (l) => formatPowerMw(l.cpTargetMw) },
  { key: "outputPowerW", label: "OUTPUT POWER", group: "Power", color: "#d97706", axisLabel: "OUTPUT POWER / W", read: (l) => outputPowerMw(l) / 1000, format: (l) => formatPowerMw(outputPowerMw(l)) },
  { key: "efficiencyPct", label: "Eff", group: "Power", color: "#b91c1c", axisLabel: "EFF / %", read: (l) => efficiencyRatio(l) * 100, format: (l) => formatPercentRatio(efficiencyRatio(l)) },

  { key: "mosTempC", label: "MOS TEMP", group: "Temperature", color: "#dc2626", axisLabel: "MOS TEMP / C", read: (l) => l.mosTempMc / 1000, format: (l) => formatTemperatureMc(l.mosTempMc) },
  { key: "internalTempC", label: "MCU TEMP", group: "Temperature", color: "#be123c", axisLabel: "MCU TEMP / C", read: (l) => l.internalTempMc / 1000, format: (l) => formatTemperatureMc(l.internalTempMc) },

  { key: "dutyPct", label: "DUTY", group: "Control", color: "#334155", axisLabel: "DUTY / %", read: (l) => l.duty * 100, format: (l) => formatPercentRatio(l.duty) },
  { key: "freqKHz", label: "FREQ", group: "Control", color: "#0f766e", axisLabel: "FREQ / kHz", read: (l) => l.currentFreqHz / 1000, format: (l) => l.currentFreqHz > 0 ? `${formatSig(l.currentFreqHz / 1000)} kHz` : "--" },
  { key: "cvValuePct", label: "CV OUT", group: "Control", color: "#0284c7", axisLabel: "CV OUT / %", read: (l) => l.cvValue * 100, format: (l) => formatPercentRatio(l.cvValue) },
  { key: "cvIntegral", label: "CV I", group: "Control", color: "#0369a1", axisLabel: "CV I", read: (l) => l.cvIntegral, format: (l) => formatUnit(l.cvIntegral, "") },
  { key: "ccValuePct", label: "CC OUT", group: "Control", color: "#047857", axisLabel: "CC OUT / %", read: (l) => l.ccValue * 100, format: (l) => formatPercentRatio(l.ccValue) },
  { key: "ccIntegral", label: "CC I", group: "Control", color: "#166534", axisLabel: "CC I", read: (l) => l.ccIntegral, format: (l) => formatUnit(l.ccIntegral, "") },
  { key: "cpValuePct", label: "CP OUT", group: "Control", color: "#c2410c", axisLabel: "CP OUT / %", read: (l) => l.cpValue * 100, format: (l) => formatPercentRatio(l.cpValue) },
  { key: "cpIntegral", label: "CP I", group: "Control", color: "#9a3412", axisLabel: "CP I", read: (l) => l.cpIntegral, format: (l) => formatUnit(l.cpIntegral, "") },

  { key: "isrLastUs", label: "ISR LAST", group: "ISR", color: "#0ea5e9", axisLabel: "ISR LAST / us", read: (l) => l.isrCyclesLast * CPU_CYCLE_NS / 1000, format: (l) => formatCyclesUs(l.isrCyclesLast) },
  { key: "isrMinUs",  label: "ISR MIN",  group: "ISR", color: "#0284c7", axisLabel: "ISR MIN / us",  read: (l) => l.isrCyclesMin * CPU_CYCLE_NS / 1000,  format: (l) => formatCyclesUs(l.isrCyclesMin) },
  { key: "isrMaxUs",  label: "ISR MAX",  group: "ISR", color: "#dc2626", axisLabel: "ISR MAX / us",  read: (l) => l.isrCyclesMax * CPU_CYCLE_NS / 1000,  format: (l) => formatCyclesUs(l.isrCyclesMax) },

  { key: "statusFlags", label: "STATUS", group: "Status", color: "#71717a", axisLabel: "STATUS", read: (l) => l.statusFlags, format: (l) => `0x${l.statusFlags.toString(16).padStart(2, "0")}` },
  { key: "keyFlags", label: "KEY FLAGS", group: "Status", color: "#52525b", axisLabel: "KEY FLAGS", read: (l) => l.keyFlags, format: (l) => `0x${l.keyFlags.toString(16).padStart(2, "0")}` },
  { key: "controlMode", label: "MODE RAW", group: "Status", color: "#3f3f46", axisLabel: "MODE RAW", read: (l) => l.controlMode, format: (l) => String(l.controlMode) },

  { key: "configOk", label: "CONFIG OK", group: "Debug", color: "#15803d", axisLabel: "CONFIG OK", read: (l) => l.configOk ? 1 : 0, format: (l) => l.configOk ? "1" : "0" },
  { key: "fixedDutyActive", label: "FIXED DUTY", group: "Debug", color: "#a16207", axisLabel: "FIXED DUTY", read: (l) => l.fixedDutyActive ? 1 : 0, format: (l) => l.fixedDutyActive ? "1" : "0" },
  {
    key: "runSecondsRemaining", label: "RUN LEFT", group: "Debug", color: "#6d28d9", axisLabel: "RUN LEFT / s",
    read: (l) => l.runSecondsRemaining === RUN_CONTINUOUS ? 0 : l.runSecondsRemaining,
    format: (l) => l.runSecondsRemaining === 0 ? "0 s" : l.runSecondsRemaining === RUN_CONTINUOUS ? "CONT" : `${l.runSecondsRemaining} s`
  }
];

const METRIC_MAP = Object.fromEntries(TELEMETRY_METRICS.map((metric) => [metric.key, metric]));

// Per-channel sample-time offset within an ADC trigger slot.
//
// All ranks of an ADC run in series after the same HRTIM trigger,
// so rank `r` only starts its sample-and-hold AFTER all previous ranks
// have finished their (sample + conversion) cycles. We treat the
// "effective sample instant" as the middle of the sample-and-hold
// window of each rank. ADC clock = 42.5 MHz (=> 23.53 ns/cyc).
//
//   ADC1 (12-bit): per rank = 2.5 S+H + 12.5 conv = 15 cyc
//     rank 0 (VSEC)  S+H center = 1.25 cyc  -> ~29.4 ns from trigger
//     rank 1 (VPRI)  S+H center = 16.25 cyc -> ~382.4 ns
//   ADC2 (8-bit):  per rank = 2.5 S+H + 8.5 conv = 11 cyc
//     rank 0 (IPRI_AC)  S+H center = 1.25 cyc  -> ~29.4 ns
//     rank 1 (ISEC)     S+H center = 12.25 cyc -> ~288.2 ns
//     rank 2 (IPRI_DC)  S+H center = 23.25 cyc -> ~547.0 ns
//
// These offsets are small but real -- at 50 kHz one switching period is
// 20 us and a single trigger slot is 833 ns, so the spread within ADC2
// alone (29..547 ns) is a noticeable fraction of one slot. We render
// each signal's dots at its true (trigger + offset) X position so the
// operator can see exactly when each sample was actually taken.
const ADC_CLOCK_NS = 1e9 / 42_500_000;
const ADC1_RANK_CYCLES = 15;
const ADC2_RANK_CYCLES = 11;
const ADC1_SH_CYCLES = 2.5;
const ADC2_SH_CYCLES = 2.5;
function adc1RankSampleDelayNs(rank) {
  return (rank * ADC1_RANK_CYCLES + ADC1_SH_CYCLES / 2) * ADC_CLOCK_NS;
}
function adc2RankSampleDelayNs(rank) {
  return (rank * ADC2_RANK_CYCLES + ADC2_SH_CYCLES / 2) * ADC_CLOCK_NS;
}

// Channels are listed in the actual hardware sampling order (ADC1
// runs in parallel with ADC2 off the same HRTIM TRG1, so rank-0 of
// each bank goes first at ~29 ns from the trigger; subsequent ranks
// stack after their predecessor finishes its full S+H + conversion).
const CYCLE_SIGNALS = [
  // ADC1 rank 0 - fires immediately on trigger (~29 ns).
  {
    key: "vsec", label: "VSEC", color: "#b45309", unit: "V",
    samples: (l) => l.vsecSamples, fullScale: ADC1_FULL_SCALE,
    adcBank: "ADC1", rank: 0, sampleDelayNs: adc1RankSampleDelayNs(0),
    toUnit: (raw, l) => (raw * l.vccMv / ADC1_FULL_SCALE) // 1:1000 attenuator -> volts
  },
  // ADC2 rank 0 - fires in parallel with ADC1 rank 0 (~29 ns).
  {
    key: "ipriAc", label: "IPRI AC", color: "#16a34a", unit: "A",
    samples: (l) => l.ipriAcSamples, fullScale: ADC2_FULL_SCALE,
    adcBank: "ADC2", rank: 0, sampleDelayNs: adc2RankSampleDelayNs(0),
    // 1:200 CT + 7.5R + |.| rectifier -> mA per mV = 200/7.5, then /1000 for A.
    toUnit: (raw, l) => ((raw * l.vccMv / ADC2_FULL_SCALE) * (200 / 7.5)) / 1000
  },
  // ADC2 rank 1 - after rank 0 finishes (11 cyc) -> ~288 ns.
  {
    key: "isec", label: "ISEC", color: "#0f766e", unit: "mA",
    samples: (l) => l.isecSamples, fullScale: ADC2_FULL_SCALE,
    adcBank: "ADC2", rank: 1, sampleDelayNs: adc2RankSampleDelayNs(1),
    toUnit: (raw, l) => (raw * l.vccMv / ADC2_FULL_SCALE) * 0.1626
  },
  // ADC1 rank 1 - after ADC1 rank 0 finishes (15 cyc) -> ~382 ns.
  {
    key: "vpri", label: "VBUS", color: "#ca8a04", unit: "V",
    samples: (l) => l.vpriSamples, fullScale: ADC1_FULL_SCALE,
    adcBank: "ADC1", rank: 1, sampleDelayNs: adc1RankSampleDelayNs(1),
    toUnit: (raw, l) => (raw * l.vccMv / ADC1_FULL_SCALE) * 17 / 1000
  },
  // ADC2 rank 2 - after rank 1 finishes (22 cyc) -> ~547 ns. Last sample.
  {
    key: "ipriDc", label: "IPRI DC", color: "#15803d", unit: "A",
    samples: (l) => l.ipriDcSamples, fullScale: ADC2_FULL_SCALE,
    adcBank: "ADC2", rank: 2, sampleDelayNs: adc2RankSampleDelayNs(2),
    toUnit: (raw, l) => {
      const sensorMv = raw * l.vccMv / ADC2_FULL_SCALE;
      const zeroMv = 2500;  // ACS712 fixed 2.5 V zero point (matches firmware)
      const ma = (zeroMv - sensorMv) * 10;
      return (ma < 0 ? 0 : ma) / 1000;
    }
  }
];

function createSeriesStore() {
  const store = {};
  for (const metric of TELEMETRY_METRICS) {
    store[metric.key] = [];
  }
  return store;
}

function normalizeChartSelection(keys) {
  if (!Array.isArray(keys)) return [];
  const seen = new Set();
  const out = [];
  for (const key of keys) {
    if (typeof key === "string" && METRIC_MAP[key] && !seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

function loadChartSelection() {
  try {
    const raw = window.localStorage.getItem(CHART_SELECTION_STORAGE_KEY);
    if (raw === null) return DEFAULT_CHART_METRICS.slice();
    const normalized = normalizeChartSelection(JSON.parse(raw));
    return normalized.length > 0 ? normalized : DEFAULT_CHART_METRICS.slice();
  } catch (error) {
    logError("LOAD CHART SELECTION FAILED", error);
    return DEFAULT_CHART_METRICS.slice();
  }
}

function saveChartSelection() {
  try {
    window.localStorage.setItem(CHART_SELECTION_STORAGE_KEY, JSON.stringify(state.selectedChartMetrics));
  } catch (error) {
    logError("SAVE CHART SELECTION FAILED", error);
  }
}

function loadCyclePrefs() {
  try {
    const raw = window.localStorage.getItem(CYCLE_PREFS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const enabled = {};
    for (const sig of CYCLE_SIGNALS) {
      enabled[sig.key] = parsed && parsed.enabled && (sig.key in parsed.enabled)
        ? !!parsed.enabled[sig.key]
        : true;
    }
    return {
      enabled,
      showPwm: parsed.showPwm !== false,
      yMode: parsed.yMode === "physical" ? "physical" : "normalized"
    };
  } catch (error) {
    logError("LOAD CYCLE PREFS FAILED", error);
    const enabled = {};
    for (const sig of CYCLE_SIGNALS) enabled[sig.key] = true;
    return { enabled, showPwm: true, yMode: "normalized" };
  }
}

function saveCyclePrefs() {
  try {
    window.localStorage.setItem(CYCLE_PREFS_STORAGE_KEY, JSON.stringify(state.cyclePrefs));
  } catch (error) {
    logError("SAVE CYCLE PREFS FAILED", error);
  }
}

const state = {
  opState: "disconnected",
  selectedPort: null,
  port: null,
  reader: null,
  readTask: null,
  connected: false,
  disconnectRequested: false,
  autoReconnectEnabled: false,
  connectInProgress: false,
  reconnectTimer: 0,
  reconnectAttempt: 0,
  packetCounter: 0,
  packetRate: 0,
  packetRateWindowStart: performance.now(),
  latest: createLatest(),
  heartbeatDecoder: createHeartbeatDecoder(),
  configDecoder: createConfigResponseDecoder(),
  settingsForm: cloneDefaultSettings(),
  deviceDraftConfig: null,
  deviceActiveConfig: null,
  configRequestSeq: 0,
  pendingConfigOp: null,
  pendingConfigAt: 0,
  selectedChartMetrics: loadChartSelection(),
  chartSignalQuery: "",
  chartSignalsOpen: false,
  chartPaused: false,
  chart: null,
  chartRafId: 0,
  chartLastFrameAt: 0,
  chartNow: performance.now(),
  series: createSeriesStore(),
  activeDrawer: null,
  activeConfigTab: "loop",
  debugPanelOpen: false,
  runSummaryStats: createRunSummaryStats(),
  cyclePrefs: loadCyclePrefs(),
  cycleOpen: false,
  toastSeq: 0
};

let history = null;

const ui = {
  metricValues: {},
  chartMetricCheckboxes: {},
  cycleSignalCheckboxes: {},
  cycleValueCells: {},
  configInputs: {}
};

function logError(message, error = null) {
  if (error) {
    console.error(`[HostUI2.0] ${message}`, error);
  } else {
    console.error(`[HostUI2.0] ${message}`);
  }
}

function showToast(message, isError = false) {
  if (!ui.toastStack) return;
  const toast = document.createElement("div");
  toast.className = `toast ${isError ? "toast-error" : "toast-info"}`;
  toast.dataset.toastId = String(++state.toastSeq);

  const text = document.createElement("span");
  text.className = "toast-text";
  text.textContent = message;

  const closeButton = document.createElement("button");
  closeButton.className = "toast-close";
  closeButton.type = "button";
  closeButton.textContent = "x";
  closeButton.setAttribute("aria-label", "Dismiss");

  toast.append(text, closeButton);
  ui.toastStack.append(toast);

  const close = () => {
    toast.classList.add("toast-leaving");
    window.setTimeout(() => toast.remove(), 180);
  };
  const timer = window.setTimeout(close, isError ? 5200 : 3200);
  closeButton.addEventListener("click", () => {
    window.clearTimeout(timer);
    close();
  });
}

function setMessage(message, isError = false, error = null) {
  ui.messageLine.textContent = message;
  ui.messageLine.classList.toggle("error", isError);
  showToast(message, isError);
  if (isError) logError(message, error);
}

function setInlineMessage(message, isError = false) {
  ui.messageLine.textContent = message;
  ui.messageLine.classList.toggle("error", isError);
}

function portLabel(port) {
  if (!port || typeof port.getInfo !== "function") return "NOT SELECTED";
  const info = port.getInfo();
  const parts = [];
  if (typeof info.usbVendorId === "number") parts.push(`VID ${info.usbVendorId.toString(16).padStart(4, "0")}`);
  if (typeof info.usbProductId === "number") parts.push(`PID ${info.usbProductId.toString(16).padStart(4, "0")}`);
  return parts.length > 0 ? parts.join(" / ") : "AUTHORIZED PORT";
}

function updateOperatingState() {
  if (!state.connected) {
    state.opState = "disconnected";
  } else if (state.latest.powerEnable) {
    state.opState = "connected_running";
  } else {
    state.opState = "connected_idle";
  }
}

function setChip(node, text, className) {
  node.textContent = text;
  node.className = "state-chip";
  if (className) node.classList.add(className);
}

function updateSystemUi() {
  updateOperatingState();
  const connected = state.connected;
  const running = state.opState === "connected_running";
  const latest = state.latest;
  const runText = !running ? "RUN --" : latest.runSecondsRemaining === RUN_CONTINUOUS ? "RUN CONT" : `RUN ${latest.runSecondsRemaining} s`;

  const connecting = !connected && state.connectInProgress;
  const reconnecting = !connected && !connecting && state.autoReconnectEnabled && state.selectedPort;
  ui.linkLabel.textContent = connected ? "CONNECTED" : connecting ? "CONNECTING" : reconnecting ? "RECONNECTING" : "DISCONNECTED";
  ui.linkMeta.textContent = connected ? `${state.packetRate} pkt/s` : connecting ? "opening port" : reconnecting ? `attempt ${Math.max(1, state.reconnectAttempt)}` : "0 pkt/s";
  ui.linkDot.className = `pill-dot ${connected ? "is-on" : reconnecting ? "is-warn" : ""}`;
  ui.outputLabel.textContent = running ? "OUTPUT LIVE" : "OUTPUT OFF";
  ui.outputMeta.textContent = modeLabel(latest.controlMode, latest.powerEnable, latest.fixedDutyActive);
  ui.outputDot.className = `pill-dot ${running ? "is-danger" : ""}`;
  ui.statusSubtitle.textContent = connected ? `${state.packetRate} pkt/s` : connecting ? "serial connecting" : reconnecting ? "serial reconnecting" : "serial disconnected";

  ui.emergencyBar.hidden = !running;
  ui.emergencyMeta.textContent = runText;
  ui.liveControlStrip.hidden = !running;
  ui.liveControlMeta.textContent = `${runText} / ${ui.outputMeta.textContent}`;
  ui.liveUpdateTargetsButton.disabled = !connected || !running || latest.fixedDutyActive;
  ui.runDrawerState.textContent = running ? `${runText} / ${ui.outputMeta.textContent}` : connected ? "OUTPUT OFF" : "DISCONNECTED";
  ui.configureDrawerState.textContent = state.pendingConfigOp ? "CONFIG BUSY" : state.deviceDraftConfig ? "DRAFT SYNCED" : "SYNC NEEDED";

  ui.selectedPortReadout.textContent = portLabel(state.selectedPort);
  ui.connectStatusReadout.textContent = connected ? "Connected" : connecting ? "Opening serial port" : reconnecting ? "Auto reconnecting" : state.selectedPort ? "Port authorized" : "No port selected";
  ui.connectRateReadout.textContent = `${state.packetRate} pkt/s`;

  const webSerialOk = "serial" in navigator;
  ui.webSerialSupportLine.textContent = webSerialOk ? "WEBSERIAL READY" : "WEBSERIAL NOT AVAILABLE";
  ui.webSerialSupportLine.classList.toggle("error", !webSerialOk);

  ui.selectPortButton.disabled = !webSerialOk || connected || state.connectInProgress;
  ui.connectButton.disabled = !webSerialOk || !state.selectedPort || connected || state.connectInProgress || reconnecting;
  ui.disconnectButton.disabled = !connected && !state.autoReconnectEnabled && !state.connectInProgress;

  ui.runDisconnected.hidden = connected;
  ui.runConnected.hidden = !connected;
  ui.runLiveBanner.hidden = !running;
  if (running) {
    ui.runLiveBanner.textContent = latest.fixedDutyActive
      ? "OUTPUT LIVE IN FIXED DUTY: disable before changing operating mode or duty."
      : "OUTPUT LIVE: target values stay available; start mode and duration are locked.";
  }
  ui.enableButton.hidden = running;
  ui.updateTargetsButton.hidden = !running;
  ui.disableButton.disabled = !connected;
  ui.enableButton.disabled = !connected;
  ui.updateTargetsButton.disabled = !connected || !running || latest.fixedDutyActive;
  ui.runDurationGroup.disabled = running;
  ui.runStartModeGroup.disabled = running;

  ui.configureLock.hidden = !running;
  ui.applySettingsButton.disabled = !connected || running || validateConfigForm(readSettingsForm()).errors.length > 0 || state.pendingConfigOp !== null;
  if (ui.saveConfigButton) ui.saveConfigButton.disabled = !connected || running || state.pendingConfigOp !== null;

  if (ui.presetsConnected) {
    ui.presetsDisconnected.hidden = connected;
    ui.presetsConnected.hidden = !connected;
    ui.presetsLiveBanner.hidden = !running;
    ui.presetsDrawerState.textContent = running
      ? `${runText} / ${ui.outputMeta.textContent}`
      : connected ? "OUTPUT OFF" : "DISCONNECTED";
    ui.savePresetsButton.disabled = !connected || running || state.pendingConfigOp !== null;
    ui.presetRunAButton.disabled = !connected || running;
    ui.presetRunBButton.disabled = !connected || running;
  }

  setChip(ui.powerStateChip, latest.powerEnable ? "LATCH ON" : "LATCH OFF", latest.powerEnable ? "is-danger" : "");
  setChip(ui.driveStateChip, latest.driveActive ? "DRIVE ON" : "DRIVE OFF", latest.driveActive ? "is-danger" : "");
  setChip(ui.controlModeChip, modeLabel(latest.controlMode, latest.powerEnable, latest.fixedDutyActive), latest.powerEnable ? (latest.fixedDutyActive ? "is-warn" : "is-on") : "");
  setChip(ui.keyFlagsChip, keyLabel(latest.keyFlags), latest.keyFlags ? "is-warn" : "");
  setChip(ui.configOkChip, state.pendingConfigOp ? "CONFIG BUSY" : state.deviceDraftConfig ? "CFG SYNCED" : "CFG UNKNOWN",
    state.pendingConfigOp ? "is-pending" : state.deviceDraftConfig ? "is-ok" : "");

  // Overcurrent trip: hardware shut the output off; user must re-enable (RUN) to clear.
  ui.ocpChip.hidden = !latest.ocpTripped;
  if (latest.ocpTripped) setChip(ui.ocpChip, "OCP TRIP · OUTPUT OFF · RE-ENABLE", "is-danger");
  // Watchdog reset: last boot was forced by the IWDG -> firmware likely ran away.
  ui.wdgChip.hidden = !latest.wdgReset;
  if (latest.wdgReset) setChip(ui.wdgChip, "WDG RESET · CHECK FIRMWARE", "is-warn");
  // Over-temperature trip: MOS or MCU exceeded 75 C; output forced off, user must re-enable.
  ui.otpChip.hidden = !latest.otpTripped;
  if (latest.otpTripped) setChip(ui.otpChip, "OVER-TEMP · OUTPUT OFF · RE-ENABLE", "is-danger");

  if (history) {
    ui.undoButton.disabled = !history.canUndo();
    ui.redoButton.disabled = !history.canRedo();
  }
}

function handlePowerStarted() {
  closeDrawer();
  setChartSignalDrawerOpen(false);
  updateSystemUi();
}

function renderTelemetryCards() {
  ui.readingsKey.replaceChildren();
  ui.readingsSecondary.replaceChildren();
  ui.readingsDebug.replaceChildren();
  ui.metricValues = {};

  for (const metric of TELEMETRY_METRICS) {
    const isKey = KEY_METRIC_KEYS.includes(metric.key);
    const isDebug = DEBUG_METRIC_KEYS.has(metric.key);
    const card = document.createElement(isKey ? "article" : "div");
    card.className = isKey ? "metric-card" : "reading-row";
    card.style.setProperty("--signal-color", metric.color);

    const label = document.createElement("span");
    label.className = isKey ? "metric-label" : "reading-label";
    label.textContent = metric.label;

    const value = document.createElement("strong");
    value.className = isKey ? "metric-value" : "reading-value";
    value.textContent = metric.format(state.latest);

    card.append(label, value);
    ui.metricValues[metric.key] = value;

    if (isKey) {
      ui.readingsKey.append(card);
    } else if (isDebug) {
      ui.readingsDebug.append(card);
    } else {
      ui.readingsSecondary.append(card);
    }
  }
}

function updateTelemetryUi() {
  for (const metric of TELEMETRY_METRICS) {
    const node = ui.metricValues[metric.key];
    if (node) node.textContent = metric.format(state.latest);
  }
  updateSystemUi();
  if (state.cycleOpen) renderCycleOverlay();
  refreshDebugPanel();
}

function chartMetricValue(metric, latest = state.latest) {
  return metric.read(latest);
}

function pushSeriesPoint(series, point, cutoffNow = point.x) {
  series.push(point);
  const cutoff = cutoffNow - CHART_WINDOW_MS;
  while (series.length > 0 && series[0].x < cutoff) {
    series.shift();
  }
}

function resetChartHistory() {
  for (const metric of TELEMETRY_METRICS) {
    state.series[metric.key].length = 0;
  }
  state.chartNow = performance.now();
}

function sampleTimeline() {
  if (!state.connected || state.latest.updatedAt === 0 || state.chartPaused) return;
  const now = performance.now();
  for (const metric of TELEMETRY_METRICS) {
    pushSeriesPoint(state.series[metric.key], { x: now, y: chartMetricValue(metric) }, now);
  }
}

function chartAxisId(metricKey) {
  return `axis_${metricKey}`;
}

function buildChartDatasets() {
  return state.selectedChartMetrics.map((metricKey, index) => {
    const metric = METRIC_MAP[metricKey];
    return {
      label: metric.label,
      metricKey,
      order: index,
      data: state.series[metricKey],
      parsing: false,
      yAxisID: chartAxisId(metricKey),
      borderColor: metric.color,
      backgroundColor: metric.color,
      pointRadius: 0,
      borderWidth: 1.8,
      tension: 0.18
    };
  });
}

function buildChartScales() {
  const scales = {
    x: {
      type: "linear",
      min: state.chartNow - CHART_WINDOW_MS,
      max: state.chartNow,
      grid: { color: "rgba(23, 32, 42, 0.08)" },
      ticks: {
        color: "#687583",
        callback(value) {
          return `${((value - state.chartNow) / 1000).toFixed(0)}s`;
        }
      }
    }
  };

  let leftAxisCount = 0;
  let rightAxisCount = 0;
  state.selectedChartMetrics.forEach((metricKey, index) => {
    const metric = METRIC_MAP[metricKey];
    const position = index % 2 === 0 ? "left" : "right";
    const offset = position === "left" ? leftAxisCount > 0 : rightAxisCount > 0;
    if (position === "left") leftAxisCount += 1; else rightAxisCount += 1;
    scales[chartAxisId(metricKey)] = {
      type: "linear",
      position,
      offset,
      grid: { drawOnChartArea: index === 0, color: "rgba(23, 32, 42, 0.08)" },
      ticks: { color: metric.color, maxTicksLimit: 5 },
      title: { display: true, text: metric.axisLabel, color: metric.color }
    };
  });
  return scales;
}

function refreshChart() {
  if (!state.chart) return;
  state.chartNow = performance.now();
  state.chart.options.scales = buildChartScales();
  state.chart.update("none");
}

function chartAnimationLoop(now) {
  if (!state.chartPaused && now - state.chartLastFrameAt >= CHART_FRAME_MIN_MS) {
    state.chartLastFrameAt = now;
    refreshChart();
  }
  state.chartRafId = window.requestAnimationFrame(chartAnimationLoop);
}

function buildChart() {
  const canvas = document.getElementById("telemetryChart");
  if (typeof Chart === "undefined") {
    ui.chartEmpty.textContent = "CHART.JS NOT LOADED";
    ui.chartEmpty.hidden = false;
    return;
  }
  state.chart = new Chart(canvas, {
    type: "line",
    data: { datasets: buildChartDatasets() },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      normalized: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: "nearest",
          intersect: false,
          callbacks: {
            label(context) {
              const metric = METRIC_MAP[context.dataset.metricKey];
              return `${metric.label}: ${formatSig(context.parsed.y)}`;
            }
          }
        }
      },
      interaction: { mode: "nearest", intersect: false },
      scales: buildChartScales()
    }
  });
  state.chartRafId = window.requestAnimationFrame(chartAnimationLoop);
}

function syncChartConfiguration() {
  if (!state.chart) {
    ui.chartEmpty.hidden = state.selectedChartMetrics.length > 0;
    return;
  }
  state.chart.data.datasets = buildChartDatasets();
  state.chart.options.scales = buildChartScales();
  ui.chartEmpty.hidden = state.selectedChartMetrics.length > 0;
  refreshChart();
}

function updateChartSelectionSummary() {
  const count = state.selectedChartMetrics.length;
  const text = count === 0 ? "No signals" : `${count} selected`;
  ui.chartSelectionSummary.textContent = text;
  ui.signalPickerCount.textContent = text;
  ui.plotSubtitle.textContent = state.selectedChartMetrics.map((key) => METRIC_MAP[key].label).join(" / ") || "no signals";
}

function updateChartMetricCheckboxes() {
  for (const metric of TELEMETRY_METRICS) {
    const checkbox = ui.chartMetricCheckboxes[metric.key];
    if (checkbox) checkbox.checked = state.selectedChartMetrics.includes(metric.key);
  }
}

function renderChartLegend() {
  ui.chartLegend.replaceChildren();
  if (state.selectedChartMetrics.length === 0) {
    const empty = document.createElement("span");
    empty.className = "legend-chip";
    empty.textContent = "No signals selected";
    ui.chartLegend.append(empty);
    return;
  }

  for (const key of state.selectedChartMetrics) {
    const metric = METRIC_MAP[key];
    const chip = document.createElement("span");
    chip.className = "legend-chip";
    chip.draggable = true;
    chip.dataset.metricKey = key;
    chip.style.setProperty("--signal-color", metric.color);

    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    const name = document.createElement("span");
    name.textContent = metric.label;
    const remove = document.createElement("button");
    remove.className = "legend-remove";
    remove.type = "button";
    remove.textContent = "x";
    remove.setAttribute("aria-label", `Remove ${metric.label}`);
    remove.addEventListener("click", () => removeChartMetric(key));

    chip.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("text/plain", key);
      event.dataTransfer.effectAllowed = "move";
    });
    chip.addEventListener("dragover", (event) => event.preventDefault());
    chip.addEventListener("drop", (event) => {
      event.preventDefault();
      const sourceKey = event.dataTransfer.getData("text/plain");
      reorderChartMetrics(sourceKey, key, event.offsetX < chip.offsetWidth / 2);
    });

    chip.append(swatch, name, remove);
    ui.chartLegend.append(chip);
  }
}

function filterChartPicker() {
  const query = state.chartSignalQuery.trim().toLowerCase();
  let visibleOptions = 0;
  for (const group of ui.signalGroups.querySelectorAll("[data-chart-group]")) {
    let groupVisible = 0;
    for (const option of group.querySelectorAll("[data-chart-option]")) {
      const visible = query.length === 0 || option.dataset.search.includes(query);
      option.hidden = !visible;
      if (visible) {
        visibleOptions += 1;
        groupVisible += 1;
      }
    }
    group.hidden = groupVisible === 0;
  }
  ui.signalNoMatch.hidden = visibleOptions > 0;
}

function updateChartSelectionUi() {
  updateChartSelectionSummary();
  updateChartMetricCheckboxes();
  renderChartLegend();
  filterChartPicker();
  ui.resetChartSelectionButton.disabled =
    state.selectedChartMetrics.length === DEFAULT_CHART_METRICS.length &&
    state.selectedChartMetrics.every((key, index) => key === DEFAULT_CHART_METRICS[index]);
}

function setChartSelection(metricKeys) {
  state.selectedChartMetrics = normalizeChartSelection(metricKeys);
  saveChartSelection();
  updateChartSelectionUi();
  syncChartConfiguration();
  if (history) history.schedule();
}

function removeChartMetric(metricKey) {
  setChartSelection(state.selectedChartMetrics.filter((key) => key !== metricKey));
}

function reorderChartMetrics(sourceKey, targetKey, insertBefore) {
  if (!sourceKey || sourceKey === targetKey) return;
  const next = state.selectedChartMetrics.filter((key) => key !== sourceKey);
  let targetIdx = next.indexOf(targetKey);
  if (targetIdx < 0) return;
  if (!insertBefore) targetIdx += 1;
  next.splice(targetIdx, 0, sourceKey);
  setChartSelection(next);
}

function buildChartPicker() {
  ui.signalGroups.replaceChildren();
  ui.chartMetricCheckboxes = {};
  for (const groupName of CHART_GROUP_ORDER) {
    const metrics = TELEMETRY_METRICS.filter((metric) => metric.group === groupName);
    if (metrics.length === 0) continue;

    const group = document.createElement("section");
    group.className = "signal-group";
    group.dataset.chartGroup = groupName;
    const title = document.createElement("h3");
    title.textContent = groupName;
    group.append(title);

    for (const metric of metrics) {
      const label = document.createElement("label");
      label.className = "signal-option";
      label.dataset.chartOption = metric.key;
      label.dataset.search = `${metric.group} ${metric.key} ${metric.label} ${metric.axisLabel}`.toLowerCase();

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.addEventListener("change", () => {
        const selection = new Set(state.selectedChartMetrics);
        if (checkbox.checked) selection.add(metric.key); else selection.delete(metric.key);
        setChartSelection(Array.from(selection));
      });
      ui.chartMetricCheckboxes[metric.key] = checkbox;

      const name = document.createElement("strong");
      name.textContent = metric.label;
      const axis = document.createElement("em");
      axis.textContent = metric.axisLabel;
      label.append(checkbox, name, axis);
      group.append(label);
    }
    ui.signalGroups.append(group);
  }
}

function setChartSignalDrawerOpen(open) {
  state.chartSignalsOpen = open;
  ui.signalPicker.hidden = !open;
  ui.toggleChartSignalsButton.setAttribute("aria-expanded", String(open));
  if (open) {
    window.setTimeout(() => ui.signalSearchInput.focus(), 0);
    filterChartPicker();
  }
}

function readSettingsForm() {
  function finiteNumber(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  function integerValue(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  const config = {};
  for (const field of CONFIG_FIELDS) {
    const input = ui.configInputs[field.key];
    if (!input) {
      config[field.key] = state.settingsForm[field.key];
    } else if (field.type === protocol.CONFIG_VALUE_FLOAT) {
      config[field.key] = finiteNumber(input.value);
    } else {
      config[field.key] = integerValue(input.value);
    }
  }
  return config;
}

function writeSettingsForm(settings) {
  for (const field of CONFIG_FIELDS) {
    const input = ui.configInputs[field.key];
    if (input && settings[field.key] !== undefined) input.value = settings[field.key];
  }
}

function refreshSettingsReadouts() {
  Object.assign(state.settingsForm, readSettingsForm());
  const { errors } = validateConfigForm(state.settingsForm);
  const setKHz = state.settingsForm.baseFreqHz / 1000;
  const liveHz = state.latest.currentFreqHz;
  // Realized switching frequency reported by firmware (MUL4 clock / PRD).
  // It can differ slightly from the requested base frequency because of
  // integer period rounding and auto-frequency operation.
  ui.timingFreqSummary.textContent = Number.isFinite(setKHz)
    ? `base ${formatSig(setKHz)} kHz / live ${liveHz > 0 ? `${formatSig(liveHz / 1000)} kHz` : "--"}`
    : "invalid";
  ui.timingSamplingSummary.textContent =
    "ADC fixed: ADC1 2 ch @ 2.5 cyc 12-bit / ADC2 3 ch @ 2.5 cyc 8-bit (24 triggers per switching period via HRTIM ADC TRG1)";

  if (errors.length === 0) {
    ui.settingsValidation.textContent = "OK";
    ui.settingsValidation.className = "validation-line ok";
  } else {
    ui.settingsValidation.textContent = errors.join(" / ") || "--";
    ui.settingsValidation.className = "validation-line error";
  }
  updateSystemUi();
}

function notifySettingsChanged() {
  Object.assign(state.settingsForm, readSettingsForm());
  refreshSettingsReadouts();
  if (history) history.schedule();
}

function restoreDefaults() {
  sendConfigSimpleOp(CONFIG_OP_LOAD_DEFAULTS, "DEFAULTS LOADED TO DRAFT");
}

function parseCommandInputs() {
  const cvV = Number.parseFloat(ui.setVoltageInput.value);
  const ccMa = Number.parseFloat(ui.setCurrentInput.value);
  const cpW = Number.parseFloat(ui.setPowerInput.value);

  if (!Number.isFinite(cvV) || cvV < 0 || cvV > MAX_CV_V) {
    return { error: `CV RANGE 0..${MAX_CV_V} V` };
  }
  if (!Number.isFinite(ccMa) || ccMa < 0 || ccMa > MAX_CC_MA) {
    return { error: `CC RANGE 0..${MAX_CC_MA} mA` };
  }
  if (!Number.isFinite(cpW) || cpW < 0 || cpW > MAX_CP_W) {
    return { error: `CP RANGE 0..${MAX_CP_W} W` };
  }

  let runSeconds = 0;
  if (!ui.continuousCheckbox.checked) {
    runSeconds = Number.parseInt(ui.runSecondsInput.value, 10);
    if (!Number.isFinite(runSeconds) || runSeconds < 1 || runSeconds > 65534) {
      return { error: "RUN DURATION 1..65534 s OR CONTINUOUS" };
    }
  }

  const fixedSelected = ui.startModeFixed.checked;
  let fixedDuty = 0;
  if (fixedSelected) {
    const dutyPct = Number.parseFloat(ui.fixedDutyInput.value);
    if (!Number.isFinite(dutyPct) || dutyPct < 0 || dutyPct > 100) {
      return { error: "FIXED DUTY 0..100 %" };
    }
    fixedDuty = dutyPct / 100;
  }

  return {
    cvMv: Math.round(cvV * 1000),
    ccMa: Math.round(ccMa),
    cpMw: Math.round(cpW * 1000),
    runSeconds,
    fixedDuty,
    fixedSelected
  };
}

function refreshRunValidation() {
  const values = parseCommandInputs();
  if (values.error) {
    ui.runValidation.textContent = values.error;
    ui.runValidation.hidden = false;
    ui.runValidation.className = "validation-line error";
    return false;
  }
  ui.runValidation.hidden = true;
  return true;
}

async function sendFrame(frame) {
  if (!state.port || !state.connected || !state.port.writable) {
    throw new Error("Serial not connected.");
  }
  const writer = state.port.writable.getWriter();
  try {
    await writer.write(frame);
  } finally {
    writer.releaseLock();
  }
}

function nextConfigSequence() {
  state.configRequestSeq = (state.configRequestSeq + 1) & 0xffff;
  if (state.configRequestSeq === 0) state.configRequestSeq = 1;
  return state.configRequestSeq;
}

function applyConfigSnapshot(response) {
  if (response.draft) {
    state.deviceDraftConfig = response.draft;
    state.settingsForm = { ...response.draft };
    writeSettingsForm(state.settingsForm);
    writePresetForm(response.draft);
  }
  if (response.active) state.deviceActiveConfig = response.active;
  refreshSettingsReadouts();
}

function configStatusText(status) {
  return CONFIG_STATUS[status] || `STATUS ${status}`;
}

async function sendConfigRequest(op, options = {}) {
  if (!state.connected) throw new Error("Serial not connected.");
  if (state.pendingConfigOp) throw new Error("Another config request is pending.");

  const sequence = nextConfigSequence();
  const frame = op === CONFIG_OP_SET_FIELD
    ? buildConfigSetFieldRequest(options.field, options.value, sequence)
    : buildConfigRequest(op, { ...options, sequence });

  const promise = new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      if (state.pendingConfigOp && state.pendingConfigOp.sequence === sequence) {
        state.pendingConfigOp = null;
        reject(new Error("Config response timeout."));
      }
    }, CONFIG_REQUEST_TIMEOUT_MS);
    state.pendingConfigOp = { sequence, resolve, reject, timeout };
    state.pendingConfigAt = performance.now();
  });

  try {
    await sendFrame(frame);
    return await promise;
  } catch (error) {
    if (state.pendingConfigOp && state.pendingConfigOp.sequence === sequence) {
      window.clearTimeout(state.pendingConfigOp.timeout);
      state.pendingConfigOp = null;
    }
    throw error;
  }
}

async function requestConfigSnapshot(showMessage = false) {
  try {
    const response = await sendConfigRequest(CONFIG_OP_GET_SNAPSHOT);
    if (response.status !== 0) throw new Error(configStatusText(response.status));
    applyConfigSnapshot(response);
    if (showMessage) setMessage("DEVICE DRAFT SYNCED");
  } catch (error) {
    setMessage(`CONFIG SYNC FAILED: ${error.message}`, true, error);
  }
}

async function sendConfigSimpleOp(op, okMessage) {
  if (state.latest.powerEnable && op !== CONFIG_OP_GET_SNAPSHOT) {
    setMessage("DISABLE OUTPUT BEFORE CHANGING CONFIGURATION", true);
    return;
  }
  try {
    const response = await sendConfigRequest(op);
    if (response.status !== 0) throw new Error(configStatusText(response.status));
    if (response.draft || response.active) applyConfigSnapshot(response);
    await requestConfigSnapshot(false);
    setMessage(okMessage);
  } catch (error) {
    setMessage(`CONFIG COMMAND FAILED: ${error.message}`, true, error);
  }
}

function handleConfigResponse(frame) {
  let response;
  try {
    response = parseConfigResponseFrame(frame);
  } catch (error) {
    logError("CONFIG RESPONSE PARSE FAILED", error);
    return;
  }
  if (!state.pendingConfigOp || state.pendingConfigOp.sequence !== response.sequence) return;
  window.clearTimeout(state.pendingConfigOp.timeout);
  const pending = state.pendingConfigOp;
  state.pendingConfigOp = null;
  if (response.status === 0 && response.op === CONFIG_OP_GET_SNAPSHOT) applyConfigSnapshot(response);
  pending.resolve(response);
}

function resetCurrentRunSummary(stats, startedAt = 0) {
  stats.currentActive = startedAt > 0;
  stats.currentStartedAt = startedAt;
  stats.currentLastAt = startedAt;
  stats.currentPackets = 0;
  stats.currentDutySum = 0;
  stats.currentIpriSumMa = 0;
  stats.currentIsecSumMa = 0;
  stats.currentVpriSumMv = 0;
  stats.currentVsecSumMv = 0;
  stats.currentFreqHz = 0;
}

function finishRunSummary(endAt) {
  const stats = state.runSummaryStats;
  if (!stats.currentActive) return;

  stats.lastStartedAt = stats.currentStartedAt;
  stats.lastEndedAt = endAt || stats.currentLastAt || performance.now();
  stats.lastPackets = stats.currentPackets;
  stats.lastDutySum = stats.currentDutySum;
  stats.lastIpriSumMa = stats.currentIpriSumMa;
  stats.lastIsecSumMa = stats.currentIsecSumMa;
  stats.lastVpriSumMv = stats.currentVpriSumMv;
  stats.lastVsecSumMv = stats.currentVsecSumMv;
  stats.lastFreqHz = stats.currentFreqHz;
  resetCurrentRunSummary(stats);
}

function updateRunSummaryFromHeartbeat(wasEnabled, now) {
  const stats = state.runSummaryStats;
  const enabled = !!state.latest.powerEnable;
  const fallbackFreqHz = state.latest.currentFreqHz || state.latest.baseFreqHz || state.settingsForm.baseFreqHz;

  if (enabled && !wasEnabled) {
    resetCurrentRunSummary(stats, now);
    stats.currentFreqHz = fallbackFreqHz;
    stats.summaryVisible = false;
  }

  if (enabled) {
    stats.currentPackets += 1;
    stats.currentLastAt = now;
    if (!stats.currentFreqHz) stats.currentFreqHz = fallbackFreqHz;
    stats.currentDutySum += state.latest.duty;
    stats.currentIpriSumMa += state.latest.iPriDcMa;
    stats.currentIsecSumMa += state.latest.iSecMa;
    stats.currentVpriSumMv += state.latest.vPriMv;
    stats.currentVsecSumMv += state.latest.vSecMv;
  } else if (wasEnabled) {
    finishRunSummary(now);
  }
}

function lastRunAverages() {
  const stats = state.runSummaryStats;
  if (stats.lastPackets <= 0) return null;
  const dutyPct = (stats.lastDutySum / stats.lastPackets) * 100;
  const ipriMa = stats.lastIpriSumMa / stats.lastPackets;
  const isecMa = stats.lastIsecSumMa / stats.lastPackets;
  const vpriMv = stats.lastVpriSumMv / stats.lastPackets;
  const vsecMv = stats.lastVsecSumMv / stats.lastPackets;
  const inputPower = ipriMa * vpriMv;
  const outputPower = isecMa * vsecMv;
  return {
    freqHz: stats.lastFreqHz || state.latest.currentFreqHz || state.latest.baseFreqHz || state.settingsForm.baseFreqHz,
    dutyPct,
    effPct: inputPower === 0 ? NaN : (outputPower / inputPower) * 100,
    ipriA: ipriMa / 1000,
    isecMa,
    vpriV: vpriMv / 1000,
    vsecV: vsecMv / 1000
  };
}

function formatLastRunCopyText() {
  const avg = lastRunAverages();
  if (!avg) return "";
  return `f: ${Math.round(avg.freqHz)}Hz, duty: ${formatSig(avg.dutyPct)}%, eff: ${Number.isFinite(avg.effPct) ? formatSig(avg.effPct) : "NaN"}%, Ipri: ${formatSig(avg.ipriA)}A, Isec: ${formatSig(avg.isecMa)}mA, Vsec: ${formatSig(avg.vsecV)}V, Vpri: ${formatSig(avg.vpriV)}V`;
}

function showLastRunSummary() {
  state.runSummaryStats.summaryVisible = true;
  refreshDebugPanel();
}

async function writeClipboardText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.select();
  try {
    if (!document.execCommand("copy")) throw new Error("copy command rejected");
  } finally {
    textarea.remove();
  }
}

async function copyLastRunSummary() {
  const text = formatLastRunCopyText();
  if (!text) {
    setMessage("NO PREVIOUS ENABLE WINDOW", true);
    return;
  }
  try {
    await writeClipboardText(text);
    state.runSummaryStats.summaryVisible = true;
    refreshDebugPanel();
    setMessage("RUN SUMMARY COPIED");
  } catch (error) {
    setMessage(`COPY FAILED: ${error.message}`, true, error);
  }
}

function setDebugPanelOpen(open) {
  state.debugPanelOpen = open;
  if (!ui.debugPanel) return;
  ui.debugPanel.classList.toggle("is-open", open);
  ui.debugPanelToggle.setAttribute("aria-expanded", String(open));
  ui.debugPanelBody.hidden = !open;
  refreshDebugPanel();
}

function refreshDebugPanel() {
  if (!ui.debugPanel) return;
  const stats = state.runSummaryStats;
  const activeText = stats.currentActive
    ? `${stats.currentPackets} packets / ${formatDurationMs(stats.currentLastAt - stats.currentStartedAt)}`
    : "idle";
  ui.debugRunActive.textContent = activeText;

  const lastDuration = stats.lastEndedAt > stats.lastStartedAt
    ? formatDurationMs(stats.lastEndedAt - stats.lastStartedAt)
    : "0 s";
  ui.debugRunLastMeta.textContent = stats.lastPackets > 0
    ? `${stats.lastPackets} packets / ${lastDuration}`
    : "no completed enable window";

  if (!stats.summaryVisible) {
    ui.debugRunSummary.textContent = "Click View Summary";
  } else {
    const text = formatLastRunCopyText();
    ui.debugRunSummary.textContent = text || "No previous enable window";
  }

  const avg = lastRunAverages();
  if (avg) {
    ui.debugRunDuty.textContent = `${formatSig(avg.dutyPct)} %`;
    ui.debugRunEff.textContent = Number.isFinite(avg.effPct) ? `${formatSig(avg.effPct)} %` : "NaN";
    ui.debugRunIpri.textContent = `${formatSig(avg.ipriA)} A`;
    ui.debugRunIsec.textContent = `${formatSig(avg.isecMa)} mA`;
    ui.debugRunVpri.textContent = `${formatSig(avg.vpriV)} V`;
    ui.debugRunVsec.textContent = `${formatSig(avg.vsecV)} V`;
  } else {
    ui.debugRunDuty.textContent = "--";
    ui.debugRunEff.textContent = "--";
    ui.debugRunIpri.textContent = "--";
    ui.debugRunIsec.textContent = "--";
    ui.debugRunVpri.textContent = "--";
    ui.debugRunVsec.textContent = "--";
  }
}

function parseHeartbeat(frame) {
  const wasEnabled = !!state.latest.powerEnable;
  const now = performance.now();
  parseHeartbeatFrame(frame, state.latest, now);
  state.packetCounter += 1;
  if (now - state.packetRateWindowStart >= PACKET_RATE_WINDOW_MS) {
    state.packetRate = state.packetCounter;
    state.packetCounter = 0;
    state.packetRateWindowStart = now;
  }
  updateRunSummaryFromHeartbeat(wasEnabled, now);
  updateTelemetryUi();
}

function feedRx(value) {
  const frames = state.heartbeatDecoder.feed(value);
  for (const frame of frames) {
    try {
      parseHeartbeat(frame);
    } catch (error) {
      logError("HEARTBEAT PARSE FAILED", error);
    }
  }
  const configFrames = state.configDecoder.feed(value);
  for (const frame of configFrames) handleConfigResponse(frame);
}

function clearReconnectTimer() {
  if (state.reconnectTimer) {
    window.clearTimeout(state.reconnectTimer);
    state.reconnectTimer = 0;
  }
}

function scheduleReconnect(reason = "SERIAL LINK CLOSED") {
  if (!state.autoReconnectEnabled || state.disconnectRequested || !state.selectedPort) return;
  if (state.connected || state.connectInProgress || state.reconnectTimer) return;

  const attempt = state.reconnectAttempt + 1;
  state.reconnectAttempt = attempt;
  setInlineMessage(`${reason}. RECONNECTING (${attempt})...`, true);
  if (attempt === 1 || (attempt % 10) === 0) showToast(`RECONNECTING SERIAL (${attempt})`, true);

  state.reconnectTimer = window.setTimeout(() => {
    state.reconnectTimer = 0;
    void connectSerial(true);
  }, AUTO_RECONNECT_DELAY_MS);
  updateSystemUi();
}

async function finalizeDisconnect(message, shouldReconnect = false) {
  const port = state.port;
  state.connected = false;
  state.port = null;
  state.reader = null;
  state.readTask = null;
  if (!shouldReconnect) state.disconnectRequested = false;
  state.heartbeatDecoder.reset();
  state.configDecoder.reset();
  state.packetCounter = 0;
  state.packetRate = 0;
  state.latest = createLatest();
  state.deviceDraftConfig = null;
  state.deviceActiveConfig = null;
  state.pendingConfigOp = null;
  if (state.runSummaryStats.currentActive) finishRunSummary(performance.now());
  resetChartHistory();
  try {
    if (port && port.readable) await port.close();
  } catch (error) {
    logError("PORT CLOSE FAILED", error);
  }
  updateTelemetryUi();
  if (shouldReconnect) {
    scheduleReconnect(message);
  } else {
    setMessage(message);
  }
}

async function readLoop() {
  const port = state.port;
  const reader = port.readable.getReader();
  state.reader = reader;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      if (result.value) feedRx(result.value);
    }
  } catch (error) {
    if (!state.disconnectRequested) {
      logError("SERIAL READ FAILED", error);
      setInlineMessage(`SERIAL READ FAILED: ${error.message}`, true);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch (error) {
      logError("SERIAL READER RELEASE FAILED", error);
    }
    if (state.port === port) {
      const manual = state.disconnectRequested;
      await finalizeDisconnect(manual ? "DISCONNECTED" : "SERIAL LINK CLOSED", !manual);
    }
  }
}

async function selectSerialPort() {
  if (!("serial" in navigator)) {
    setMessage("WEBSERIAL NOT AVAILABLE", true);
    return;
  }
  try {
    state.selectedPort = await navigator.serial.requestPort();
    setMessage("SERIAL PORT AUTHORIZED");
    updateSystemUi();
  } catch (error) {
    if (error && error.name !== "NotFoundError") {
      setMessage(`PORT SELECTION FAILED: ${error.message}`, true, error);
    }
  }
}

async function connectSerial() {
  if (state.connected || !state.selectedPort) return;
  clearReconnectTimer();
  state.autoReconnectEnabled = true;
  state.disconnectRequested = false;
  state.connectInProgress = true;
  updateSystemUi();
  try {
    await state.selectedPort.open({ baudRate: 115200 });
    if (!state.autoReconnectEnabled || state.disconnectRequested) {
      try {
        await state.selectedPort.close();
      } catch (closeError) {
        logError("PORT CLOSE AFTER CANCELLED CONNECT FAILED", closeError);
      }
      state.connectInProgress = false;
      updateSystemUi();
      return;
    }
    state.port = state.selectedPort;
    state.connected = true;
    state.connectInProgress = false;
    state.reconnectAttempt = 0;
    state.heartbeatDecoder.reset();
    state.configDecoder.reset();
    resetChartHistory();
    state.readTask = readLoop();
    setMessage("CONNECTED");
    updateSystemUi();
    requestConfigSnapshot(true);
  } catch (error) {
    state.connected = false;
    state.port = null;
    state.connectInProgress = false;
    logError("CONNECT FAILED", error);
    try {
      if (state.selectedPort && state.selectedPort.readable) await state.selectedPort.close();
    } catch (closeError) {
      logError("PORT CLOSE AFTER CONNECT FAILURE FAILED", closeError);
    }
    if (state.autoReconnectEnabled && !state.disconnectRequested) {
      scheduleReconnect(`CONNECT FAILED: ${error.message}`);
    } else {
      setMessage(`CONNECT FAILED: ${error.message}`, true, error);
    }
    updateSystemUi();
  }
}

async function disconnectSerial() {
  state.autoReconnectEnabled = false;
  state.disconnectRequested = true;
  clearReconnectTimer();
  if (!state.port) {
    state.connectInProgress = false;
    state.connected = false;
    updateSystemUi();
    setMessage("DISCONNECTED");
    return;
  }
  try {
    if (state.reader) await state.reader.cancel();
  } catch (error) {
    logError("SERIAL READER CANCEL FAILED", error);
  }
  try {
    if (state.readTask) await state.readTask;
  } catch (error) {
    logError("READ TASK SETTLE FAILED", error);
  }
}

async function sendApplySettings() {
  if (!state.connected) {
    setMessage("CONNECT FIRST", true);
    return;
  }
  if (state.latest.powerEnable) {
    setMessage("DISABLE OUTPUT BEFORE APPLYING CONFIGURATION", true);
    return;
  }
  Object.assign(state.settingsForm, readSettingsForm());
  const { errors } = validateConfigForm(state.settingsForm);
  refreshSettingsReadouts();
  if (errors.length > 0) {
    setMessage("CONFIGURATION HAS ERRORS", true);
    return;
  }
  try {
    const baseline = state.deviceDraftConfig || {};
    for (const field of CONFIG_FIELDS) {
      const next = state.settingsForm[field.key];
      const prev = baseline[field.key];
      const changed = field.type === protocol.CONFIG_VALUE_FLOAT
        ? Math.abs(Number(next) - Number(prev)) > 1e-9
        : Number(next) !== Number(prev);
      if (changed) {
        const response = await sendConfigRequest(CONFIG_OP_SET_FIELD, { field: field.key, value: next });
        if (response.status !== 0) throw new Error(`${field.label}: ${configStatusText(response.status)}`);
      }
    }
    const applyResponse = await sendConfigRequest(CONFIG_OP_APPLY_DRAFT);
    if (applyResponse.status !== 0) throw new Error(configStatusText(applyResponse.status));
    await requestConfigSnapshot(false);
    setMessage("DRAFT APPLIED TO ACTIVE CONFIG");
    updateSystemUi();
  } catch (error) {
    setMessage(`APPLY FAILED: ${error.message}`, true, error);
  }
}

async function sendSaveConfig() {
  if (!state.connected) {
    setMessage("CONNECT FIRST", true);
    return;
  }
  if (state.latest.powerEnable) {
    setMessage("DISABLE OUTPUT BEFORE SAVING CONFIGURATION", true);
    return;
  }
  try {
    const response = await sendConfigRequest(CONFIG_OP_SAVE_DRAFT);
    if (response.status !== 0) throw new Error(configStatusText(response.status));
    await requestConfigSnapshot(false);
    setMessage("DRAFT SAVED TO FLASH LOG");
  } catch (error) {
    setMessage(`SAVE FAILED: ${error.message}`, true, error);
  }
}

async function sendEnableCommand() {
  const values = parseCommandInputs();
  if (values.error) {
    setMessage(values.error, true);
    refreshRunValidation();
    return;
  }
  try {
    await sendFrame(buildCommandFrame(true, false, values.fixedSelected, values.cvMv, values.ccMa, values.cpMw, values.runSeconds, values.fixedDuty));
    setMessage(values.fixedSelected ? `FIXED DUTY ${(values.fixedDuty * 100).toFixed(1)} % START SENT` : "START COMMAND SENT");
    handlePowerStarted();
  } catch (error) {
    setMessage(`SEND FAILED: ${error.message}`, true, error);
  }
}

async function sendUpdateTargetsCommand() {
  const values = parseCommandInputs();
  if (values.error) {
    setMessage(values.error, true);
    refreshRunValidation();
    return;
  }
  try {
    await sendFrame(buildCommandFrame(true, false, state.latest.fixedDutyActive, values.cvMv, values.ccMa, values.cpMw, values.runSeconds, values.fixedDuty));
    setMessage("TARGET UPDATE SENT");
  } catch (error) {
    setMessage(`SEND FAILED: ${error.message}`, true, error);
  }
}

async function sendDisableCommand() {
  try {
    await sendFrame(buildCommandFrame(false, true, false, state.latest.cvTargetMv, state.latest.ccTargetMa, state.latest.cpTargetMw, 0, 0));
    setMessage("DISABLE COMMAND SENT");
  } catch (error) {
    setMessage(`SEND FAILED: ${error.message}`, true, error);
  }
}

// ----- Front-panel key presets -----------------------------------------
// The two keys each run a stored closed-loop preset (CC/CV/CP + run time) held
// in the device config (btnA*/btnB* fields). Edited here, persisted to flash,
// and executed by the firmware on a physical key press with no host attached.

function presetEls(which) {
  return which === "A"
    ? { enable: ui.presetAEnable, continuous: ui.presetAContinuous, cv: ui.presetACvInput, cc: ui.presetACcInput, cp: ui.presetACpInput, time: ui.presetATimeInput }
    : { enable: ui.presetBEnable, continuous: ui.presetBContinuous, cv: ui.presetBCvInput, cc: ui.presetBCcInput, cp: ui.presetBCpInput, time: ui.presetBTimeInput };
}

function readOnePreset(which) {
  const label = `Button ${which}`;
  const els = presetEls(which);
  const cvV = Number.parseFloat(els.cv.value);
  const ccMa = Number.parseFloat(els.cc.value);
  const cpW = Number.parseFloat(els.cp.value);
  if (!Number.isFinite(cvV) || cvV < 0 || cvV > MAX_CV_V) return { error: `${label} CV 0..${MAX_CV_V} V` };
  if (!Number.isFinite(ccMa) || ccMa < 0 || ccMa > MAX_CC_MA) return { error: `${label} CC 0..${MAX_CC_MA} mA` };
  if (!Number.isFinite(cpW) || cpW < 0 || cpW > MAX_CP_W) return { error: `${label} CP 0..${MAX_CP_W} W` };
  let timeS = 0;
  if (!els.continuous.checked) {
    timeS = Number.parseInt(els.time.value, 10);
    if (!Number.isFinite(timeS) || timeS < 1 || timeS > 65534) return { error: `${label} time 1..65534 s or Continuous` };
  }
  return {
    enable: els.enable.checked ? 1 : 0,
    cvMv: Math.round(cvV * 1000),
    ccMa: Math.round(ccMa),
    cpMw: Math.round(cpW * 1000),
    timeS,
    runSeconds: timeS // 0 = continuous, same convention as the run command
  };
}

function readPresetForm() {
  const a = readOnePreset("A");
  if (a.error) return { error: a.error };
  const b = readOnePreset("B");
  if (b.error) return { error: b.error };
  return { a, b };
}

function writePresetForm(cfg) {
  if (!cfg) return;
  const fill = (which, enable, cvMv, ccMa, cpMw, timeS) => {
    const els = presetEls(which);
    els.enable.checked = Number(enable) !== 0;
    els.cv.value = (Number(cvMv) || 0) / 1000;
    els.cc.value = Number(ccMa) || 0;
    els.cp.value = (Number(cpMw) || 0) / 1000;
    const continuous = (Number(timeS) || 0) === 0;
    els.continuous.checked = continuous;
    if (!continuous) els.time.value = Number(timeS);
  };
  fill("A", cfg.btnAEnable, cfg.btnACvMv, cfg.btnACcMa, cfg.btnACpMw, cfg.btnATimeS);
  fill("B", cfg.btnBEnable, cfg.btnBCvMv, cfg.btnBCcMa, cfg.btnBCpMw, cfg.btnBTimeS);
  updatePresetFormVisibility();
}

function updatePresetFormVisibility() {
  if (!ui.presetATimeInput) return;
  ui.presetATimeInput.disabled = ui.presetAContinuous.checked;
  ui.presetBTimeInput.disabled = ui.presetBContinuous.checked;
  refreshPresetValidation();
}

function refreshPresetValidation() {
  const form = readPresetForm();
  if (form.error) {
    ui.presetsValidation.textContent = form.error;
    ui.presetsValidation.hidden = false;
    ui.presetsValidation.className = "validation-line error";
    return false;
  }
  ui.presetsValidation.hidden = true;
  return true;
}

async function sendSavePresets() {
  if (!state.connected) {
    setMessage("CONNECT FIRST", true);
    return;
  }
  if (state.latest.powerEnable) {
    setMessage("DISABLE OUTPUT BEFORE SAVING PRESETS", true);
    return;
  }
  const form = readPresetForm();
  if (form.error) {
    setMessage(form.error, true);
    refreshPresetValidation();
    return;
  }
  const fields = [
    ["btnAEnable", form.a.enable], ["btnACcMa", form.a.ccMa], ["btnACvMv", form.a.cvMv], ["btnACpMw", form.a.cpMw], ["btnATimeS", form.a.timeS],
    ["btnBEnable", form.b.enable], ["btnBCcMa", form.b.ccMa], ["btnBCvMv", form.b.cvMv], ["btnBCpMw", form.b.cpMw], ["btnBTimeS", form.b.timeS]
  ];
  try {
    const baseline = state.deviceDraftConfig || {};
    for (const [key, value] of fields) {
      if (Number(baseline[key]) !== Number(value)) {
        const response = await sendConfigRequest(CONFIG_OP_SET_FIELD, { field: key, value });
        if (response.status !== 0) throw new Error(`${key}: ${configStatusText(response.status)}`);
      }
    }
    const applyResponse = await sendConfigRequest(CONFIG_OP_APPLY_DRAFT);
    if (applyResponse.status !== 0) throw new Error(configStatusText(applyResponse.status));
    const saveResponse = await sendConfigRequest(CONFIG_OP_SAVE_DRAFT);
    if (saveResponse.status !== 0) throw new Error(configStatusText(saveResponse.status));
    await requestConfigSnapshot(false);
    setMessage("PRESETS APPLIED AND SAVED TO FLASH");
    updateSystemUi();
  } catch (error) {
    setMessage(`SAVE PRESETS FAILED: ${error.message}`, true, error);
  }
}

async function sendRunPreset(which) {
  if (!state.connected) {
    setMessage("CONNECT FIRST", true);
    return;
  }
  const form = readPresetForm();
  if (form.error) {
    setMessage(form.error, true);
    refreshPresetValidation();
    return;
  }
  const p = which === "A" ? form.a : form.b;
  try {
    await sendFrame(buildCommandFrame(true, false, false, p.cvMv, p.ccMa, p.cpMw, p.runSeconds, 0));
    setMessage(`PRESET ${which} START SENT`);
    handlePowerStarted();
  } catch (error) {
    setMessage(`SEND FAILED: ${error.message}`, true, error);
  }
}

function openDrawer(name) {
  const drawerMap = {
    connect: ui.connectDrawer,
    run: ui.runDrawer,
    configure: ui.configureDrawer,
    presets: ui.presetsDrawer
  };
  for (const [key, drawer] of Object.entries(drawerMap)) {
    const open = key === name;
    drawer.hidden = !open;
    drawer.setAttribute("aria-hidden", String(!open));
  }
  state.activeDrawer = name;
  ui.drawerBackdrop.hidden = state.opState === "connected_running";
}

function closeDrawer() {
  ui.connectDrawer.hidden = true;
  ui.runDrawer.hidden = true;
  ui.configureDrawer.hidden = true;
  ui.presetsDrawer.hidden = true;
  ui.connectDrawer.setAttribute("aria-hidden", "true");
  ui.runDrawer.setAttribute("aria-hidden", "true");
  ui.configureDrawer.setAttribute("aria-hidden", "true");
  ui.presetsDrawer.setAttribute("aria-hidden", "true");
  state.activeDrawer = null;
  ui.drawerBackdrop.hidden = true;
}

function setConfigTab(tab) {
  state.activeConfigTab = tab;
  for (const button of ui.configureTabs) {
    const active = button.dataset.configTab === tab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  }
  for (const page of ui.configurePages) {
    const active = page.dataset.configPage === tab;
    page.classList.toggle("is-active", active);
    page.hidden = !active;
  }
}

function toggleSection(button) {
  const key = button.dataset.toggleSection;
  const panel = document.querySelector(`[data-section-panel="${key}"]`);
  const open = button.getAttribute("aria-expanded") !== "true";
  button.setAttribute("aria-expanded", String(open));
  panel.hidden = !open;
}

function snapshotCommandForm() {
  return {
    setVoltage: ui.setVoltageInput.value,
    setCurrent: ui.setCurrentInput.value,
    setPower: ui.setPowerInput.value,
    runSeconds: ui.runSecondsInput.value,
    continuous: ui.continuousCheckbox.checked,
    startMode: ui.startModeFixed.checked ? "fixed" : "regular",
    fixedDuty: ui.fixedDutyInput.value
  };
}

function applyCommandFormSnapshot(snap) {
  ui.setVoltageInput.value = snap.setVoltage;
  ui.setCurrentInput.value = snap.setCurrent;
  ui.setPowerInput.value = snap.setPower;
  ui.runSecondsInput.value = snap.runSeconds;
  ui.continuousCheckbox.checked = snap.continuous;
  ui.startModeFixed.checked = snap.startMode === "fixed";
  ui.startModeRegular.checked = snap.startMode !== "fixed";
  ui.fixedDutyInput.value = snap.fixedDuty;
  updateRunFormVisibility();
}

function updateRunFormVisibility() {
  ui.fixedDutyGroup.hidden = !ui.startModeFixed.checked;
  ui.runSecondsInput.disabled = ui.continuousCheckbox.checked;
  refreshRunValidation();
  if (history) history.schedule();
}

function preventAccidentalNumberStepping() {
  window.addEventListener("keydown", (event) => {
    if ((event.key === "ArrowUp" || event.key === "ArrowDown") && event.target instanceof HTMLInputElement && event.target.type === "number") {
      event.preventDefault();
    }
  }, true);
  window.addEventListener("wheel", (event) => {
    if (event.target instanceof HTMLInputElement && event.target.type === "number" && document.activeElement === event.target) {
      event.preventDefault();
    }
  }, { passive: false, capture: true });
}

// ====================================================================
// Single-Cycle Waveform overlay
// --------------------------------------------------------------------
// Lives in its own full-screen overlay so it gets a real amount of room.
// Reads sample arrays straight off the latest heartbeat; redraws on every
// heartbeat update while open.
// ====================================================================

function openCycleOverlay() {
  if (!ui.cycleOverlay) return;
  state.cycleOpen = true;
  ui.cycleOverlay.hidden = false;
  ui.cycleOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("is-cycle-open");
  // Force reflow so the slide-in transition runs.
  void ui.cycleOverlay.offsetWidth;
  ui.cycleOverlay.classList.add("is-open");
  renderCycleOverlay();
}

function closeCycleOverlay() {
  if (!ui.cycleOverlay) return;
  state.cycleOpen = false;
  ui.cycleOverlay.classList.remove("is-open");
  ui.cycleOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("is-cycle-open");
  // Hide after transition.
  window.setTimeout(() => { if (!state.cycleOpen) ui.cycleOverlay.hidden = true; }, 240);
}

function buildCycleSignalControls() {
  if (!ui.cycleSignalList) return;
  ui.cycleSignalList.replaceChildren();
  ui.cycleSignalCheckboxes = {};
  ui.cycleValueCells = {};
  for (const sig of CYCLE_SIGNALS) {
    const row = document.createElement("label");
    row.className = "cycle-signal-row";
    row.style.setProperty("--signal-color", sig.color);
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !!state.cyclePrefs.enabled[sig.key];
    checkbox.addEventListener("change", () => {
      state.cyclePrefs.enabled[sig.key] = checkbox.checked;
      saveCyclePrefs();
      renderCycleOverlay();
    });
    const swatch = document.createElement("span");
    swatch.className = "cycle-signal-swatch";
    const label = document.createElement("strong");
    label.className = "cycle-signal-label";
    label.textContent = `${sig.label}  (${sig.unit})`;
    const meta = document.createElement("em");
    meta.className = "cycle-signal-meta";
    meta.textContent = `${sig.adcBank} rank ${sig.rank} · +${sig.sampleDelayNs.toFixed(1)} ns`;
    const value = document.createElement("span");
    value.className = "cycle-signal-value";
    value.textContent = "--";
    row.append(checkbox, swatch, label, meta, value);
    ui.cycleSignalList.append(row);
    ui.cycleSignalCheckboxes[sig.key] = checkbox;
    ui.cycleValueCells[sig.key] = value;
  }
}

function buildCycleOptions() {
  if (!ui.cycleShowPwm) return;
  ui.cycleShowPwm.checked = state.cyclePrefs.showPwm;
  ui.cycleYMode.value = state.cyclePrefs.yMode;
  ui.cycleShowPwm.addEventListener("change", () => {
    state.cyclePrefs.showPwm = ui.cycleShowPwm.checked;
    saveCyclePrefs();
    renderCycleOverlay();
  });
  ui.cycleYMode.addEventListener("change", () => {
    state.cyclePrefs.yMode = ui.cycleYMode.value === "physical" ? "physical" : "normalized";
    saveCyclePrefs();
    renderCycleOverlay();
  });
}

function bindConfigInputs() {
  ui.configInputs = {
    kpCv: ui.kpCvInput,
    kiCv: ui.kiCvInput,
    kpCc: ui.kpCcInput,
    kiCc: ui.kiCcInput,
    kpCp: ui.kpCpInput,
    kiCp: ui.kiCpInput,
    baseFreqHz: ui.ctrlFreq,
    freqPolicy: ui.freqPolicyInput,
    softStartStep: ui.softStartStepInput
  };

  if (ui.advancedConfigGrid) {
    ui.advancedConfigGrid.replaceChildren();
    for (const field of CONFIG_FIELDS) {
      // Per-key presets are edited in the dedicated Presets drawer, never in the
      // device-constant Configure->Defaults grid.
      if (ui.configInputs[field.key] || field.group === "Buttons") continue;
      const label = document.createElement("label");
      label.className = "field";
      const span = document.createElement("span");
      span.textContent = field.label;
      const input = document.createElement("input");
      input.type = "number";
      input.step = field.type === protocol.CONFIG_VALUE_FLOAT ? "any" : "1";
      input.id = `cfg_${field.key}`;
      label.append(span, input);
      ui.advancedConfigGrid.append(label);
      ui.configInputs[field.key] = input;
    }
  }

  for (const input of Object.values(ui.configInputs)) {
    if (!input) continue;
    input.addEventListener("input", notifySettingsChanged);
    input.addEventListener("change", notifySettingsChanged);
  }
}

function resizeCycleCanvas() {
  const canvas = ui.cycleCanvas;
  if (!canvas) return null;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const cssW = Math.max(320, rect.width || canvas.clientWidth || 720);
  const cssH = Math.max(240, rect.height || canvas.clientHeight || 420);
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }
  return { cssW, cssH, dpr };
}

function renderCycleOverlay() {
  if (!ui.cycleCanvas || !state.cycleOpen) return;
  const ctx = ui.cycleCanvas.getContext("2d");
  const sizing = resizeCycleCanvas();
  if (!sizing) return;
  const { cssW, cssH, dpr } = sizing;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const latest = state.latest;
  // Period in ns: prefer the firmware-reported true frequency (gives the
  // exact running period), but fall back to the host-side setting so the
  // X-offsets between channels are visible even before the first heartbeat
  // or while disconnected.
  const periodNsTele = latest.currentFreqHz > 0
    ? 1e9 / latest.currentFreqHz : NaN;
  const baseFreqHz = state.latest.baseFreqHz || state.settingsForm.baseFreqHz;
  const periodNsSet = baseFreqHz > 0
    ? 1e9 / baseFreqHz : NaN;
  const periodNs = Number.isFinite(periodNsTele) ? periodNsTele : periodNsSet;
  const periodUs = Number.isFinite(periodNs) ? periodNs / 1000 : NaN;
  // PSFB phase-shift fraction of the period (0..0.5). app.duty already encodes
  // the realized phase as duty = phase / (PRD/2), so phaseFrac = duty / 2 -- no
  // raw MASTER compare values needed.
  const phaseFracReal = Math.max(0, Math.min(0.5, latest.duty / 2));

  const padL = 70;
  const padR = 24;
  const padT = 24;
  const padB = 56;
  const plotW = Math.max(120, cssW - padL - padR);
  const plotH = Math.max(140, cssH - padT - padB);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cssW, cssH);

  // --- Plot frame and gridlines --------------------------------------
  ctx.strokeStyle = "#9ca8b6";
  ctx.lineWidth = 1;
  ctx.strokeRect(padL, padT, plotW, plotH);

  ctx.strokeStyle = "rgba(120,130,144,0.18)";
  ctx.beginPath();
  for (let i = 1; i < SAMPLES_PER_PERIOD; i += 1) {
    const x = padL + (i / SAMPLES_PER_PERIOD) * plotW;
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + plotH);
  }
  ctx.stroke();
  ctx.strokeStyle = "rgba(120,130,144,0.4)";
  ctx.beginPath();
  for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
    const x = padL + frac * plotW;
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + plotH);
  }
  ctx.stroke();

  ctx.fillStyle = "#5a6776";
  ctx.font = "11px 'JetBrains Mono','Consolas',monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let i = 0; i <= 4; i += 1) {
    const x = padL + (i / 4) * plotW;
    const frac = i / 4;
    const label = Number.isFinite(periodUs)
      ? `${(frac * periodUs).toFixed(2)} μs`
      : `${(frac * 100).toFixed(0)}%`;
    ctx.fillText(label, x, padT + plotH + 6);
  }

  // Y-axis tick labels.
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const pct of [0, 0.5, 1]) {
    const y = padT + plotH * (1 - pct);
    ctx.fillText(`${Math.round(pct * 100)}%`, padL - 8, y);
  }
  ctx.save();
  ctx.translate(18, padT + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.fillText(state.cyclePrefs.yMode === "physical" ? "per-signal full-scale" : "normalized 0..full-scale", 0, 0);
  ctx.restore();

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#5a6776";
  ctx.fillText(Number.isFinite(periodUs) ? "switching period (μs)" : "switching period (% of T_sw)",
    padL + plotW / 2, padT + plotH + 26);

  // --- Sample traces (the raw 24 samples, straight lines, no smoothing,
  // no fake-wrap to 100%). Each rank within an ADC starts S+H at a
  // slightly different offset from the trigger; we draw at the true
  // (trigger_k + sampleDelayNs) X position so the operator can see the
  // inter-channel timing skew directly on the plot. ---
  const slotDurNs = Number.isFinite(periodNs) ? periodNs / SAMPLES_PER_PERIOD : NaN;
  const xForSample = (k, sig) => {
    if (!Number.isFinite(slotDurNs)) return padL + (k / SAMPLES_PER_PERIOD) * plotW;
    const tNs = k * slotDurNs + sig.sampleDelayNs;
    return padL + (tNs / periodNs) * plotW;
  };

  for (const sig of CYCLE_SIGNALS) {
    if (!state.cyclePrefs.enabled[sig.key]) {
      if (ui.cycleValueCells[sig.key]) ui.cycleValueCells[sig.key].textContent = "(off)";
      continue;
    }
    const samples = sig.samples(latest);
    if (!samples || samples.length === 0) continue;

    let maxRaw = 0;
    for (let k = 0; k < samples.length; k += 1) if (samples[k] > maxRaw) maxRaw = samples[k];
    const scaleDen = state.cyclePrefs.yMode === "physical"
      ? Math.max(maxRaw, sig.fullScale * 0.02)
      : sig.fullScale;

    // 1. Solid polyline between consecutive REAL samples (slot 0..23).
    //    Slot 23 sits at ~95.83% of the period (plus per-channel offset),
    //    not at 100%. We do NOT extend the polyline to 100%.
    ctx.strokeStyle = sig.color;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let k = 0; k < samples.length; k += 1) {
      const x = xForSample(k, sig);
      const normalized = samples[k] / scaleDen;
      const y = padT + plotH * (1 - Math.max(0, Math.min(1, normalized)));
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 2. Dashed wrap-around stub showing the inferred line from slot 23
    //    of THIS period back to slot 0 of the NEXT period (which lives
    //    at sampleDelayNs into the next cycle). We render two short
    //    dashed segments: slot 23 -> right edge (using interpolated
    //    end-of-period value), and left edge -> slot 0 (showing the
    //    same value entering the next cycle). This makes the implied
    //    cyclic continuity visible without pretending slot 23 is at
    //    100% or that there is a sample at the boundary.
    if (Number.isFinite(slotDurNs)) {
      const xSlot23 = xForSample(SAMPLES_PER_PERIOD - 1, sig);
      const xSlot0  = xForSample(0, sig);
      const v23 = samples[SAMPLES_PER_PERIOD - 1] / scaleDen;
      const v0  = samples[0] / scaleDen;
      // Linearly interpolate to the period boundary (x = padL + plotW).
      // The boundary lies between slot 23 (this cycle) and slot 0 (next).
      const span = (slotDurNs - sig.sampleDelayNs) + sig.sampleDelayNs; // = slotDurNs
      const t23ToBoundary = (slotDurNs - sig.sampleDelayNs); // ns from slot 23 to next-cycle period boundary? -- not right
      // Actually: slot 23 at trigger_23 + sampleDelayNs; period boundary
      // at trigger_24 = trigger_23 + slotDurNs. So distance from slot 23
      // to boundary = slotDurNs - sampleDelayNs.
      const distToBoundaryNs = slotDurNs - sig.sampleDelayNs;
      const t = Math.max(0, Math.min(1, distToBoundaryNs / slotDurNs));
      const vBoundary = v23 + (v0 - v23) * t;
      const yBoundary = padT + plotH * (1 - Math.max(0, Math.min(1, vBoundary)));
      const ySlot0 = padT + plotH * (1 - Math.max(0, Math.min(1, v0)));
      const ySlot23 = padT + plotH * (1 - Math.max(0, Math.min(1, v23)));
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = sig.color + "aa";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      // tail-end of this period
      ctx.moveTo(xSlot23, ySlot23);
      ctx.lineTo(padL + plotW, yBoundary);
      // head of next period (mirror)
      ctx.moveTo(padL, yBoundary);
      ctx.lineTo(xSlot0, ySlot0);
      ctx.stroke();
      ctx.restore();
    }

    // 3. Dots at actual sample positions.
    ctx.fillStyle = sig.color;
    for (let k = 0; k < samples.length; k += 1) {
      const x = xForSample(k, sig);
      const normalized = samples[k] / scaleDen;
      const y = padT + plotH * (1 - Math.max(0, Math.min(1, normalized)));
      ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
    }

    if (ui.cycleValueCells[sig.key]) {
      let sumRaw = 0;
      for (let k = 0; k < samples.length; k += 1) sumRaw += samples[k];
      const meanRaw = sumRaw / samples.length;
      const value = sig.toUnit(meanRaw, latest);
      ui.cycleValueCells[sig.key].textContent = `${formatSig(value)} ${sig.unit}`;
    }
  }

  // --- PWM digital waveforms (drawn on top of signal traces) ---------
  // Two bridges share the SAME high/low Y so the operator perceives a
  // single PWM-level reference; 50% alpha on the strokes lets the two
  // colours blend visibly wherever both bridges are simultaneously
  // high (which is the meaningful PSFB power-transfer interval).
  // High level tops out at ~75% from the bottom of the plot, leaving
  // the upper 25% clear for tall signal traces.
  if (state.cyclePrefs.showPwm) {
    const yHigh = padT + plotH * 0.25;
    const yLow  = padT + plotH * 0.97;
    const bridges = [
      // Colours chosen so they don't collide with any signal trace
      // (VSEC amber, VBUS gold, IPRI_DC dark green, ISEC teal, IPRI_AC green).
      { label: "Q1/PA8 lead", color: "rgba(29, 78, 216, 0.55)",  start: 0,             end: 0.5 },
      { label: "Q2/PA10 lag", color: "rgba(192, 38, 211, 0.55)", start: phaseFracReal, end: phaseFracReal + 0.5 }
    ];

    const drawPwmStroke = (color, startFrac, endFrac) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.4;        // a touch thicker so 50% alpha still pops
      ctx.lineJoin = "miter";
      ctx.lineCap = "butt";
      ctx.beginPath();
      const xAt = (f) => padL + Math.max(0, Math.min(1, f)) * plotW;
      if (endFrac <= 1) {
        // |__low__|--high--|__low__|
        ctx.moveTo(padL, yLow);
        if (startFrac > 0) ctx.lineTo(xAt(startFrac), yLow);
        ctx.lineTo(xAt(startFrac), yHigh);
        ctx.lineTo(xAt(endFrac),   yHigh);
        ctx.lineTo(xAt(endFrac),   yLow);
        if (endFrac < 1) ctx.lineTo(padL + plotW, yLow);
      } else {
        // wrap: |--high--|__low__|--high--|
        const wrapEnd = endFrac - 1;
        ctx.moveTo(padL, yHigh);
        ctx.lineTo(xAt(wrapEnd),   yHigh);
        ctx.lineTo(xAt(wrapEnd),   yLow);
        ctx.lineTo(xAt(startFrac), yLow);
        ctx.lineTo(xAt(startFrac), yHigh);
        ctx.lineTo(padL + plotW,   yHigh);
      }
      ctx.stroke();
    };

    for (const b of bridges) drawPwmStroke(b.color, b.start, b.end);

    // Tiny colored chip labels at the top of the plot so the operator
    // can immediately match "blue = lead bridge", "magenta = lag bridge".
    ctx.font = "11px 'JetBrains Mono','Consolas',monospace";
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    let chipX = padL + 4;
    for (const b of bridges) {
      ctx.fillStyle = b.color;
      ctx.fillRect(chipX, padT + 2, 10, 3);
      const label = `${b.label} 50%`;
      ctx.fillText(label, chipX + 14, padT + 7);
      chipX += ctx.measureText(label).width + 28;
    }
  }

  // Subtitle text above the canvas.
  if (ui.cycleSubtitle) {
    const slotDurNs = Number.isFinite(periodNs) ? periodNs / SAMPLES_PER_PERIOD : NaN;
    const liveTag = latest.currentFreqHz > 0 ? "live" : "preview (no telemetry)";
    ui.cycleSubtitle.textContent = Number.isFinite(periodUs)
      ? `${liveTag} · period ${periodUs.toFixed(2)} μs · slot ${(slotDurNs).toFixed(1)} ns · duty ${(latest.duty * 100).toFixed(1)}% · phase ${(phaseFracReal * 100).toFixed(1)}% T · pkt ${state.packetRate}/s`
      : `duty ${(latest.duty * 100).toFixed(1)}% · awaiting telemetry`;
  }
}

function bindUi() {
  ui.linkPill = document.getElementById("linkPill");
  ui.linkDot = document.getElementById("linkDot");
  ui.linkLabel = document.getElementById("linkLabel");
  ui.linkMeta = document.getElementById("linkMeta");
  ui.outputPill = document.getElementById("outputPill");
  ui.outputDot = document.getElementById("outputDot");
  ui.outputLabel = document.getElementById("outputLabel");
  ui.outputMeta = document.getElementById("outputMeta");
  ui.openConnectButton = document.getElementById("openConnectButton");
  ui.openRunButton = document.getElementById("openRunButton");
  ui.openConfigureButton = document.getElementById("openConfigureButton");
  ui.openCycleButton = document.getElementById("openCycleButton");
  ui.undoButton = document.getElementById("undoButton");
  ui.redoButton = document.getElementById("redoButton");
  ui.emergencyBar = document.getElementById("emergencyBar");
  ui.emergencyMeta = document.getElementById("emergencyMeta");
  ui.emergencyDisableButton = document.getElementById("emergencyDisableButton");
  ui.liveControlStrip = document.getElementById("liveControlStrip");
  ui.liveControlMeta = document.getElementById("liveControlMeta");
  ui.liveUpdateTargetsButton = document.getElementById("liveUpdateTargetsButton");
  ui.liveDisableButton = document.getElementById("liveDisableButton");
  ui.statusSubtitle = document.getElementById("statusSubtitle");
  ui.plotSubtitle = document.getElementById("plotSubtitle");
  ui.toggleChartSignalsButton = document.getElementById("toggleChartSignalsButton");
  ui.chartSelectionSummary = document.getElementById("chartSelectionSummary");
  ui.pauseChartButton = document.getElementById("pauseChartButton");
  ui.resetChartSelectionButton = document.getElementById("resetChartSelectionButton");
  ui.chartLegend = document.getElementById("chartLegend");
  ui.chartEmpty = document.getElementById("chartEmpty");
  ui.signalPicker = document.getElementById("signalPicker");
  ui.signalPickerCount = document.getElementById("signalPickerCount");
  ui.closeSignalPickerButton = document.getElementById("closeSignalPickerButton");
  ui.signalSearchInput = document.getElementById("signalSearchInput");
  ui.selectAllSignalsButton = document.getElementById("selectAllSignalsButton");
  ui.clearSignalsButton = document.getElementById("clearSignalsButton");
  ui.signalGroups = document.getElementById("signalGroups");
  ui.signalNoMatch = document.getElementById("signalNoMatch");
  ui.cycleOverlay = document.getElementById("cycleOverlay");
  ui.cycleCanvas = document.getElementById("cycleCanvas");
  ui.cycleSubtitle = document.getElementById("cycleSubtitle");
  ui.cycleSignalList = document.getElementById("cycleSignalList");
  ui.cycleShowPwm = document.getElementById("cycleShowPwm");
  ui.cycleYMode = document.getElementById("cycleYMode");
  ui.cycleCloseButton = document.getElementById("cycleCloseButton");
  ui.debugPanel = document.getElementById("debugPanel");
  ui.debugPanelToggle = document.getElementById("debugPanelToggle");
  ui.debugPanelBody = document.getElementById("debugPanelBody");
  ui.debugRunActive = document.getElementById("debugRunActive");
  ui.debugRunDuty = document.getElementById("debugRunDuty");
  ui.debugRunEff = document.getElementById("debugRunEff");
  ui.debugRunIpri = document.getElementById("debugRunIpri");
  ui.debugRunIsec = document.getElementById("debugRunIsec");
  ui.debugRunVpri = document.getElementById("debugRunVpri");
  ui.debugRunVsec = document.getElementById("debugRunVsec");
  ui.debugRunLastMeta = document.getElementById("debugRunLastMeta");
  ui.debugRunSummary = document.getElementById("debugRunSummary");
  ui.debugRunViewButton = document.getElementById("debugRunViewButton");
  ui.debugRunCopyButton = document.getElementById("debugRunCopyButton");
  ui.powerStateChip = document.getElementById("powerStateChip");
  ui.driveStateChip = document.getElementById("driveStateChip");
  ui.controlModeChip = document.getElementById("controlModeChip");
  ui.keyFlagsChip = document.getElementById("keyFlagsChip");
  ui.configOkChip = document.getElementById("configOkChip");
  ui.ocpChip = document.getElementById("ocpChip");
  ui.wdgChip = document.getElementById("wdgChip");
  ui.otpChip = document.getElementById("otpChip");
  ui.readingsKey = document.getElementById("readingsKey");
  ui.readingsSecondary = document.getElementById("readingsSecondary");
  ui.readingsDebug = document.getElementById("readingsDebug");
  ui.drawerBackdrop = document.getElementById("drawerBackdrop");
  ui.connectDrawer = document.getElementById("connectDrawer");
  ui.runDrawer = document.getElementById("runDrawer");
  ui.configureDrawer = document.getElementById("configureDrawer");
  ui.webSerialSupportLine = document.getElementById("webSerialSupportLine");
  ui.selectedPortReadout = document.getElementById("selectedPortReadout");
  ui.selectPortButton = document.getElementById("selectPortButton");
  ui.connectButton = document.getElementById("connectButton");
  ui.disconnectButton = document.getElementById("disconnectButton");
  ui.connectStatusReadout = document.getElementById("connectStatusReadout");
  ui.connectRateReadout = document.getElementById("connectRateReadout");
  ui.messageLine = document.getElementById("messageLine");
  ui.runDrawerState = document.getElementById("runDrawerState");
  ui.runDisconnected = document.getElementById("runDisconnected");
  ui.runOpenConnectButton = document.getElementById("runOpenConnectButton");
  ui.runConnected = document.getElementById("runConnected");
  ui.runLiveBanner = document.getElementById("runLiveBanner");
  ui.setVoltageInput = document.getElementById("setVoltageInput");
  ui.setCurrentInput = document.getElementById("setCurrentInput");
  ui.setPowerInput = document.getElementById("setPowerInput");
  ui.runDurationGroup = document.getElementById("runDurationGroup");
  ui.runSecondsInput = document.getElementById("runSecondsInput");
  ui.continuousCheckbox = document.getElementById("continuousCheckbox");
  ui.runStartModeGroup = document.getElementById("runStartModeGroup");
  ui.startModeRegular = document.getElementById("startModeRegular");
  ui.startModeFixed = document.getElementById("startModeFixed");
  ui.fixedDutyGroup = document.getElementById("fixedDutyGroup");
  ui.fixedDutyInput = document.getElementById("fixedDutyInput");
  ui.runValidation = document.getElementById("runValidation");
  ui.enableButton = document.getElementById("enableButton");
  ui.updateTargetsButton = document.getElementById("updateTargetsButton");
  ui.disableButton = document.getElementById("disableButton");
  ui.configureDrawerState = document.getElementById("configureDrawerState");
  ui.configureTabs = Array.from(document.querySelectorAll(".configure-tab"));
  ui.configurePages = Array.from(document.querySelectorAll(".configure-page"));
  ui.configureLock = document.getElementById("configureLock");
  ui.configureLockDisableButton = document.getElementById("configureLockDisableButton");
  ui.kpCvInput = document.getElementById("kpCvInput");
  ui.kiCvInput = document.getElementById("kiCvInput");
  ui.kpCcInput = document.getElementById("kpCcInput");
  ui.kiCcInput = document.getElementById("kiCcInput");
  ui.kpCpInput = document.getElementById("kpCpInput");
  ui.kiCpInput = document.getElementById("kiCpInput");
  ui.softStartStepInput = document.getElementById("softStartStepInput");
  ui.timingFreqSummary = document.getElementById("timingFreqSummary");
  ui.timingSamplingSummary = document.getElementById("timingSamplingSummary");
  ui.freqPolicyInput = document.getElementById("freqPolicyInput");
  ui.advancedConfigGrid = document.getElementById("advancedConfigGrid");
  ui.syncConfigButton = document.getElementById("syncConfigButton");
  ui.loadFlashButton = document.getElementById("loadFlashButton");
  ui.factoryResetButton = document.getElementById("factoryResetButton");
  ui.saveConfigButton = document.getElementById("saveConfigButton");
  ui.resetSettingsButton = document.getElementById("resetSettingsButton");
  ui.settingsValidation = document.getElementById("settingsValidation");
  ui.applySettingsButton = document.getElementById("applySettingsButton");
  ui.ctrlFreq = document.getElementById("ctrlFreq");

  ui.openPresetsButton = document.getElementById("openPresetsButton");
  ui.presetsDrawer = document.getElementById("presetsDrawer");
  ui.presetsDrawerState = document.getElementById("presetsDrawerState");
  ui.presetsDisconnected = document.getElementById("presetsDisconnected");
  ui.presetsOpenConnectButton = document.getElementById("presetsOpenConnectButton");
  ui.presetsConnected = document.getElementById("presetsConnected");
  ui.presetsLiveBanner = document.getElementById("presetsLiveBanner");
  ui.presetsValidation = document.getElementById("presetsValidation");
  ui.savePresetsButton = document.getElementById("savePresetsButton");
  ui.presetAEnable = document.getElementById("presetAEnable");
  ui.presetACvInput = document.getElementById("presetACvInput");
  ui.presetACcInput = document.getElementById("presetACcInput");
  ui.presetACpInput = document.getElementById("presetACpInput");
  ui.presetATimeInput = document.getElementById("presetATimeInput");
  ui.presetAContinuous = document.getElementById("presetAContinuous");
  ui.presetRunAButton = document.getElementById("presetRunAButton");
  ui.presetBEnable = document.getElementById("presetBEnable");
  ui.presetBCvInput = document.getElementById("presetBCvInput");
  ui.presetBCcInput = document.getElementById("presetBCcInput");
  ui.presetBCpInput = document.getElementById("presetBCpInput");
  ui.presetBTimeInput = document.getElementById("presetBTimeInput");
  ui.presetBContinuous = document.getElementById("presetBContinuous");
  ui.presetRunBButton = document.getElementById("presetRunBButton");

  ui.toastStack = document.getElementById("toastStack");

  ui.openConnectButton.addEventListener("click", () => openDrawer("connect"));
  ui.linkPill.addEventListener("click", () => openDrawer("connect"));
  ui.openRunButton.addEventListener("click", () => openDrawer("run"));
  ui.outputPill.addEventListener("click", () => openDrawer("run"));
  ui.openConfigureButton.addEventListener("click", () => openDrawer("configure"));
  ui.openPresetsButton.addEventListener("click", () => openDrawer("presets"));
  if (ui.openCycleButton) ui.openCycleButton.addEventListener("click", openCycleOverlay);
  if (ui.cycleCloseButton) ui.cycleCloseButton.addEventListener("click", closeCycleOverlay);
  if (ui.debugPanelToggle) ui.debugPanelToggle.addEventListener("click", () => setDebugPanelOpen(!state.debugPanelOpen));
  if (ui.debugRunViewButton) ui.debugRunViewButton.addEventListener("click", showLastRunSummary);
  if (ui.debugRunCopyButton) ui.debugRunCopyButton.addEventListener("click", copyLastRunSummary);
  ui.drawerBackdrop.addEventListener("click", closeDrawer);
  document.querySelectorAll("[data-drawer-close]").forEach((button) => button.addEventListener("click", closeDrawer));

  ui.selectPortButton.addEventListener("click", selectSerialPort);
  ui.connectButton.addEventListener("click", connectSerial);
  ui.disconnectButton.addEventListener("click", disconnectSerial);
  ui.runOpenConnectButton.addEventListener("click", () => openDrawer("connect"));
  ui.enableButton.addEventListener("click", sendEnableCommand);
  ui.updateTargetsButton.addEventListener("click", sendUpdateTargetsCommand);
  ui.disableButton.addEventListener("click", sendDisableCommand);
  ui.emergencyDisableButton.addEventListener("click", sendDisableCommand);
  ui.liveUpdateTargetsButton.addEventListener("click", sendUpdateTargetsCommand);
  ui.liveDisableButton.addEventListener("click", sendDisableCommand);
  ui.configureLockDisableButton.addEventListener("click", sendDisableCommand);

  ui.toggleChartSignalsButton.addEventListener("click", () => setChartSignalDrawerOpen(!state.chartSignalsOpen));
  ui.closeSignalPickerButton.addEventListener("click", () => setChartSignalDrawerOpen(false));
  ui.signalSearchInput.addEventListener("input", () => {
    state.chartSignalQuery = ui.signalSearchInput.value;
    filterChartPicker();
  });
  ui.selectAllSignalsButton.addEventListener("click", () => setChartSelection(TELEMETRY_METRICS.map((metric) => metric.key)));
  ui.clearSignalsButton.addEventListener("click", () => setChartSelection([]));
  ui.pauseChartButton.addEventListener("click", () => {
    state.chartPaused = !state.chartPaused;
    ui.pauseChartButton.setAttribute("aria-pressed", String(state.chartPaused));
    ui.pauseChartButton.querySelector("span").textContent = state.chartPaused ? "Resume" : "Pause";
  });
  ui.resetChartSelectionButton.addEventListener("click", () => setChartSelection(DEFAULT_CHART_METRICS));

  document.querySelectorAll("[data-toggle-section]").forEach((button) => button.addEventListener("click", () => toggleSection(button)));
  ui.configureTabs.forEach((button) => button.addEventListener("click", () => setConfigTab(button.dataset.configTab)));

  bindConfigInputs();

  ui.applySettingsButton.addEventListener("click", sendApplySettings);
  ui.resetSettingsButton.addEventListener("click", restoreDefaults);
  if (ui.saveConfigButton) ui.saveConfigButton.addEventListener("click", sendSaveConfig);
  if (ui.syncConfigButton) ui.syncConfigButton.addEventListener("click", () => requestConfigSnapshot(true));
  if (ui.loadFlashButton) ui.loadFlashButton.addEventListener("click", () => sendConfigSimpleOp(CONFIG_OP_LOAD_FLASH, "FLASH LOADED TO DRAFT"));
  if (ui.factoryResetButton) ui.factoryResetButton.addEventListener("click", () => sendConfigSimpleOp(CONFIG_OP_FACTORY_RESET, "FACTORY RESET COMPLETE"));

  ui.presetsOpenConnectButton.addEventListener("click", () => openDrawer("connect"));
  ui.savePresetsButton.addEventListener("click", sendSavePresets);
  ui.presetRunAButton.addEventListener("click", () => sendRunPreset("A"));
  ui.presetRunBButton.addEventListener("click", () => sendRunPreset("B"));
  [
    ui.presetAEnable, ui.presetACvInput, ui.presetACcInput, ui.presetACpInput, ui.presetATimeInput, ui.presetAContinuous,
    ui.presetBEnable, ui.presetBCvInput, ui.presetBCcInput, ui.presetBCpInput, ui.presetBTimeInput, ui.presetBContinuous
  ].forEach((el) => {
    el.addEventListener("input", updatePresetFormVisibility);
    el.addEventListener("change", updatePresetFormVisibility);
  });

  [ui.setVoltageInput, ui.setCurrentInput, ui.setPowerInput, ui.runSecondsInput, ui.continuousCheckbox, ui.startModeRegular, ui.startModeFixed, ui.fixedDutyInput].forEach((input) => {
    input.addEventListener("input", () => {
      updateRunFormVisibility();
      if (history) history.schedule();
    });
    input.addEventListener("change", () => {
      updateRunFormVisibility();
      if (history) history.schedule();
    });
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (state.cycleOpen) {
        closeCycleOverlay();
        return;
      }
      if (state.activeDrawer) {
        closeDrawer();
      }
    }
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === "z" && !event.shiftKey) {
      event.preventDefault();
      if (history) history.undo();
    } else if (key === "y" || (key === "z" && event.shiftKey)) {
      event.preventDefault();
      if (history) history.redo();
    }
  }, true);
  window.addEventListener("resize", () => { if (state.cycleOpen) renderCycleOverlay(); });

  ui.undoButton.addEventListener("click", () => { if (history) history.undo(); });
  ui.redoButton.addEventListener("click", () => { if (history) history.redo(); });
  preventAccidentalNumberStepping();
}

function boot() {
  window.addEventListener("error", (event) => logError(event.message || "UNHANDLED ERROR", event.error || null));
  window.addEventListener("unhandledrejection", (event) => logError("UNHANDLED PROMISE REJECTION", event.reason || null));

  bindUi();
  buildCycleSignalControls();
  buildCycleOptions();
  writeSettingsForm(state.settingsForm);
  buildChartPicker();
  renderTelemetryCards();
  updateChartSelectionUi();
  refreshSettingsReadouts();
  updateRunFormVisibility();
  updatePresetFormVisibility();
  buildChart();
  setDebugPanelOpen(false);

  window.setInterval(sampleTimeline, CHART_SAMPLE_MS);

  history = new historyLib.HistoryStack({
    snapshot: () => ({
      settings: historyLib.deepClone(state.settingsForm),
      command: snapshotCommandForm(),
      chartMetrics: state.selectedChartMetrics.slice()
    }),
    apply: (snap) => {
      state.settingsForm = historyLib.deepClone(snap.settings);
      writeSettingsForm(state.settingsForm);
      refreshSettingsReadouts();
      applyCommandFormSnapshot(snap.command);
      state.selectedChartMetrics = snap.chartMetrics.slice();
      saveChartSelection();
      updateChartSelectionUi();
      syncChartConfiguration();
    },
    onChange: updateSystemUi
  });

  updateSystemUi();
}

document.addEventListener("DOMContentLoaded", boot);

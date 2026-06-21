# Debug Mode Design & Implementation Plan

This document captures the design of the debug-mode firmware and host UI
ahead of coding. It is the working notebook for the `debug` branch.

## 2026-06-09 术语更正：ISP → IAP（自写引导程序应称在应用编程）

更正背景：
- 此前把自写引导程序称作 "ISP"。实际上 ISP（In-System Programming，在系统编程）通常特指经 ST 出厂 System Memory Bootloader / 内置协议对芯片在系统内编程；而本工程是常驻 Flash 的**用户自写引导程序**，通过自定义 UART 协议改写 App 区，属于 IAP（In-Application Programming，在应用编程）。故统一更名为 IAP。
- 纯命名更正，不改任何逻辑 / 协议 / 时序 / Flash 布局 / LED 行为。

代码（`git mv` 保留历史）：
- `BootLoader/Core/Src/boot_isp.c` → `boot_iap.c`；`BootLoader/Core/Inc/boot_isp.h` → `boot_iap.h`。
- 标识符：`BootIsp_Run` → `BootIap_Run`；`isp_loop()` → `iap_loop()`；枚举 `BL_LED_ISP` → `BL_LED_IAP`；头文件保护宏 `BOOT_ISP_H` → `BOOT_IAP_H`；`boot_iap.c` 与 `main.c` 的 `#include "boot_isp.h"` → `"boot_iap.h"`，`main.c` 调用改为 `BootIap_Run()`。

工程 / 上位机 / 文档：
- Keil：`BootLoader/MDK-ARM/G474_BL.uvprojx` 的 `<FileName>` / `<FilePath>` 指向 `boot_iap.c`。
- 上位机：`BootLoaderHostUI/index.html` 的 `<title>` / `<h1>` 由 "HVCCPS ISP" 改为 "HVCCPS IAP"（`app.js`、`styles.css` 无 ISP 字样，无需改）。
- `README.md`：「Bootloader（自写 UART IAP 引导程序）」章节及「IAP 协议」「IAP 等待握手」等术语统一为 IAP。

说明：
- 本条目以上的历史记录（2026-06-08 / 06-09 各条）仍按当时写法保留 "ISP" 字样，作为变更留痕；自本次起该功能一律称 IAP。
- 供应商文件（CMSIS / HAL）内的 `ISP` 子串（如 `SCB->ISPR`、`DISP*` 等寄存器 / 宏）与本引导程序无关，未改动。

验证：
- 待 Keil 重新编译确认（纯重命名，预期 `0 Error(s)`，Program Size 不变）。
- 上位机仅改 `index.html` 文本，无 JS 改动。

## 2026-06-09 Bootloader 每次进入 ISP 限一次擦除（防 BEGIN flood 擦穿 Flash）

背景 / 隐患：
- 擦除的唯一触发点是 `receive_begin()` 收到参数合法的 `BEGIN`（`boot_isp.c`）：调用 `metadata_begin_update()`（擦 metadata 页 page 7）+ `erase_app_area()`（擦 App 区）。
- `isp_loop()` 失败后会 `led_error_blink()` 再回到 `receive_begin()` 无限等待下一个 `BEGIN`。若上位机卡 bug / 被替换 / 脚本死循环，反复发合法 `BEGIN`，则每轮（约 1~2 s）就擦 1 次 metadata + App 区；按 ~10,000 次/页寿命估算约 4 小时即可擦穿，代码层面原本无任何防护。
- 当前 `app.js` 每次点击只发 1 次 `BEGIN`，不触发；噪声因帧 CRC32 + 参数校验也无法构成合法 `BEGIN`。这是“异常上位机”风险，非噪声风险。

策略（按用户要求）：
- **每次进入 ISP 最多允许擦除 1 次**。该次擦除一经消耗（无论后续烧录成功或失败），后续任何 `BEGIN` 一律拒绝；用户须按 RST 重新进入 ISP 才能再次烧录。成功烧录本就以 `NVIC_SystemReset()` 收尾 → 复位后预算自动刷新，正常流程不受影响。

代码修改：
- `BootLoader/Core/Src/boot_isp.c`
  - 新增 `BL_STATUS_ERASE_LIMIT = 12U`、`BL_MAX_ERASES_PER_ENTRY = 1U`、文件级 `static uint32_t bl_erase_count;`。
  - `isp_loop()` 入口处 `bl_erase_count = 0U;`——`isp_loop` 每次开机/复位只进入一次，等价于“每次进入 ISP 刷新一次擦除预算”。
  - `receive_begin()` 参数合法分支前加预算判断：`bl_erase_count >= BL_MAX_ERASES_PER_ENTRY` 时回 `STATUS=ERASE_LIMIT`（detail=已用次数）且不擦除；否则 `bl_erase_count++` 后再 `metadata_begin_update` + `erase_app_area`。参数非法仍走 `BAD_LENGTH`，不消耗预算。
- `BootLoaderHostUI/app.js`
  - `STATUS_TEXT` 增加 `[12, "ERASE_LIMIT"]`，烧录被拒时上位机显示 `BEGIN failed: ERASE_LIMIT`。
- `README.md`
  - ISP 协议“烧录”条目补充“每次进入 ISP 仅允许一次擦除 / 失败重试须按 RST / `STATUS=ERASE_LIMIT`”的当前行为。

验证：
- Bootloader Keil 编译：`0 Error(s), 0 Warning(s)`；`Program Size: Code=13034 RO-data=570 RW-data=52 ZI-data=2972`，ROM ≈ 13.29 KiB，仍在 14 KiB（0x3800）代码区内（本次 guard 约 +150 B）。
- `node --check BootLoaderHostUI/app.js` 通过。
- 行为需实机复测：正常烧录 1 次成功并复位；故意失败后不按 RST 再发 `BEGIN` 应收到 `ERASE_LIMIT`，按 RST 后可再次烧录。

## 2026-06-09 修复 BootLoaderHostUI 串口读循环遇错即停（烧录无响应）

问题现象：
- 连接串口后立即出现 `Read loop stopped: Buffer overrun`；随后点击烧录，等待约 15 s 报 `Flash failed: Bootloader did not respond.`，按下位机 RST 也无反应。

根因：
- `BootLoaderHostUI/app.js` 的 `readLoop()` 用单层 `try/catch` 包住 `reader.read()`，遇到第一个错误就 `log` 后退出循环，整个会话不再接收任何字节。
- Web Serial 对可恢复传输错误（buffer overrun / framing / parity / break）的处理方式是把 `ReadableStream` 置为 errored；正确做法是释放旧 reader、从 `port.readable` 重新 `getReader()` 续读，而不是当成致命错误退出。
- `Buffer overrun` 本身说明“有数据正在到达”——即 Bootloader 一直在正常周期发送 `READY`（无有效 App 时常驻 `isp_loop`，每 100 ms 一帧）。读循环一死，`enqueueBytes` 不再被调用，所有 `readByte()` 超时 → `readFrame()` 收不到 `READY` → 15 s 后判“无响应”。按 RST 也没用，因为上位机已不再监听。

代码修改（`BootLoaderHostUI/app.js`）：
- `readLoop()` 改为 `while (port && port.readable && keepReading)` 外层循环：每轮 `getReader()`，内层读到 `done` 或抛错后在 `finally` 里 `releaseLock()` 并置 `reader=null`；可恢复错误只记日志（`Serial read error (recovering): …`）后重新取 reader 续读。
- 新增模块级 `keepReading` 标志；`connect()` 置 `true` 且不再预先 `getReader()`（交给 `readLoop`），清空 `rxQueue`/`pendingReadResolvers`，`port.open()` 增加 `bufferSize: 4096` 降低突发溢出概率。
- `disconnect()` 改为置 `keepReading=false` 后 `reader.cancel()` 唤醒挂起的 `read()`，锁由 `readLoop` 的 `finally` 释放，避免重复 `releaseLock`。
- `flashFirmware()` 开始处清空 `rxQueue`，避免上一段 `READY` 流的残留字节打乱首帧解析。

核查（未改但确认正确）：
- 帧 CRC 两端均为软件 zlib CRC-32（`crc32_sw_update_raw` ↔ `crc32AccumulateRaw`），握手不依赖硬件 CRC，本修复后 `HELLO/READY/BEGIN/...` 可正常收发。
- Bootloader 数据块/镜像 CRC 用硬件 CRC（`crc.c`：默认多项式 + 输入按字节位反转 + 输出位反转 + init `0xFFFFFFFF`，`crc32_bytes` 末尾再 `^0xFFFFFFFF`），等价于 host 端软件 zlib CRC-32，握手后不会再出现二次 `BAD_CRC`。

验证：
- `node --check BootLoaderHostUI/app.js` 通过（语法正确）。
- Web Serial 行为需浏览器 + 实机，无法在此环境运行；待连接 Bootloader 实机复测整套烧录流程。

## 2026-06-09 Bootloader metadata 单擦除、分区缩小与错误快闪

目标：
- Bootloader 烧录 App 时，metadata 页每次更新只擦除 1 次，避免 BEGIN 写 UPDATING、结束写 VALID 各擦一次导致页寿命减半。
- 按实际 Bootloader 体积缩小常驻区，把 App 起始地址前移，释放给 App 使用的 flash。
- 修正新增 `BootLoader/` 工程后 `.gitignore` 对 MDK 输出目录的路径假设。
- 加快 Bootloader 错误 LED 闪烁，避免肉眼看起来像常亮。

实际尺寸与分区：
- 先编译现有 Bootloader：`Total ROM Size = 13292 B (12.98 KiB)`，`Total RO Size = 13244 B (12.93 KiB)`。
- 代码区按 2 KiB page 对齐保留 7 页：`0x08000000` - `0x080037FF`，共 14 KiB。
- metadata 页放在第 7 页：`0x08003800` - `0x08003FFF`，共 2 KiB。
- App 起始地址前移到 `0x08004000`，App 区为 `0x08004000` - `0x0801F7FF`，共 110 KiB；末尾 `0x0801F800` - `0x0801FFFF` 仍保留给 App 配置日志。

代码修改：
- `BootLoader/Core/Src/boot_isp.c`
  - 更新 flash 布局常量：`BL_CODE_SIZE_BYTES = 0x3800`、`BL_META_PAGE_ADDR = 0x08003800`、`BL_META_PAGE_INDEX = 7`、`BL_APP_BASE_ADDR = 0x08004000`。
  - metadata 页拆成两个 8 字节标志窗口和一个记录区：
    - `0x08003800`：`UPDATING` 标志窗口，写 `0x5A5A5A5A` 与反码。
    - `0x08003808`：`VALID` 标志窗口，写 `0xA5A5A5A5` 与反码。
    - `0x08003810`：定长 metadata 记录区。
  - `metadata_write(state, ...)` 拆为：
    - `metadata_begin_update(app_size, app_crc)`：擦 metadata 页 1 次，写 UPDATING 窗口，再写记录。
    - `metadata_mark_valid(app_size, app_crc)`：不擦页，只追加写 VALID 窗口。
  - 记录本体 `state` 字段固定为 erased/invalid 参与 record CRC，实际状态由两个标志窗口推导；这样 VALID 追加写不会改变已写 doubleword，也不会破坏记录 CRC。
  - 镜像 CRC 或向量表校验失败时不再额外写 INVALID；保持只有 UPDATING 标志，下次复位不会跳 App。
  - ISP 等待 `BEGIN` 不设置超时；App 无效进入 ISP 时只持续等待上位机并周期发送 `READY`，不把空等烧录请求判为故障。
  - 非 `BEGIN` 帧返回 `BAD_SEQUENCE` 后继续等待；`ABORT` 返回 `ABORTED` 后继续等待； malformed `BEGIN` / 擦写失败 / 后续传输或校验失败才进入故障提示。
  - 真实故障调用 `led_error_blink()`：LED_C 从灭态开始每 100 ms 翻转一次，形成 200 ms 周期快闪，共 8 次翻转后回到 ISP 等待态。
- `BootLoader/Core/Src/main.c`
  - `Error_Handler()` 全灯翻转延时从 `900000` 空循环降到 `250000`，早期初始化失败也能明显闪烁。
- `BootLoader/MDK-ARM/stm32g474xx_flash.sct`
  - Bootloader IROM 从整片 flash 缩到 `0x08000000` + `0x00003800`。
- `BootLoader/MDK-ARM/G474_BL.uvprojx`
  - IROM size 同步为 `0x3800`；IRAM 保持 `0x20000`。
- `App/MDK-ARM/stm32g474xx_flash.sct`
  - App IROM 改为 `0x08004000` + `0x0001B800`。
- `App/MDK-ARM/G474_HVCCPS.uvprojx`
  - App IROM start/size 同步为 `0x8004000` / `0x1B800`。
- `App/Core/Src/system_stm32g4xx.c`
  - `VECT_TAB_OFFSET = 0x00004000`。
- `BootLoaderHostUI/app.js`
  - `APP_BASE = 0x08004000`，与 Bootloader READY/App 工程一致。
- `.gitignore`
  - MDK 输出目录改为 `**/MDK-ARM/...` 形式，覆盖 `App/MDK-ARM` 与 `BootLoader/MDK-ARM`。
- `README.md`
  - 当前版本 Flash 布局、App 向量偏移、metadata 双窗口格式、BootLoaderHostUI 地址范围和编译命令同步为当前实现。

验证：
- Bootloader Keil 编译：
  - 命令：`& 'D:\apps\keil_v5\uv4\uVision.com' -b G474_BL.uvprojx -j0 -o build.log`
  - 结果：`0 Error(s), 0 Warning(s)`；`Program Size: Code=12886 RO-data=570 RW-data=48 ZI-data=2968`。
  - ROM 约 13.14 KiB，低于 14 KiB 代码区上限。
- App Keil 编译：
  - 命令：`& 'D:\apps\keil_v5\uv4\uVision.com' -b G474_HVCCPS.uvprojx -j0 -o build.log`
  - 结果：`0 Error(s), 0 Warning(s)`；`Program Size: Code=43796 RO-data=17304 RW-data=244 ZI-data=5740`。
- BootLoaderHostUI 基础语法校验：
  - `node --check BootLoaderHostUI\app.js` 通过。

## 2026-06-08 修复 Bootloader 启动即死机（缺失 SysTick_Handler）

现象：STLink 刷入 Bootloader 后，进入 Web ISP 页面、连接串口、选择固件、点击烧录并按下硬件
RST，下位机三个 LED 全部常亮且不再变化，反复按 RST 现象相同；上位机日志停在
`Sending 0x45 entry stream. Press the target RST now.`，随后报 `Flash failed: Bootloader did not respond.`。

定位：
- `BootLoader/Core/Src/stm32g4xx_it.c` 被精简成空壳，**缺失全部 Cortex-M 异常处理函数**，
  其中关键的 `SysTick_Handler` 没有定义。
- 启动文件 `startup_stm32g474xx.s` 的向量表项 `SysTick_Handler` 为 `[WEAK]`，未被强定义覆盖时
  指向 `Default_Handler`（死循环 `B .`）。
- 死机链路：`HAL_Init()` 使能 SysTick 1 ms 中断 → `MX_GPIO_Init()` 把 LED_A/B/C 全部拉到
  `GPIO_PIN_RESET`（低有效，三灯全亮）→ `SystemClock_Config()` 启动 HSE/PLL 期间约 1 ms 后
  首个 SysTick 中断触发 → 跳进 `Default_Handler` 死循环 → MCU 卡死，永远到不了 `BootIsp_Run()`。
- 结果：三灯保持 `MX_GPIO_Init` 点亮的全亮态、USART3 从未真正服务、每次复位都一样确定性卡死，
  与现象完全吻合。READY 握手用的是软件帧 CRC（与上位机一致），故并非 CRC 或串口配置问题。

修复：
- 在 `BootLoader/Core/Src/stm32g4xx_it.c` 中恢复标准 CubeMX 生成的 Cortex-M 异常处理函数：
  `NMI/HardFault/MemManage/BusFault/UsageFault/SVC/DebugMon/PendSV/SysTick`，其中
  `SysTick_Handler()` 调用 `HAL_IncTick()`，使 `HAL_GetTick()`/`HAL_Delay()`/各超时正常工作。
  Bootloader 全程用轮询方式收发 USART3、CRC、FLASH，无需任何外设 IRQ，故只补回内核异常即可。
- 在 `BootLoader/Core/Inc/stm32g4xx_it.h` 中补回上述处理函数原型。

验证：
- Keil 命令行编译 Bootloader：
  `& 'D:\apps\keil_v5\uv4\uVision.com' -b BootLoader\MDK-ARM\G474_BL.uvprojx -j0 -o build.log`
- 结果：`0 Error(s), 0 Warning(s)`；`Code=12674 RO-data=570`，远小于 `0x7800` 代码区。

文档：
- README.md 新增「Bootloader（自写 UART ISP 引导程序）」章节，记录 Flash 布局、启动流程、
  ISP 拉取协议、元数据记录、LED 指示、上位机 `BootLoaderHostUI/` 与编译命令。

## 2026-06-08 Custom UART pull-mode Bootloader and Web ISP

Implemented the in-project Bootloader plus browser WebSerial ISP path for HVCCPS.

- Project layout now uses `BootLoader/` for the resident firmware, `App/` for the power-control application, and `BootLoaderHostUI/` for the browser ISP.
- Flash layout:
  - Bootloader code: `0x08000000` - `0x080077FF`
  - Bootloader metadata page: `0x08007800` - `0x08007FFF`
  - App image: `0x08008000` - `0x0801F7FF`
  - App config log page: `0x0801F800` - `0x0801FFFF`
- Bootloader startup behavior:
  - Initializes GPIO, USART3 at 115200 8N1, and hardware CRC.
  - Waits 50 ms for entry byte `0x45`; if seen, stays in ISP mode.
  - Without entry byte, validates metadata, App vector table, and hardware CRC32 before jumping to `0x08008000`.
  - If App metadata/state/CRC/vector is invalid, stays in ISP mode.
- UART ISP protocol:
  - Entry sync uses raw byte `0x45`.
  - Framed protocol uses SOF `HVBL`, a 16-byte header, payload, and CRC32 trailer.
  - Host sends `HELLO`; Bootloader replies `READY` with App base, max size, page size, chunk size, version, and pairing magic.
  - Host sends `BEGIN` with image size, image CRC32, App base, and parsed HEX address range.
  - Bootloader erases the App pages, then actively requests each `(offset,length)` chunk.
  - Host answers each request with `DATA`; Bootloader checks per-chunk CRC, writes flash doublewords, skips all-`0xFF` doublewords, and verifies programmed bytes.
  - Final image verification uses the STM32 hardware CRC peripheral and the App vector table check, then writes VALID metadata and resets.
  - Failure paths send `STATUS` frames for timeout, bad sequence, bad length/offset, bad CRC, flash error, image CRC error, invalid vector, and abort.
- Robustness notes:
  - Metadata is written as UPDATING before erase/program and VALID only after full CRC/vector verification.
  - Interrupted or failed updates leave Bootloader resident and App invalid, so the next reset remains in ISP mode instead of jumping bad code.
  - Bootloader never writes below `0x08008000` or into the App config page.
  - Jump to App deinitializes USART3/CRC/HAL/RCC, clears SysTick and NVIC pending/enables, sets VTOR/MSP to the App vector table, restores privileged MSP thread mode, and re-enables global IRQ before entering the App reset handler.
  - LED behavior is active-low: idle C on, ISP A on, receiving A blink plus B on, error B on plus C blink, valid all on briefly.
- App relocation:
  - App scatter file and Keil IROM start at `0x08008000` with size `0x17800`.
  - App `system_stm32g4xx.c` enables vector relocation with `VECT_TAB_OFFSET = 0x00008000`.
- Web ISP:
  - `BootLoaderHostUI/index.html`, `styles.css`, and `app.js` implement a pure browser WebSerial tool.
  - Supports `.hex` and `.bin`; HEX records are checksum-verified and must fit inside the App region.
  - The Flash action continuously sends `0x45` while waiting for the user to press target RST, then performs HELLO/BEGIN/REQUEST/DATA/STATUS.
  - The progress bar is driven by Bootloader REQUEST offsets, so it reflects actual requested/programmed image progress.
  - The UI checks Bootloader App base, App limit, and pairing magic before erasing.
- Verification:
  - `node --check BootLoaderHostUI/app.js` passed.
  - `git diff --check` passed for edited Bootloader/App/WebISP files.
  - Bootloader Keil build passed: `0 Error(s), 0 Warning(s)`, `Program Size: Code=12634 RO-data=570 RW-data=48 ZI-data=2968`.
  - App Keil build passed: `0 Error(s), 0 Warning(s)`.

### 2026-06-08 field handshake fix

- Moved Bootloader GPIO initialization before PLL/system-clock setup and made `Error_Handler()` blink all three LEDs, so early clock/init failures are visible instead of appearing as all LEDs off.
- Changed ISP mode to send periodic unsolicited `READY` frames every 100 ms while waiting for `BEGIN`; `HELLO` still gets a `READY` response, but the host no longer needs to land `HELLO` in the first 50 ms entry window.
- Reduced Web ISP entry-byte traffic from 64 bytes every 4 ms to one `0x45` every 10 ms, avoiding a saturated 115200-baud TX queue that could delay the first protocol frame.
- Web ISP now deasserts DTR/RTS after opening WebSerial when supported, reducing the chance that USB-UART auto-reset wiring holds the target in reset.

## 2026-06-08 按键 A/B 运行预设 + 上位机/按键统一安全停机

让设备脱离上位机也能用：为前面板两个按键各定义一组闭环运行预设（CC/CV/CP 目标 + 运行时间），保存到 flash，上电后无需连接上位机，按一下按键即可按预设参数运行。

### 按键状态机（下位机）

- 之前 `Core/Src/app_core.c` 的 `read_key_flags()` 只把 KEY_A(PB0)/KEY_B(PA7) 的原始电平打进心跳，不触发任何动作；本次为按键加上动作逻辑。
- 抽出两个公共函数，让“上位机命令”和“按键”走完全相同的启停路径：
  - `app_start_run(cv_mv, cc_ma, cp_mw, duration_s, fixed_active, fixed_value)`：原 `APP_CMD_BIT_ENABLE` 分支的全部动作（夹紧目标、清 OCP/OTP、设占空模式、装运行计时、`set_psfb_outputs(1)`、变频锁定）。目标在内部夹紧，调用方可传原始值；`duration_s == 0` 表示无限运行。
  - `app_stop_output()`：原 `APP_CMD_BIT_DISABLE` 分支的全部动作，并清 OCP/OTP 锁存，使下一次启动是干净的上电。
  - `parse_command()` 改为调用这两个函数；`update_run_timer()` 定时到期也改走 `app_stop_output()`，去重。
- 新增 `process_keys()`（在 `APP_Task()` 中每轮调用，位于 `process_rx()` 之后）：基于 `HAL_GetTick()` 的 25 ms 防抖 + 上升沿检测，统一规则：
  - 输出已在运行（无论上位机还是按键启动）→ 任意按键按下都直接停机（面板安全急停，上位机 RUN 后断连也能在下位机关断）；
  - 输出关闭时，按下的那个键若其预设 `enable==1` → 按预设闭环启动（A 优先）；
  - 预设未启用 → 忽略。
- 预设从 `ConfigManager_Active()` 的 `btn_a_*` / `btn_b_*` 读取；LED_B 仍由 `set_psfb_outputs()` 表示“输出运行中”，按键启动时同样点亮，提供脱机反馈。

### 预设持久化（复用现有配置记录）

- `Core/Inc/config_manager.h`：`HV_CONFIG_SCHEMA_VERSION` 1→2；`HV_ConfigFieldId` 增加 40–49（A/B 各 enable/cc_ma/cv_mv/cp_mw/time_s）；`HVCCPS_Config` 末尾追加 10 个 `uint32_t` 字段（单位对齐命令路径：CV mV、CC mA、CP mW、time s，0=无限，enable∈{0,1}）。
- `Core/Src/config_manager.c`：`load_defaults()` 全部置 0（预设默认禁用，未配置时按键按下为安全空操作）；`value_type_for_field()`/`ConfigManager_GetField()`/`set_field()` 各加 10 个分支；`validate_config()` 加上预设范围校验（新增 `HV_CONFIG_BTN_MAX_*` 上限）。
- 因 `sizeof(HVCCPS_Config)` 由 100→140 字节，旧 flash 记录 length 不匹配会失效，刷入本固件后首次上电回退到内置默认值一次（默认值即当前已调好的值），如有额外微调在上位机重新 Save 一次即可。

### 配置协议线长

- `Core/Inc/app_protocol.h`：`APP_CONFIG_RESPONSE_MAX_LEN` 260→320（GET_SNAPSHOT 最大 = 25 头 + 2×140 + 2 = 307 B）。
- `Core/Src/app_protocol.c`：`APP_Protocol_WriteConfig()` 末尾追加 10 个 `WriteLe32`（与结构体/JS 同序）；`BuildConfigResponse()` 的 `2U*100U`→`2U*140U`。

### 上位机（HostUI2.0）

- `protocol.js`：`CONFIG_FIELDS` 末尾追加 10 个 `Buttons` 组 U32 字段（顺序严格匹配 `WriteConfig`：A enable/cc/cv/cp/time，再 B）；`DEFAULT_CONFIG` 补 10 个 0；`CONFIG_RECORD_SIZE` 100→140；配置响应解码上限 260→320（`CONFIG_RESPONSE_MAX_SIZE`）。
- 新增独立 **Presets** 抽屉（与“设备常量”Configure 面板分离）：顶栏 Presets 按钮 + `presetsDrawer`，A/B 两列各含 Enable、CV(V)/CC(mA)/CP(W)、Run Time(s)+Continuous，底部 “Save Presets to Flash”，每列另有 “Run now (test)” 直接用表单值发命令测试。
- `app.js`：`bindConfigInputs()` 跳过 `group==="Buttons"`，预设字段绝不出现在 Configure→Defaults 网格；`readOnePreset/readPresetForm/writePresetForm/updatePresetFormVisibility/refreshPresetValidation/sendSavePresets/sendRunPreset`；`sendSavePresets` 只对 10 个预设字段做 SET_FIELD（V→mV、W→mW、s、enable/continuous→0/1）再 APPLY_DRAFT+SAVE_DRAFT；`applyConfigSnapshot()` 调 `writePresetForm()` 回填；`updateSystemUi()` 在运行/未连接/配置忙时锁定保存与测试按钮。
- `styles.css`：新增 `.preset-columns` 两列布局、`.presets-intro`，沿用现有浅色工业风样式。

### 验证

- Keil 全量重编译通过：`0 Error(s), 0 Warning(s)`；Program Size：`Code=43780 RO-data=17304 RW-data=244 ZI-data=5740`。
- `node --check HostUI2.0/protocol.js`、`node --check HostUI2.0/app.js` 均通过；预设元素 id 在 index.html 与 app.js 间一一对应。

## 2026-06-03 HRTIM A/B update source 核查

- 检查 CubeMX 对 HRTIM Timer A/B 的更新源调整：`Core/Src/hrtim.c` 中 Timer A/B 已改为 `UpdateTrigger = HRTIM_TIMUPDATETRIGGER_MASTER`，且 `RepetitionUpdate = HRTIM_UPDATEONREPETITION_DISABLED`、`ResetUpdate = HRTIM_TIMUPDATEONRESET_DISABLED`，避免 A/B 自身 repetition 或 reset 绕过 master update 提前搬运 preload。
- `G474_HVCCPS.ioc` 同步体现 A/B `NumberUpdateTrigger=1`、`UpdateTrigger1=HRTIM_TIMUPDATETRIGGER_MASTER`，并关闭 A/B repetition/reset update。C/D/E 继续沿用 master update，HRTIM 六个定时器的 preload 搬运时机一致。
- 应用层 `hrtim_load_periods()` / `set_duty()` 不需要逻辑改动：周期和 compare 仍只写 preload，运行中变频由 HRTIM master ISR 在周期边界写入，下一次 master update 统一生效；软起动前馈覆盖逻辑仍成立。
- 修复 CubeMX/Keil 伴随改动：`MDK-ARM/stm32g474xx_flash.sct` 一度恢复为完整 `0x00020000` IROM，会覆盖 `config_manager.c` 使用的最后 2 KB 配置日志页 `0x0801F800`，已改回 `0x0001F800` 保留最后 2 KB。

## 2026-06-03 闭环停机后恢复 active base frequency

- 修复闭环自动变频后再次启动偶尔沿用上次运行频率的问题。
- `Core/Src/app_core.c` 新增 `restore_base_frequency_when_output_off()`：
  - 当输出已经 disabled，且 `g_current_freq_hz != active.base_freq_hz` 或仍有 pending 变频计划时，调用 `apply_active_config()`。
  - `apply_active_config()` 重新装载 active 配置中的 `base_freq_hz` 到 HRTIM 周期寄存器，并清 duty、PI 和变频 pending。
- 手动 Disable 分支已经会回到 active base frequency；本次补齐其他停机路径：
  - 定时运行到期 `update_run_timer()` 停输出后立即 `apply_active_config()`。
  - OCP/OTP 或其他使 `power_enable_latched` 变 0 的保护停机，在控制 ISR 的公共 disabled 分支中归一化到 active base frequency。
- 这样闭环模式下一次 Enable 总是从配置里的基准频率（默认 35 kHz，或用户 active 配置中的 `base_freq_hz`）开始，而不是从上一次自动优化后的运行频率开始。
- 验证：Keil 编译通过，`0 Error(s), 0 Warning(s)`；Program Size: `Code=42964 RO-data=17304 RW-data=228 ZI-data=5556`。

## 2026-06-03 HostUI 串口自动重连

- `HostUI2.0/app.js` 增加保持连接模式：
  - 操作员点击 Connect 后设置 `autoReconnectEnabled = true`。
  - 串口读错误、read loop 结束、`port.open()` 失败都会继续重试同一个已授权 `SerialPort`。
  - 手动 Disconnect 会清除重连 timer、关闭保持连接模式，并取消当前 reader/open 流程。
  - 重连间隔为 `AUTO_RECONNECT_DELAY_MS = 500`，避免浏览器 WebSerial open/close 被紧密循环打爆。
  - UI 顶栏显示 `CONNECTING` / `RECONNECTING`，Connect drawer 显示 `Auto reconnecting` 和 attempt 计数。
  - 重连失败只更新底部状态行，首次和每 10 次 attempt 弹 toast，避免连续错误刷屏。
- README 的 HostUI 连接说明同步到当前行为。
- 验证：
  - `node --check HostUI2.0/app.js` 通过。

## 2026-06-03 配置分层重构：ConfigManager、配置协议、flash 日志持久化、HostUI draft 同步

按本次配置解耦目标，把“编译期硬件常量 / 可持久化配置 / draft 配置 / active 配置 / 运行状态”拆开，并把上位机的设置包机制重构为带请求序号和响应状态的配置协议。当前 duty、MCMP3、PI 积分、目标值、保护锁存等仍留在运行状态中，不进入配置持久化结构。

### 下位机配置管理

- 新增 `Core/Inc/config_manager.h` / `Core/Src/config_manager.c`：
  - `HVCCPS_Config` 保存可持久化配置：三环 PI、`base_freq_hz`、`freq_policy`、`soft_start_step`、自动变频计分阈值、锁定窗口、滤波系数、步进、升降频阈值、前馈 `gamma`。
  - 维护 `draft_config`、`active_config`、`flash_config` 三份配置；`ConfigManager_GetSnapshot()` 返回 draft/active 及 revision、flash sequence、flags。
  - 字段访问统一走 field id：`ConfigManager_SetDraftField()` / `ResetDraftField()` / `GetField()`，每次修改先构造 candidate 并整体校验。
  - `ConfigManager_ApplyDraft()` 只把 draft 复制到 active；硬件周期重载由 `app_core.c` 的 `apply_active_config()` 执行。
  - `config_flags` 由状态派生：flash valid、draft 与 flash 不一致、active 与 draft 不一致、flash 页整理标志。
- flash 持久化：
  - 使用最后 2 KB flash page：`0x0801F800`，page index 63。
  - 每次 `SAVE_DRAFT` 追加完整记录：magic、record version、schema、sequence、length、crc32、reserved、完整 `HVCCPS_Config`。
  - 启动时扫描有效记录并加载 sequence 最大的配置到 draft/active。
  - 页满或遇到无效/半写记录槽时擦除该页，再以当前 draft 写入第一条新记录，避免在非擦除 flash 槽位上覆盖。
  - `MDK-ARM/stm32g474xx_flash.sct` 将 IROM 缩到 `0x0001F800`，保留最后 2 KB 给配置日志。

### 下位机协议与 app_core 拆分

- 新增 `Core/Inc/app_protocol.h` / `Core/Src/app_protocol.c`：
  - 统一 checksum/xor、小端读写、float 读写。
  - 新配置请求 `0xC5`，固定 16 字节：`op / target / field_id / value_type / value / sequence / reserved / sum8 / xor8`。
  - 新配置响应 `0xC6`，uint16 length，可变长度：
    - 普通响应 27 字节。
    - `GET_SNAPSHOT` 响应 227 字节，payload 为 draft + active 两份完整配置。
    - `GET_FIELD` 响应 32 字节，payload 为 value type + value。
  - op：`GET_SNAPSHOT`、`GET_FIELD`、`SET_FIELD`、`RESET_FIELD`、`APPLY_DRAFT`、`SAVE_DRAFT`、`LOAD_FLASH`、`LOAD_DEFAULTS`、`FACTORY_RESET`。
  - status：OK、BAD_FIELD、BAD_TYPE、BAD_VALUE、FLASH_ERROR、NO_FLASH、LOCKED、BAD_REQUEST、BUSY。
- `Core/Src/app_core.c`：
  - 引入 `ConfigManager_Active()` 作为控制 ISR 的 PI/频率/软起动/变频参数来源。
  - 删除运行中的配置结构，把硬件配置应用收敛为 `apply_active_config()`。
  - 输出关闭时才允许配置修改、apply/save/load/default/factory reset；查询允许输出开启时执行。
  - `APPLY_DRAFT` 后重载 HRTIM 基准频率并重置控制状态；`SAVE_DRAFT` 只写 flash，不自动应用 active。
  - 配置响应经独立 `config_tx_frame` 发送；若 UART 正忙则挂起，TX complete 后优先发送。
  - 心跳新增 `base_freq_hz`、`freq_policy`、配置 draft/active revision、flash sequence、config flags，帧长为 297 字节。

### HostUI 2.0

- `HostUI2.0/protocol.js`：
  - 增加配置字段表、默认配置、配置表单校验、`buildConfigRequest()` / `buildConfigSetFieldRequest()`、`parseConfigResponseFrame()`、配置响应流式 decoder。
  - 心跳解析同步 297 字节布局，增加 `baseFreqHz`、`freqPolicy`、`configDraftRevision`、`configActiveRevision`、`configFlashSequence`、`configFlags`。
- `HostUI2.0/app.js`：
  - 配置表单不从 localStorage 取设备配置；连接后自动 `GET_SNAPSHOT`，用设备 draft 填充 UI。
  - Apply：读取表单，逐字段比较 device draft，变化字段逐个 `SET_FIELD`，再 `APPLY_DRAFT`，最后重新 snapshot。
  - Save Flash：发送 `SAVE_DRAFT` 并重新 snapshot。
  - 增加 Sync Draft、Load Flash、Load Defaults、Factory Reset 操作。
  - 输出运行时锁定配置修改类按钮；查询 snapshot 保持可用。
  - 图表选择和 Cycle Plot 偏好继续使用 localStorage；设备配置以连接后查询的 draft 为准。
- `HostUI2.0/index.html`：
  - 配置页增加 `softStartStepInput`、`freqPolicyInput`。
  - Defaults 页增加 Sync Draft、Load Flash、Load Defaults、Factory Reset。
  - 动态高级配置区显示自动变频参数，footer 增加 Save Flash。

### README

- 更新当前版协议：心跳 297 字节、配置请求 `0xC5`、配置响应 `0xC6`。
- 增加配置层、flash 日志、`config_flags`、配置字段、配置接受约束说明。
- 更新 HostUI 配置行为和代码组织，标明 `config_manager` / `app_protocol` 模块职责。

### 验证

- HostUI 语法检查通过：
  - `node --check HostUI2.0/protocol.js`
  - `node --check HostUI2.0/app.js`
  - `node --check HostUI2.0/history.js`
- Keil 编译通过：
  - `& 'D:\apps\keil_v5\uv4\uVision.com' -b G474_HVCCPS.uvprojx -j0 -o build.log`
  - 结果：`0 Error(s), 0 Warning(s)`。
  - Program Size: `Code=42868 RO-data=17304 RW-data=228 ZI-data=5556`。

## 2026-06-02 新增软起动（占空比上升限速 10%/ISR，硬性、全路径、带抗积分饱和）

软起动逻辑很简单：限制占空比的快速增长。每个控制 ISR 占空比最多增加 10%（绝对值），即把仲裁改成 `min(CV, CC, CP, duty_last + 10%)`；命中软起动的那个 ISR，CV/CC/CP 三环积分本轮全部不积分（抗积分饱和）。软起动是**硬性**的，所有路径都必须走：固定占空比 100% 启动也要 ≥10 个周期才到 100%；变频前馈从 40% 跳 70% 时本周期最多到 50%。**只限制上升、不限制下降**（一个 ISR 内 80%→55% 允许）。仅下位机改动，协议/上位机不变。

### 下位机 `Core/Src/app_core.c`

- 新增 `APP_SOFT_START_MAX_STEP = 0.10f`（归一化绝对步进，放在 `APP_PI_MIN/MAX` 旁）。
- 控制 ISR 增局部 `float duty_cap; uint8_t soft_limited;`。
- **捕获参考点**：在 `if (power_enable==0) return;` 之后、固定占空比分支与 `freq_ctrl_consume_pending()` 之前，先取 `duty_cap = app.duty + APP_SOFT_START_MAX_STEP`。关键：必须在 `freq_ctrl_consume_pending()` 把 `app.duty` 顶到前馈值之前捕获，否则前馈跳变会绕过限速。`app.duty` 是上一个 ISR 实际落地的占空比（`set_duty()` 末尾按量化后的 mcmp3 反算），是天然的"上次占空比"。
- **固定占空比路径**：`set_duty(app.fixed_duty_value)` → 先 `if (fixed_duty > duty_cap) fixed_duty = duty_cap;` 再 `set_duty(fixed_duty)`，使固定占空比也逐周期爬升。
- **闭环路径**：`duty = min(CC,CV,CP)` 之后加 `soft_limited = (duty > duty_cap); if (soft_limited) duty = duty_cap;`，作为仲裁的第 4 个 min 项。`pi_commit()` 的 integrate 参数由 `winner==X` 改为 `(soft_limited==0) && (winner==X)`——命中软起动则三环都传 0，本轮都不积分。
- **前馈路径自动覆盖**：`freq_ctrl_consume_pending()` 内 `set_hrtim_phase_raw(前馈)` 的预装寄存器写入，会被本 ISR 末尾 `set_duty(capped)` 覆盖（HRTIM preload，下个 master 重复事件只latch最后一次写入）；且 `duty_cap` 用的是前馈写入前捕获的旧 `app.duty`，故前馈跳变同样限速。`consume_pending` 本身不改（避免动到已调好的变频；软起动期间变频处于 100 ms 锁定窗内，互不干扰）。
- **优化**：热路径仅新增约 1 次浮点加（`duty_cap`）+ 1 次比较（`soft_limited`）+ 3 个布尔与（`pi_commit` 入参）；无除法、无分支预测惩罚的循环。下降天然不命中（`duty < duty_cap`），无需单独判断方向。
- **与 enable/停机的衔接**：停机/OCP/OTP/禁用都会 `set_duty(0)` 把 `app.duty` 归 0，故每次重新 Enable 自动从 0 开始软起动，无需额外标志位或计数器。
- 编译：Keil `0 Error(s), 0 Warning(s)`，Program Size: Code=37788（较过温保护版 +24 B），RO-data=17304, RW-data=168, ZI-data=5024。

### 文档 `README.md`

- 控制环路新增"软起动（Soft-start）"小节：公式 `min(CC,CV,CP,duty_last+10%)`、只限上升、全路径强制、参考点捕获时机、抗积分饱和、实现与开销。
- "运行模式"两条都注明受软起动限速（含固定占空比 100% 启动也要逐周期爬升）。
- "下位机关键数据流"控制 ISR 那行补上软起动 min 项与"命中则三环本轮不积分"，并标注固定占空比模式在更早处已 `set_duty(min(fixed, duty_last+10%))` 返回。

## 2026-06-02 新增过温保护（OTP），补齐数据流文档 TIM6/TIM7，复核心跳 20 Hz

加一个最基础的过温保护：MOS 温度或 MCU 内部温度任一超过 75 °C 即强制停止输出，并在心跳协议里置位过热标志（用掉心跳 `status_flags` 仅剩的 bit 7）；上下位机配套改动。同时修复文档若干不一致——尤其"下位机关键数据流"缺 TIM7/TIM6 中断逻辑——并复核心跳速率确为 20 Hz。

### 下位机 `Core/Src/app_core.c`

- **过温保护（OTP，纯软件）**：
  - 新增 `APP_STATUS_BIT_OTP = 0x80`（心跳状态位）、`APP_OTP_TRIP_MC = 75000`（75 °C，单位 m°C）、`APP_ControlState.otp_latched`。
  - 控制 ISR 在 OCP（FLT4）检测之后、关断分支之前插入 OTP 检测：`process_slow_adc_isr()` 已刷新 `g_mos_temp_mc` / `g_internal_temp_mc`，任一 `> APP_OTP_TRIP_MC` 则锁存过温、清 `power_enable_latched` / `fixed_duty_active` / `mode`。与 OCP 不同，过温无硬件关管通路，故在**跳闸沿**（`otp_latched` 0→1）调用 `set_psfb_outputs(0)` 主动关断四管；之后的 `if (power_enable==0) { set_duty(0); return; }` 保持 duty 0。跳闸沿守卫避免每周期重复 stop。
  - 粘滞锁存：恢复靠上位机重新 Enable —— `parse_command()` 的 enable / disable 两个分支各在 `clear_ocp_fault()` 旁清 `otp_latched=0`；若仍 >75 °C，下一个控制 ISR 立即再次跳闸（输出至多被点亮约一个开关周期，热量可忽略）。
  - `build_heartbeat()` 在 OCP 位之后追加 `if (app.otp_latched) status_flags |= APP_STATUS_BIT_OTP`。心跳帧长不变（273），上位机协议无需改长度。
  - 上电安全性：MOS NTC raw 0 → 0 °C（查表钳位）、内部温度出错/为负 → 0，滑动平均从 0 起爬升不过冲，故开机不会误触发。
- 编译：Keil `0 Error(s), 0 Warning(s)`，Program Size: Code=37764, RO-data=17304, RW-data=168, ZI-data=5024。

### 上位机 `HostUI2.0/`

- **protocol.js**：`createLatest()` 增 `otpTripped:false`；`parseHeartbeatFrame()` 增 `latest.otpTripped = (statusFlags & 0x80) !== 0`。
- **index.html**：状态 chip 区在 `wdgChip` 后增 `otpChip`（默认 hidden）。
- **app.js**：缓存 `ui.otpChip`；`updateSystemUi()` 在 wdg chip 之后按 `latest.otpTripped` 显示红色 `OVER-TEMP · OUTPUT OFF · RE-ENABLE`（`is-danger`），与 OCP/WDG 同一套提示机制，提示用户当前过热。
- `node --check`（protocol.js / app.js / history.js）通过。

### 文档 `README.md`

- **status_flags 表**：bit 7 由 `reserved` 改为 `otp_latched`（MOS 或 MCU >75 °C，输出已关闭，需重新 Enable 恢复）。
- **新增"过温保护（OTP）"小节**（接在"硬件过流保护（OCP）"之后）：阈值、跳闸动作（软件 `set_psfb_outputs(0)` 关管 vs OCP 硬件关管）、粘滞恢复、上电安全、上位机告警。
- **"下位机关键数据流"补全**：原图缺 TIM7/TIM6 两个中断。补入 TIM7 10 ms（`freq_ctrl_score_and_plan` 生成变频 pending）、TIM6 10 ms（看门狗活性检查 + 喂狗）两个 IRQ 块；并在控制 ISR 块补上原本也缺的 `wdg_activity` 标志、OCP（FLT4）与 OTP 检测步骤，注明 NVIC 优先级（HRTIM 0,0 / TIM7 2,0 / TIM6 3,0）与"两定时器经 `HAL_TIM_PeriodElapsedCallback` 按实例分发、均为 100 Hz/10 ms"。

### 复核：心跳速率 = 20 Hz（一致，未改）

- 固件 `APP_HEARTBEAT_INTERVAL_MS = 50U`（50 ms）→ 20 Hz；`send_heartbeat_if_due()` 据此节流。
- README 多处（"心跳包（20 Hz）"、"50 ms（约 20 Hz）"、"20 Hz 时上行带宽 ≈ 5.46 kB/s"、数据流注释）均为 20 Hz，无矛盾。本次仅把数据流注释顺带写明"每 50 ms 一帧"，未改速率。

## 2026-06-02 固定分频 + 变频重构：控制 ISR 改挂 master repetition，额定 11–45 kHz，心跳新增真·当前频率

配合后续要加的变频机制，把 HRTIM 从"按频率自动分配分频"改成"每个定时器分频固定，变频只重载周期寄存器"；控制 ISR 改挂 master 重复事件；额定频率改 11–45 kHz、默认 35 kHz；心跳包用真·当前频率取代一批 HRTIM 原始量。CubeMX 侧（hrtim.c/.ioc：master/A/B 固定 MUL4、C/D/E 固定 MUL32、master 中断源 MREP、全员 preload、统一 master 更新、ADC Trigger 3 由 Timer E 16× 驱动）已在前序提交完成，本次为固件逻辑层 + 上位机的配套改动。

### 下位机 `Core/Src/app_core.c`

- **控制 ISR 改挂 master 重复事件**：回调 `HAL_HRTIM_Compare2EventCallback` → `HAL_HRTIM_RepetitionEventCallback`（`HAL_HRTIM_IRQHandler` 对 master 的 `MREP` 标志调用此回调；`RepetitionCounter=0` 故每个开关周期一次）。更新 ISR 头注释：现在在周期边界进入，刚结束周期的 24 高速 + 16 慢速样本已全部就位，全周期聚合更干净；新 duty 经 preload 在下个重复事件生效。
- **额定 11–45 kHz / 默认 35 kHz**：`APP_FREQ_MIN_HZ` 10000→11000、`APP_FREQ_MAX_HZ` 50000→45000、`load_default_settings()` 的 `freq_hz` 50000→35000。
- **去掉自动分频分配**：删除 `select_hrtim_prescaler()`、`APP_HRTIM_PRESCALER_TABLE`、`APP_HRTIM_BASE_CLK_TABLE`；新增 `APP_HRTIM_MASTER_BASE_CLK_HZ`（680 MHz，MUL4）与 `master_prd_for_freq()`（`floor(680 MHz / freq)`）。`validate_settings()` 改为只校验频率范围并显式保证 master PRD ∈ `[256, 0xFFDF]`。
- **变频不再重配 HRTIM**：`reconfigure_hrtim()` → `hrtim_load_periods()`，仅用 `__HAL_HRTIM_SETPERIOD` / `__HAL_HRTIM_SETCOMPARE` 预装 master/timA/B/C/D/E 六个周期与 MCMP1/MCMP3、timA/B CMP1；删去死区重写（固定 34 ticks，与频率无关）和已无用的 master CMP2 写入。
- **`apply_settings()` 精简**：去掉「停输出 / 停计数 / 停 5 路 ADC DMA / 清缓冲 / 重新 arm / 重启」整套，只剩：算 4 个周期 → `hrtim_load_periods()` → 更新 `g_derived` → 复位三环 PI → 相位归零。依据：每周期采样点数（24/16/10）与频率无关，循环 DMA 一次对齐后跨变频持续保持；且 `parse_settings()` 只在输出关断（`power_enable_latched==0`）时受理，ISR 此时强制 `set_duty(0)`，对 `g_derived` 的撕裂读不敏感。
- **一次性启动逻辑移入 `APP_Init()`**：预装默认频率 → 先 arm 5 路 ADC DMA → 再 `WaveformCountStart_IT(APP_TIMERS_ALL)`；删去冗余的手工 `g_derived` / `app.mcmp*` 初始化（统一由 `apply_settings()` 设置）。
- **心跳新增真·当前频率**：`APP_DerivedConfig` 删 `prescaler / timc_prd / timd_prd / time_prd / base_clk_hz`，加 `actual_freq_hz`（= `(680 MHz + PRD/2) / PRD`，即取整后的实际频率）。`build_heartbeat()` 把 duty 之后的 4×uint16（mcmp1 / mcmp2 / mcmp3 / timc_prd，共 8 字节）替换为 `current_freq_hz`（uint32，4 字节），并删掉每包 3 次 `__HAL_HRTIM_GETCOMPARE` 重读。心跳帧长 277 → 273。`APP_ControlState` 删 `mcmp1_raw` / `mcmp2_raw`（`mcmp3_raw` 保留，控制环用）。
- 编译：Keil `0 Error(s), 0 Warning(s)`，Code=32424。

### 上位机 `HostUI2.0/`

- **protocol.js**：心跳镜像同步——`HEARTBEAT_PAYLOAD_SIZE` 的 `(4*2)` → `4`，`createLatest()` / `parseHeartbeatFrame()` 把 `mcmp1Raw/mcmp2Raw/mcmp3Raw/timcPrd` 换成 `currentFreqHz`（readLe32），帧长 273。删除 `HRTIM_PRESCALERS`、`HRTIM_TIMC_BASE_CLK_HZ`、`LEAD_RAW`、`pickHrtimPrescaler`、`hrtimTickNsFromPrescaler`、`timcPrdForFreq` 及其导出。`validateSettingsForm()` 频率改 11000–45000 且去掉 prescaler 派生（返回 `{ errors }`）。`DEFAULT_SETTINGS.freqHz` 50000 → 35000。
- **app.js**：导入去掉 `LEAD_RAW/pickHrtimPrescaler/timcPrdForFreq`；删 4 个 Raw 信号（MCMP1/2/3、TIMC PRD）及 `DEBUG_METRIC_KEYS`、`CHART_GROUP_ORDER` 的 `"Raw"`；新增 Control 组 `FREQ` 信号显示真·当前频率（kHz）。`refreshSettingsReadouts()` 与 apply 路径去掉 `derived`，频率摘要改为 `set X kHz · live Y kHz`。单周期波形：周期由 `currentFreqHz` 反算、相位用 `duty/2`（不再依赖 mcmp2/mcmp3/timcPrd），live 判定改用 `currentFreqHz`。运行摘要频率优先取遥测真值。
- **index.html**：`ctrlFreq` min/max 10000/50000 → 11000/45000，note 改为 11–45 kHz（固定 MUL4、在线重载周期），频率标签注明 `set · live`。
- `node --check` 通过（protocol.js / app.js / history.js）。

### 2026-06-02 Codex 接手核查与补齐

- 核对 Claude 修改后，发现主体功能已基本完成：ISR 已挂 master repetition，频率范围/默认值、心跳 `current_freq_hz`、HostUI 协议解析与显示均已同步。
- 修复开机默认频率落地问题：`APP_Init()` 中 `apply_settings(&defaults)` 只写 preload shadow，补充 `HAL_HRTIM_SoftwareUpdate(... master/A/B/C/D/E ...)`，在 HRTIM 计数启动前把 35 kHz 默认周期强制转入 active register，确保第一拍就是默认频率。
- 修复 HostUI 旧 localStorage 兼容：若本地保存过 10–50 kHz 旧频率（如 50000 Hz），加载设置时回退到当前默认 35000 Hz，避免页面一打开就处于非法配置。
- 修复 `HostUI2.0/index.html` 中 3 处已损坏的分隔符显示，避免界面出现替换字符。
- 修复 `README.md` 心跳描述：固件实际 `APP_HEARTBEAT_INTERVAL_MS = 50`，因此当前协议说明更新为 20 Hz、50 ms、约 5.46 kB/s；数据流注释同步为 20 Hz。
- 修复 `MDK-ARM/G474_HVCCPS.uvprojx` 根节点 schema 属性，恢复 `xsi:noNamespaceSchemaLocation` 前缀，避免 Keil 工程 XML 被格式化工具改成非预期属性名。
- 复测：`node --check HostUI2.0/protocol.js/app.js/history.js` 通过；Keil 编译通过，`0 Error(s), 0 Warning(s)`，Program Size: Code=32504, RO-data=16952, RW-data=156, ZI-data=4900。

### 暂未做（按要求）

Todo 里的自动变频本次不加，仍由上位机设定频率；只完成"固定分频 + 在线重载 + ISR 挂 repetition + 真·当前频率"这套基础设施。

## 2026-06-01 HostUI Debug Tools：上次 Enable 运行摘要与复制

`Debug Tools` 浮窗扩展为上次 Enable 窗口运行摘要，用来承载这类临时/调试小功能。

- `HostUI2.0/index.html`：Debug Tools 内的工具为 `Last Enable Summary`，显示上次 Enable 窗口的 duty、efficiency、Ipri、Isec、Vpri、Vsec 结果，以及窗口 packet 数和持续时间；提供 `View Summary` 与 `Copy` 按钮。
- `HostUI2.0/styles.css`：Debug Tools 固定在左下角，默认折叠；z-index 降到抽屉/backdrop 下面，打开 Configure/Run/Connect 抽屉时不会挡住频率等设置控件。
- `HostUI2.0/app.js`：
  - `createRunSummaryStats()` 维护当前 Enable 窗口与上次封存窗口的统计量。
  - `parseHeartbeat()` 在解析前记录旧 `powerEnable`，解析后按设备心跳里的 `powerEnable` 做边沿检测：false→true 开始新窗口；运行中每个 heartbeat packet 累计 duty、Ipri、Isec、Vpri、Vsec；true→false 封存为上次窗口。
  - duty、Ipri、Isec、Vpri、Vsec 都先按窗口 packet 做算术平均，efficiency 再按 `avg(Isec)*avg(Vsec)/(avg(Ipri)*avg(Vpri))` 计算，避免逐包 efficiency 平均被低输入功率样本拉偏。
  - frequency 在窗口开始时按上位机当前设置锁定一次，用于复制结果中的 `f` 字段。
  - 串口断开时若当前窗口仍在运行，则按断开时刻封存。
  - `View Summary` 展示复制字符串；`Copy` 一键复制 `f: {frequency}Hz, duty: {duty}%, eff: {efficiency}%, Ipri: {Ipri}A, Isec: {Isec}mA, Vsec: {Vsec}V, Vpri: {Vpri}V`，并提供 `document.execCommand("copy")` fallback 以兼容 `navigator.clipboard` 不可用的环境。
- 校验：`node --check HostUI2.0/app.js`、`protocol.js`、`history.js` 通过。只改上位机和文档，未重新编译固件。

## 2026-06-01 固定 200 ns 死区 + 删除上位机死区设置/HRTIM 可视化

根据实测结果，死区统一固定为约 200 ns，关闭并删除上位机的死区配置入口，同时删除独立 HRTIM 时序可视化编辑器。采样逻辑保持当前实现不动。**Keil 编译通过，0 Error / 0 Warning，Code=33880, RO=16952, RW=156, ZI=4924。** 上位机基础语法校验通过：`node --check HostUI2.0/protocol.js`、`node --check HostUI2.0/history.js`、`node --check HostUI2.0/app.js`。

### 1. 固件固定死区

- `Core/Src/app_core.c`：`APP_SETTINGS_LEN` 从 34 改为 32，设置包不再解析 `deadtime_ticks`。
- `APP_Settings` 删除 `deadtime_ticks` 字段，`validate_settings()` 删除死区范围校验，默认设置不再保存死区值。
- `reconfigure_hrtim()` 删除 `deadtime` 形参，A/B 两路 `HRTIM_DeadTimeConfig` 始终使用 `DEAD_TIME`。
- `Core/Inc/main.h` 与 `.ioc` 里 `DEAD_TIME=34` 保持一致，对应 `34 * 5.882 ns ~= 200 ns`。

### 2. 上位机删除死区配置

- `HostUI2.0/protocol.js`：`SETTINGS_FRAME_SIZE` 改为 32；`DEFAULT_SETTINGS` 删除 `deadTimeNs`；删除 `deadTimeTicksFromNs()` 和相关死区校验/写帧逻辑。
- `HostUI2.0/app.js`：设置表单只读取/保存 PI 参数和频率；旧 localStorage 配置经白名单加载，避免隐藏的旧 `deadTimeNs` 被继续存回；删除死区 readout 联动和 HRTIM 可视化联动。
- `HostUI2.0/index.html`：HRTIM 配置页显示固定 `200 ns fixed`，删除死区输入框和 Open Visual Timing Editor 按钮。

### 3. 删除 HRTIM 可视化编辑器

- 删除 `HostUI2.0/viz.js` 与 `HostUI2.0/viz.css`。
- `index.html` 不再加载 `viz.js` / `viz.css`，也删除了 `vizOverlay` DOM。
- `styles.css` 删除仅供 HRTIM 可视化和采样位置虚线使用的孤立样式。
- 单周期波形 `Cycle Plot` 保留，用于查看当前 24 点采样波形和 PWM 叠加。

### 4. 文档同步

- `README.md` 当前版本描述同步为固定 34 ticks / 约 200 ns 死区。
- 设置包总览与字段表改为 32 字节，字段中删除 `deadtime_ticks`。
- HostUI 文件列表删除 `viz.css` / `viz.js`，配置页说明删除 HRTIM Visual Timing Editor。

## 2026-06-01 硬件过流保护（COMP1+DAC1+FAULT4）+ IWDG 看门狗 + 上位机通知

新增硬件级 AC 过流保护与独立看门狗，并把过流/看门狗状态上报上位机。CubeMX 已生成 COMP1/DAC1/IWDG/TIM6 外设初始化（`comp.c`/`dac.c`/`iwdg.c`/`tim.c`），本条记录业务代码（`app_core.c`）、中断和上位机。**Keil 编译通过，0 Error / 0 Warning，Code=33964, RO=16952, RW=156, ZI=4924。**

### 1. 硬件过流保护（OCP）

- 链路：PA1（1:200 CT + 7.5Ω + 绝对值，同时给 ADC2 峰值遥测）→ COMP1（INP=PA1，INM=DAC1_CH1，非反相输出）→ HRTIM FAULT4（片上源=COMP1，active-high，FAULTFILTER_7 ≈ 188 ns）→ 异步把 TA/TB 四路强制 inactive（关管）。硬件配置全在 `MX_HRTIM1_Init` / `MX_COMP1_Init` / `MX_DAC1_Init`。
- 阈值 75 A（CSD19531）。`#define APP_OCP_TRIP_A 75`、`APP_OCP_TRIP_MV = 75*1000*15/400 = 2812 mV`（与 IPRI_AC 标度 `i_ma=mv*400/15` 一致）。`apply_ocp_threshold()` 把 DAC 码设为 `APP_OCP_TRIP_MV*4095/g_vcc_mv`（用 VREFINT 反推的 VDDA，使绝对阈值不随供电漂移）。`APP_Init` 里 `HAL_DAC_Start` → `apply_ocp_threshold` → `HAL_COMP_Start`，在放输出前就武装好。
- 软件锁存/恢复：`app.ocp_latched` 新增。控制 ISR 每周期 `__HAL_HRTIM_GET_FLAG(FLT4)`，置位则锁存、清 `power_enable_latched`/`fixed_duty_active`、`mode=DISABLED`（既有的 `power_enable==0` 分支负责 `set_duty(0)`+return）。`clear_ocp_fault()`（清 FLT4 标志 + 清锁存）在 `parse_command` 的 ENABLE（先清再武装，等价常规上电）与 DISABLE 分支调用。恢复方式：上位机在 RUN 里重新 Enable；过流仍在则下个开关沿再次跳闸。
- 控制 ISR 在 fault 时仍运行（fault 只关输出不关 master 定时器），所以轮询可行，无需新开 fault 中断。

### 2. 独立看门狗（IWDG）+ 双路活性判定

- IWDG 超时 ≈200 ms（`MX_IWDG_Init` 在 `main.c` 里先于 `APP_Init` 启动）。TIM6 中断每 10 ms 一次（`HAL_TIM_Base_Start_IT` 在 `APP_Init` 末尾启动）。
- 活性标志 `wdg_activity`（volatile uint8）：`APP_Task` 每次 `|= APP_WDG_FLAG_LOOP(0x01)`，控制 ISR 每次 `|= APP_WDG_FLAG_ISR(0x02)`。`HAL_TIM_PeriodElapsedCallback`（仅 TIM6）采样后清零，更新两个 miss 计数；**两路都在最近 `APP_WDG_MISS_LIMIT=10` 拍（100 ms）内活过才喂狗**，任一路连续 10 拍静默就停喂，由 IWDG 复位。RMW 竞争无害：每拍有数千次置位，且需连续 10 拍丢失才误判，方向上也只会"误判为死"不会"误判为活"。
- 复位原因：`APP_Init` 读 `__HAL_RCC_GET_FLAG(RCC_FLAG_IWDGRST)` → `wdg_reset_latched`，再 `__HAL_RCC_CLEAR_RESET_FLAGS()`，并早喂一次狗。

### 3. 心跳状态位

- `status_flags` 新增 bit5 `APP_STATUS_BIT_OCP`（=`app.ocp_latched`）、bit6 `APP_STATUS_BIT_WDG_RESET`（=`wdg_reset_latched`）。仅加位、不改帧长、不动协议其余部分。

### 4. 上位机（protocol.js / app.js / index.html）

- `protocol.js`：`createLatest` 加 `ocpTripped`/`wdgReset`，解析 `statusFlags & 0x20 / 0x40`。
- `app.js` + `index.html`：状态栏加两个仅在触发时显示的 chip —— OCP（红，"OCP TRIP · OUTPUT OFF · RE-ENABLE"）、WDG（黄，"WDG RESET · CHECK FIRMWARE"）。

### 5. 单周期波形图：删除采样位置标记 + 修正 IPRI_DC 零点

- 全周期聚合后单点"采样位置"已无意义，按要求删除：`app.js`/`viz.js` 的 `SAMPLE_POSITIONS` 虚线标记渲染、`CYCLE_SIGNALS` 的 `positions` 字段、`showSamplePos` 开关（含 `index.html` 复选框与 `styles.css` 的 `.svg-sample-pos-*`）；`protocol.js` 删除 `SAMPLE_POSITIONS` 常量及 `sampleIndexFor`/`interpolateSample`（已全无引用）。原始 24 点波形折线保留，**不改协议**。
- 顺手修正 `app.js` 单周期图 IPRI_DC 换算零点：`l.aux5Mv/2` → 固定 `2500`，与固件一致。
- `node --check` 通过：protocol.js / app.js / viz.js。

### 文档

- `README.md`：电源控制逻辑下新增「硬件过流保护（OCP）」「看门狗（IWDG）」两节；`status_flags` 表补 bit5/bit6；PA1 引脚行补 COMP1_INP；单周期 Overlay 去掉采样位置虚线两处描述；`protocol.js` 职责去掉"采样位置常量"。

## 2026-06-01 IPRI_DC 叠加 8 周期移动平均（ACS712 霍尔，带宽有限）

ACS712 是霍尔原件、响应不快，故在 IPRI_DC 的每周期 24 点均值之上再叠加一层 8 周期移动平均，方法与 AUX5 等慢速量一致：rolling sum + 移位除法，且全程无循环。本环境无 ARM 工具链，未编译验证。

- 新增常量（`app_core.c`，紧挨 `APP_IPRI_DC_ZERO_MV`）：`APP_IPRI_DC_AVG_CYCLES=8`、`APP_IPRI_DC_AVG_SHIFT=3`、`APP_IPRI_DC_AVG_MASK=7`。窗口取 2 的幂，故最终均值是 `>>3` 而非除法。
- 新增 `ipri_dc_period_avg(uint16_t period_mean)`：8 元素静态环 + 静态 `rsum`，每拍 `rsum = rsum + 新均值 - ring[idx]`（rolling sum，无重求和循环），`ring[idx]=新均值`，`idx=(idx+1)&MASK`，返回 `(rsum + 4) >> 3`。环与 rsum 静态零初始化、仅此函数写入，故 rsum 恒等于环和；上电时环从 0 充满的短暂爬坡与 AUX 轨一致。
- ISR 内 `i_pri_dc_raw = ipri_dc_period_avg(arithmetic_mean24_adc2(APP_ADC2_RANK_IPRI_DC))`：先取本周期 24 点均值（已展开），再过 8 周期移动平均；其后的 2.5V 零点换算（`adc8_to_mv`、`(zero-sensor)*10`）作用在平滑后的 raw 上。
- **关于“展开”**：8 周期平均用 rolling sum，本就没有求和循环可展开；它消费的每周期 24 点均值 `arithmetic_mean24_adc2` 已是手工展开式。整条 IPRI_DC 路径无循环。环用的是 `ring[idx]`（与 AUX5 同构），若想把 8 个抽头写成显式移位寄存器（`h0..h7`）也可，说一声即可。
- 仅平滑进入控制/功率与遥测的 `g_i_pri_dc_ma`；心跳里逐样本回传的 24 个 IPRI_DC raw（供上位机示波）不受影响。

### 文档

- `README.md`：信号表 IPRI_DC 行改“24 点算术均值 + 8 周期移动平均”，并注明 ACS712 带宽有限、rolling sum + 右移、类似 AUX5；ISR 数据流图在 `arithmetic_mean24_adc2(ISEC/IPRI_DC)` 后加一行 `ipri_dc_period_avg()`。
- 改动文件：`Core/Src/app_core.c`、`README.md`。上位机与协议未动。

## 2026-05-31 ISR 计时上移 + VPRI 改全周期均值 + 求和循环全展开

按要求做三件事，并同步文档。本环境无 ARM 工具链，未编译验证。

### 1. ISR 开销 DWT 计时与结算上移到 IRQ handler

- 原先在 `APP_HRTIM_ControlISR()` 内部捕获 `DWT->CYCCNT` 起点、并在每个 return 分支调用 `isr_timing_end()`，测得的只是控制体本身，漏掉 HAL 派发与回调开销。
- 现把计时移到真正的中断入口 `HRTIM1_Master_IRQHandler`（`stm32g4xx_it.c`，用 USER CODE 段以免 CubeMX 再生覆盖）：USER CODE 0 取 `isr_start_cycles = DWT->CYCCNT`，USER CODE 1 调 `APP_HRTIM_IsrTimingEnd(isr_start_cycles)`，**包住** `HAL_HRTIM_IRQHandler()`，测得整个 IRQ 窗口（HAL 标志派发 + Compare2 回调 + 控制体）。
- `isr_timing_end()`（static inline）改名导出为 `void APP_HRTIM_IsrTimingEnd(uint32_t)`，在 `app_core.h` 声明；`stm32g4xx_it.c` 的 USER CODE Includes 加 `#include "app_core.h"`。控制体内删除起点捕获和 3 处 `isr_timing_end()`。
- 测量口径仍唯一对应控制 ISR：`hrtim.c` 中 master 只开了 `HRTIM_MASTER_IT_MCMP2`，其余定时器 `HRTIM_TIM_IT_NONE`，故 master IRQ 仅因 CMP2 触发。

### 2. VPRI 改为与 IPRI_DC 一致的全周期 24 点均值

- 原 VPRI 用 `read_adc1()` 走 `sample_index_for()`/`interp_sample()` 的 A/B 两点相位插值（位置 `0.25+0.5φ`、`0.75+0.5φ`）。VPRI 是硬件滤波后的直流母线，全周期平均更简单、SNR 更高，且与 ISEC/IPRI_DC 同法。
- 新增 `arithmetic_mean24_adc1(rank)`，ISR 内 `v_pri_raw = arithmetic_mean24_adc1(APP_ADC1_RANK_VPRI)`，`v_pri_mv = adc12_to_mv(v_pri_raw) * 17U`（去掉两点求均值的 `/2`）。
- **连带删除现已无用的插值机构**（否则 static 函数未引用会报 warning，破坏 0-warning 构建）：`read_adc1`、`sample_index_for`、`interp_sample`、`APP_POS_VPRI_A/B`、`APP_SamplePos` 结构；以及只服务相位插值的 `g_derived.inv_prd_f`（上一轮刚加，现随之失效）和 `g_derived.period_ns`，及 ISR 内 `phase_frac`/`period_ns` 局部量。`set_duty()` 用的 `phase_span_f`/`inv_span_f` 仍保留。
- VSEC 仍用 `anti_phase_pairwise_mean_vsec()`（PSFB 反相对消，与 VPRI 无关），ISEC/IPRI_DC 不变。

### 3. 求平均的循环累加全部手工展开

- 将“涉及求平均的循环累加”改写为 `buffer[0]+buffer[1]+…` 的无循环展开式：
  - `arithmetic_mean24_adc2`、新增的 `arithmetic_mean24_adc1`：各 24 项（`k*APP_ADCx_CHANNELS+rank`，k=0..23）。
  - `process_slow_adc_isr()` 的 VREFINT/温度（adc5，各 16 项）与 AUX12/AUX5/MOS-NTC（adc3/adc4，各 16 项）。展开后该函数不再需要循环变量 `k`，并去掉 `sum_* = 0U` 初值（改为整式直接赋值）。
- 加编译期护栏：`#if (APP_SAMPLES_PER_PERIOD != 24U) #error …`、`#if (APP_VREF_SAMPLES != 16U) || (APP_SLOW_SAMPLES_PER_PERIOD != 16U) #error …`，样本数一旦改动即编译报错，避免手工展开与常量脱节。
- **未展开**两处（不属于“求平均的累加”）：`period_max_adc2()` 是逐样本取最大值的比较循环（非累加）；`anti_phase_pairwise_mean_vsec()` 是带 5 路分支的配对分类器（非纯累加），展开 12 次会十几倍放大分支代码且无收益。`build_heartbeat()` 里写 TX 帧的循环是序列化、非求平均，保持不变。如需也展开这两处可再说。

### 文档

- `README.md`：信号处理小节去掉 `sample_index_for`/`interp_sample` 插值描述，改为“全周期聚合 + 手工展开求和”；信号表 VPRI 行由“A/B 两点插值取均值”改“24 点算术均值”；ISR 数据流图把 `read_adc1(VPRI…)` 改 `arithmetic_mean24_adc1(VPRI)`、并把计时画到 `HRTIM1_Master_IRQHandler` 包住 `HAL_HRTIM_IRQHandler` 的层级、末尾 `isr_timing_end()` 改 `APP_HRTIM_IsrTimingEnd()`。
- 改动文件：`Core/Src/app_core.c`、`Core/Inc/app_core.h`、`Core/Src/stm32g4xx_it.c`、`README.md`。上位机与协议未动。

## 2026-05-31 控制 ISR 等价优化落地（Todo.md 第 2–7 项）

先逐项核实 Todo.md 中问题是否真实存在、给出的修法是否会变糟，确认后再改；全部为等价优化，不改变采样/控制节奏与对外协议，故 README 无需改动（其数据流/算法描述仍准确：慢速量最终仍是 `>>4` 求均值，移动平均语义不变）。本环境无 ARM 工具链，未编译验证。

**核实结论**：6 项均真实存在（反汇编层面每个控制 ISR 都有对应的系统存储读 / 浮点除 / `UDIV` / 全量重求和），修法均成立。唯一调整：第 3 项不采用其建议的 `app.duty * 0.5f`——因 `prd = base_clk / freq` 为整数除，**可能为奇数**（如 `2.72e9/83000=32771`），而 `app.duty` 基于 `span = prd/2`（整数下取整），`*0.5f` 在奇数 `prd` 时有 `prd/(prd-1)` 的相位偏差；改用缓存倒数 `1/prd` 直乘，与原 `(mcmp3-LEAD)/prd` 在 ~1 ULP 内，更准。

1. **缓存工厂校准常量（第 2 项）**：`__LL_ADC_CALC_VREFANALOG_VOLTAGE` / `__LL_ADC_CALC_TEMPERATURE` 宏每个 ISR 都从系统存储区（`0x1FFF75xx`）读 `*VREFINT_CAL_ADDR`、`*TEMPSENSOR_CAL1/2_ADDR`。初始化时缓存 `vrefint_cal_x3000 = *VREFINT_CAL_ADDR * VREFINT_CAL_VREF`、`ts_cal1`、`ts_span = *CAL2 - *CAL1`、`ts_cal_valid`。ISR 内 `g_vcc_mv = vrefint_cal_x3000 / vref_avg`；温度按宏公式内联（数据本就 12-bit，分辨率换算是 no-op，省略），与宏逐比特等价。两个真正的 `UDIV`（`/vref_avg`、`/ts_span`）保留（操作数变化，必需）。

2. **相位浮点除改缓存倒数（第 3 项）**：`g_derived` 新增 `inv_prd_f = 1/prd`，ISR 内 `phase_frac = (mcmp3-LEAD) * inv_prd_f` 取代 `/(float)prd`。phase_frac 仅用于给 VPRI 采样定位，VPRI 是硬件滤波后的直流母线，亚-ULP 误差无意义。

3. **VPRI 固定采样位跳过除法（第 4 项）**：`sample_index_for()` 中 `delay_ns/period_ns` 一项，当前所有采样位（VPRI A/B）`delay_ns==0`，`0/period_ns==0` 纯属浪费（每 ISR 两次 `VDIV`）。改为 `if ((pos->delay_ns != 0) && (period_ns > 0.0f))` 跳过，位精确，且保留 `delay_ns!=0` 的通用路径。

4. **set_duty 缓存相位跨度（第 5 项）**：`g_derived` 新增 `phase_span_f = (float)(prd/2)`、`inv_span_f = 1/phase_span_f`。`set_duty()` 去掉每次的整数 `prd/2`（`UDIV`）和浮点 `/(float)span`（`VDIV`）：`raw` 用 `duty * phase_span_f`（与原 `duty*(float)span` 位等价），`app.duty` 用 `*inv_span_f`（倒数乘，~1 ULP，且 app.duty 仅遥测）。三个缓存量在 `apply_settings()` 与 `APP_Init` 默认块各算一次。

5. **AUX 慢速环改滚动和（第 6 项）**：原先每 ISR 把 AUX12/AUX5/MOS-NTC 三个 16 元素环全量重求和（48 次加）。改为 `process_slow_adc_isr()` 内三个静态 `rsum_*`：写槽前 `rsum = rsum + 新均值 - 旧槽值`（无符号回绕保证 `新<旧` 时仍正确），下游直接取 `rsum_*`。静态零初始化 + 仅本函数写入，故 `rsum_*` 恒等于环和；变频时 `apply_settings` 不清环数组也不清 `rsum_*`，二者始终一致——与原全量重求和逐比特相同（含预热与跨变频）。

6. **LED 心跳去 `% 5000U`（第 7 项）**：`hrtim_irq_count % 5000U` 每 ISR 一次硬件 `UDIV`，且该计数器无其他用途。改为 `if (++hrtim_irq_count >= 5000U) { hrtim_irq_count = 0; toggle; }`，触发节拍（每第 5000 个 ISR）完全一致。

**改动文件**：仅 `Core/Src/app_core.c`（`APP_DerivedConfig` 增 3 个 float 字段；新增 4 个静态校准缓存量；`apply_settings`/`APP_Init` 各补缓存计算；`set_duty`、`sample_index_for`、`process_slow_adc_isr`、`APP_HRTIM_ControlISR` 改写如上）。上位机与协议未动。

**附：VREFINT/temp 为何不一并改 rolling sum**（评估后决定不改）。移位平均它本来就是（`vref_avg`/`temp_avg` 用 `>>4`，无除法）。rolling sum 不适用：第 6 项能 roll 的是 AUX 那层 **CPU 每拍写一格**的 ring（`cyc_*`，写前能读到旧值，故"减旧加新"精确）。AUX 其实还有一层"求 16 个 DMA 样本之和→本周期均值"的 stage 1（`adc3/4_dma`），第 6 项**也没动**它。VREFINT/temp 只有这层 stage 1（直接对 `adc5_dma` 求和），样本是 **DMA 硬件异步写入**，CPU 不知道本拍覆盖了哪格、旧值多少，无法减旧。强行 roll 要么维护 16 元素影子拷贝来 diff（开销 ≥ 直接重求和，不省），要么读 DMA NDTR 记账（脆弱、与 DMA 竞态），要么再加一级 ring（变成更长平均，改变温度/VREF 滤波特性，Todo 头部明确禁止）。故保持原样。

## 2026-05-31 控制 ISR 等价优化点梳理

- 检查 `adc12_to_mv()` 的 `raw * g_vcc_mv / 4095U` 编译结果：当前 Keil ARMCC v5 未自动变成乘法倒数，`APP_HRTIM_ControlISR` 内联后仍为硬件 `UDIV`，除数 `0x0FFF`。已把“如需优化，必须先做有边界证明和穷举验证的等价无除法 helper；不合适则保留硬件除法”的方案写入 `Todo.md`。
- 将不降低实时表现的 ISR 等价优化点记录到 `Todo.md`：缓存 `VREFINT_CAL` / `TS_CAL1` / `TS_CAL2` 派生常量、用 `app.duty * 0.5f` 或缓存值替代相位浮点除法、专门化 VPRI 固定采样位置以避开零 delay 的通用除法路径、缓存 `set_duty()` 的相位跨度/倒数、AUX 慢速 ring 改 rolling sum、LED 分频从 `% 5000U` 改倒计数。
- 明确未纳入会降低更新频率或改变实时表现的方案，例如温度/VREF/AUX 降频计算。
- 本次只做分析和文档记录，未修改下位机业务代码，未运行 Keil 编译。

## 2026-05-31 控制 ISR 去 int64 除法 + IPRI_DC 零点改精确 2.5V

本次两项修改，均在控制 ISR（`APP_HRTIM_ControlISR`）热路径上，并同步文档。

### 1. `pi_power_mw()` 去掉 64 位乘除

- 原实现 `(uint32_t)(((uint64_t)mv * (uint64_t)ma) / 1000ULL)`：32×32→64 的乘法（`UMULL`）本身很便宜，但紧接着的 **64 位常量除以 1000** 会被编译器展开成一串 64 位 reciprocal-multiply（或退化为 `__aeabi_uldivmod` 风格的库调用），每个控制 ISR 跑两次（母线侧 + 副边侧功率），是 ISR 里唯一的 64 位运算。
- 改为全 32 位：把 `mv` 拆成 `mv = 1000*vq + vr`（`vq` 整伏特、`vr` 0..999 的亚伏 mV），则
  `mv*ma/1000 = ma*vq + (ma*vr)/1000`。两个 `/1000U` 都是 32 位、被编译为乘倒数+移位，无除法指令、无 64 位。
- **位精确**：因 `ma*vq` 为整数，`floor((1000*vq+vr)*ma/1000) = ma*vq + floor(ma*vr/1000)`，与原 64 位结果逐比特相同。
- **不溢出**：本机最坏情形副边 `~3.3e6 mV × ~0.5A`、母线 `~56e3 mV × ~25A`，`ma*vq` 与 `ma*vr` 两个分量都远在 uint32 内（各 < 3e7）。要溢出需功率 > 4.29 MW 或电流 > 4290 A，不可能。

### 2. IPRI_DC（ACS712）零点由 `AUX_5V/2` 改为精确 2.5V

- 实测 ACS712 在 0A 时输出为**精确 2.5V**，并非随 5V 轨比例变化的 `AUX_5V/2`。
- 新增宏 `APP_IPRI_DC_ZERO_MV = 2500UL`；ISR 内 `ipri_dc_zero_mv = g_aux_5v_mv / 2U;` 改为 `= APP_IPRI_DC_ZERO_MV;`。因 `adc8_to_mv()` 已用 VREFINT 反推的 `g_vcc_mv` 做基准，输出是绝对电压，固定 2500 mV 即为正确零点。
- `g_aux_5v_mv` 仍在 `process_slow_adc_isr()` 中计算，作为心跳遥测（5V 轨电压）保留，仅不再用于 IPRI_DC 零点。
- 同步修订两处过时注释：`process_slow_adc_isr()` 头注释与 ISR 内 `process_slow_adc_isr()` 调用前注释（原称 “g_aux_5v_mv 为 IPRI_DC 零点”）。

### 文档

- `README.md`：PA0 引脚表（无电流输出改为“精确 2.5V（实测，非 AUX_5V/2）”）；安全约束 IPRI_DC 钳位阈值由 `AUX_5V/2` 改为 `2.5V（ACS712 精确零点）`。
- 本次未改上位机代码（`pi_power_mw` 为下位机内部定点实现，上位机功率/效率计算不受影响）。

### 验证

- 待 Keil uVision 编译 `G474_HVCCPS.uvprojx` 确认 0 Error / 0 Warning（本环境无 ARM 工具链，未在此运行）。

## 2026-05-31 MOS NTC 改 4096 点 ADC raw 查表

按本次要求将 MOS NTC 温度换算从 ISR 内 `raw -> mV -> Beta/logf` 改为完整 12-bit ADC raw 查表。

- 新增 `Core/Inc/mos_ntc_lut.h`，表长 4096，索引为 ADC4 MOS-NTC raw `0..4095`，表值单位为 `m°C`。
- 表按文档参数生成：`3.3V -> NTC10K -> ADC -> 10K -> GND`，`R25=10k`，`B=3450`，`T25=298.15K`。
- `raw=0` 和负温区间钳为 `0 m°C`；`raw=4095` 是分压公式奇点，饱和到 `raw=4094` 的最高表值。
- `app_core.c` 删除 MOS NTC 的浮点 Beta 计算函数和 `APP_NTC_*` 宏，`process_slow_adc_isr()` 对 16 周期平均后的 raw 直接索引 `MOS_NTC_TEMP_MC_BY_RAW[]`。
- `math.h` 保留给已有的 `isfinite()` 使用；MOS 温度路径不再调用 `logf()`。
- `README.md` 安全约束同步说明：MOS NTC 是 raw 直接查表，其余 ADC 物理量仍先用 VREFINT 反推 VCC。
- 验证：Keil uVision 编译 `G474_HVCCPS.uvprojx` 通过，**0 Error / 0 Warning**，Program Size: Code=28796, RO-data=16976, RW-data=120, ZI-data=4760。

## 2026-05-31 慢速量恢复每周期处理 + 16×/移位滤波

按 Todo 原始算法架构修正上一版的慢速量处理频率：ADC3/4 的采样数量和滑动窗口保持 16（便于移位求均值），但 CPU 处理不再每 16 个控制 ISR 才跑一次，而是恢复为每个控制 ISR 都执行一次。

### 下位机代码

1. 删除 `APP_SLOW_PROC_INTERVAL` 和 `slow_decim`，`APP_HRTIM_ControlISR()` 每次进入都调用 `process_slow_adc_isr()`。
2. `process_slow_adc_isr()` 的算法保持 Todo 结构：
   - 读取本周期 ADC3/4 的 16 个样本，右移 `>> 4` 得到“本周期均值”。
   - 覆盖写入 16 元素环形数组。
   - 再对环形数组右移 `>> 4` 得到最终 AUX12 / AUX5 / MOS NTC raw。
   - 因此 ring 现在表示最近 16 个连续开关周期，而不是每隔 16 周期取一次快照。
3. 环形下标从 `% APP_SLOW_AVG_CYCLES` 改为 `& APP_SLOW_AVG_MASK`，窗口长度为 16 时避免取模除法。
4. IPRI_AC 峰值也恢复为每个控制 ISR 更新一次，语义重新匹配“周期内峰值（不记录历史最大值）”。
5. 注释同步为“所有物理量换算在每个控制 ISR 内完成”，去掉 1/16 慢速块描述。

### 文档

- `README.md` 下位机数据流图更新为每周期调用 `process_slow_adc_isr()`，并标明 ADC3/4 是“16 点周期均值 -> 连续 16 周期环形平均”。
- 本次未修改上位机代码。

### 验证

- Keil uVision 编译 `G474_HVCCPS.uvprojx` 通过：**0 Error / 0 Warning**。

## 2026-05-31 ADC3/4 改 Timer E 16× 同步采样

按本次要求把慢速辅助量链路从上一版 Timer D 10× 进一步调整为 Timer E 16×，文档与 CubeMX 配置同步到当前实现。

### 下位机代码

1. **ADC3/ADC4 改由 ADC Trigger 3 + Timer E 16× 驱动**：
   - `Core/Src/hrtim.c` 中 ADC Trigger 3 的触发源改为 `Master CMP1 | Timer E Period`，postscaler 保持 0。
   - 新增 Timer E no-output 配置，默认周期 `HRTIM_PRD/8+1`，MUL32、CONTINUOUS、由 Master CMP1 reset。
   - `APP_TIMERS_ALL` 增加 `HRTIM_TIMERID_TIMER_E`，保证 `apply_settings()` 停止/启动 HRTIM 时 Timer E 也同步参与。
2. **缓冲区与均值改为 16× / 移位**：
   - `APP_SLOW_SAMPLES_PER_PERIOD=16`、`APP_SLOW_AVG_CYCLES=16`、`APP_VREF_SAMPLES=16`。
   - ADC3/4/5 DMA 缓冲长度变为 `16 / 32 / 32`。
   - AUX12 / AUX5 / MOS-NTC 的单周期均值、16 周期环形均值，以及 VREFINT / 内部温度 16 样本均值均改为 `>> 4`，避免除以 10 这类非 2 的幂除法。
3. **频率变更同步 Timer E**：
   - 新增 `time_prd_for_freq(freq)=floor(5.44GHz/(freq×16))+1`。
   - `APP_DerivedConfig` 增加 `time_prd`。
   - `reconfigure_hrtim()` 增加 `time_prd` 形参，并在 Timer C/D 后重新配置 Timer E 时基。
   - `apply_settings()` 和 `APP_Init()` 都计算并记录 Timer E 周期，确保上位机下发频率变更后 Timer E 也随主开关频率更新。
4. **控制 ISR 细节**：
   - 慢速辅助量物理换算（VREF/VCC、AUX、NTC、内部温度）仍在控制 ISR 内处理，主循环不做物理量换算。
   - `IPRI_AC` 峰值仅作 MOS 保护/遥测，不参与控制。
   - `sample_index_for()` 用内联取整替代 `floorf()`，避免 Cortex-M4 上的库函数调用。
5. **注释同步**：
   - 清理 `app_core.c` 中残留的 `10-sample`、`TIM-D 10x chain`、`slot k ~ k*10%` 等旧注释，改为 Timer E 16× / ADC5 16 样本跨周期分频窗描述。

### CubeMX / IOC

- `G474_HVCCPS.ioc` 增加 Timer E no-output 虚拟外设。
- `ADCTrigger3_Source2` 从 `HRTIM_ADCTRIGGEREVENT13_TIMERD_PERIOD` 改为 `HRTIM_ADCTRIGGEREVENT13_TIMERE_PERIOD`。
- 增加 `Periode_TE=HRTIM_PRD/8+1`、`ResetTrigger1-No_output_TE=HRTIM_TIMRESETTRIGGER_MASTER_CMP1` 等 Timer E 配置项。

### 文档

- `README.md` 更新 HRTIM 章节：Timer D 只驱动 ADC5 的 Trigger 2 分频链，Timer E 驱动 ADC3/4 的 Trigger 3 16×采样链。
- 启动顺序改为 master + timA/B/C/D/E，设置包说明改为频率变更时重算 TIM C/D/E。
- 下位机数据流图改为：ADC3/4 为每周期 16 点周期均值 + 连续 16 周期环形平均，ADC5 为 16 样本均值。

### 验证

- Keil uVision 编译 `G474_HVCCPS.uvprojx` 通过：**0 Error / 0 Warning**。
- 本次未修改上位机代码，按要求无需运行上位机实际测试。

## 2026-05-31 原边 AC 电流改峰值检测 + 1:200 CT/7.5Ω + 控制环简化

发现 PSFB 存在无功电流，原边 SW 节点交流电流（IPRI_AC）的均值/插值对控制和功率计算无意义，本次将其改为**纯峰值检测**，只用于 MOS 过流保护显示；同时原边 AC 采样硬件改为 1:200 互感器 + 7.5Ω；闭环控制与效率/功率计算改用更可靠的量。

### `Core/Src/app_core.c`

1. **IPRI_AC 改为周期内峰值（最大值）**：新增 `period_max_adc2(rank)`（遍历 24 个样本取最大）替代原来的单点相位插值 `read_adc2(...)`。仅取当前周期峰值，不记录历史最大值。删除随之失去使用者的 `read_adc2()`、`APP_POS_IPRI_AC`（`read_adc1`/`APP_POS_VPRI_*` 仍保留供 VPRI 用）。
2. **硬件系数 1:100/15Ω → 1:200/7.5Ω**：`i_pri_ac_ma` 换算由 `* 100UL / 15UL` 改为 `* 400UL / 15UL`（即 `CT/R = 200/7.5 = 400/15 ≈ 26.67 mA/mV`，灵敏度 37.5 mV/A），行尾注释更新为 `1:200 CT + 7.5ohm + |.| (peak)`。
3. **闭环 CC 控制只用副边 DC 电流**：`current_feedback_ma = i_sec_ma`，删除原 `max3(原边AC折算, 原边DC折算, 副边)` 及局部变量 `pri_ac_sec_ma`/`pri_dc_sec_ma`。
4. **CP 功率反馈改用 IPRI_DC**：去掉 `母线电压 × IPRI_AC` 这一无功项，改为 `max(母线电压 × IPRI_DC, 副边电压 × 副边电流)`（用一个内联两值取大替代）。
5. 上述改动后 `max3_u32()` 失去使用者，删除其定义（避免 armcc 未使用静态函数告警）。`APP_TRANSFORMER_RATIO` 宏变为未使用（保留，记录 100:1 变压比，宏未使用不告警）。
6. **IPRI_DC 已是周期内 24 点直接平均**（`arithmetic_mean24_adc2`），核对后无需改动。

### 上位机 `HostUI2.0/`

- `app.js` `efficiencyRatio()`：输入功率由 `iPriAcMa × vPriMv` 改为 **`iPriDcMa × vPriMv`**（IPRI_AC 不再代表实功率）。
- `app.js` 遥测指标 `iPriAcA` 标签由 `IPRI AC` 改为 **`IPRI AC PK`**（轴标同改），明确这是峰值保护读数。
- `app.js` IPRI_AC 波形 `toUnit` 系数由旧的 `100/11`（此前 1:200+22Ω 残留，未随 0530 改动同步，本次一并修正）改为 **`200/7.5`**，与下位机一致。
- `protocol.js` `SAMPLE_POSITIONS.ipriAc` 由单点探针改为**空数组**（峰值检测无单一采样点，波形上不再画该探针标记；viz 的位置标记循环对空数组安全）。

### 文档

- `README.md` 最小化更新：PA1 引脚（1:200 CT + 7.5Ω，标注仅 MOS 保护取峰值）；控制环信号处理表 IPRI_AC 行（单点插值 → 周期峰值）；CC/CP 反馈描述（CC 仅副边 DC、CP 用 IPRI_DC）；VSEC 全 0 返回 0 的补充；心跳字段 i_pri_ac 注明峰值；数据流图 `read_adc2` → `period_max_adc2`。

### 验证

- Keil 编译 `G474_HVCCPS.uvprojx`：**0 Error / 0 Warning**，Code=29444。
- 上位机 `app.js` / `protocol.js` / `viz.js` `node --check` 全部通过。
- 心跳协议字段布局未变（仅 `i_pri_ac` 语义由插值值变为峰值），上位机其余部分兼容。

## 2026-05-31 慢速辅助量采样架构重构（HRTIM 触发 + ISR 同步处理）

本次把 AUX5 / AUX12 / MOS 温度 / VREFINT / 内部温度 这些慢速辅助量，从"软件触发 + 在 `APP_Task` while 循环里做物理量换算"改为"HRTIM 硬件触发 + 在控制 ISR 内同步处理"，并补齐频率变更时 TIMER D 的重配置。硬件层（`adc.c` / `hrtim.c` / `.ioc`）已由 CubeMX 重新生成，本条记录业务代码（`app_core.c`）与文档的同步。

### 硬件触发链（已由 CubeMX 生成，本次仅核对，未改）

- **ADC Trigger 1** = `Master CMP1 | TIMC Period`，postscaler 0 → ADC1/ADC2，24×/周期（原有不变）。
- **ADC Trigger 3** = `Master CMP1 | TIMD Period`，postscaler 0 → ADC3（AUX12）+ ADC4（AUX5 rank0 / MOS-NTC rank1），10×/周期。
- **ADC Trigger 2** = `Master CMP1 | TIMD Period`，postscaler **10（每 11 个事件触发 1 次）** → ADC5（内部温度 rank0 / VREFINT rank1）。
- **TIMER D**：MUL32、CONTINUOUS、周期 `HRTIM_PRD/5+1`、由 Master CMP1 reset 同步。
- ADC3/4/5 由软件触发改为 HRTIM 触发；时钟统一 `ADC_CLOCK_SYNC_PCLK_DIV4`（42.5 MHz）；ADC3/4 采样时间 6.5 cycle，ADC5 保持 247.5 cycle；关闭了过采样；DMA 优先级提至 HIGH。`usart.c` 的 RX/TX DMA 优先级降为 MEDIUM 以让位。

### `Core/Src/app_core.c` 改动

1. **缓冲区 10× 化 + 常量/rank 宏**：新增 `APP_SLOW_SAMPLES_PER_PERIOD=10`、`APP_SLOW_AVG_CYCLES=10`、`APP_VREF_SAMPLES=10`，以及 `APP_ADC3/4/5_CHANNELS`、`APP_ADC3/4/5_BUFFER_LEN`（10/20/20）。`adc3_dma[10]` / `adc4_dma[20]` / `adc5_dma[20]`（原为 1/2/2）。新增 rank 宏 `APP_ADC3_RANK_AUX12`、`APP_ADC4_RANK_AUX5/MOS_NTC`、`APP_ADC5_RANK_INT_TEMP/VREFINT`。
2. **🔴 修复 TIMER D 从未启动**：`APP_TIMERS_ALL` 增加 `HRTIM_TIMERID_TIMER_D`。该宏被 `apply_settings()` 的 `WaveformCountStart_IT`/`Stop_IT` 共用——此前 TIMER D 虽在 `hrtim.c` 配置却从未被启动，TRG2/TRG3 只会收到 Master CMP1 单一事件源（1 次/周期而非 10 次），缓冲区无法正确填充。这是本次发现并修复的关键缺陷。
3. **频率变更同步 TIMER D**（对标 `timc_prd_for_freq`）：新增 `timd_prd_for_freq(freq)=5.44GHz/(freq×10)+1`（复用 `APP_HRTIM_TIMC_BASE_CLK_HZ`，TIMER D 同为 MUL32）；`APP_DerivedConfig` 增 `timd_prd`；`reconfigure_hrtim()` 增 `timd_prd` 形参并在 TIMER C 之后配置 TIMER D 时基；`apply_settings()` 与 `APP_Init()` 计算并写入 `g_derived.timd_prd`。心跳协议未改（不新增 timd_prd 上报），上位机无需改动。
4. **慢速量处理移入 ISR**：删除 `update_slow_adc()` 及其在 `APP_Task()` 的调用（while 循环不再做任何物理量换算）；新增 `static void process_slow_adc_isr()`，在 `APP_HRTIM_ControlISR()` 最前面调用（先于所有 `adcXX_to_mv`，因为 `g_vcc_mv` 被全部换算依赖、`g_aux_5v_mv` 被 IPRI_DC 零点依赖）。滤波算法：
   - TRG3 组（AUX12/AUX5/MOS-NTC）：每拍先对 DMA 缓冲内 10 个样本求均值得"本周期采样值"，覆盖写入 3 个 `cyc_*[10]` 环形数组的最旧槽（共享 `ring_idx` 循环移动），再对环内 10 个周期值求平均得最终 raw。等效 100 点平均，但只用两个 10 元素数组/信号（避免 10×10 大数组）。
   - TRG2 组（VREFINT/内部温度）：直接对 `adc5_dma` 内 10 个样本求均值（缓冲本身即跨 11 周期的 0%..90% 历史窗）。`g_vcc_mv` 保留 `vref_avg!=0` 防护，缓冲未满时维持 3300 mV 默认。
5. **单周期 10 次采样与周期同步对齐**：把 ADC3/4/5 的 DMA 预装从 `APP_Init` 移入 `apply_settings()`（与 ADC1/2 并列：先 `HAL_ADC_Stop_DMA` → 清零缓冲 → `start_adc_dma`，全部在 `WaveformCountStart_IT` 之前）。配合"缓冲恰好 = 1 次采集样本数 + TIMER D `+1` 保证每周期恰好 10 次触发"，首个 Master CMP1 落在 index 0，slot k 恒对应相位 ~k×10%；开机与每次改频都重新对齐。`APP_Init` 仅保留 `calibrate_adc(3/4/5)`。
6. **副边电压全 0 → 输出 0**（`anti_phase_pairwise_mean_vsec`）：原先无 valid/side 信息时一律返回 4095。改为仅当 `has_full!=0`（真饱和）才返回 4095 强制退避；否则（24 样本皆 0）返回 0。应对低压大电流输出时副边分压被 EMI 拉到 0 的情况，避免误报满量程。saturation/side 分支语义不变。

### 时序验证（开工前逐项确认，50 kHz 最坏情况）

ADC 时钟 42.5 MHz（1 cyc=23.53 ns）。
- TRG3 间隔 = T_sw/10 = 2000 ns：ADC3（1ch×19cyc=447 ns）、ADC4（2ch×19cyc=894 ns）均充足。
- TRG2 间隔 = 11×T_sw/10 = 22 µs：ADC5（2ch×260cyc=12.24 µs）充足。
- **TIMER D `+1` 防碰撞**：master 周期 = 108800 MUL32 tick，TIMD 周期 = `HRTIM_PRD/5+1` = 10881 → 108800/10881 = 9.999 → 9 个 period 事件 + 1 个 Master CMP1 = 恰好 10 次；若不 +1（10880）则刚好 10.000，第 10 次 overflow 与 reset 同刻碰撞。TIMER C 同理（4534 → 23.997 → 24 次）。
- **11 分频 → 0%..90% 扫描**：10 与 11 互质，输出落在事件序号 0,11,…,99，跨 11 个主周期覆盖 10 个相位。
- 频率缩放：`timd_prd=floor(5.44e9/(freq×10))+1` 在 10–50 kHz 全程恒落于 (9,10)，且 16-bit 内（50 kHz=10881，10 kHz=54401）。

### 文档

- `README.md` 最小化更新：ADC 整体分配表 ADC3/4/5 触发列（软件触发→HRTIM Trigger 3/2）；引脚表"慢速循环采样"→"HRTIM 10×/周期同步采样"；HRTIM 配置新增 Timer D 段、新增"慢速 ADC 触发（Timer D，10×/周期）"小节、compare unit 列出 Timer D；启动顺序补全 5 路 ADC + Timer D；文件结构 hrtim.c 描述补 Timer D / Trigger 2/3；下位机数据流图把 `update_slow_adc` 从 `APP_Task` 移到 ISR 的 `process_slow_adc_isr`。
- 更新 `app_core.c` 文件头注释，补充 TRG2/TRG3 + TIMER D 慢速链与"所有物理量换算在 ISR 内完成"的说明。

### 验证

- Keil uVision 编译 `G474_HVCCPS.uvprojx` 通过：**0 Error / 0 Warning**，Code=29648（较上次 29104 增 544 字节）。
- 协议未变，上位机 HostUI2.0 无需改动。

## 2026-05-30 原边 AC 电流互感器硬件变更（1:100 CT + 15Ω）

- 硬件变更：原边变压器 SW 节点交流电流采样电路，电流互感器由 1:200 改为 **1:100**，采样电阻由 22Ω 改为 **15Ω**。绝对值电路与 8 位 ADC2_IN2（PA1）通道不变。
- `Core/Src/app_core.c`（`APP_HRTIM_ControlISR`，约 1269 行）更新 IPRI_AC 物理量换算系数：
  - `adc8_to_mv()` 返回采样电阻两端电压（mV），换算到原边电流 mA 的增益 = `CT 变比 / 采样电阻` = `CT_ratio / R_sense`。
  - 旧：`* 100UL / 11UL`（即 `200/22`，对应 1:200 CT + 22Ω）。
  - 新：`* 100UL / 15UL`（对应 1:100 CT + 15Ω），并同步更新行尾注释为 `/* 1:100 CT + 15ohm + |.| */`。
  - 换算关系：`I_pri(mA) = V_sense(mV) / 15 × 100`，灵敏度由旧 0.11 V/A 提升至 0.15 V/A；在同一 ADC 满量程下测量上限相应由约 30 A 降至约 22 A，分辨率提升。
- **注意**：`APP_TRANSFORMER_RATIO`（55 行，值 100）是主功率变压器原副边匝比，用于将原边电流折算到副边，与本次电流采样 CT 无关，未改动（数值与新 CT 变比恰好同为 100 纯属巧合）。
- 采样时序参数 `APP_POS_IPRI_AC = {0.015f, 0.42f, 0}` 仅影响相位插值采样点，与幅值标定无关，未改动。
- `README.md` 第 29 行（PA1 引脚说明）由 `1:200 CT + 22 Ω 采样电阻` 最小化更新为 `1:100 CT + 15 Ω 采样电阻`，保持文档与代码一致。
- 验证：Keil uVision 编译 `G474_HVCCPS.uvprojx` 通过，0 Error(s) / 0 Warning(s)，Code=29104。

## 2026-05-27 文档重构

- 将 `Design.md` 和 `DebugDesign.md` 删除，所有当前设计信息迁移到 `README.md`。
  - `README.md` 仅描述当前代码的最终状态，移除所有"旧版/新版/不变/已移除"等演进描述。
  - 历史设计演进信息继续保留在 `log.md` 中。
- 修正 `Design.md`（现 README.md）中与实际代码不符的若干描述：
  - ADC 采样参数（采样时间、过采样）已固定为 CubeMX 初始值，不可由上位机覆盖。README 中明确标注为固定配置。
  - VSEC 不再使用 A/B 位置插值，而是 12-pair 反相对消均值处理；ISEC 和 IPRI_DC 使用 24 点算术均值而非单点插值。更新了控制环路信号处理方式的完整描述。
  - ADC2 regular 序列顺序更正为 `(IPRI_AC, ISEC, IPRI_DC)`，与 `adc.c` CubeMX 配置一致。
  - `validateSettingsForm` 不再检查采样时间/过采样预算。
  - 设置包大小从文档中不存在的 67/79 字节更正为实际当前值 34 字节。
  - 频率范围保持 10–50 kHz（非 10–100 kHz）。
  - 移除"（不变）""新格式"等非当前时态的描述。
- 修复了 `app_core.c` 文件头注释中 ADC2 序列顺述描述错误（IPRI_DC, ISEC, IPRI_AC → IPRI_AC, ISEC, IPRI_DC）。
- 修复了 `index.html` 中两处 ADC2 rank 描述错误的顺序。
- 修复了 `viz.js` 中 `ADC2_RANKS` 数组顺序，使其与硬件实际 rank 顺序一致。
- 上位机 4 个 JS 文件语法校验全部通过。

## 2026-05-27 ISR 执行时间测量与上报

- 在 `Core/Src/app_core.c` 启用 Cortex-M4 DWT CYCCNT，用于无开销地测量控制 ISR 的执行时间：
  - `APP_Init` 中设置 `CoreDebug->DEMCR |= TRCENA`、清零并使能 `DWT->CYCCNT`。
  - 新增静态全局 `isr_cycles_last/min/max`，`min` 初始化为 `0xFFFFFFFF`，`max` 初始化为 0。
  - 新增内联辅助函数 `isr_timing_end()`：以 32 位无符号减法计算 `DWT->CYCCNT - start`，更新 last 并维护本心跳窗口内的 min/max。
  - `APP_HRTIM_ControlISR` 在函数入口采样 `isr_start_cycles`，并在所有三个 `return` 路径（power 未使能直接出、fixed-duty 路径、完整 PI 仲裁路径）之前调用 `isr_timing_end()`，保证任何分支的耗时都能被记录。
- 心跳协议在 `run_seconds_remaining` 之后插入 3 × `uint32`（last / min / max 周期数），总长度由 265 增至 277 字节：
  - `build_heartbeat` 用 `__disable_irq()/__enable_irq()` 的极短临界区把三个值快照出来，并同时把 `min` 复位为 `0xFFFFFFFF`、`max` 复位为 0，让下个心跳窗口从零开始累积。
  - 若该窗口内一次 ISR 都没跑过（`min` 仍是 `0xFFFFFFFF`），写包时把 `min` 折回 0 以避免上位机把哨兵值当真。
  - 调整 `build_heartbeat` 内 `total_len` 计算项，加入 `(3U * 4U)`；TX buffer `APP_HEARTBEAT_TX_CAPACITY = 320` 仍有充足余量。
- 上位机 `HostUI2.0/protocol.js`：
  - `HEARTBEAT_PAYLOAD_SIZE` 增加 `(3 * 4)`。
  - `createLatest()` 增加 `isrCyclesLast/Min/Max` 三个字段，默认 0。
  - `parseHeartbeatFrame` 在 `runSecondsRemaining` 之后顺序读取 3 个 `readLe32`。
- 上位机 `HostUI2.0/app.js`：
  - 新增 `CPU_CLOCK_HZ = 170_000_000` 和 `CPU_CYCLE_NS` 常量，新增 `formatCyclesUs()` 把 CYCCNT 转换为 μs 展示。
  - 在 `TELEMETRY_METRICS` 中新增 `isrLastUs / isrMinUs / isrMaxUs` 三个指标，归入新分组 `ISR`，颜色分别为 sky-500、sky-600、red-600。
  - `CHART_GROUP_ORDER` 在 `Control` 与 `Raw` 之间插入 `ISR`，使新分组在右侧 "Secondary Indicators" 列表和波形信号选择器里自然出现。
  - 这三个指标既不属于 `KEY_METRIC_KEYS` 也不属于 `DEBUG_METRIC_KEYS`，因此会默认在 Power Status 面板的 Secondary Indicators 区域里以 "ISR LAST / ISR MIN / ISR MAX" 三行 μs 数值常驻显示，无需展开调试折叠区。
- 删除 `Todo.md` 中对应一行条目。
- 验证：
  - 上位机用 `node --check HostUI2.0\protocol.js` 与 `node --check HostUI2.0\app.js` 通过语法校验。
  - 下位机未单独编译（按 AGENTS.md 约定可省略），仅人工核对：`build_heartbeat` 的 `off` 偏移变化与 `total_len` 计算项一致；ISR 三处 return 路径均在 `isr_timing_end()` 之后才返回；DWT 初始化只在上电时执行一次。

## 2026-05-25 HostUI telemetry efficiency and ADC2 default timing update

- Added a host-side telemetry metric named `效率` in the Power group.
  - The value is calculated directly as `(ISEC * VSEC) / (IPRI_AC * VBUS)`.
  - The UI displays the raw calculated percentage without clamping, so values above 100% or negative values caused by measurement noise are preserved.
  - The metric is available in the readings panel and in the plot signal picker.
- Updated HostUI2.0 ADC2 default trigger expressions:
  - ADC2 regular default is now `(MCMP3*2+MIN_TICKS)/3` with `0 ns` delay.
  - ADC2 injected default is now `MCMP3*0.72+0.075*HRTIM_PRD-34` with `0 ns` delay.
  - Existing browser settings that exactly match the previous ADC2 default `MCMP3*2/3+16` with `0 ns` delay are migrated to the new defaults on load.
- No firmware/protocol frame change was needed for this request because both new ADC2 timings are represented by the existing HostUI expression-to-`(a*MCMP3+b)` folding path.
- Verification:
  - `node --check HostUI2.0\protocol.js`, `HostUI2.0\app.js`, and `HostUI2.0\viz.js` passed.
  - Numeric default check passed at 50 kHz / MUL16: ADC2 regular folds to `a=2/3,b=16`; ADC2 injected folds to `a=0.72,b=4046`, with ranges `[48,18181]` and `[4081,23665]`.
  - `git diff --check -- HostUI2.0\protocol.js HostUI2.0\app.js Design.md log.md` passed with only Git CRLF normalization warnings.

## 2026-05-25 ADC1 dual-phase voltage sampling preset

- Reworked ADC trigger expression encoding so HostUI2.0 now folds each trigger into the wire form `(a * MCMP3 + b)` in HRTIM ticks:
  - Tick expressions can use `MCMP3`, `HRTIM_PRD`, `MIN_TICKS`, constants, `+`, `-`, `*`, `/`, and parentheses, while validation still rejects non-linear expressions such as variable-by-variable multiplication or division by a variable.
  - `MIN_TICKS` is computed from the selected HRTIM multiplier as `3 * multiplier` (`MUL16=48`, `MUL8=24`, `MUL4=12`, `MUL2=6`).
  - The separate delay-time field remains in nanoseconds in the UI; HostUI converts it to the nearest tick at the selected frequency/prescaler and adds it into the final `b` coefficient before sending.
  - The firmware no longer receives or evaluates an HRTIM_PRD coefficient or a separate constant/offset field; it only evaluates `round(a * MCMP3 + b)` at runtime.
- Shrunk the settings wire protocol from 79 bytes to 67 bytes:
  - Removed `adc1_c`, `adc2_c`, and `adc2_inj_c`.
  - `adc1_b`, `adc2_b`, and `adc2_inj_b` are now already-folded tick constants, not HRTIM_PRD coefficients.
  - Updated HostUI frame building and firmware frame parsing together.
- Updated trigger defaults:
  - ADC1 custom still displays `HRTIM_PRD*13/16` with `0 ns`; HostUI sends that as `a=0`, `b=prd*13/16`.
  - ADC1 preset still displays the dual phase expressions `HRTIM_PRD/4+MCMP3/2` and `HRTIM_PRD*3/4+MCMP3/2`; HostUI sends only the first phase as `a=0.5`, `b=prd/4+delay_ticks`, and firmware generates CMP4 as CMP3+PRD/2.
  - ADC1 preset delay default remains the time equivalent of `-1728 ticks` at 50 kHz / MUL16 (`-635.294117647 ns`), so changing frequency changes the sent tick offset while preserving the intended time delay.
  - ADC2 regular and ADC2 injected defaults are now `MCMP3*2/3+16` plus `0 ns`; HostUI migrates the prior default `MCMP3*2/3` plus `5.882352941 ns` localStorage value to the new default shape.
- Updated HostUI labels and visualization:
  - Main editor and popovers now label the expression field as `Tick Expression` and the time field as `Delay Time (ns)`.
  - Range analysis, summaries, and plotted ADC trigger rows now use the same folded trigger coefficients that will be sent to firmware.
- Updated firmware validation/clamping:
  - ADC compare minimum now follows the selected HRTIM multiplier via `3 * multiplier` for ADC trigger compares.
  - MCMP3 phase control still starts at the existing fixed 48-tick lead so the original 0% phase alignment with Master CMP1 is preserved.
  - Removed the old `-1728` tick compare defaults from CubeMX-generated HRTIM init; ADC Trigger 3 now starts as the custom single CMP3 trigger and app runtime configuration owns the dual-phase preset.
- Verification:
  - `node --check HostUI2.0\protocol.js`, `HostUI2.0\app.js`, and `HostUI2.0\viz.js` all passed.
  - Numeric protocol check passed: settings frame length 67; default ADC1 custom sends `a=0,b=44200`; ADC1 preset sends `a=0.5,b=11872` at 50 kHz/MUL16 and triggers `[11896,39096]` at `MCMP3=48`; ADC2 regular/injected both send `a=2/3,b=16`; `MIN_TICKS` evaluates to 24 at MUL8.
  - `git diff --check -- Core\Src\app_core.c HostUI2.0\protocol.js HostUI2.0\app.js HostUI2.0\viz.js HostUI2.0\index.html Design.md log.md` passed, apart from Git CRLF normalization warnings.
  - Keil build was attempted from `MDK-ARM`, but uVision reported it could not create `build.log` and `g474_hvccps\*. __i` command input files. The visible `build.log` timestamp stayed at 2026-05-19, so it is an old log and not a valid verification of this change. A sandbox-escalated retry was requested but rejected by the automatic approval service.
- Historical note: the older 79-byte / `adc*_c` entries below in this same 2026-05-25 section describe the intermediate implementation before this two-coefficient protocol cleanup.
- Split fixed trigger constants out of the expression text and into explicit time-offset fields in HostUI2.0:
  - Added `Trigger Offset (ns)` inputs for ADC1, ADC2 regular, and ADC2 injected in the visual editor, including rank/trigger popovers.
  - ADC1 keeps separate stored offsets for custom single-trigger mode and preset dual-phase mode so switching modes does not overwrite the custom offset.
  - ADC1 preset base expressions are now `HRTIM_PRD/4+MCMP3/2` and `HRTIM_PRD*3/4+MCMP3/2`; the default preset offset is stored as time derived from `-1728 ticks` at the default 50 kHz / MUL16 HRTIM base (`-635.294117647 ns`).
  - ADC2 regular/injected default base expressions are now `MCMP3*2/3`; the default offset is stored as time derived from `+16 ticks` at the default HRTIM base (`5.882352941 ns`), preserving the previous `(MCMP3+24)*2/3` effective trigger at the default HRTIM base.
  - Host validation, summaries, and visualization now convert each offset from nanoseconds to HRTIM ticks using the selected frequency/prescaler before range checks and frame encoding.
  - The wire protocol length remains 79 bytes. No new frame fields were added; HostUI writes the converted tick offset into the existing `adc1_c`, `adc2_c`, and `adc2_inj_c` coefficients.
- Firmware ADC1 preset now uses the received `adc1_c` tick offset for both dual-phase compare calculations instead of the old hardcoded `1728` tick constant. The lower computer still treats all received trigger coefficients as ticks.
- Split ADC2 current sampling into mandatory regular and injected groups:
  - ADC2 regular group now contains IPRI_AC and IPRI_DC, triggered by HRTIM ADC Trigger 1 from Master CMP4.
  - ADC2 injected group now contains ISEC, triggered by HRTIM ADC Trigger 2 from Timer A CMP2.
  - Added independent host/firmware settings for ADC2 injected trigger expression, sample time, and oversampling; regular and injected defaults are both equivalent to `(MCMP3+24)*2/3`, 6.5 cycles, no oversampling.
  - Increased settings frames from 66 to 79 bytes; ADC2 regular still has its own trigger/sample/oversampling fields, and the old single ADC2 trigger / three-regular-rank shape is no longer supported.
  - Updated the HRTIM/ADC visual editor with a separate ADC2 injected row and controls.
- Added an ADC1 sample-mode field to the settings protocol (`0` custom single trigger, `1` preset dual-phase average), increasing settings frames from 65 to 66 bytes.
- Firmware ADC1 preset mode:
  - Dynamically configures HRTIM ADC Trigger 3 to aggregate Timer A CMP3 and CMP4.
  - Computes CMP3 as `HRTIM_PRD/4 + MCMP3/2 + adc1_c` and CMP4 as `HRTIM_PRD*3/4 + MCMP3/2 + adc1_c`, where `adc1_c` is already a tick offset converted by HostUI.
  - Forces the applied ADC1 oversampling to 2x with right shift 1 for hardware averaging while preserving the custom-mode oversampling setting in the host form.
  - Starts ADC1 DMA with four halfwords in preset mode and keeps the two-halfword buffer length in custom mode.
  - In the 50 kHz control ISR, averages the two VSEC samples (`dma[0]` and `dma[2]`) for secondary voltage feedback; VPRI uses the first sequence sample.
- Preserved custom ADC1 operation:
  - Custom mode still uses the editable ADC1 expression routed through Timer A CMP3 only.
  - ADC2 current sampling remains independent on HRTIM ADC Trigger 1 / Master CMP4.
- Updated HostUI2.0:
  - Added an ADC1 sample-mode selector in the HRTIM/ADC visual editor.
  - Preset mode disables the custom ADC1 expression/oversampling controls, sends OSR x2, and shows both preset trigger instants in the visualization.
  - ADC1 rank sample-time selectors remain editable in preset mode; default ADC1 VSEC/VPRI sample times are now both 6.5 cycles.
  - Validation and ADC budget calculations account for two ADC1 trigger sequences per period in preset mode.
- Updated `Design.md` minimally to describe the new ADC1 modes and CMP3/CMP4 timing.
- Verification so far:
  - Ran `node --check HostUI2.0\protocol.js`; syntax check passed.
  - Ran `node --check HostUI2.0\app.js`; syntax check passed.
  - Ran `node --check HostUI2.0\viz.js`; syntax check passed.

## 2026-05-24

- Rebuilt the upper-computer UI in `HostUI2.0` as a new monitor-first operator console:
  - Main screen now keeps telemetry plot and power status visible at all times.
  - Serial connection, run/stop control, and configuration are separated into independent right-side drawers instead of sharing one mixed control dock.
  - Top status pills expose the four operator work areas clearly: connection state, output/run state, live monitoring, and configuration.
- Reworked the interaction model for safety and usability:
  - Added a single operating-state model (`disconnected`, `connected_idle`, `connected_running`) that drives button enablement and configuration locking.
  - Configuration drawer is locked while output is live and exposes a direct disable action.
  - Run drawer keeps CV/CC/CP targets available during closed-loop operation, but locks start mode and duration while running.
  - Fixed-duty running disables the online target-update action because the targets do not have the same control meaning in that mode.
  - Emergency disable bar appears whenever output is latched on.
- Reworked HRTIM/ADC configuration placement:
  - Configuration drawer has a dedicated HRTIM/ADC tab with timing summaries and a large visual-editor entry point.
  - The HRTIM visual editor remains fully interactive, but its manual input column is hidden by default and shown only through a `Manual` button.
  - Frequency, dead time, ADC trigger expressions, oversampling, rank sample times, phase preview dragging, inline popovers, and undo/redo remain wired through shared state.
- Reworked the visual style:
  - Replaced the old blue-grey dark console with a white, restrained industrial style.
  - Used compact bordered panels, status pills, table-like reading rows, sparse status colors, and no decorative hero/marketing layout.
  - Kept monospace typography and dense information layout suitable for bench/industrial use.
- Kept protocol behavior unchanged:
  - Reused the existing non-module `protocol.js` frame helpers, heartbeat decoder, settings validation, and `history.js` undo/redo stack.
  - Reused `viz.js` visualization logic with new HostUI2.0 shell and styles.
- Updated `Design.md` minimally to describe the HostUI2.0 monitor-first drawer layout and visual-editor-first HRTIM workflow.
- Verification:
  - Ran `node --check HostUI2.0\app.js`; syntax check passed.
  - Ran `node --check HostUI2.0\protocol.js`; syntax check passed.
  - Ran `node --check HostUI2.0\history.js`; syntax check passed.
  - Ran `node --check HostUI2.0\viz.js`; syntax check passed.
  - Firmware was not changed, so Keil firmware compilation was not run.

## 2026-05-27：修复 ADC2 IPRI_AC / IPRI_DC rank 互换错误

- **问题**：下位机 `app_core.c` 中 `APP_ADC2_RANK_IPRI_DC` 和 `APP_ADC2_RANK_IPRI_AC` 的 rank 常量互换了（DC 写了 0、AC 写了 2），与 CubeMX 硬件配置不一致。实际 `adc.c` 中 ADC2 的 rank 顺序为：rank 0 = IPRI_AC（PA1/CH2）、rank 1 = ISEC（PA6/CH3）、rank 2 = IPRI_DC（PA0/CH1）。这导致心跳包 `build_heartbeat()` 去交织 DMA 缓冲区时 IPRI_AC 和 IPRI_DC 数据互换。
- 上位机 `app.js` 的 `CYCLE_SIGNALS` 中 IPRI_AC 和 IPRI_DC 的 rank/sampleDelayNs/positions 也相应互换了（AC 标记为 rank 2、DC 标记为 rank 0），导致逐周期波形图中 X 轴时间偏移各差了约 518 ns。
- **修复**：
  1. `app_core.c`：`APP_ADC2_RANK_IPRI_AC` 改为 0U，`APP_ADC2_RANK_IPRI_DC` 改为 2U（ISEC 保持 1U 不变）。
  2. `app.js`：`CYCLE_SIGNALS` 中交换 ipriAc 和 ipriDc 两个对象的位置，使 ipriAc 对应 ADC2 rank 0（~29 ns）、ipriDc 对应 ADC2 rank 2（~547 ns）。
- 修复后的正确时序：
  | 信号 | ADC Bank | Rank | 采样偏移 |
  |------|----------|------|---------|
  | VSEC | ADC1 | 0 | ~29 ns |
  | IPRI_AC | ADC2 | 0 | ~29 ns |
  | ISEC | ADC2 | 1 | ~288 ns |
  | VPRI | ADC1 | 1 | ~382 ns |
  | IPRI_DC | ADC2 | 2 | ~547 ns |
- 上位机语法检查通过。

## 2026-05-25

- Fixed HostUI2.0 operation and HRTIM visualization issues found after the first rewrite:
  - Changed the right-side power status panel to a fixed status header plus an isolated readings scroll area so expanding secondary/debug sections cannot push metric cards upward into the state chips.
  - Added internal scroll limits to expanded reading lists so long status groups stay contained.
  - Removed the dark backdrop effect from operation drawers while output is live, and made `Start Output` close the Run drawer immediately after sending the start command so the telemetry monitor is visible for startup observation.
  - Added a live control strip above the plot with `Update Targets` and `Disable` controls while output is latched on, keeping emergency stop available without reopening the Run drawer.
  - Kept the existing top emergency disable bar as a second always-visible stop path.
- Cleaned up the HRTIM / ADC timing editor:
  - Removed the `Bridge Color` option and all related UI/controller code; PWM colors are now always by bridge.
  - Restyled the Master timer counter lane for the white industrial theme instead of the previous dark/black-filled look.
  - Added explicit white-theme SVG styles for lane backgrounds, cycle lines, sawtooth counter fill, PWM baselines, dead-time blocks, rank text, MCMP3 reference lines/handles, and ADC TRIG reference lines/arrows.
  - Extended ADC TRIG reference lines upward through the timing view so they are visible as references, not just small local markers.
  - Changed ADC budget bars to compact inline cards under the timing diagram so they no longer visually occupy the middle of the view.
  - Removed the visible `Selection` help box and moved the rank-hover/click guidance into the timing editor help tooltip.
- Updated `Design.md` minimally to record that live output keeps immediate disable controls available.
- Verification:
  - Ran `node --check HostUI2.0\app.js`; syntax check passed.
  - Ran `node --check HostUI2.0\viz.js`; syntax check passed.
  - Checked all `getElementById()` references in `HostUI2.0\app.js` and `HostUI2.0\viz.js`; all referenced IDs exist in `HostUI2.0\index.html`.
  - Firmware was not changed, so Keil firmware compilation was not run.

## 2026-05-27：修复 ADC2 IPRI_AC / IPRI_DC rank 互换错误

- **问题**：下位机 `app_core.c` 中 `APP_ADC2_RANK_IPRI_DC` 和 `APP_ADC2_RANK_IPRI_AC` 的 rank 常量互换了（DC 写了 0、AC 写了 2），与 CubeMX 硬件配置不一致。实际 `adc.c` 中 ADC2 的 rank 顺序为：rank 0 = IPRI_AC（PA1/CH2）、rank 1 = ISEC（PA6/CH3）、rank 2 = IPRI_DC（PA0/CH1）。这导致心跳包 `build_heartbeat()` 去交织 DMA 缓冲区时 IPRI_AC 和 IPRI_DC 数据互换。
- 上位机 `app.js` 的 `CYCLE_SIGNALS` 中 IPRI_AC 和 IPRI_DC 的 rank/sampleDelayNs/positions 也相应互换了（AC 标记为 rank 2、DC 标记为 rank 0），导致逐周期波形图中 X 轴时间偏移各差了约 518 ns。
- **修复**：
  1. `app_core.c`：`APP_ADC2_RANK_IPRI_AC` 改为 0U，`APP_ADC2_RANK_IPRI_DC` 改为 2U（ISEC 保持 1U 不变）。
  2. `app.js`：`CYCLE_SIGNALS` 中交换 ipriAc 和 ipriDc 两个对象的位置，使 ipriAc 对应 ADC2 rank 0（~29 ns）、ipriDc 对应 ADC2 rank 2（~547 ns）。
- 修复后的正确时序：
  | 信号 | ADC Bank | Rank | 采样偏移 |
  |------|----------|------|---------|
  | VSEC | ADC1 | 0 | ~29 ns |
  | IPRI_AC | ADC2 | 0 | ~29 ns |
  | ISEC | ADC2 | 1 | ~288 ns |
  | VPRI | ADC1 | 1 | ~382 ns |
  | IPRI_DC | ADC2 | 2 | ~547 ns |
- 上位机语法检查通过。

## Goals (from DebugDesign.md)

Provide a developer-facing console that lets researchers freely tune the
PSFB power stage:

- Three-loop PI (CV/CC/CP) Kp / Ki at runtime.
- Switching frequency from 10 kHz to 100 kHz (with safety margins on the
  experimenter; not interlocked).
- Dead time 50 ns – 1000 ns (raw `fHRTIM` ticks, no multiplier).
- ADC1 / ADC2 trigger position as a *parametric expression* of `MCMP3`
  and `HRTIM_PRD` so the trigger can track the switch midpoint or sit
  at any fixed location.
- Per-rank ADC sample times (named for the user as "primary current",
  "secondary voltage", …).
- ADC oversampling / hardware averaging (must shift to match the ratio).
- Startup mode: fixed-duty (with risk warning) **or** regular three-loop
  control. With a "run N seconds" auto-cutoff (or "continuous").
- Stop button always available.
- Host can confirm settings reached firmware via a new `settings_ok`
  bit in the heartbeat (set after the next heartbeat following a valid
  settings packet).

## Packet design

Two new things on the wire plus a small heartbeat extension. All
little-endian, all fixed-length, all sum8 + xor8 trailers. We keep the
existing 0x55 heartbeat header and 0xAA command header; settings get
0x5A.

### Settings packet (Host -> Device), header `0x5A`, **67 bytes**

| offset | bytes | type     | field                                  |
|-------:|------:|----------|----------------------------------------|
|      0 |     1 | u8       | header `0x5A`                          |
|      1 |     1 | u8       | length = 67                            |
|      2 |     4 | f32      | `kp_cv`                                |
|      6 |     4 | f32      | `ki_cv`                                |
|     10 |     4 | f32      | `kp_cc`                                |
|     14 |     4 | f32      | `ki_cc`                                |
|     18 |     4 | f32      | `kp_cp`                                |
|     22 |     4 | f32      | `ki_cp`                                |
|     26 |     4 | u32      | `freq_hz` (10 000 – 100 000)           |
|     30 |     2 | u16      | `deadtime_ticks` (9 – 170, fHRTIM)     |
|     32 |     4 | f32      | `adc1_a` coefficient on MCMP3          |
|     36 |     4 | f32      | `adc1_b` folded tick constant          |
|     40 |     4 | f32      | `adc2_a`                               |
|     44 |     4 | f32      | `adc2_b` folded tick constant          |
|     48 |     4 | f32      | `adc2_inj_a`                           |
|     52 |     4 | f32      | `adc2_inj_b` folded tick constant      |
|     56 |     1 | u8       | `adc1_smp[0]` sample-time index 0..7   |
|     57 |     1 | u8       | `adc1_smp[1]`                          |
|     58 |     1 | u8       | `adc2_smp[0]` regular IPRI_AC          |
|     59 |     1 | u8       | `adc2_smp[1]` regular IPRI_DC          |
|     60 |     1 | u8       | `adc2_inj_smp` injected ISEC           |
|     61 |     1 | u8       | `adc1_oversample_log2` (0 = off, 1 = 2x, ... 8 = 256x) |
|     62 |     1 | u8       | `adc2_oversample_log2` regular group   |
|     63 |     1 | u8       | `adc2_inj_oversample_log2`             |
|     64 |     1 | u8       | `adc1_sample_mode` (0 custom single, 1 preset dual-phase average) |
|     65 |     1 | u8       | sum8                                   |
|     66 |     1 | u8       | xor8                                   |

Sample-time index ↔ ADC cycles (G474):
`0:2.5  1:6.5  2:12.5  3:24.5  4:47.5  5:92.5  6:247.5  7:640.5`

Host trigger inputs are a free-form tick expression using `MCMP3`,
`HRTIM_PRD`, `MIN_TICKS`, and constants, plus an explicit delay time in
nanoseconds. The host converts `HRTIM_PRD`, `MIN_TICKS`, constants, and delay
time to ticks using the selected frequency/prescaler, then sends the linear
wire form `round(a * MCMP3 + b)`.
With this form the host can express:

- fixed 48 ticks -> `a=0, b=48`
- `MIN_TICKS` -> `a=0, b=48` at MUL16 or `b=24` at MUL8
- "ADC2 current default" `MCMP3*2/3+16` + `0 ns` -> `a=0.6666667, b=16`
- "switch midpoint" `(MCMP3+48)/2` -> `a=0.5, b=24`
- "13/16 of period" (current ADC1 behaviour) -> `a=0, b=prd*13/16`
- ADC1 preset first phase `HRTIM_PRD/4+MCMP3/2` plus default delay derived from `-1728 ticks` at 50 kHz/MUL16 -> `a=0.5, b=prd/4+delay_ticks`; firmware derives the second phase as CMP4=CMP3+PRD/2.

Validation (firmware *and* host):

1. `freq_hz ∈ [10 000, 100 000]`
2. `deadtime_ticks ∈ [9, 170]`
3. `adc1_oversample_log2`, `adc2_oversample_log2`, and `adc2_inj_oversample_log2 ∈ [0, 8]`
4. `adc1_sample_mode ∈ {0, 1}`; mode 1 applies ADC1 as 2× oversampling and doubles the ADC1 per-period budget.
5. Sample-time indices `∈ [0, 7]`
6. Recompute `prd` and choose smallest prescaler that gives
   `prd ≤ 65535` (see prescaler table below). `prd` must end up
   `> 96` so the basic 48-tick offsets fit and MCMP3 has at least
   one tick of range. In practice `prd ≥ 27200` for our band.
7. For each of (adc1 custom mode, adc2 regular, adc2 injected): evaluate the expression at both ends of the
   MCMP3 range `[48, 48 + prd/2]` and require the result ∈
   `[48, prd + 48]`. ADC1 preset dual-phase validates both Timer A compare values
   against `[48, prd]`. (We accept a fixed expression as long as it stays
   in range across the entire phase sweep.) Hint to user about the
   `+48` lead offset.
8. ADC time budget per period: for ADC1, ADC2 regular, and ADC2 injected independently,

   ```
   t_per_rank = (sample_cycles + 12.5) * oversample_count
   total_cycles = sum_over_ranks(t_per_rank)
   ```

   The ADC is clocked at `170 MHz / 4 = 42.5 MHz`. Converted to seconds
   and compared to `1 / freq_hz`. Both must fit.

Settings packets are only accepted while the latch is OFF. If the
output is enabled the packet is silently dropped (host sees that
`settings_ok` does not flip).

### Command packet (Host → Device), header `0xAA`, **23 bytes**

Extends the v1 command with start-mode and run-duration fields.

| offset | bytes | type | field                                                   |
|-------:|------:|------|---------------------------------------------------------|
|      0 |     1 | u8   | header `0xAA`                                           |
|      1 |     1 | u8   | length = 23                                             |
|      2 |     1 | u8   | `ctrl_flags`                                            |
|      3 |     4 | u32  | `cv_target_mv`                                          |
|      7 |     4 | u32  | `cc_target_ma`                                          |
|     11 |     4 | u32  | `cp_target_mw`                                          |
|     15 |     2 | u16  | `run_duration_s` (0 = continuous)                       |
|     17 |     4 | f32  | `fixed_duty` (0.0 – 1.0; only honoured if bit2 of ctrl) |
|     21 |     1 | u8   | sum8                                                    |
|     22 |     1 | u8   | xor8                                                    |

`ctrl_flags` bits:

- bit 0: `enable_request`
- bit 1: `disable_request` (wins over enable when both set)
- bit 2: `fixed_duty_start` (only meaningful with enable)
- bit 3..7: reserved (0)

The firmware still applies the existing absolute target caps
(`CV ≤ 3000 V`, `CC ≤ 250 mA`, `CP ≤ 500 W`).

### Heartbeat v2 (Device → Host), header `0x55`, **96 bytes**

Identical to v1 up through the existing 24 telemetry / control fields.
After `key_flags` we insert a 2-byte `run_seconds_remaining` field
before the sum8/xor8 trailer (total grows by 2 bytes).

`status_flags` re-uses its reserved bits:

- bit 0: `power_enable_latched`
- bits 1-2: control mode (0 disabled, 1 CC, 2 CV, 3 CP)
- bit 3: `settings_ok` — flipped to 1 by the next heartbeat after a
  valid settings packet has been applied. Cleared back to 0 only by
  reset (per packet handshake; the host treats it as a level signal,
  not an edge).
- bit 4: `fixed_duty_active` — high while the latch is on **and** the
  current run was started in fixed-duty mode.
- bit 5..7: reserved.

`key_flags` unchanged.

## Firmware changes (Core/Src/app_core.c)

The runtime parameters move into a `g_settings` struct alongside the
existing `app` state. `HRTIM_PRD` and `DEAD_TIME` macros stay in
`main.h` only as power-on defaults; the body of the application reads
the live values from `g_settings`.

New flow on a valid settings packet:

1. Verify CRC, header, length.
2. Reject if `power_enable_latched`.
3. Validate fields (table above).
4. Stage into a scratch struct; on success:
   1. `HAL_HRTIM_WaveformOutputStop` (already off, defensive).
   2. `HAL_HRTIM_WaveformCountStop_IT` on master + Tim A + Tim B.
   3. `HAL_ADC_Stop_DMA` on ADC1 and ADC2, plus `HAL_ADCEx_InjectedStop` on ADC2.
   4. Reinit ADC1/ADC2 regular groups and ADC2 injected group with new oversampling + sample times.
      We mutate `hadcN.Init.OversamplingMode/Ratio/RightBitShift` then
      call `HAL_ADC_Init` again (which keeps the MSP / DMA bindings)
      followed by `HAL_ADC_ConfigChannel` for each rank.
  5. Reconfigure HRTIM time base on Master / A / B (period +
      prescaler), recompute structural compares (MCMP1 = 48,
      MCMP2 = `prd/2 + 48`, Tim A CMP1 = `prd/2`, Tim B CMP1 =
      `prd/2`), then evaluate ADC1/ADC2 regular/ADC2 injected trigger expressions at
      `MCMP3 = 48`.
   6. `HAL_HRTIM_DeadTimeConfig` with new ticks (rising = falling).
   7. Reset `app.mcmp3_raw / mcmp4_raw` to `lead = 48` (0 % duty).
   8. Restart ADC DMAs and ADC2 injected conversion, then HRTIM.
   9. Copy staged settings into `g_settings`; recompute cached values
      (`prd`, `phase_max`, ADC trigger constant parts, ADC time
      budget, `ki_*` scaled per period if useful).
   10. Set `settings_ok` flag (cleared on each new settings packet
       attempt and reasserted only on success).

ADC trigger update path (per-cycle inside `APP_HRTIM_ControlISR`):
whenever duty is applied and `mcmp3_raw` is known, ADC1, ADC2 regular,
and ADC2 injected evaluate their own user expressions against the same
`MCMP3` and `HRTIM_PRD`. ADC1 writes Timer A CMP3/CMP4 as needed, ADC2
regular writes Master CMP4, and ADC2 injected writes Timer A CMP2. All
are clamped to `[lead, prd + lead]`, and the firmware validator already
rejects expressions that leave this range over the whole MCMP3 sweep.

Fixed-duty start path:

- `parse_command` reads `fixed_duty_start`. If both `enable` and
  `fixed_duty_start` are set we set a new `app.fixed_duty_active` flag
  and stash `app.fixed_duty_value`.
- In the control ISR, if `fixed_duty_active`, we bypass the entire PI
  block: `duty = clamp(app.fixed_duty_value, 0, 1)` and freeze all
  three integrals at their current values. `app.mode` is reported as
  CV (arbitrary; UI shows "FIXED" instead). We still read ADCs so
  telemetry stays fresh.

Run-duration path:

- On enable, latch `run_seconds_remaining = run_duration_s` (or
  `0xFFFF` if continuous).
- In the slow `APP_Task` loop, once per heartbeat tick decrement
  `run_seconds_remaining` (in seconds, derived from `HAL_GetTick`).
  When it hits zero in non-continuous mode, force a disable.
- Stop button (host sends disable) zeroes the timer.

PI gains read from `g_settings` (no more macros). The candidate /
frozen / commit logic stays identical so the integral-bumpless
behaviour the original code goes to lengths to preserve is kept.

## Host UI changes (HostUI/)

Layout becomes a tab strip with three tabs: **Setup**, **Run**,
**Plot**. Status/telemetry stays visible across all tabs.

### Setup tab

Inputs grouped into cards:

- **PI gains** — six float inputs (Kp/Ki × CV/CC/CP).
- **Power frequency** — number, 10 000 – 100 000 Hz. Live readout of
  the resulting `prd` and "selected prescaler".
- **Dead time** — number, 50 – 1000 ns. Live readout of the resulting
  raw ticks (with the 5.88 ns/tick reminder).
- **ADC trigger** — for ADC1, ADC2 regular, and ADC2 injected separately, a free-form
  expression input plus a small read-only "evaluated range" line showing
  `eval(MCMP3 = lead)` and `eval(MCMP3 = lead + prd/2)`. The host also
  shows the parsed linear coefficients sent on the wire.
- **ADC sample times** — drop-downs per rank inside each ADC block with friendly names:
  - ADC1 rank 1: VSEC, rank 2: VPRI
  - ADC2 regular rank 1: IPRI_AC, regular rank 2: IPRI_DC
  - ADC2 injected rank 1: ISEC
- **Oversampling** — separate ADC1, ADC2 regular, and ADC2 injected drop-downs 1× / 2× / 4× /
  … / 256×. We don't expose the shift separately because it is locked
  to `log2(ratio)`.
- **"Apply"** button. Disabled while latched on. Disabled while the
  validator finds an error; the error text shows in a banner above
  the button. On click, builds the 65-byte settings packet, sends it,
  and shows "WAITING …" until the heartbeat reports `settings_ok = 1`
  (with a 1500 ms timeout that flips the banner to an error).

### Run tab

- Targets CV / CC / CP (existing inputs).
- Run-duration field plus a "Continuous" checkbox.
- Start-mode radio: "Regular (closed loop)" / "Fixed duty (NO LOAD =
  RISK)".
- When fixed-duty selected: an extra duty input (0 – 100 %). A red
  reminder banner appears: "FIXED DUTY: LOAD REQUIRED".
- **Apply Enable** sends the extended command packet. **Disable**
  sends a disable command (`fixed_duty` and `run_duration` echoed
  from the latest known values, but the disable bit wins).
- The Run tab also surfaces:
  - `RUN REMAINING` chip (counts down from heartbeat).
  - `SETTINGS OK` indicator chip.
  - Mode chip already shows CC/CV/CP — gain a FIXED state.

### Plot tab

Untouched from v1 except the metric list gains:

- `settingsOk` (boolean)
- `fixedDutyActive` (boolean)
- `runSecondsRemaining` (uint16)

These join the existing free-choice plot picker. Default plot
selection unchanged (VSEC, ISEC, IPRI AC).

### Protocol module

Centralise frame builders. `buildSettingsFrame(...)`,
`buildCommandFrameV2(...)`. Heartbeat parser updated for the 96-byte
layout and the new bits. The receiver remains robust: on any frame
mismatch we shift one byte and resync (no auto-disconnect).

## Validation logic shared with firmware

Sampling-time table (cycles) and ADC clock division replicated on
both sides. ADC time check:

```
adc_clock_hz   = 170_000_000 / 4
sample_cycles  = ADC_SAMPLE_TIME_CYCLES[idx]
conv_cycles    = sample_cycles + 12.5             // 12-bit
ovs_count      = max(1, 1 << adcN_oversample_log2)
rank_total     = conv_cycles * ovs_count
adc_total_us   = sum(rank_total) / adc_clock_hz
period_us      = 1e6 / freq_hz
require adc_total_us < period_us                  // per ADC
```

The UI shows the budget consumption as `xx.x % of period` per ADC
and refuses to send when either exceeds 100 %.

## Notes / non-goals

- We don't expose mid-run settings changes. The hardware-level cost
  of stopping HRTIM + ADCs would create a power-stage glitch and the
  spec says these are pre-run knobs. Settings packets received while
  the latch is on are dropped.
- We don't expose Tim A CMP1 (always `prd/2`) or MCMP1 (always 48) —
  those are structural and the design doc fixes them.
- We retain the per-period 50 kHz baseline by leaving the defaults
  identical to the master branch: same PI gains, 50 kHz, 247 ns
  dead time, MCMP3-aware ADC2 trigger at switch midpoint, fixed
  13/16 ADC1 trigger.

## 2026-05-20

- Decoupled HostUI protocol/data handling from UI/rendering:
  - Added `HostUI/protocol.js` as a plain non-module browser script that exports `window.HvccpsProtocol`.
  - Moved protocol constants, checksum helpers, little-endian binary read/write helpers, command/settings frame builders, heartbeat frame parsing, heartbeat stream resynchronization, default settings cloning, and settings validation/derived timing calculations into `protocol.js`.
  - Kept `HostUI/app.js` focused on DOM binding, status/telemetry rendering, Chart.js setup, signal selection UI, layout persistence, toast/messages, WebSerial port lifecycle, and calling protocol helpers.
  - Replaced the UI-owned `rxBuffer` with a protocol-owned `createHeartbeatDecoder()` instance; connect/disconnect now reset the decoder instead of directly clearing byte buffers.
  - `parseHeartbeat()` in `app.js` now delegates binary parsing to `parseHeartbeatFrame()` and only handles UI-facing side effects such as packet rate counting, settings apply confirmation, and telemetry refresh.
  - Kept the page load model as non-module scripts by loading `protocol.js` before `app.js` in `HostUI/index.html`.
- Tightened the boundary after the split:
  - `app.js` has its own small UI clamp helper for layout sizing instead of importing a protocol-level clamp.
  - Protocol internals keep their clamp helper private to frame construction.
- Updated `Design.md` minimally to record the new HostUI JS split.
- Verification:
  - Ran `node --check HostUI\protocol.js`; syntax check passed.
  - Ran `node --check HostUI\app.js`; syntax check passed.
  - Ran `git diff --check` for the HostUI files; no whitespace errors.
  - Firmware was not changed, so Keil firmware compilation was not run.

## 2026-05-19

- Fixed the host UI settings-apply confirmation display:
  - `HostUI/app.js` already parsed `settings_ok` from heartbeat `status_flags & 0x08` and cleared `pendingSettings` when the device confirmed the settings.
  - The settings panel banner was not updated on that success path, so it could remain stuck at `Sent. Waiting for SETTINGS OK ...` even after the device had applied the new settings.
  - Added success and timeout/reject banner updates in `parseHeartbeat()` so the settings panel now changes to an applied message after `settings_ok` is observed, or to an error message after timeout.
- Checked the firmware/host protocol path for this issue:
  - Firmware accepts settings frames with header `0x5A`, length `65`, checksum/xor validation, then runs `apply_settings()` and sets `app.settings_ok = 1`.
  - Firmware reports that state in heartbeat `status_flags` bit3.
  - Host parses bit3 as `latest.settingsOk`, so the protocol bit itself is consistent.
- Updated `Design.md` minimally so `status_flags` matches the implemented heartbeat protocol:
  - bit3 is `settings_ok`
  - bit4 is `fixed_duty_active`
  - bit5-7 remain reserved

## 2026-05-19

- Reworked the HostUI layout for bench operation:
  - Replaced the long single-column workflow with a two-dock workbench layout.
  - Left control dock contains serial connection, run controls, and pre-run settings.
  - Right monitor dock keeps the telemetry plot visible above the status metrics, so users do not need to scroll down after enabling output.
  - Run options and settings groups now use collapsible `<details>` panels for duration, start mode, PI gains, switching, ADC1, and ADC2.
- Added bottom-right toast notifications:
  - `setMessage()` still updates the inline message line for state history.
  - Every operational message now also creates a timed toast in the bottom-right corner.
  - Error toasts stay visible longer and use the existing red warning styling.
- Improved plot smoothness:
  - Removed the old 80 ms `setInterval(refreshChart)` chart update loop.
  - Added a `requestAnimationFrame` chart loop capped at about 60 fps, while keeping telemetry samples at 20 ms.
  - Enlarged the chart viewport with responsive height constraints.
- Removed duplicated chart value chips:
  - Deleted the `chartSelectionChips` DOM area from `index.html`.
  - Removed `renderChartSelectionChips()` and `chartChipValues` updates from `app.js`.
  - The signal picker remains available, while live values stay in the main status metric cards.
- Updated `Design.md` with a minimal Host UI layout note so the document matches the new workbench/toast behavior.

## 2026-05-19

- Refined HostUI interaction model after bench-use review:
  - Converted desktop layout into a fixed-height workbench instead of a long page.
  - Left control area and right monitor area now scroll independently with `overscroll-behavior: contain`, so scrolling at the bottom of the left control area no longer drives the right/page scroll.
  - Added a three-tab control dock (`Link`, `Run`, `Settings`) to reduce vertical stacking and make the main actions faster to reach.
  - Changed the plot signal selector into an absolute popover on desktop, so opening signal selection does not push the plot down.
  - Kept responsive fallback for narrow screens as normal page scrolling.
- Disabled accidental numeric input stepping:
  - Added keydown handling to prevent `ArrowUp` / `ArrowDown` from changing any `input[type="number"]`.
  - Added wheel handling with `passive: false` to prevent mouse wheel changes on numeric fields.
- Updated `Design.md` with the minimal note that desktop HostUI uses independent scrolling, control tabs, and numeric-input step blocking.

## 2026-05-19

- Reworked the HostUI layout to make the waveform area the primary workspace:
  - Replaced the fixed minimum left-column layout with a remembered, draggable control dock width.
  - Added a vertical resize handle between the control dock and monitor dock; dragging changes the left control width and immediately resizes the chart.
  - Added keyboard support on the resize handle: left/right arrows step the width, Home/End snap to min/max, and double click restores the default width.
  - Added a collapse/expand button for the control dock so the plot can use nearly the full window when tuning or inspecting long waveforms.
- Replaced the plot signal picker popover:
  - Removed the absolute top-right signal picker that could cover parameters and the chart.
  - Added a non-overlapping right-side signal drawer inside the chart workspace.
  - Added a `Signals` toolbar button with selected-count feedback and a close button inside the drawer.
  - Added a signal search field that filters by group, key, label, and axis text.
  - Added a selected-signal strip above the chart; clicking a signal chip removes it from the plot.
- Refined responsive behavior and styling:
  - Kept narrow screens as normal single-column scrolling with the control dock visible even if a desktop collapse state was saved.
  - Tightened settings grids with `auto-fit` so the left dock remains usable at smaller widths.
  - Updated the dark industrial palette and hover/focus affordances without changing protocol behavior.
- Verification:
  - Ran `node --check HostUI\app.js`; syntax check passed.
  - Firmware was not changed, so Keil firmware compilation was not run.

## 2026-05-27：修复 ADC2 IPRI_AC / IPRI_DC rank 互换错误

- **问题**：下位机 `app_core.c` 中 `APP_ADC2_RANK_IPRI_DC` 和 `APP_ADC2_RANK_IPRI_AC` 的 rank 常量互换了（DC 写了 0、AC 写了 2），与 CubeMX 硬件配置不一致。实际 `adc.c` 中 ADC2 的 rank 顺序为：rank 0 = IPRI_AC（PA1/CH2）、rank 1 = ISEC（PA6/CH3）、rank 2 = IPRI_DC（PA0/CH1）。这导致心跳包 `build_heartbeat()` 去交织 DMA 缓冲区时 IPRI_AC 和 IPRI_DC 数据互换。
- 上位机 `app.js` 的 `CYCLE_SIGNALS` 中 IPRI_AC 和 IPRI_DC 的 rank/sampleDelayNs/positions 也相应互换了（AC 标记为 rank 2、DC 标记为 rank 0），导致逐周期波形图中 X 轴时间偏移各差了约 518 ns。
- **修复**：
  1. `app_core.c`：`APP_ADC2_RANK_IPRI_AC` 改为 0U，`APP_ADC2_RANK_IPRI_DC` 改为 2U（ISEC 保持 1U 不变）。
  2. `app.js`：`CYCLE_SIGNALS` 中交换 ipriAc 和 ipriDc 两个对象的位置，使 ipriAc 对应 ADC2 rank 0（~29 ns）、ipriDc 对应 ADC2 rank 2（~547 ns）。
- 修复后的正确时序：
  | 信号 | ADC Bank | Rank | 采样偏移 |
  |------|----------|------|---------|
  | VSEC | ADC1 | 0 | ~29 ns |
  | IPRI_AC | ADC2 | 0 | ~29 ns |
  | ISEC | ADC2 | 1 | ~288 ns |
  | VPRI | ADC1 | 1 | ~382 ns |
  | IPRI_DC | ADC2 | 2 | ~547 ns |
- 上位机语法检查通过。

## 2026-05-22

- Fixed HRTIM timing visualization hover layering and tick-reference behavior:
  - Moved `#vizTooltip` to the document body at startup and raised its z-index above the click-to-edit popover, so the hover summary remains visible when a settings popover is open.
  - Kept the top timing row and cycle separator axis fixed to the Master timer frame.
  - Removed the old clickable tick-reference label behavior from the Master timer row.
  - Added Tab / Shift+Tab handling while a hover summary is visible to cycle only the hover summary's local tick reference between Master, TIM A, and TIM B.
  - Preserved normal Tab focus movement while editing inputs/selects/textareas or working inside the settings popover.
  - Removed absolute cycle labels from hover summaries, so users see local tick ranges only instead of values such as `cyc -2`, `cyc 0`, or large panned cycle indices.
- Updated `Design.md` minimally to record that the visualization top timeline remains Master timer while hover summaries have their own Tab-cycled local tick reference.
- Verification:
  - Ran `node --check HostUI\HRTIM_visualization\viz.js`; syntax check passed.
  - Ran `git diff --check -- HostUI\HRTIM_visualization\viz.js HostUI\HRTIM_visualization\viz.css`; no whitespace errors.
  - Firmware was not changed, so Keil firmware compilation was not run.

## 2026-05-19

- Fixed two HostUI signal-selection usability issues:
  - Changed the signal picker from a chart-layout side panel to a fixed floating drawer, so it stays above the chart and remains clickable instead of being pushed below the waveform area.
  - Kept the drawer full-height on narrow screens with viewport insets, so saved layout width/collapse states cannot make the picker unreachable.
  - Changed selected signal chips from click-to-remove buttons into read-only labels with a small explicit `x` remove button.
  - The chip body no longer removes a signal, reducing accidental removals while inspecting the plot.
- Verification:
  - Ran `node --check HostUI\app.js`; syntax check passed.
  - Firmware was not changed, so Keil firmware compilation was not run.
## 2026-06-02：加入 TIM7 自动变频调度与 duty 前馈

- 在下位机 `app_core.c` 中加入自动变频策略：
  - TIM7 以 10 ms 周期运行低优先级频率监督逻辑，只计算待执行计划，不直接写 HRTIM。
  - HRTIM master ISR 在开关周期边界消费 pending 变频计划，执行寄存器写入与前馈 duty 生效。
  - TIM7 预先计算：
    - 新频率 `freq_hz`
    - master / Tim A / Tim B 周期 `prd`
    - Tim C 24x ADC 链周期
    - Tim D 10x ADC5 链周期
    - Tim E 16x ADC3/4 链周期
    - 实际频率 `actual_freq_hz`
    - `phase_max_raw`
    - `phase_span_f`
    - `inv_span_f`
    - 前馈 `feedforward_duty`
    - 前馈 `feedforward_mcmp3_raw`
  - HRTIM ISR 消费计划时只写这些已算好的值，不在高速 ISR 中调用 `sinf` / `asinf` / `powf` 或重新计算周期寄存器。

- 变频控制策略：
  - duty 以 TIM7 10 ms tick 做一阶滤波，滤波系数 `0.25`。
  - 降频触发区：`duty > 95%`，`duty > 98%` 和 `duty > 99.5%` 时加速计分。
  - 升频触发区：`duty < f(kHz) + 25`。
  - 升频停止/回滞线：`duty > (6/7) * f(kHz) + 36.43`。
  - 使用 score 计分触发，不用单点瞬时判定；回到带内时 score 快速衰减。
  - 变频后、目标值变化后、刚使能后分别设置锁定窗口，避免连续抖动：
    - 变频后 100 ms
    - 目标变化后 100 ms
    - 刚使能后 200 ms
  - 步进为自适应 1–4 kHz，默认约为当前频率 6%；严重饱和降频允许更快下探。

- duty 前馈：
  - 使用基于测试数据拟合的连续模型：
    - `s = sin(pi * duty / 2)`
    - `s_new = s * (f_new / f_old)^0.924`
    - `duty_ff = asin(clamp(s_new, 0..1)) * 2/pi`
  - TIM7 计算前馈 duty 和对应 MCMP3 raw。
  - HRTIM ISR 执行变频时同步当前胜出 PI 环积分：
    - `integral = duty_ff - kp * error`
    - clamp 到 `[0, 1]`
  - 这样变频后 PI 输出从前馈 duty 附近继续闭环修正，减少频率切换瞬间的功率抖动。

- 状态管理：
  - 输出关闭、固定占空比、OCP 锁存、频率越界时自动变频监督复位并清 pending plan。
  - `apply_settings()`、目标值变化、disable、run duration 到期和 enable 均重置变频监督状态。
  - TIM7 已在 `APP_Init()` 中通过 `HAL_TIM_Base_Start_IT(&htim7)` 启动。
  - `APP_TIM7_FrequencyControlISR()` 加入 `app_core.h`，由通用 `HAL_TIM_PeriodElapsedCallback()` 分派 TIM7 进入。

- 文档：
  - README 当前版本说明已补充 TIM7 自动变频、阈值、前馈模型、步进和锁定窗口。

- 验证：
  - 使用 Keil 命令编译下位机：
    - `& 'D:\apps\keil_v5\uv4\uVision.com' -b G474_HVCCPS.uvprojx -j0 -o build.log`
  - 编译结果：0 Error(s), 0 Warning(s)。

## 2026-06-13 上位机：新增「当前输出功率」OUTPUT POWER 指标卡片

背景：
- `AppHostUI` 的 Power Status 区只有 `CP TARGET`（恒功率设定值）和 `Eff`（效率）两个功率类指标，缺少一个直接显示**当前实际输出功率**的读数。运行时想确认真实输出功率（尤其是 CP 模式下设定值与实测的对照）只能口算 VSEC×ISEC。

改动（纯上位机派生量，不动协议 / 下位机）：
- `AppHostUI/app.js` 新增 `outputPowerMw(latest)` 辅助函数：`vSecMv[mV] × iSecMa[mA] / 1000 → mW`（mV×mA=µW，除 1000 得 mW）。直接复用心跳帧已有的 `vSecMv`（副边输出电压）与 `iSecMa`（副边输出电流）字段，无需改动 `protocol.js` 或下位机帧格式。
- `TELEMETRY_METRICS` 新增一条（Power 分组）：
  - `key: "outputPowerW"`，`label: "OUTPUT POWER"`，`color: "#d97706"`（与 `CP TARGET` 的 `#ea580c`、`Eff` 的 `#b91c1c` 区分），`axisLabel: "OUTPUT POWER / W"`。
  - `read: (l) => outputPowerMw(l) / 1000`（图表 Y 轴用 W，与 CP TARGET 同量纲）。
  - `format: (l) => formatPowerMw(outputPowerMw(l))`（< 1000 mW 显示 mW，否则自动换算到 W）。
  - 排在 `cpTargetW` 之后、`efficiencyPct` 之前，使「设定功率」与「实测功率」相邻。
- `KEY_METRIC_KEYS` 追加 `"outputPowerW"`，使其作为关键指标卡片显示在 Power Status header（紧随 CP TARGET），而非次级 reading 行。
- 系统为数据驱动：`createSeriesStore()` / 图表信号选择器 / `renderTelemetryCards()` / `updateTelemetryUi()` 均遍历 `TELEMETRY_METRICS`，新增项自动获得历史曲线、可被选入实时图、并随每帧刷新。`#readingsKey` 为 2 列自动流式网格，第 9 张卡片自然换行，无需改 CSS。

文档：
- README 右侧布局说明补充：关键指标卡片含由 VSEC×ISEC 实时计算的 OUTPUT POWER。

验证：
- `node --check AppHostUI/app.js` 通过（SYNTAX OK）。

## 2026-06-21 release：收紧公开固件输出与保护限制

背景：
- 准备发布面向开源仓库的 V0.0.1 固件 HEX。固件源码暂不公开，公开固件需要限制得更保守，避免误设置过高输出或保护阈值。

固件限制：
- `App/Core/Src/app_core.c`
  - `APP_MAX_CV_MV` 从 `3000000` 收紧为 `2200000`，运行命令 CV 上限为 2200 V。
  - `APP_MAX_CC_MA` 从 `250` 收紧为 `200`，运行命令 CC 上限为 200 mA。
  - `APP_MAX_CP_MW` 从 `500000` 收紧为 `400000`，运行命令 CP 上限为 400 W。
  - 硬件 OCP 比较器阈值 `APP_OCP_TRIP_A` 从 75 A 收紧为 60 A；对应 DAC 阈值从约 2812 mV 变为约 2250 mV。
  - 软件 OTP 阈值 `APP_OTP_TRIP_MC` 从 75000 m°C 收紧为 70000 m°C。
- `App/Core/Src/config_manager.c`
  - 前面板 KEY_A / KEY_B 预设限制同步为 2200 V / 200 mA / 400 W，防止离线上电预设绕过运行命令上限。

上位机：
- `AppHostUI/protocol.js`
  - `MAX_CV_V` / `MAX_CC_MA` / `MAX_CP_W` 同步为 2200 / 200 / 400。
- `AppHostUI/index.html`
  - RUN 面板和前面板预设抽屉的 number input `max` 同步为 2200 V / 200 mA / 400 W。

文档：
- README 当前版本描述同步为 2200 V / 200 mA / 400 W、OCP 60 A、OTP 70 °C。
- README 顶部和 Bootloader 小节移除本地 Keil 编译命令，改为描述发布 HEX 的 ST-Link / WebSerial IAP 烧录方式。

验证：
- 上位机基础语法校验通过：
  - `node --check AppHostUI/app.js`
  - `node --check AppHostUI/protocol.js`
  - `node --check AppHostUI/history.js`
  - `node --check BootLoaderHostUI/app.js`
- Keil 编译 App：
  - 工程：`App/MDK-ARM/G474_HVCCPS.uvprojx`
  - 结果：0 Error(s), 0 Warning(s)
  - HEX：`App/MDK-ARM/G474_HVCCPS/G474_HVCCPS.hex`
- Keil 编译 Bootloader：
  - 工程：`BootLoader/MDK-ARM/G474_BL.uvprojx`
  - 结果：0 Error(s), 0 Warning(s)
  - HEX：`BootLoader/MDK-ARM/G474_BL/G474_BL.hex`
- 发布资产已复制：
  - `release_assets/HVCCPS_App_V0.0.1.hex`
  - `release_assets/HVCCPS_Bootloader_V0.0.1.hex`

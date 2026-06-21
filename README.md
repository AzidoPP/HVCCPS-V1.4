# HVCCPS V1.4

## English

HVCCPS is a STM32G474CBT6-based digitally controlled PSFB high-voltage DC-DC power supply. It is designed for capacitor charging and laboratory high-voltage experiments. The rated input is 18-28 V, with 24 V recommended. The public firmware limits the output to 0-2200 V, 200 mA, and 400 W. Communication uses USART3 and browser-based WebSerial host tools.

High-voltage power supplies can cause electric shock, stored-energy discharge, component failure, and fire. Use proper isolation, grounding, discharge paths, current limiting, and emergency shutdown hardware.

### Repository Contents

| Path | Description |
|------|-------------|
| `AppHostUI/` | Browser WebSerial host UI for power control and telemetry |
| `BootLoaderHostUI/` | Browser WebSerial IAP flashing UI for App firmware |
| `Docs/` | STM32G4, HRTIM, and device reference documents |
| `Test_Data/` | Test data, analysis scripts, and plots |
| `log.md` | Detailed change log |

Firmware is published as Bootloader HEX and App HEX files in GitHub Releases. The Bootloader and App use the same STM32G474CBT6 target, 8 MHz HSE to 170 MHz system clock, USART3 PB10/PB11 at 115200 8N1, and the same panel LEDs and keys.

### Public Firmware Limits

| Item | Limit |
|------|-------|
| CV target | 0-2200 V |
| CC target | 0-200 mA |
| CP target | 0-400 W |
| Hardware OCP | Primary-side SW-node AC current, approx. 60 A |
| Software OTP | MOS NTC or internal MCU temperature above 70 °C |

The host UI input ranges, panel-key preset ranges, and firmware command validation ranges are aligned.

### Flashing

#### ST-Link

Use an ST-Link tool to flash the two HEX files from GitHub Releases.

| Firmware | Address |
|----------|---------|
| Bootloader HEX | Starts at `0x08000000` |
| App HEX | Starts at `0x08004000` |

#### WebSerial IAP

Flash the Bootloader HEX with ST-Link first. Then open `BootLoaderHostUI/index.html`, select the App HEX, connect the serial port, click flash, and press the hardware RST key. The page waits for the Bootloader to enter IAP and then runs the BEGIN -> REQUEST/DATA -> STATUS flow.

### Host UIs

`AppHostUI/index.html` provides run control, CC/CV/CP target settings, fixed-duty debug mode, key telemetry cards, live plots, and configuration panels. A browser with WebSerial support is required. Serial parameters are 115200 8N1.

`BootLoaderHostUI/index.html` supports Intel HEX parsing, address-range checks, serial handshake, block transfer, progress display, and error logs.

### Flash Layout

| Region | Address | Size |
|--------|---------|------|
| Bootloader | `0x08000000`-`0x080037FF` | 14 KB |
| Bootloader metadata page | `0x08003800`-`0x08003FFF` | 2 KB |
| App | `0x08004000`-`0x0801F7FF` | 110 KB |
| App configuration page | `0x0801F800`-`0x0801FFFF` | 2 KB |

### License

This repository is licensed under GPL-3.0. See `LICENSE`.

## 中文

HVCCPS 是一款基于 STM32G474CBT6 的 PSFB 移相全桥数控高压 DC-DC 电源，可用于电容充电和高压实验。额定输入 18-28 V，推荐 24 V。公开固件限制输出为 0-2200 V、200 mA、400 W。设备通过 USART3 通信，上位机为基于 WebSerial 的浏览器页面。

高压电源具有触电、储能电容放电、器件击穿和火灾风险。使用前请确认隔离、接地、放电、电流限制和外部急停措施齐备。

### 仓库内容

| 路径 | 内容 |
|------|------|
| `AppHostUI/` | 用于电源控制与遥测的浏览器 WebSerial 上位机 |
| `BootLoaderHostUI/` | 用于 App 固件 IAP 烧录的浏览器 WebSerial 上位机 |
| `Docs/` | STM32G4、HRTIM 与器件资料 |
| `Test_Data/` | 测试数据、分析脚本与图表 |
| `log.md` | 详细修改记录 |

固件以 Bootloader HEX 与 App HEX 文件发布在 GitHub Releases 中。Bootloader 与 App 使用同一颗 STM32G474CBT6、8 MHz HSE 至 170 MHz 主频、USART3 PB10/PB11 115200 8N1，以及同一组面板 LED 和按键。

### 公开固件限制

| 项目 | 限制 |
|------|------|
| CV 目标 | 0-2200 V |
| CC 目标 | 0-200 mA |
| CP 目标 | 0-400 W |
| 硬件过流保护 | 原边 SW 节点交流电流约 60 A |
| 软件过温保护 | MOS NTC 或 MCU 内部温度超过 70 °C |

上位机输入范围、前面板按键预设范围和固件命令校验范围保持一致。

### 烧录方式

#### ST-Link

使用 ST-Link 工具分别烧录 GitHub Releases 中的两个 HEX 文件。

| 固件 | 地址 |
|------|------|
| Bootloader HEX | 从 `0x08000000` 起始 |
| App HEX | 从 `0x08004000` 起始 |

#### WebSerial IAP

先使用 ST-Link 烧录 Bootloader HEX。之后打开 `BootLoaderHostUI/index.html`，选择 App HEX，连接串口后点击烧录并按硬件 RST。页面会等待 Bootloader 进入 IAP，然后执行 BEGIN -> REQUEST/DATA -> STATUS 流程。

### 上位机

`AppHostUI/index.html` 提供运行控制、CC/CV/CP 目标设置、固定占空比调试、关键遥测卡片、实时曲线和配置面板。浏览器需要支持 WebSerial，串口参数为 115200 8N1。

`BootLoaderHostUI/index.html` 支持 Intel HEX 解析、地址范围校验、串口握手、分块发送、进度显示和错误日志。

### Flash 布局

| 区域 | 地址 | 大小 |
|------|------|------|
| Bootloader | `0x08000000`-`0x080037FF` | 14 KB |
| Bootloader 元数据页 | `0x08003800`-`0x08003FFF` | 2 KB |
| App | `0x08004000`-`0x0801F7FF` | 110 KB |
| App 配置页 | `0x0801F800`-`0x0801FFFF` | 2 KB |

### 许可证

本仓库使用 GPL-3.0 许可证，详见 `LICENSE`。

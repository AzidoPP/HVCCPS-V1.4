# HVCCPS V1.4

基于 STM32G474CBT6 的 PSFB 移相全桥数控 D2D 升压电源。额定输入 18-28 V（推荐 24 V），输出 0-2200 V 连续可调，副边额定电流 200 mA，公开固件功率上限 400 W。设备通过 USART3 与电脑通信，上位机使用 WebSerial 纯前端页面。

高压电源具有触电、储能电容放电、器件击穿和火灾风险。使用前请确认隔离、接地、放电、电流限制和外部急停措施齐备。

## 仓库内容

| 路径 | 内容 |
|------|------|
| `AppHostUI/` | 电源运行控制与遥测上位机，浏览器直接打开 `index.html` 使用 |
| `BootLoaderHostUI/` | App 固件 IAP 烧录上位机，浏览器直接打开 `index.html` 使用 |
| `Docs/` | STM32G4、HRTIM 与器件资料 |
| `Test_Data/` | 测试数据、分析脚本与图表 |
| `log.md` | 详细修改记录 |

固件以 Bootloader HEX 与 App HEX 发布在 GitHub Releases 中。Bootloader 和 App 使用同一颗 STM32G474CBT6、8 MHz HSE 到 170 MHz 主频、USART3（PB10/PB11，115200 8N1）与同一组面板 LED / 按键。

## 公开固件限制

| 项目 | 限制 |
|------|------|
| CV 目标 | 0-2200 V |
| CC 目标 | 0-200 mA |
| CP 目标 | 0-400 W |
| 硬件 OCP | 原边 SW 节点交流电流约 60 A |
| 软件 OTP | MOS NTC 或 MCU 内部温度超过 70 °C |

上位机输入范围、前面板按键预设范围和固件命令校验范围保持一致。

## 烧录方式

### ST-Link

使用 ST-Link 工具分别烧录 GitHub Releases 中的两个 HEX 文件：

| 固件 | 地址范围 |
|------|------|
| Bootloader HEX | `0x08000000` 起始 |
| App HEX | `0x08004000` 起始 |

### WebSerial IAP

先使用 ST-Link 烧录 Bootloader HEX。之后打开 `BootLoaderHostUI/index.html`，选择 App HEX，连接串口后点击烧录并按硬件 RST。页面会等待 Bootloader 进入 IAP，然后执行 BEGIN -> REQUEST/DATA -> STATUS 流程。

## 上位机

`AppHostUI/index.html` 提供运行控制、CC/CV/CP 目标设置、固定占空比调试、关键遥测卡片、实时曲线和配置面板。浏览器需要支持 WebSerial，串口参数为 115200 8N1。

`BootLoaderHostUI/index.html` 支持 Intel HEX 解析、地址范围校验、串口握手、分块发送、进度显示和错误日志。

## Flash 布局

| 区域 | 地址 | 大小 |
|------|------|------|
| Bootloader | `0x08000000`-`0x080037FF` | 14 KB |
| Bootloader 元数据页 | `0x08003800`-`0x08003FFF` | 2 KB |
| App | `0x08004000`-`0x0801F7FF` | 110 KB |
| App 配置页 | `0x0801F800`-`0x0801FFFF` | 2 KB |

## 许可证

本仓库使用 GPL-3.0 许可证，详见 `LICENSE`。

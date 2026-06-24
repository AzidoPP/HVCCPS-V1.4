# HVCCPS V1.4

> [!IMPORTANT]
> 本文是发布在科创网的项目镜像，内容更新可能不及时。建议前往 [GitHub 项目主页](https://github.com/AzidoPP/HVCCPS-V1.4) 查看最新文档、文件和版本信息。

📺 **项目说明视频：** [在哔哩哔哩观看](https://www.bilibili.com/video/BV1GMjm6cExY)

**QQ交流群：582594264**

> [!CAUTION]
> 本项目涉及致命高压。设备断电后，输出端及电容仍可能储存大量能量。调试和使用前，请确保绝缘保护措施齐备；请勿在缺乏高压操作经验或无人监护的情况下使用。

![HVCCPS V1.4 封面](https://image.lceda.cn/oshwhub/pullImage/c596c4f2c02e48db8a4622354f19884a.png)

## 1. 项目简介

### 1.1 项目概述

HVCCPS V1.4 是一款基于 **STM32G474CBT6** 的数控高压 DC-DC 电源，功率级采用 **PSFB（Phase-Shifted Full Bridge，移相全桥）** 拓扑。它可用于高压电容充电及实验室高压供电，公开版固件支持 **CV（恒压）、CC（恒流）和 CP（恒功率）** 控制。

在推荐工作条件下，电源输入为 18–28 V DC，公开固件输出限制为 **0–2200 V、0–200 mA、0–400 W**。项目功率密度约为 **40 W/in³**。

PCB 使用 EasyEDA（立创 EDA 专业版）设计，仓库提供完整的 [EasyEDA 工程文件](PCB/ProPrj_HVCCPS_V1.4_Release.epro2)、[Gerber 制板文件](PCB/Gerber_HVCCPS_V1.4.zip)和 [BOM](Docs/BOM.xlsx)，便于复刻与二次开发。

### 1.2 固件与许可证说明

为预防闭源商用或闭源抄袭，公开仓库目前仅提供编译后的固件，固件源码不直接放在公开分支中。如需源码，请加入 **QQ 群 582594264**，或发送邮件至 **Lanyyontop@gmail.com** 后**免费**获取。

本仓库公开内容采用 [GPL-3.0](LICENSE) 许可证。获取、修改或再分发源码及衍生作品时，请遵守许可证条款。

## 2. 技术参数

### 2.1 电气参数

以下参数适用于默认 **1:100** 变压器及公开发布版固件。

| 参数 | 最小值 | 典型值 | 最大值 | 单位 | 说明 |
|---|---:|---:|---:|:---:|---|
| 输入电压（DC） | 18 | 24 | 28 | V | 额定输入电压 |
| 输入电流（DC） | — | — | 20 | A | 额定输入电流 |
| 输出电压（DC） | 0 | 可调 | 2200 | V | — |
| 输出电流（DC） | 0 | 可调 | 200 | mA | — |
| 输出功率（DC） | 0 | 可调 | 400 | W | — |
| 开关频率 | 11 | 35 | 45 | kHz | 默认自动变频，35 kHz 为基准频率 |
| 栅极驱动死区 | — | 200 | — | ns | — |
| 变换效率 | — | — | 96 | % | 实测峰值；见[效率测试数据](Test_Data/效率测试.txt) |
| 输出电压步进 | — | 1 | — | V | — |
| 输出电流步进 | — | 1 | — | mA | — |
| 输出电压精度 | — | — | ±0.5 | % | — |
| 输出电流精度 | — | — | ±1 | % | — |
| 功率密度 | — | 40 | — | W/in³ | 按整机有效体积计算 |
| 整机重量 | — | 292 | — | g | — |

> [!NOTE]
> 表中的 28 V 是推荐工作范围上限，母线电容耐压为 35 V，切勿超过 35 V。

### 2.2 控制与保护参数

| 项目 | 参数 | 说明 |
|---|---|---|
| 控制模式 | CV / CC / CP | 三环 PI 自动仲裁 |
| 固定占空比模式 | 0–100% | 仅用于调试，仍受软启动约束 |
| 软启动 | 每个控制周期最多增加 10% 占空比 | 默认值，可通过上位机配置管理器调整 |
| 运行定时 | 连续或 1–65534 s | 到时自动关闭输出 |
| 硬件过流保护（OCP） | 原边 SW 节点交流峰值约 60 A | COMP1 → HRTIM FAULT4 异步关断；**不是 60 A 输入额定值** |
| 软件过温保护（OTP） | 70 °C | MOS NTC 或 MCU 内部温度任一路超过阈值即关断 |
| 独立看门狗（IWDG） | 约 200 ms | 主循环或控制 ISR 异常时触发复位 |
| 按键 | A / B 两组预设 | 可保存 CV、CC、CP 和运行时间，支持脱机运行及停机 |

OCP 和 OTP 触发后均会锁存停机状态。再次启动时固件会清除锁存；如果故障条件仍然存在，保护会立即再次触发。

### 2.3 控制器与通信参数

| 项目 | 参数 |
|---|---|
| MCU | STM32G474CBT6 |
| 外部晶振 | 8 MHz HSE |
| 系统主频 | 170 MHz |
| 通信接口 | USART3，PB10（TX）/ PB11（RX） |
| 串口格式 | 115200 baud，8N1 |
| 上位机接口 | WebSerial |
| 输入连接器 | XT30 |
| 高压输出连接器 | M3 |

### 2.4 高压侧设计说明

高压副边的 PCB 电气间隙均 **≥ 9.5 mm**，相关电路按 7000 V 耐压目标进行布局设计。这里的 7000 V 是高压侧的设计目标，**不代表整机额定输出为 7000 V**；默认版本变压器、器件选型、反馈比例和公开固件的额定输出仍以 2200 V 为准。

如需更高输出电压，必须重新核算并验证变压器匝比、整流二极管、输出电容和反馈网络，同时修改固件参数。本 PCB 布局的设计安全上限为 7000 V；如需改版，切勿超过 7000 V。

## 3. 硬件架构

### 3.1 PCB 布局

PCB 采用 **4 层、1.6 mm 板厚、1 oz 铜厚**设计，常用阻容器件全部采用 0805 封装，便于焊接。顶层主要布置主功率变压器，底层主要布置驱动、控制和采样电路。

| 顶层 | 底层 |
|---|---|
| ![PCB 顶层](https://image.lceda.cn/oshwhub/pullImage/2c29796dbac541de83bec83f04e137e6.png) | ![PCB 底层](https://image.lceda.cn/oshwhub/pullImage/46c3b7af1b924aa08cf7887466256f91.png) |

### 3.2 电源架构

功率级采用 PSFB 移相全桥拓扑，通过改变两组桥臂之间的相移调节传输功率。

![电源架构](https://image.lceda.cn/oshwhub/pullImage/b349107d51914c9f8f0f85b3dfc7d57b.png)

### 3.3 硬件架构

控制器负责电压、电流、温度和辅助电源采样，并通过 HRTIM 产生带固定死区的四路全桥驱动信号。独立比较器和 HRTIM Fault 通路用于硬件过流关断。

![硬件架构](https://image.lceda.cn/oshwhub/pullImage/86baa95a7f284a8e82966bb8c7454091.png)

## 4. 制作与装配

### 4.1 制板

使用仓库中的 [Gerber 制板文件](PCB/Gerber_HVCCPS_V1.4.zip)下单，推荐参数如下：

- 层数：4 层
- 板厚：1.6 mm
- 铜厚：1 oz

### 4.2 变压器

![变压器打样参数](https://image.lceda.cn/oshwhub/pullImage/55bef8b8b71141f8857a10ec88f47625.jpg)

| 项目 | 参数 |
|---|---|
| 磁芯 | EC49，40 材 |
| 匝数 | 初级 9 匝，次级 900 匝 |
| 匝数比 | 1:100 |
| 初级绕组引脚 | 2–3 |
| 次级绕组引脚 | 5–8 |
| 次级线径 | 0.3 mm |
| 气隙 | 不需要 |
| 其他要求 | 尽量减小漏感，完成后灌胶密封 |

初级绕组应尽量选用较粗导线，载流能力需 **≥ 30 A**。灌胶前裁掉 1、4、6、7 脚及中间两个多余引脚；绕线方向正反均可。

当前项目的变压器是在淘宝店铺“[祥润电子磁芯骨架](https://shop339657327.taobao.com)”定做打样的。

> [!NOTE]
> 变压器打样后漏感应小于10uH，励磁电感应大于300uH。

### 4.3 BOM 与关键器件

完整物料清单见 [Docs/BOM.xlsx](Docs/BOM.xlsx)。以下器件在采购时需要特别留意：

| 位号 | 器件/建议 | 注意事项 |
|---|---|---|
| L1 | [参考链接](https://item.taobao.com/item.htm?id=524929973196) | — |
| R8 | 10 kΩ NTC，B = 3450 K（[参考链接](https://detail.tmall.com/item.htm?id=610279139920)） | — |
| Q1–Q4 | CSD18540 或 CSD19531 | 注意管子来源 |
| R24–R28 | Viking（光颉）高压电阻，2 MΩ、2512、3000 V（[参考链接](https://item.taobao.com/item.htm?id=987002402599)） | — |
| U7、U8 | UCC27211；可替换为 SLM27211 | 市面上 UCC27211 假货较多，SLM27211 可 Pin-to-Pin 替换 |
| U9 | EE8.3 1:200电流互感器（[参考链接](https://item.taobao.com/item.htm?id=721406076659)） | — |

其余元器件请按照 BOM 采购。

### 4.4 焊接与检查

推荐使用锡膏和加热台或回流焊完成贴片焊接。这里就不过多赘述了，相信复刻本项目的同学都是焊接老手了。

![制作完成（正面）](https://image.lceda.cn/oshwhub/pullImage/6640d359660946fb9f9c18479000e8ce.png)

![制作完成（背面）](https://image.lceda.cn/oshwhub/pullImage/a42465ba650147b5ba4522648195e70e.png)

### 4.5 输出电容

作为通用高压电源使用时，可外接 **4000 V、0.2 µF** 薄膜电容作为输出滤波电容（[购买链接](https://item.taobao.com/item.htm?id=814880889031)）；作为高压电容充电器使用时，可以不安装该电容。

连接电容的时候先在引脚上焊接端子，再使用螺丝固定到输出端。

![输出电容连接](https://image.lceda.cn/oshwhub/pullImage/fe16bb532e42410d98fdd04c98ca2bd2.png)

## 5. 固件烧录与 IAP 更新

### 5.1 固件组成

发布固件由两个 Intel HEX 文件组成，可从 [GitHub Releases](https://github.com/AzidoPP/HVCCPS-V1.4/releases) 下载：

| 固件 | 起始地址 | 作用 |
|---|---|---|
| [Bootloader HEX](https://github.com/AzidoPP/HVCCPS-V1.4/releases/download/v0.0.1/HVCCPS_Bootloader_V0.0.1.hex) | `0x08000000` | 启动检查及串口 IAP 更新 |
| [App HEX](https://github.com/AzidoPP/HVCCPS-V1.4/releases/download/v0.0.1/HVCCPS_App_V0.0.1.hex) | `0x08004000` | 电源控制、保护、遥测和上位机通信 |

### 5.2 烧录准备

准备以下设备：

- ST-Link V2
- USB 转 TTL 模块
- SH1.0 转 2.54 mm 转接板
- SH1.0 接口连接线

![烧录所需设备](https://image.lceda.cn/oshwhub/pullImage/6849ec03bda242669d860d72b38f338a.png)

在电脑中下载安装 [STM32 ST-LINK Utility](https://www.st.com/en/development-tools/stsw-link004.html)，并建议先[下载当前工程（ZIP）](https://github.com/AzidoPP/HVCCPS-V1.4/archive/refs/heads/main.zip)或使用[在线烧录器](https://azidopp.github.io/HVCCPS-V1.4/BootLoaderHostUI/)或[在线上位机](https://azidopp.github.io/HVCCPS-V1.4/AppHostUI/)。

**完整操作过程见：[固件烧录视频教程](https://github.com/AzidoPP/HVCCPS-V1.4/releases/download/videos-v1.4/HVCCPS-V1.4-Flashing-Tutorial.mp4)。**

### 5.3 烧录方法

板上通信接口依次为 `SWCLK`、`SWDIO`、`TX`、`RX`、`GND`、`3.3 V`、`SDA` 和 `SCL`。烧录分为以下两个阶段：

| 阶段 | 需要连接的引脚 | 连接设备 |
|---|---|---|
| 首次烧录 Bootloader | `SWCLK`、`SWDIO`、`GND`、`3.3 V` | ST-Link V2 |
| IAP 烧录 App | `TX`、`RX`、`GND`、`3.3 V` | USB 转 TTL 模块，TX/RX 交叉连接 |

> [!WARNING]
> 操作前必须断开高压输出负载。确保安全。

1. 将板卡的 `SWCLK`、`SWDIO`、`GND` 和 `3.3 V` 与 ST-Link V2 对应连接。
2. 打开 STM32 ST-LINK Utility，选择 Bootloader HEX 文件并执行烧录。

   ![使用 ST-LINK Utility 烧录 Bootloader](https://image.lceda.cn/oshwhub/pullImage/38f43fc627214e75aa7420e296def66e.png)

3. 烧录完成后复位板卡；若 `LED_A` 点亮，说明 Bootloader 已正常启动。
4. 断开 ST-Link，改用 USB 转 TTL 模块连接板卡的 `TX`、`RX`、`GND` 和 `3.3 V`，其中 TX 与 RX 需要交叉连接。
5. 推荐在已下载的工程中打开 [`BootLoaderHostUI/index.html`](BootLoaderHostUI/index.html)；也可以直接使用[在线 IAP 烧录页面](https://azidopp.github.io/HVCCPS-V1.4/BootLoaderHostUI/)。请使用最新版 Chrome 或 Edge。
6. 在页面中连接串口并选择 App HEX 文件，点击烧录后按下板卡的 **RST** 键。

   ![使用 IAP 页面烧录 App 固件](https://image.lceda.cn/oshwhub/pullImage/6512dad1e02b4845b77f222e0731e220.png)

7. 等待传输和校验完成。再次复位板卡后，若 `LED_A` 持续闪烁，说明 App 已成功启动。

## 6. 上位机

### 6.1 电源控制上位机

推荐下载工程后打开 [`AppHostUI/index.html`](AppHostUI/index.html) 离线使用；也可以直接打开[在线电源控制上位机](https://azidopp.github.io/HVCCPS-V1.4/AppHostUI/)。页面通过 WebSerial 提供以下功能：

首次使用建议先观看：[上位机连接与控制视频教程](https://github.com/AzidoPP/HVCCPS-V1.4/releases/download/videos-v1.4/HVCCPS-V1.4-Host-Control-Tutorial.mp4)。

- 启停控制及 CV、CC、CP 目标设置
- 固定占空比调试
- 电压、电流、功率、温度和保护状态遥测
- 实时曲线及单周期采样波形
- PI、开关频率、自动变频及软启动参数配置
- 前面板 A/B 按键预设管理

![hostui](https://image.lceda.cn/oshwhub/pullImage/41dbbd78c6a14702a8850ca1d7ec0439.png)

连接参数为 **115200 baud、8N1**。建议使用最新版 Chrome 或 Edge，并一次只打开一个占用该串口的页面。

### 6.2 Bootloader 上位机

本地页面 [`BootLoaderHostUI/index.html`](BootLoaderHostUI/index.html) 和[在线 IAP 烧录页面](https://azidopp.github.io/HVCCPS-V1.4/BootLoaderHostUI/)均支持 Intel HEX 解析、地址范围校验、串口握手、分块传输、进度显示和错误日志，仅用于更新 App 固件。

![iapui](https://image.lceda.cn/oshwhub/pullImage/f88bce7b1618450e84d71942d73f5c17.png)

## 7. 测试

本项目的教程及测试视频统一收录在 [HVCCPS V1.4 视频教程与测试 Release](https://github.com/AzidoPP/HVCCPS-V1.4/releases/tag/videos-v1.4) 中。

测试仪器：

- SDS804X 示波器
- VC980D 万用表

### 7.1 ZVS 零电压开通

实测主功率管能够实现 ZVS 零电压开通：开关节点电压先降至 0 V 附近，随后栅极驱动信号到来并使 MOSFET 导通。移相全桥利用变压器漏感续流实现软开关，以降低高频开关损耗。

示波器探头连接方式如下：

![ZVS 测试探头连接](https://image.lceda.cn/oshwhub/pullImage/5a5729cd4cd94275a723c7829a9dc62c.png)

测试重点观察较难实现 ZVS 的滞后桥臂下管；当滞后桥臂满足 ZVS 条件时，超前桥臂通常也能实现 ZVS。

| ZVS 波形 1 | ZVS 波形 2 | ZVS 波形 3 |
|---|---|---|
| ![ZVS 波形 1](https://image.lceda.cn/oshwhub/pullImage/4d54e5a30e12479489c3e1627275b0eb.png) | ![ZVS 波形 2](https://image.lceda.cn/oshwhub/pullImage/40796f044c9c4a83b60e77b274b3b40f.png) | ![ZVS 波形 3](https://image.lceda.cn/oshwhub/pullImage/a66d5b1b37a3442cbc7921ef9c1f7d91.png) |

图中蓝色波形为滞后桥臂 SW，红色波形为超前桥臂 SW，黄色波形为滞后桥臂下管的栅极驱动信号。

> [!NOTE]
> 本项目属于升压电源，原边电流显著大于副边电流，因此能够在较宽的输入范围内实现 ZVS，而不是仅在重载条件下实现。

### 7.2 电流波形

#### 原边电流

| 波形 1 | 波形 2 |
|---|---|
| ![原边电流波形 1](https://image.lceda.cn/oshwhub/pullImage/9fe67f698f2a4fd7a7a3a64bcfd8a83d.png) | ![原边电流波形 2](https://image.lceda.cn/oshwhub/pullImage/e1297cf75bef4f3fbe2852a99b9cac63.png) |

图中蓝色波形为滞后桥臂 SW，红色波形为超前桥臂 SW，黄色波形为电流互感器信号经整流采样后转换得到的电压信号。

#### 副边电流

| 波形 1 | 波形 2 |
|---|---|
| ![副边电流波形 1](https://image.lceda.cn/oshwhub/pullImage/0602681886c44358835bb51e7f6bbf63.png) | ![副边电流波形 2](https://image.lceda.cn/oshwhub/pullImage/3b308e9f52634190aed3617cb1d7271f.png) |

图中蓝色波形为滞后桥臂 SW，红色波形为超前桥臂 SW，黄色波形为 AMC1301 采样信号经差分放大后反馈至原边的电压信号。

### 7.3 电压波形

| 副边电压波形 1 | 副边电压波形 2 |
|---|---|
| ![副边电压波形 1](https://image.lceda.cn/oshwhub/pullImage/c1ced01a821f4a0e95371ffe9b088f03.png) | ![副边电压波形 2](https://image.lceda.cn/oshwhub/pullImage/494dc2b0f29b4177af55c49b78e236f3.png) |

图中蓝色波形为滞后桥臂 SW，红色波形为超前桥臂 SW，黄色波形为 AMC1311B 采样信号经差分放大后反馈至原边的电压信号。

> [!NOTE]
> 由于电压采样分压器的回路面积较大，且采样回路位于变压器正下方，反馈信号受到了一定干扰。固件中因此加入了针对性的数字滤波算法，以改善采样效果。

### 7.4 电容恒流充电测试

[观看完整测试视频](https://github.com/AzidoPP/HVCCPS-V1.4/releases/download/videos-v1.4/HVCCPS-V1.4-Capacitor-CC-Charging-Test.mp4)

测试使用两个 1100 µF 电容串联，等效容量约为 550 µF；上位机设置目标电压为 2000 V、限流为 200 mA。整个充电过程约耗时 5.6 s，电容电压基本呈线性上升，峰值输出功率约为 390 W。根据电容储能公式计算，平均充电功率约为 195 W。

![电容恒流充电测试第 6 秒画面](https://image.lceda.cn/oshwhub/pullImage/3de0009200974f91ab8fa34ff4fd6f4c.jpg)

### 7.5 阻性负载恒压测试

[观看完整测试视频](https://github.com/AzidoPP/HVCCPS-V1.4/releases/download/videos-v1.4/HVCCPS-V1.4-Resistive-CV-Test.mp4)

测试将 5 kΩ 铝壳电阻连接至输出端，并将输出电压设定为 800 V。测试过程中输出电压保持稳定，用于验证恒压环路及持续输出能力。

![阻性负载恒压测试第 9 秒画面](https://image.lceda.cn/oshwhub/pullImage/25db73a166ae4cfd820d96cf77618603.jpg)

### 7.6 拉弧测试

[观看完整测试视频](https://github.com/AzidoPP/HVCCPS-V1.4/releases/download/videos-v1.4/HVCCPS-V1.4-Arc-Test.mp4)

拉弧测试用于直观展示高压输出效果。电弧测试具有极高危险性，必须采取可靠的绝缘、接地、限流、放电及外部急停措施，请勿模仿或在无人监护的情况下操作。

[查看拉弧测试第 10 秒画面](https://github.com/AzidoPP/HVCCPS-V1.4/blob/main/Docs/test-arc-10s.jpg)

## 8. 许可证与修改记录

本仓库采用 [GPL-3.0](LICENSE) 许可证。项目的版本变化和详细修改内容见 [`log.md`](log.md)。

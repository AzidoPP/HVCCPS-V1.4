# HVCCPS V1.4

[![Bilibili followers](https://img.shields.io/badge/dynamic/json?color=blue&label=BiliBili&labelColor=white&query=$.data.follower&url=https://api.bilibili.com/x/relation/stat?vmid=1084866085&logo=bilibili)](https://space.bilibili.com/1084866085)
[![YouTube](https://img.shields.io/badge/YouTube-white?logo=youtube&logoColor=FF0000)](https://www.youtube.com/@lyyontop)
[![GitHub last commit](https://img.shields.io/github/last-commit/AzidoPP/HVCCPS-V1.4?color=yellow&logo=github&labelColor=black&label=Latest)](https://github.com/AzidoPP/HVCCPS-V1.4)


一、项目信息
HVCCPS V1.4 是一款基于 STM32G474CBT6 的高压数控电源，拥有40W/in^3的较高功率密度。 可用于电容充电和高压实验。

PCB采用EasyEDA（立创EDA专业版）设计，工程[工程](PCB/ProPrj_HVCCPS_V1.4_Release.epro2)文件包含了完整的设计数据，方便复刻和二次开发。

**本工程遵循GPL协议，但为避免闭源抄袭或闭源商用，固件仅公开开放编译后的.hex文件，如需源码请加qq群582594264或联系Lanyyontop@gmail.com后免费提供**

高压电源具有触电、储能电容放电、器件击穿和火灾风险。使用前请确认隔离、接地、放电、电流限制和外部急停措施齐备。

基本参数如下：
数控电源：基于PSFB移相全桥
输入接口|XT30接口
输出接口 M3螺柱

电气参数

|电气参数|最小值|典型值|最大值|单位|
|输入电压(DC)|18|/|30|V|
|输入电流(DC)|/|/|20|A|
|输出电压(DC)|0|可调|2200|V|
|输出电流(DC)|0|可调|200|mA|
|输出功率(DC)|0|可调|400|W|
|频率|11000|/|45000|Hz|
|变换效率|/|/|96%（详细请参考测试数据）|/|
|输出电压精度|/|/|±0.5%|/|
|输出电流精度|/|/|±1%|/|


二、架构
PCB采用4层板设计，全0805封装，方便焊接。板子正面主要被主功率变压器占据，背面则是驱动电路，控制电路等等。
![顶层](Docs/顶层.png)
![底层](Docs/顶层.png)

电源架构
![电源架构](Docs/电源架构.png)

硬件架构
![硬件架构](Docs/硬件架构.png)

三、制作
如需复刻请参考以下步骤：
使用gerber文件打样电路板[Gerber制板文件](PCB/Gerber_HVCCPS_V1.4.zip)，1.6mm厚，1oz铜箔即可。

按照以下参数打样变压器
![变压器](Docs/变压器打样参数.jpg)
```
磁芯EC49

40材

匝数比9:900

初级线圈2-3(尽量选择更粗的线，至少需要过30A电流以上)。
次级线圈5-8直径0.3mm线。

灌胶密封，灌胶前先裁剪掉多余引脚，裁剪掉6、7、1、4和中间两个脚。
不需要气隙，需要漏感最小化。
绕线方向正反均可。
```

推荐淘宝店铺"祥润电子磁芯骨架"，地址：shop339657327.taobao.com
直接把打样参数发给老板即可。

bom采购

这里有几个原件需要稍微注意，如果找不到可以参考以下链接，或是一些注意事项：
L1  https://item.taobao.com/item.htm?id=524929973196
R8 热敏电阻 https://detail.tmall.com/item.htm?id=610279139920 选择10k B=3450
Q1,Q2,Q3,Q4 主功率管，这里可以选择CSD18540或者CSD19531均可
R24,R25,R26,R27,R28 高压分压电阻，耐压尽量选择高一点的，这里选择的是Viking光颉高压电阻https://item.taobao.com/item.htm?id=987002402599
U7,U8 UCC27211 由于这个芯片假货比较多，推荐使用slm27211，可以直接pin-to-pin替换。

如果打算作为通用高压电源使用，还需要加装一个一个输出电容。我选择的是4000V 0.2uF薄膜电容https://item.taobao.com/item.htm?id=814880889031如果作为高压电容充电器使用，可以不用加这个电容。


焊接
这里推荐使用锡膏+加热台焊接。相信复刻这个项目的都是焊接老手了，这里不过多赘述。

![制作完成1](Docs/制作完成.png)
![制作完成2](Docs/制作完成2.png)

如果需要输出电容，可以焊接两个端子到电容引脚后用螺丝固定。

![电容连接](Docs/输出电容的连接.png)

注：顺带一提，副边的电路全部是按照7000V的耐压设计的（电气间隙均>=9.5mm），如果需要更高电压版本，只需要更换不同变压比的变压器，再略微修改代码即可。


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

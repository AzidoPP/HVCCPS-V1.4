# HVCCPS V1.4

[![Bilibili followers](https://img.shields.io/badge/dynamic/json?color=blue&label=BiliBili&labelColor=white&query=$.data.follower&url=https://api.bilibili.com/x/relation/stat?vmid=1084866085&logo=bilibili)](https://space.bilibili.com/1084866085)
[![YouTube](https://img.shields.io/badge/YouTube-white?logo=youtube&logoColor=FF0000)](https://www.youtube.com/@lyyontop)
[![GitHub last commit](https://img.shields.io/github/last-commit/AzidoPP/HVCCPS-V1.4?color=yellow&logo=github&labelColor=black&label=Latest)](https://github.com/AzidoPP/HVCCPS-V1.4)

**QQ交流群：582594264**

<div style="max-width: 1040px; margin: 18px auto; color: #172033; font-family: -apple-system, BlinkMacSystemFont,"Segoe UI', 'Microsoft YaHei', Arial, sans-serif; line-height: 1.75;">

  <div style="border: 3px solid #f59e0b; border-radius: 14px; padding: 22px 24px; margin: 18px 0 20px; background: linear-gradient(135deg, #111827 0%, #1f2937 58%, #3b1d0b 100%); color: #fff; box-shadow: 0 16px 40px rgba(17, 24, 39, 0.22);">
    <div style="font-size: 13px; letter-spacing: 2.4px; color: #fcd34d; font-weight: 800; margin-bottom: 8px;">立创开源社区镜像版 / OSHWHUB MIRROR</div>
    <div style="font-size: 32px; line-height: 1.18; font-weight: 900; margin: 0 0 12px;">请优先阅读 GitHub 最新文档</div>
    <div style="font-size: 17px; color: #fef3c7; margin-bottom: 16px;">由于立创开源社区审核时间较长、页面缓存和附件同步等因素，本文可能滞后于主仓库。复刻、调试、烧录或采购前，强烈建议以 GitHub 仓库中的 README、Release、BOM 和文件为准。</div>
    <a href="https://github.com/AzidoPP/HVCCPS-V1.4" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #facc15; color: #111827; font-size: 17px; font-weight: 900; text-decoration: none;">GitHub 主仓库：AzidoPP/HVCCPS-V1.4</a>
  </div>

  <div style="border-left: 5px solid #d73a49; padding: 12px 14px; background: #fff5f5; margin: 14px 0 22px; border-radius: 0 10px 10px 0;">
    <strong style="color: #d73a49; font-size: 16px;">⚠️ CAUTION</strong><br>
    本项目涉及致命高压。设备断电后，输出端及电容仍可能储存大量能量。调试和使用前，请确保绝缘保护措施齐备；请勿在缺乏高压操作经验或无人监护的情况下使用。
  </div>

  <div style="overflow: hidden; border-radius: 14px; border: 1px solid #d6dde8; background: #0f172a; box-shadow: 0 18px 44px rgba(15, 23, 42, 0.18); margin: 18px 0 24px;">
    <img src="https://raw.githubusercontent.com/AzidoPP/HVCCPS-V1.4/main/Docs/%E5%B0%81%E9%9D%A2.png" alt="HVCCPS V1.4 封面" style="display: block; width: 100%; max-height: 620px; object-fit: cover;">
    <div style="padding: 18px 20px; background: #0f172a; color: #e5edf8;">
      <div style="font-size: 13px; letter-spacing: 2px; color: #38bdf8; font-weight: 800;">DIGITAL HIGH VOLTAGE DC-DC POWER SUPPLY</div>
      <div style="font-size: 28px; line-height: 1.2; font-weight: 900; margin: 6px 0 10px;">HVCCPS V1.4</div>
      <div style="font-size: 15px; color: #cbd5e1;">基于 STM32G474CBT6 的数控高压电源，采用 PSFB 移相全桥拓扑，公开固件支持 CV / CC / CP 控制。</div>
      <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px;">
        <span style="display: inline-block; padding: 5px 10px; border-radius: 999px; background: #162036; color: #bfdbfe; border: 1px solid #334155; font-size: 13px;">0-2200 V</span>
        <span style="display: inline-block; padding: 5px 10px; border-radius: 999px; background: #162036; color: #bbf7d0; border: 1px solid #334155; font-size: 13px;">0-200 mA</span>
        <span style="display: inline-block; padding: 5px 10px; border-radius: 999px; background: #162036; color: #fde68a; border: 1px solid #334155; font-size: 13px;">0-400 W</span>
        <span style="display: inline-block; padding: 5px 10px; border-radius: 999px; background: #162036; color: #fecaca; border: 1px solid #334155; font-size: 13px;">GPL-3.0</span>
      </div>
    </div>
  </div>

  <div style="display: flex; flex-wrap: wrap; gap: 10px; margin: 20px 0 28px;">
    <a href="#intro" style="padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 999px; color: #0f172a; text-decoration: none; background: #f8fafc; font-weight: 700;">项目简介</a>
    <a href="#specs" style="padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 999px; color: #0f172a; text-decoration: none; background: #f8fafc; font-weight: 700;">技术参数</a>
    <a href="#hardware" style="padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 999px; color: #0f172a; text-decoration: none; background: #f8fafc; font-weight: 700;">硬件架构</a>
    <a href="#assembly" style="padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 999px; color: #0f172a; text-decoration: none; background: #f8fafc; font-weight: 700;">制作装配</a>
    <a href="#firmware" style="padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 999px; color: #0f172a; text-decoration: none; background: #f8fafc; font-weight: 700;">固件烧录</a>
    <a href="#hostui" style="padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 999px; color: #0f172a; text-decoration: none; background: #f8fafc; font-weight: 700;">上位机</a>
    <a href="#test" style="padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 999px; color: #0f172a; text-decoration: none; background: #f8fafc; font-weight: 700;">测试</a>
  </div>

  <h2 id="intro" style="margin: 34px 0 12px; padding-bottom: 8px; border-bottom: 2px solid #0f172a; color: #0f172a;">1. 项目简介</h2>

  <h3 style="margin: 22px 0 8px; color: #1f2937;">1.1 项目概述</h3>
  <p>HVCCPS V1.4 是一款基于 <strong>STM32G474CBT6</strong> 的数控高压 DC-DC 电源，功率级采用 <strong>PSFB（Phase-Shifted Full Bridge，移相全桥）</strong>拓扑。它可用于高压电容充电及实验室高压供电，公开版固件支持 <strong>CV（恒压）、CC（恒流）和 CP（恒功率）</strong>控制。</p>
  <p>在推荐工作条件下，电源输入为 18-28 V DC，公开固件输出限制为 <strong>0-2200 V、0-200 mA、0-400 W</strong>。项目功率密度约为 <strong>40 W/in³</strong>。</p>
  <p>PCB 使用 EasyEDA（立创 EDA 专业版）设计，仓库提供完整的 <a href="https://github.com/AzidoPP/HVCCPS-V1.4/blob/main/PCB/ProPrj_HVCCPS_V1.4_Release.epro2" style="color: #0369a1; font-weight: 700;">EasyEDA 工程文件</a>、<a href="https://github.com/AzidoPP/HVCCPS-V1.4/blob/main/PCB/Gerber_HVCCPS_V1.4.zip" style="color: #0369a1; font-weight: 700;">Gerber 制板文件</a>和 <a href="https://github.com/AzidoPP/HVCCPS-V1.4/blob/main/Docs/BOM.xlsx" style="color: #0369a1; font-weight: 700;">BOM</a>，便于复刻与二次开发。</p>

  <h3 style="margin: 22px 0 8px; color: #1f2937;">1.2 固件与许可证说明</h3>
  <p>为预防闭源商用或闭源抄袭，公开仓库目前仅提供编译后的固件，固件源码不直接放在公开分支中。如需源码，请加入 <strong>QQ 群 582594264</strong>，或发送邮件至 <strong>Lanyyontop@gmail.com</strong> 后<strong>免费</strong>获取。</p>
  <p>本仓库公开内容采用 <a href="https://github.com/AzidoPP/HVCCPS-V1.4/blob/main/LICENSE" style="color: #0369a1; font-weight: 700;">GPL-3.0</a> 许可证。获取、修改或再分发源码及衍生作品时，请遵守许可证条款。</p>

  <h2 id="specs" style="margin: 34px 0 12px; padding-bottom: 8px; border-bottom: 2px solid #0f172a; color: #0f172a;">2. 技术参数</h2>

  <h3 style="margin: 22px 0 8px; color: #1f2937;">2.1 电气参数</h3>

  <table style="width: 100%; border-collapse: collapse; margin: 12px 0 18px; font-size: 14px;">
    <thead>
      <tr>
        <th style="padding: 10px; border: 1px solid #dbe3ef; background: #0f172a; color: #fff;">参数</th>
        <th style="padding: 10px; border: 1px solid #dbe3ef; background: #0f172a; color: #fff;">最小值</th>
        <th style="padding: 10px; border: 1px solid #dbe3ef; background: #0f172a; color: #fff;">典型值</th>
        <th style="padding: 10px; border: 1px solid #dbe3ef; background: #0f172a; color: #fff;">最大值</th>
        <th style="padding: 10px; border: 1px solid #dbe3ef; background: #0f172a; color: #fff;">单位</th>
        <th style="padding: 10px; border: 1px solid #dbe3ef; background: #0f172a; color: #fff;">说明</th>
      </tr>
    </thead>
    <tbody>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef;">输入电压（DC）</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: right;">18</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: right;">24</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: right;">28</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: center;">V</td><td style="padding: 9px; border: 1px solid #dbe3ef;">额定输入电压</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">输入电流（DC）</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: right; background: #f8fafc;">-</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: right; background: #f8fafc;">-</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: right; background: #f8fafc;">20</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: center; background: #f8fafc;">A</td><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">额定输入电流</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef;">输出电压（DC）</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: right;">0</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: right;">可调</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: right;">2200</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: center;">V</td><td style="padding: 9px; border: 1px solid #dbe3ef;">-</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">输出电流（DC）</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: right; background: #f8fafc;">0</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: right; background: #f8fafc;">可调</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: right; background: #f8fafc;">200</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: center; background: #f8fafc;">mA</td><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">-</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef;">输出功率（DC）</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: right;">0</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: right;">可调</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: right;">400</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: center;">W</td><td style="padding: 9px; border: 1px solid #dbe3ef;">-</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">开关频率</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: right; background: #f8fafc;">11</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: right; background: #f8fafc;">35</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: right; background: #f8fafc;">45</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: center; background: #f8fafc;">kHz</td><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">默认自动变频，35 kHz 为基准频率</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef;">栅极驱动死区</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: right;">-</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: right;">200</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: right;">-</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: center;">ns</td><td style="padding: 9px; border: 1px solid #dbe3ef;">-</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">变换效率</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: right; background: #f8fafc;">-</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: right; background: #f8fafc;">-</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: right; background: #f8fafc;">96</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: center; background: #f8fafc;">%</td><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">实测峰值；见<a href="https://github.com/AzidoPP/HVCCPS-V1.4/blob/main/Test_Data/%E6%95%88%E7%8E%87%E6%B5%8B%E8%AF%95.txt" style="color: #0369a1; font-weight: 700;">效率测试数据</a></td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef;">输出电压精度</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: right;">-</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: right;">-</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: right;">±0.5</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: center;">%</td><td style="padding: 9px; border: 1px solid #dbe3ef;">-</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">输出电流精度</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: right; background: #f8fafc;">-</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: right; background: #f8fafc;">-</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: right; background: #f8fafc;">±1</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: center; background: #f8fafc;">%</td><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">-</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef;">功率密度</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: right;">-</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: right;">40</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: right;">-</td><td style="padding: 9px; border: 1px solid #dbe3ef; text-align: center;">W/in³</td><td style="padding: 9px; border: 1px solid #dbe3ef;">按整机有效体积计算</td></tr>
    </tbody>
  </table>

  <div style="border-left: 5px solid #2563eb; padding: 11px 14px; background: #eff6ff; margin: 14px 0 22px; border-radius: 0 10px 10px 0;">
    <strong style="color: #1d4ed8;">NOTE</strong><br>
    表中的 28 V 是推荐工作范围上限，母线电容耐压为 35 V，切勿超过 35 V。
  </div>

  <h3 style="margin: 22px 0 8px; color: #1f2937;">2.2 控制与保护参数</h3>
  <table style="width: 100%; border-collapse: collapse; margin: 12px 0 18px; font-size: 14px;">
    <thead>
      <tr>
        <th style="padding: 10px; border: 1px solid #dbe3ef; background: #0f172a; color: #fff;">项目</th>
        <th style="padding: 10px; border: 1px solid #dbe3ef; background: #0f172a; color: #fff;">参数</th>
        <th style="padding: 10px; border: 1px solid #dbe3ef; background: #0f172a; color: #fff;">说明</th>
      </tr>
    </thead>
    <tbody>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef;">控制模式</td><td style="padding: 9px; border: 1px solid #dbe3ef;">CV / CC / CP</td><td style="padding: 9px; border: 1px solid #dbe3ef;">三环 PI 自动仲裁</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">固定占空比模式</td><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">0-100%</td><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">仅用于调试，仍受软启动约束</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef;">软启动</td><td style="padding: 9px; border: 1px solid #dbe3ef;">每个控制周期最多增加 10% 占空比</td><td style="padding: 9px; border: 1px solid #dbe3ef;">默认值，可通过上位机配置管理器调整</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">运行定时</td><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">连续或 1-65534 s</td><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">到时自动关闭输出</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef;">硬件过流保护（OCP）</td><td style="padding: 9px; border: 1px solid #dbe3ef;">原边 SW 节点交流峰值约 60 A</td><td style="padding: 9px; border: 1px solid #dbe3ef;">COMP1 → HRTIM FAULT4 异步关断；<strong>不是 60 A 输入额定值</strong></td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">软件过温保护（OTP）</td><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">70 °C</td><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">MOS NTC 或 MCU 内部温度任一路超过阈值即关断</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef;">独立看门狗（IWDG）</td><td style="padding: 9px; border: 1px solid #dbe3ef;">约 200 ms</td><td style="padding: 9px; border: 1px solid #dbe3ef;">主循环或控制 ISR 异常时触发复位</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">按键</td><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">A / B 两组预设</td><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">可保存 CV、CC、CP 和运行时间，支持脱机运行及停机</td></tr>
    </tbody>
  </table>
  <p>OCP 和 OTP 触发后均会锁存停机状态。再次启动时固件会清除锁存；如果故障条件仍然存在，保护会立即再次触发。</p>

  <h3 style="margin: 22px 0 8px; color: #1f2937;">2.3 控制器与通信参数</h3>
  <table style="width: 100%; border-collapse: collapse; margin: 12px 0 18px; font-size: 14px;">
    <thead><tr><th style="padding: 10px; border: 1px solid #dbe3ef; background: #0f172a; color: #fff;">项目</th><th style="padding: 10px; border: 1px solid #dbe3ef; background: #0f172a; color: #fff;">参数</th></tr></thead>
    <tbody>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef;">MCU</td><td style="padding: 9px; border: 1px solid #dbe3ef;">STM32G474CBT6</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">外部晶振</td><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">8 MHz HSE</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef;">系统主频</td><td style="padding: 9px; border: 1px solid #dbe3ef;">170 MHz</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">通信接口</td><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">USART3，PB10（TX）/ PB11（RX）</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef;">串口格式</td><td style="padding: 9px; border: 1px solid #dbe3ef;">115200 baud，8N1</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">上位机接口</td><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">WebSerial</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef;">输入连接器</td><td style="padding: 9px; border: 1px solid #dbe3ef;">XT30</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">高压输出连接器</td><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">M3</td></tr>
    </tbody>
  </table>

  <h3 style="margin: 22px 0 8px; color: #1f2937;">2.4 高压侧设计说明</h3>
  <p>高压副边的 PCB 电气间隙均 <strong>≥ 9.5 mm</strong>，相关电路按 7000 V 耐压目标进行布局设计。这里的 7000 V 是高压侧的设计目标，<strong>不代表整机额定输出为 7000 V</strong>；默认版本变压器、器件选型、反馈比例和公开固件的额定输出仍以 2200 V 为准。</p>
  <p>如需更高输出电压，必须重新核算并验证变压器匝比、整流二极管、输出电容和反馈网络，同时修改固件参数。本 PCB 布局的设计安全上限为 7000 V；如需改版，切勿超过 7000 V。</p>

  <h2 id="hardware" style="margin: 34px 0 12px; padding-bottom: 8px; border-bottom: 2px solid #0f172a; color: #0f172a;">3. 硬件架构</h2>

  <h3 style="margin: 22px 0 8px; color: #1f2937;">3.1 PCB 布局</h3>
  <p>PCB 采用 <strong>4 层、1.6 mm 板厚、1 oz 铜厚</strong>设计，常用阻容器件全部采用 0805 封装，便于焊接。顶层主要布置主功率变压器，底层主要布置驱动、控制和采样电路。</p>
  <div style="display: flex; flex-wrap: wrap; gap: 14px; margin: 14px 0 24px;">
    <div style="flex: 1 1 320px; border: 1px solid #dbe3ef; border-radius: 12px; overflow: hidden; background: #fff;">
      <div style="padding: 9px 12px; font-weight: 800; background: #f1f5f9; color: #0f172a;">PCB 顶层</div>
      <img src="https://raw.githubusercontent.com/AzidoPP/HVCCPS-V1.4/main/Docs/%E9%A1%B6%E5%B1%82.png" alt="PCB 顶层" style="display: block; width: 100%;">
    </div>
    <div style="flex: 1 1 320px; border: 1px solid #dbe3ef; border-radius: 12px; overflow: hidden; background: #fff;">
      <div style="padding: 9px 12px; font-weight: 800; background: #f1f5f9; color: #0f172a;">PCB 底层</div>
      <img src="https://raw.githubusercontent.com/AzidoPP/HVCCPS-V1.4/main/Docs/%E5%BA%95%E5%B1%82.png" alt="PCB 底层" style="display: block; width: 100%;">
    </div>
  </div>

  <h3 style="margin: 22px 0 8px; color: #1f2937;">3.2 电源架构</h3>
  <p>功率级采用 PSFB 移相全桥拓扑，通过改变两组桥臂之间的相移调节传输功率。</p>
  <img src="https://raw.githubusercontent.com/AzidoPP/HVCCPS-V1.4/main/Docs/%E7%94%B5%E6%BA%90%E6%9E%B6%E6%9E%84.png" alt="电源架构" style="display: block; width: 100%; max-width: 920px; margin: 12px auto 24px; border-radius: 12px; border: 1px solid #dbe3ef; box-shadow: 0 10px 26px rgba(15, 23, 42, 0.10);">

  <h3 style="margin: 22px 0 8px; color: #1f2937;">3.3 硬件架构</h3>
  <p>控制器负责电压、电流、温度和辅助电源采样，并通过 HRTIM 产生带固定死区的四路全桥驱动信号。独立比较器和 HRTIM Fault 通路用于硬件过流关断。</p>
  <img src="https://raw.githubusercontent.com/AzidoPP/HVCCPS-V1.4/main/Docs/%E7%A1%AC%E4%BB%B6%E6%9E%B6%E6%9E%84.png" alt="硬件架构" style="display: block; width: 100%; max-width: 920px; margin: 12px auto 24px; border-radius: 12px; border: 1px solid #dbe3ef; box-shadow: 0 10px 26px rgba(15, 23, 42, 0.10);">

  <h2 id="assembly" style="margin: 34px 0 12px; padding-bottom: 8px; border-bottom: 2px solid #0f172a; color: #0f172a;">4. 制作与装配</h2>

  <h3 style="margin: 22px 0 8px; color: #1f2937;">4.1 制板</h3>
  <p>使用仓库中的 <a href="https://github.com/AzidoPP/HVCCPS-V1.4/blob/main/PCB/Gerber_HVCCPS_V1.4.zip" style="color: #0369a1; font-weight: 700;">Gerber 制板文件</a>下单，推荐参数如下：</p>
  <div style="display: flex; flex-wrap: wrap; gap: 10px; margin: 12px 0 22px;">
    <span style="display: inline-block; padding: 8px 12px; border-radius: 10px; background: #ecfeff; border: 1px solid #a5f3fc; color: #155e75; font-weight: 800;">层数：4 层</span>
    <span style="display: inline-block; padding: 8px 12px; border-radius: 10px; background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; font-weight: 800;">板厚：1.6 mm</span>
    <span style="display: inline-block; padding: 8px 12px; border-radius: 10px; background: #fffbeb; border: 1px solid #fde68a; color: #92400e; font-weight: 800;">铜厚：1 oz</span>
  </div>

  <h3 style="margin: 22px 0 8px; color: #1f2937;">4.2 变压器</h3>
  <img src="https://raw.githubusercontent.com/AzidoPP/HVCCPS-V1.4/main/Docs/%E5%8F%98%E5%8E%8B%E5%99%A8%E6%89%93%E6%A0%B7%E5%8F%82%E6%95%B0.jpg" alt="变压器打样参数" style="display: block; width: 100%; max-width: 820px; margin: 12px auto 18px; border-radius: 12px; border: 1px solid #dbe3ef; box-shadow: 0 10px 26px rgba(15, 23, 42, 0.10);">
  <table style="width: 100%; border-collapse: collapse; margin: 12px 0 18px; font-size: 14px;">
    <thead><tr><th style="padding: 10px; border: 1px solid #dbe3ef; background: #0f172a; color: #fff;">项目</th><th style="padding: 10px; border: 1px solid #dbe3ef; background: #0f172a; color: #fff;">参数</th></tr></thead>
    <tbody>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef;">磁芯</td><td style="padding: 9px; border: 1px solid #dbe3ef;">EC49，40 材</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">匝数</td><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">初级 9 匝，次级 900 匝</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef;">匝数比</td><td style="padding: 9px; border: 1px solid #dbe3ef;">1:100</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">初级绕组引脚</td><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">2-3</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef;">次级绕组引脚</td><td style="padding: 9px; border: 1px solid #dbe3ef;">5-8</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">次级线径</td><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">0.3 mm</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef;">气隙</td><td style="padding: 9px; border: 1px solid #dbe3ef;">不需要</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">其他要求</td><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">尽量减小漏感，完成后灌胶密封</td></tr>
    </tbody>
  </table>
  <p>初级绕组应尽量选用较粗导线，载流能力需 <strong>≥ 30 A</strong>。灌胶前裁掉 1、4、6、7 脚及中间两个多余引脚；绕线方向正反均可。</p>
  <p>当前项目的变压器是在淘宝店铺“<a href="https://shop339657327.taobao.com" style="color: #0369a1; font-weight: 700;">祥润电子磁芯骨架</a>”定做打样的。</p>
  <div style="border-left: 5px solid #2563eb; padding: 11px 14px; background: #eff6ff; margin: 14px 0 22px; border-radius: 0 10px 10px 0;">
    <strong style="color: #1d4ed8;">NOTE</strong><br>
    变压器打样后漏感应小于 10 uH，励磁电感应大于 300 uH。
  </div>

  <h3 style="margin: 22px 0 8px; color: #1f2937;">4.3 BOM 与关键器件</h3>
  <p>完整物料清单见 <a href="https://github.com/AzidoPP/HVCCPS-V1.4/blob/main/Docs/BOM.xlsx" style="color: #0369a1; font-weight: 700;">Docs/BOM.xlsx</a>。以下器件在采购时需要特别留意：</p>
  <table style="width: 100%; border-collapse: collapse; margin: 12px 0 18px; font-size: 14px;">
    <thead><tr><th style="padding: 10px; border: 1px solid #dbe3ef; background: #0f172a; color: #fff;">位号</th><th style="padding: 10px; border: 1px solid #dbe3ef; background: #0f172a; color: #fff;">器件/建议</th><th style="padding: 10px; border: 1px solid #dbe3ef; background: #0f172a; color: #fff;">注意事项</th></tr></thead>
    <tbody>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef;">L1</td><td style="padding: 9px; border: 1px solid #dbe3ef;"><a href="https://item.taobao.com/item.htm?id=524929973196" style="color: #0369a1; font-weight: 700;">参考链接</a></td><td style="padding: 9px; border: 1px solid #dbe3ef;">-</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">R8</td><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">10 kΩ NTC，B = 3450 K（<a href="https://detail.tmall.com/item.htm?id=610279139920" style="color: #0369a1; font-weight: 700;">参考链接</a>）</td><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">-</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef;">Q1-Q4</td><td style="padding: 9px; border: 1px solid #dbe3ef;">CSD18540 或 CSD19531</td><td style="padding: 9px; border: 1px solid #dbe3ef;">注意管子来源</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">R24-R28</td><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">Viking（光颉）高压电阻，2 MΩ、2512、3000 V（<a href="https://item.taobao.com/item.htm?id=987002402599" style="color: #0369a1; font-weight: 700;">参考链接</a>）</td><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">-</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef;">U7、U8</td><td style="padding: 9px; border: 1px solid #dbe3ef;">UCC27211；可替换为 SLM27211</td><td style="padding: 9px; border: 1px solid #dbe3ef;">市面上 UCC27211 假货较多，SLM27211 可 Pin-to-Pin 替换</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">U9</td><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">EE8.3 1:200 电流互感器（<a href="https://item.taobao.com/item.htm?id=721406076659" style="color: #0369a1; font-weight: 700;">参考链接</a>）</td><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">-</td></tr>
    </tbody>
  </table>
  <p>其余元器件请按照 BOM 采购。</p>

  <h3 style="margin: 22px 0 8px; color: #1f2937;">4.4 焊接与检查</h3>
  <p>推荐使用锡膏和加热台或回流焊完成贴片焊接。这里就不过多赘述了，相信复刻本项目的同学都是焊接老手了。</p>
  <div style="display: flex; flex-wrap: wrap; gap: 14px; margin: 14px 0 24px;">
    <div style="flex: 1 1 320px; border: 1px solid #dbe3ef; border-radius: 12px; overflow: hidden; background: #fff;">
      <div style="padding: 9px 12px; font-weight: 800; background: #f1f5f9; color: #0f172a;">制作完成（正面）</div>
      <img src="https://raw.githubusercontent.com/AzidoPP/HVCCPS-V1.4/main/Docs/%E5%88%B6%E4%BD%9C%E5%AE%8C%E6%88%90.png" alt="制作完成正面" style="display: block; width: 100%;">
    </div>
    <div style="flex: 1 1 320px; border: 1px solid #dbe3ef; border-radius: 12px; overflow: hidden; background: #fff;">
      <div style="padding: 9px 12px; font-weight: 800; background: #f1f5f9; color: #0f172a;">制作完成（背面）</div>
      <img src="https://raw.githubusercontent.com/AzidoPP/HVCCPS-V1.4/main/Docs/%E5%88%B6%E4%BD%9C%E5%AE%8C%E6%88%902.png" alt="制作完成背面" style="display: block; width: 100%;">
    </div>
  </div>

  <h3 style="margin: 22px 0 8px; color: #1f2937;">4.5 输出电容</h3>
  <p>作为通用高压电源使用时，可外接 <strong>4000 V、0.2 µF</strong> 薄膜电容作为输出滤波电容（<a href="https://item.taobao.com/item.htm?id=814880889031" style="color: #0369a1; font-weight: 700;">购买链接</a>）；作为高压电容充电器使用时，可以不安装该电容。</p>
  <p>连接电容的时候先在引脚上焊接端子，再使用螺丝固定到输出端。</p>
  <img src="https://raw.githubusercontent.com/AzidoPP/HVCCPS-V1.4/main/Docs/%E8%BE%93%E5%87%BA%E7%94%B5%E5%AE%B9%E7%9A%84%E8%BF%9E%E6%8E%A5.png" alt="输出电容连接" style="display: block; width: 100%; max-width: 820px; margin: 12px auto 24px; border-radius: 12px; border: 1px solid #dbe3ef; box-shadow: 0 10px 26px rgba(15, 23, 42, 0.10);">

  <h2 id="firmware" style="margin: 34px 0 12px; padding-bottom: 8px; border-bottom: 2px solid #0f172a; color: #0f172a;">5. 固件烧录与 IAP 更新</h2>

  <h3 style="margin: 22px 0 8px; color: #1f2937;">5.1 固件组成</h3>
  <p>发布固件由两个 Intel HEX 文件组成，可从 <a href="https://github.com/AzidoPP/HVCCPS-V1.4/releases" style="color: #0369a1; font-weight: 700;">GitHub Releases</a> 下载：</p>
  <table style="width: 100%; border-collapse: collapse; margin: 12px 0 18px; font-size: 14px;">
    <thead><tr><th style="padding: 10px; border: 1px solid #dbe3ef; background: #0f172a; color: #fff;">固件</th><th style="padding: 10px; border: 1px solid #dbe3ef; background: #0f172a; color: #fff;">起始地址</th><th style="padding: 10px; border: 1px solid #dbe3ef; background: #0f172a; color: #fff;">作用</th></tr></thead>
    <tbody>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef;"><a href="https://github.com/AzidoPP/HVCCPS-V1.4/releases/download/v0.0.1/HVCCPS_Bootloader_V0.0.1.hex" style="color: #0369a1; font-weight: 700;">Bootloader HEX</a></td><td style="padding: 9px; border: 1px solid #dbe3ef;"><code>0x08000000</code></td><td style="padding: 9px; border: 1px solid #dbe3ef;">启动检查及串口 IAP 更新</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;"><a href="https://github.com/AzidoPP/HVCCPS-V1.4/releases/download/v0.0.1/HVCCPS_App_V0.0.1.hex" style="color: #0369a1; font-weight: 700;">App HEX</a></td><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;"><code>0x08004000</code></td><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">电源控制、保护、遥测和上位机通信</td></tr>
    </tbody>
  </table>

  <h3 style="margin: 22px 0 8px; color: #1f2937;">5.2 烧录准备</h3>
  <p>准备以下设备：</p>
  <ul style="margin: 8px 0 16px; padding-left: 22px;">
    <li>ST-Link V2</li>
    <li>USB 转 TTL 模块</li>
    <li>SH1.0 转 2.54 mm 转接板</li>
    <li>SH1.0 接口连接线</li>
  </ul>
  <img src="https://raw.githubusercontent.com/AzidoPP/HVCCPS-V1.4/main/Docs/%E5%87%86%E5%A4%87%E8%AE%BE%E5%A4%87.png" alt="烧录所需设备" style="display: block; width: 100%; max-width: 820px; margin: 12px auto 18px; border-radius: 12px; border: 1px solid #dbe3ef; box-shadow: 0 10px 26px rgba(15, 23, 42, 0.10);">
  <p>在电脑中下载安装 <a href="https://www.st.com/en/development-tools/stsw-link004.html" style="color: #0369a1; font-weight: 700;">STM32 ST-LINK Utility</a>，并建议先<a href="https://github.com/AzidoPP/HVCCPS-V1.4/archive/refs/heads/main.zip" style="color: #0369a1; font-weight: 700;">下载当前工程（ZIP）</a>或使用<a href="https://azidopp.github.io/HVCCPS-V1.4/BootLoaderHostUI/" style="color: #0369a1; font-weight: 700;">在线烧录器</a>或<a href="https://azidopp.github.io/HVCCPS-V1.4/AppHostUI/" style="color: #0369a1; font-weight: 700;">在线上位机</a>。</p>
  <p><strong>完整操作过程见：<a href="https://github.com/AzidoPP/HVCCPS-V1.4/releases/download/videos-v1.4/HVCCPS-V1.4-Flashing-Tutorial.mp4" style="color: #0369a1;">固件烧录视频教程</a>。</strong></p>

  <h3 style="margin: 22px 0 8px; color: #1f2937;">5.3 烧录方法</h3>
  <p>板上通信接口依次为 <code>SWCLK</code>、<code>SWDIO</code>、<code>TX</code>、<code>RX</code>、<code>GND</code>、<code>3.3 V</code>、<code>SDA</code> 和 <code>SCL</code>。烧录分为以下两个阶段：</p>
  <table style="width: 100%; border-collapse: collapse; margin: 12px 0 18px; font-size: 14px;">
    <thead><tr><th style="padding: 10px; border: 1px solid #dbe3ef; background: #0f172a; color: #fff;">阶段</th><th style="padding: 10px; border: 1px solid #dbe3ef; background: #0f172a; color: #fff;">需要连接的引脚</th><th style="padding: 10px; border: 1px solid #dbe3ef; background: #0f172a; color: #fff;">连接设备</th></tr></thead>
    <tbody>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef;">首次烧录 Bootloader</td><td style="padding: 9px; border: 1px solid #dbe3ef;"><code>SWCLK</code>、<code>SWDIO</code>、<code>GND</code>、<code>3.3 V</code></td><td style="padding: 9px; border: 1px solid #dbe3ef;">ST-Link V2</td></tr>
      <tr><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">IAP 烧录 App</td><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;"><code>TX</code>、<code>RX</code>、<code>GND</code>、<code>3.3 V</code></td><td style="padding: 9px; border: 1px solid #dbe3ef; background: #f8fafc;">USB 转 TTL 模块，TX/RX 交叉连接</td></tr>
    </tbody>
  </table>

  <div style="border-left: 5px solid #f97316; padding: 11px 14px; background: #fff7ed; margin: 14px 0 22px; border-radius: 0 10px 10px 0;">
    <strong style="color: #c2410c;">WARNING</strong><br>
    操作前必须断开高压输出负载。确保安全。
  </div>

  <ol style="margin: 8px 0 18px; padding-left: 24px;">
    <li>将板卡的 <code>SWCLK</code>、<code>SWDIO</code>、<code>GND</code> 和 <code>3.3 V</code> 与 ST-Link V2 对应连接。</li>
    <li>打开 STM32 ST-LINK Utility，选择 Bootloader HEX 文件并执行烧录。</li>
  </ol>
  <img src="https://raw.githubusercontent.com/AzidoPP/HVCCPS-V1.4/main/Docs/stlinkutility.png" alt="使用 ST-LINK Utility 烧录 Bootloader" style="display: block; width: 100%; max-width: 820px; margin: 12px auto 18px; border-radius: 12px; border: 1px solid #dbe3ef; box-shadow: 0 10px 26px rgba(15, 23, 42, 0.10);">
  <ol start="3" style="margin: 8px 0 18px; padding-left: 24px;">
    <li>烧录完成后复位板卡；若 <code>LED_A</code> 点亮，说明 Bootloader 已正常启动。</li>
    <li>断开 ST-Link，改用 USB 转 TTL 模块连接板卡的 <code>TX</code>、<code>RX</code>、<code>GND</code> 和 <code>3.3 V</code>，其中 TX 与 RX 需要交叉连接。</li>
    <li>推荐在已下载的工程中打开 <a href="https://github.com/AzidoPP/HVCCPS-V1.4/blob/main/BootLoaderHostUI/index.html" style="color: #0369a1; font-weight: 700;">BootLoaderHostUI/index.html</a>；也可以直接使用<a href="https://azidopp.github.io/HVCCPS-V1.4/BootLoaderHostUI/" style="color: #0369a1; font-weight: 700;">在线 IAP 烧录页面</a>。请使用最新版 Chrome 或 Edge。</li>
    <li>在页面中连接串口并选择 App HEX 文件，点击烧录后按下板卡的 <strong>RST</strong> 键。</li>
  </ol>
  <img src="https://raw.githubusercontent.com/AzidoPP/HVCCPS-V1.4/main/Docs/IAP%E7%83%A7%E5%BD%95.png" alt="使用 IAP 页面烧录 App 固件" style="display: block; width: 100%; max-width: 820px; margin: 12px auto 18px; border-radius: 12px; border: 1px solid #dbe3ef; box-shadow: 0 10px 26px rgba(15, 23, 42, 0.10);">
  <ol start="7" style="margin: 8px 0 18px; padding-left: 24px;">
    <li>等待传输和校验完成。再次复位板卡后，若 <code>LED_A</code> 持续闪烁，说明 App 已成功启动。</li>
  </ol>

  <h2 id="hostui" style="margin: 34px 0 12px; padding-bottom: 8px; border-bottom: 2px solid #0f172a; color: #0f172a;">6. 上位机</h2>

  <h3 style="margin: 22px 0 8px; color: #1f2937;">6.1 电源控制上位机</h3>
  <p>推荐下载工程后打开 <a href="https://github.com/AzidoPP/HVCCPS-V1.4/blob/main/AppHostUI/index.html" style="color: #0369a1; font-weight: 700;">AppHostUI/index.html</a> 离线使用；也可以直接打开<a href="https://azidopp.github.io/HVCCPS-V1.4/AppHostUI/" style="color: #0369a1; font-weight: 700;">在线电源控制上位机</a>。页面通过 WebSerial 提供以下功能：</p>
  <p>首次使用建议先观看：<a href="https://github.com/AzidoPP/HVCCPS-V1.4/releases/download/videos-v1.4/HVCCPS-V1.4-Host-Control-Tutorial.mp4" style="color: #0369a1; font-weight: 700;">上位机连接与控制视频教程</a>。</p>
  <ul style="margin: 8px 0 16px; padding-left: 22px;">
    <li>启停控制及 CV、CC、CP 目标设置</li>
    <li>固定占空比调试</li>
    <li>电压、电流、功率、温度和保护状态遥测</li>
    <li>实时曲线及单周期采样波形</li>
    <li>PI、开关频率、自动变频及软启动参数配置</li>
    <li>前面板 A/B 按键预设管理</li>
  </ul>
  <img src="https://raw.githubusercontent.com/AzidoPP/HVCCPS-V1.4/main/Docs/hostui.png" alt="hostui" style="display: block; width: 100%; max-width: 920px; margin: 12px auto 18px; border-radius: 12px; border: 1px solid #dbe3ef; box-shadow: 0 10px 26px rgba(15, 23, 42, 0.10);">
  <p>连接参数为 <strong>115200 baud、8N1</strong>。建议使用最新版 Chrome 或 Edge。</p>

  <h3 style="margin: 22px 0 8px; color: #1f2937;">6.2 Bootloader 上位机</h3>
  <p>本地页面 <a href="https://github.com/AzidoPP/HVCCPS-V1.4/blob/main/BootLoaderHostUI/index.html" style="color: #0369a1; font-weight: 700;">BootLoaderHostUI/index.html</a> 和<a href="https://azidopp.github.io/HVCCPS-V1.4/BootLoaderHostUI/" style="color: #0369a1; font-weight: 700;">在线 IAP 烧录页面</a>均支持 Intel HEX 解析、地址范围校验、串口握手、分块传输、进度显示和错误日志，仅用于更新 App 固件。</p>
  <img src="https://raw.githubusercontent.com/AzidoPP/HVCCPS-V1.4/main/Docs/iapui.png" alt="iapui" style="display: block; width: 100%; max-width: 920px; margin: 12px auto 24px; border-radius: 12px; border: 1px solid #dbe3ef; box-shadow: 0 10px 26px rgba(15, 23, 42, 0.10);">

  <h2 id="test" style="margin: 34px 0 12px; padding-bottom: 8px; border-bottom: 2px solid #0f172a; color: #0f172a;">7. 测试</h2>
  <p>本项目的教程及测试视频统一收录在 <a href="https://github.com/AzidoPP/HVCCPS-V1.4/releases/tag/videos-v1.4" style="color: #0369a1; font-weight: 700;">HVCCPS V1.4 视频教程与测试 Release</a> 中。</p>
  <p>测试仪器：</p>
  <ul style="margin: 8px 0 16px; padding-left: 22px;">
    <li>SDS804X 示波器</li>
    <li>VC980D 万用表</li>
  </ul>

  <h3 style="margin: 22px 0 8px; color: #1f2937;">7.1 ZVS 零电压开通</h3>
  <p>实测主功率管能够实现 ZVS 零电压开通：开关节点电压先降至 0 V 附近，随后栅极驱动信号到来并使 MOSFET 导通。移相全桥利用变压器漏感续流实现软开关，以降低高频开关损耗。</p>
  <p>示波器探头连接方式如下：</p>
  <img src="https://raw.githubusercontent.com/AzidoPP/HVCCPS-V1.4/main/Test_Data/oscilloscope-connection.png" alt="ZVS 测试探头连接" style="display: block; width: 100%; max-width: 820px; margin: 12px auto 18px; border-radius: 12px; border: 1px solid #dbe3ef; box-shadow: 0 10px 26px rgba(15, 23, 42, 0.10);">
  <p>测试重点观察较难实现 ZVS 的滞后桥臂下管；当滞后桥臂满足 ZVS 条件时，超前桥臂通常也能实现 ZVS。</p>
  <div style="display: flex; flex-wrap: wrap; gap: 12px; margin: 14px 0 18px;">
    <div style="flex: 1 1 260px; border: 1px solid #dbe3ef; border-radius: 12px; overflow: hidden; background: #fff;"><div style="padding: 8px 10px; background: #f1f5f9; font-weight: 800;">ZVS 波形 1</div><img src="https://raw.githubusercontent.com/AzidoPP/HVCCPS-V1.4/main/Test_Data/ZVS-waveform1.png" alt="ZVS 波形 1" style="display: block; width: 100%;"></div>
    <div style="flex: 1 1 260px; border: 1px solid #dbe3ef; border-radius: 12px; overflow: hidden; background: #fff;"><div style="padding: 8px 10px; background: #f1f5f9; font-weight: 800;">ZVS 波形 2</div><img src="https://raw.githubusercontent.com/AzidoPP/HVCCPS-V1.4/main/Test_Data/ZVS-waveform2.png" alt="ZVS 波形 2" style="display: block; width: 100%;"></div>
    <div style="flex: 1 1 260px; border: 1px solid #dbe3ef; border-radius: 12px; overflow: hidden; background: #fff;"><div style="padding: 8px 10px; background: #f1f5f9; font-weight: 800;">ZVS 波形 3</div><img src="https://raw.githubusercontent.com/AzidoPP/HVCCPS-V1.4/main/Test_Data/ZVS-waveform3.png" alt="ZVS 波形 3" style="display: block; width: 100%;"></div>
  </div>
  <p>图中蓝色波形为滞后桥臂 SW，红色波形为超前桥臂 SW，黄色波形为滞后桥臂下管的栅极驱动信号。</p>
  <div style="border-left: 5px solid #2563eb; padding: 11px 14px; background: #eff6ff; margin: 14px 0 22px; border-radius: 0 10px 10px 0;">
    <strong style="color: #1d4ed8;">NOTE</strong><br>
    本项目属于升压电源，原边电流显著大于副边电流，因此能够在较宽的输入范围内实现 ZVS，而不是仅在重载条件下实现。
  </div>

  <h3 style="margin: 22px 0 8px; color: #1f2937;">7.2 电流波形</h3>
  <h4 style="margin: 18px 0 8px; color: #334155;">原边电流</h4>
  <div style="display: flex; flex-wrap: wrap; gap: 12px; margin: 14px 0 18px;">
    <div style="flex: 1 1 320px; border: 1px solid #dbe3ef; border-radius: 12px; overflow: hidden; background: #fff;"><div style="padding: 8px 10px; background: #f1f5f9; font-weight: 800;">原边电流波形 1</div><img src="https://raw.githubusercontent.com/AzidoPP/HVCCPS-V1.4/main/Test_Data/50kHz/%E5%8E%9F%E8%BE%B9%E7%94%B5%E6%B5%81/_74.png" alt="原边电流波形 1" style="display: block; width: 100%;"></div>
    <div style="flex: 1 1 320px; border: 1px solid #dbe3ef; border-radius: 12px; overflow: hidden; background: #fff;"><div style="padding: 8px 10px; background: #f1f5f9; font-weight: 800;">原边电流波形 2</div><img src="https://raw.githubusercontent.com/AzidoPP/HVCCPS-V1.4/main/Test_Data/50kHz/%E5%8E%9F%E8%BE%B9%E7%94%B5%E6%B5%81/_78.png" alt="原边电流波形 2" style="display: block; width: 100%;"></div>
  </div>
  <p>图中蓝色波形为滞后桥臂 SW，红色波形为超前桥臂 SW，黄色波形为电流互感器信号经整流采样后转换得到的电压信号。</p>

  <h4 style="margin: 18px 0 8px; color: #334155;">副边电流</h4>
  <div style="display: flex; flex-wrap: wrap; gap: 12px; margin: 14px 0 18px;">
    <div style="flex: 1 1 320px; border: 1px solid #dbe3ef; border-radius: 12px; overflow: hidden; background: #fff;"><div style="padding: 8px 10px; background: #f1f5f9; font-weight: 800;">副边电流波形 1</div><img src="https://raw.githubusercontent.com/AzidoPP/HVCCPS-V1.4/main/Test_Data/50kHz/%E5%89%AF%E8%BE%B9%E7%94%B5%E6%B5%81/_67.png" alt="副边电流波形 1" style="display: block; width: 100%;"></div>
    <div style="flex: 1 1 320px; border: 1px solid #dbe3ef; border-radius: 12px; overflow: hidden; background: #fff;"><div style="padding: 8px 10px; background: #f1f5f9; font-weight: 800;">副边电流波形 2</div><img src="https://raw.githubusercontent.com/AzidoPP/HVCCPS-V1.4/main/Test_Data/50kHz/%E5%89%AF%E8%BE%B9%E7%94%B5%E6%B5%81/_69.png" alt="副边电流波形 2" style="display: block; width: 100%;"></div>
  </div>
  <p>图中蓝色波形为滞后桥臂 SW，红色波形为超前桥臂 SW，黄色波形为 AMC1301 采样信号经差分放大后反馈至原边的电压信号。</p>

  <h3 style="margin: 22px 0 8px; color: #1f2937;">7.3 电压波形</h3>
  <div style="display: flex; flex-wrap: wrap; gap: 12px; margin: 14px 0 18px;">
    <div style="flex: 1 1 320px; border: 1px solid #dbe3ef; border-radius: 12px; overflow: hidden; background: #fff;"><div style="padding: 8px 10px; background: #f1f5f9; font-weight: 800;">副边电压波形 1</div><img src="https://raw.githubusercontent.com/AzidoPP/HVCCPS-V1.4/main/Test_Data/50kHz/%E5%B0%86%E8%BE%93%E5%85%A5%E6%BB%A4%E6%B3%A2%E7%94%B5%E5%AE%B9%E6%94%B9%E4%B8%BA1nF%E5%90%8E%E7%94%B5%E5%8E%8B%E5%8F%8D%E9%A6%88/313V-60.png" alt="副边电压波形 1" style="display: block; width: 100%;"></div>
    <div style="flex: 1 1 320px; border: 1px solid #dbe3ef; border-radius: 12px; overflow: hidden; background: #fff;"><div style="padding: 8px 10px; background: #f1f5f9; font-weight: 800;">副边电压波形 2</div><img src="https://raw.githubusercontent.com/AzidoPP/HVCCPS-V1.4/main/Test_Data/50kHz/%E5%B0%86%E8%BE%93%E5%85%A5%E6%BB%A4%E6%B3%A2%E7%94%B5%E5%AE%B9%E6%94%B9%E4%B8%BA1nF%E5%90%8E%E7%94%B5%E5%8E%8B%E5%8F%8D%E9%A6%88/370V-100.png" alt="副边电压波形 2" style="display: block; width: 100%;"></div>
  </div>
  <p>图中蓝色波形为滞后桥臂 SW，红色波形为超前桥臂 SW，黄色波形为 AMC1311B 采样信号经差分放大后反馈至原边的电压信号。</p>
  <div style="border-left: 5px solid #2563eb; padding: 11px 14px; background: #eff6ff; margin: 14px 0 22px; border-radius: 0 10px 10px 0;">
    <strong style="color: #1d4ed8;">NOTE</strong><br>
    由于电压采样分压器的回路面积较大，且采样回路位于变压器正下方，反馈信号受到了一定干扰。固件中因此加入了针对性的数字滤波算法，以改善采样效果。
  </div>

  <h3 style="margin: 22px 0 8px; color: #1f2937;">7.4 电容恒流充电测试</h3>
  <p><a href="https://github.com/AzidoPP/HVCCPS-V1.4/releases/download/videos-v1.4/HVCCPS-V1.4-Capacitor-CC-Charging-Test.mp4" style="color: #0369a1; font-weight: 700;">观看完整测试视频</a></p>
  <p>测试使用两个 1100 µF 电容串联，等效容量约为 550 µF；上位机设置目标电压为 2000 V、限流为 200 mA。整个充电过程约耗时 5.6 s，电容电压基本呈线性上升，峰值输出功率约为 390 W。根据电容储能公式计算，平均充电功率约为 195 W。</p>
  <img src="https://raw.githubusercontent.com/AzidoPP/HVCCPS-V1.4/main/Docs/test-capacitor-cc-6s.jpg" alt="电容恒流充电测试第 6 秒画面" style="display: block; width: 100%; max-width: 680px; margin: 12px auto 24px; border-radius: 12px; border: 1px solid #dbe3ef; box-shadow: 0 10px 26px rgba(15, 23, 42, 0.10);">

  <h3 style="margin: 22px 0 8px; color: #1f2937;">7.5 阻性负载恒压测试</h3>
  <p><a href="https://github.com/AzidoPP/HVCCPS-V1.4/releases/download/videos-v1.4/HVCCPS-V1.4-Resistive-CV-Test.mp4" style="color: #0369a1; font-weight: 700;">观看完整测试视频</a></p>
  <p>测试将 5 kΩ 铝壳电阻连接至输出端，并将输出电压设定为 800 V。测试过程中输出电压保持稳定，用于验证恒压环路及持续输出能力。</p>
  <img src="https://raw.githubusercontent.com/AzidoPP/HVCCPS-V1.4/main/Docs/test-resistive-cv-9s.jpg" alt="阻性负载恒压测试第 9 秒画面" style="display: block; width: 100%; max-width: 680px; margin: 12px auto 24px; border-radius: 12px; border: 1px solid #dbe3ef; box-shadow: 0 10px 26px rgba(15, 23, 42, 0.10);">

  <h3 style="margin: 22px 0 8px; color: #1f2937;">7.6 拉弧测试</h3>
  <p><a href="https://github.com/AzidoPP/HVCCPS-V1.4/releases/download/videos-v1.4/HVCCPS-V1.4-Arc-Test.mp4" style="color: #0369a1; font-weight: 700;">观看完整测试视频</a></p>
  <p>拉弧测试用于直观展示高压输出效果。</p>
  <img src="https://raw.githubusercontent.com/AzidoPP/HVCCPS-V1.4/main/Docs/test-arc-10s.jpg" alt="拉弧测试第 10 秒画面" style="display: block; width: 100%; max-width: 680px; margin: 12px auto 24px; border-radius: 12px; border: 1px solid #dbe3ef; box-shadow: 0 10px 26px rgba(15, 23, 42, 0.10);">

  <h2 id="license" style="margin: 34px 0 12px; padding-bottom: 8px; border-bottom: 2px solid #0f172a; color: #0f172a;">8. 许可证与修改记录</h2>
  <p>本仓库采用 <a href="https://github.com/AzidoPP/HVCCPS-V1.4/blob/main/LICENSE" style="color: #0369a1; font-weight: 700;">GPL-3.0</a> 许可证。项目的版本变化和详细修改内容见 <a href="https://github.com/AzidoPP/HVCCPS-V1.4/blob/main/log.md" style="color: #0369a1; font-weight: 700;">log.md</a>。</p>

  <div style="margin: 28px 0 6px; padding: 16px 18px; border-radius: 12px; border: 1px solid #dbe3ef; background: #f8fafc; color: #475569;">
    <strong style="color: #0f172a;">再次提醒：</strong>立创开源社区页面可能存在审核和同步延迟，正式复刻前请回到 <a href="https://github.com/AzidoPP/HVCCPS-V1.4" style="color: #0369a1; font-weight: 900;">GitHub 主仓库</a>核对最新文档与附件。
  </div>

</div>

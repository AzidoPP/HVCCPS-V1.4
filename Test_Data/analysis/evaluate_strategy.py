# -*- coding: utf-8 -*-
"""Evaluate frequency modulation strategy thresholds against efficiency data."""
import re, os
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
from matplotlib.lines import Line2D
from scipy.interpolate import griddata

HERE = os.path.dirname(os.path.abspath(__file__))
SRC  = os.path.join(HERE, "..", "效率测试.txt")

rows = []
with open(SRC, encoding='utf-8') as fh:
    for line in fh:
        m = re.findall(r'f:\s*(\d+)Hz, duty:\s*([\d.]+)%, eff:\s*([\d.]+)%, '
                       r'Ipri:\s*([\d.]+)A, Isec:\s*([\d.]+)mA, Vsec:\s*([\d.]+)V, '
                       r'Vpri:\s*([\d.]+)V', line)
        if m: rows.append([float(x) for x in m[0]])
a = np.array(rows)
freq_khz = a[:,0]/1000; duty_pct = a[:,1]; eff_pct = a[:,2]
ipri = a[:,3]; isec = a[:,4]; vsec = a[:,5]; pout = vsec*isec/1000

# ── Strategy thresholds ──
# UP: if duty < (6/7)*f + 31.43  -->  start increasing freq
#     until duty > (6/7)*f + 36.43  -->  stop
# DOWN: if duty > 95% for some time --> decrease freq until duty < 90%

f_axis = np.linspace(13, 50, 200)
d_trigger_upspeed   = (6/7)*f_axis + 31.4285714286   # UP start line
d_stop_upspeed      = (6/7)*f_axis + 36.4285714286   # UP stop line
d_down_trigger      = 95  # constant
d_down_stop         = 90  # constant

# Calculate key boundary crossings
for fv in [13, 20, 25, 30, 35, 40, 45, 50]:
    d_trig = (6/7)*fv + 31.43
    d_stop = (6/7)*fv + 36.43
    print(f"  f={fv:2.0f}kHz: UP triggers at d<{d_trig:.1f}%, stops at d>{d_stop:.1f}%")

# ── Analyze: what efficiency do points in each zone have? ──
print("\n" + "="*75)
print("  ZONE ANALYSIS: efficiency levels in each operating region")
print("="*75)

# Zone definitions
def classify_point(f, d):
    """Classify a point into the strategy's zone system."""
    d_up_trig  = (6/7)*f + 31.4285714286
    d_up_stop  = (6/7)*f + 36.4285714286
    
    if d > 95:
        return "DOWN (d>95%: should down-shift)"
    elif d > 90 and d <= 95:
        return "DOWN-HOLD (d 90-95%: down-shift in progress)"
    elif d >= d_up_stop:
        return "STABLE (d above UP-stop, below 90%)"
    elif d >= d_up_trig:
        return "UP-HOLD (d in buffer zone, up-shift may stop)"
    else:
        return "UP (d too low, should up-shift)"

classes = []
for i in range(len(freq_khz)):
    cls = classify_point(freq_khz[i], duty_pct[i])
    classes.append(cls)

classes = np.array(classes)
zone_stats = {}
for zone in sorted(set(classes)):
    mask = classes == zone
    n = mask.sum()
    if n == 0: continue
    zone_stats[zone] = {
        'n': n, 'eff_mean': eff_pct[mask].mean(),
        'eff_std': eff_pct[mask].std(ddof=1) if n>1 else 0,
        'eff_min': eff_pct[mask].min(), 'eff_max': eff_pct[mask].max(),
        'ipri_mean': ipri[mask].mean(), 'pout_mean': pout[mask].mean(),
        'freq_range': f"{freq_khz[mask].min():.0f}-{freq_khz[mask].max():.0f}kHz",
        'duty_range': f"{duty_pct[mask].min():.0f}-{duty_pct[mask].max():.0f}%",
    }

print(f"\n{'Zone':<40s} {'n':>4s} {'mean_eff':>8s} {'std':>6s} {'min':>7s} {'max':>7s} {'mean_Ipri':>9s} {'mean_Pout':>9s}")
print("-" * 100)
for zone in ['UP (d too low, should up-shift)',
             'UP-HOLD (d in buffer zone, up-shift may stop)',
             'STABLE (d above UP-stop, below 90%)',
             'DOWN-HOLD (d 90-95%: down-shift in progress)',
             'DOWN (d>95%: should down-shift)']:
    if zone in zone_stats:
        s = zone_stats[zone]
        print(f"  {zone:<38s} {s['n']:4d} {s['eff_mean']:8.1f}% {s['eff_std']:6.1f}% {s['eff_min']:7.1f}% {s['eff_max']:7.1f}% {s['ipri_mean']:9.2f}A {s['pout_mean']:9.2f}W")
    else:
        print(f"  {zone:<38s}  -- no data points in this zone --")

# ── De-confounded analysis: predicted eff at median Ipri ──
X = np.column_stack([np.ones(len(eff_pct)), freq_khz, duty_pct, ipri])
coefs, _, _, _ = np.linalg.lstsq(X, eff_pct, rcond=None)
b0, bf, bd, bi = coefs
med_ipri = np.median(ipri)

fi = np.linspace(10, 52, 150)
di = np.linspace(0, 105, 150)
F, D = np.meshgrid(fi, di)
E_pred = b0 + bf*F + bd*D + bi*med_ipri

# Predicted efficiency along the UP-trigger and UP-stop lines
f_ana = np.linspace(13, 50, 50)
d_up_trig_line = (6/7)*f_ana + 31.4285714286
d_up_stop_line = (6/7)*f_ana + 36.4285714286
d_down_trig_line = np.full_like(f_ana, 95)
d_down_stop_line = np.full_like(f_ana, 90)

eff_on_up_trig = b0 + bf*f_ana + bd*d_up_trig_line + bi*med_ipri
eff_on_up_stop = b0 + bf*f_ana + bd*d_up_stop_line + bi*med_ipri
eff_on_down_trig = b0 + bf*f_ana + bd*d_down_trig_line + bi*med_ipri
eff_on_down_stop = b0 + bf*f_ana + bd*d_down_stop_line + bi*med_ipri

print(f"\n=== DE-CONFOUNDED efficiency along threshold lines (Ipri={med_ipri:.1f}A) ===")
print(f"  freq  |  eff@UP-trigger  |  eff@UP-stop  |  eff@DOWN-stop(90%)  |  eff@DOWN-trigger(95%)")
print(f"  " + "-"*80)
for fv in [15, 20, 25, 30, 35, 40, 45, 50]:
    d_ut = (6/7)*fv + 31.43
    d_us = (6/7)*fv + 36.43
    e_ut = b0 + bf*fv + bd*d_ut + bi*med_ipri
    e_us = b0 + bf*fv + bd*d_us + bi*med_ipri
    e_ds = b0 + bf*fv + bd*90 + bi*med_ipri
    e_dt = b0 + bf*fv + bd*95 + bi*med_ipri
    print(f"  {fv:4.0f}k | d={d_ut:5.1f}% e={e_ut:5.1f}%  |  d={d_us:5.1f}% e={e_us:5.1f}%  |  d=90% e={e_ds:5.1f}%  |  d=95% e={e_dt:5.1f}%")

# ── PLOT ──
fig, ax = plt.subplots(figsize=(12, 10))

# Interpolated efficiency background
eff_grid = griddata((freq_khz, duty_pct), eff_pct, (F, D), method='linear')
cf = ax.contourf(F, D, eff_grid, levels=20, cmap='RdYlGn', alpha=0.40, antialiased=True)

# Data scatter
scatter = ax.scatter(freq_khz, duty_pct, c=eff_pct, cmap='RdYlGn', s=55,
                     edgecolors='#333333', linewidth=0.5, vmin=15, vmax=100, zorder=3)

# ── Draw strategy lines ──
# UP boundary lines
ax.plot(f_axis, d_trigger_upspeed, color='#3366CC', linewidth=2.5, linestyle='-',
        zorder=5, label='UP-trigger: d = (6/7)f + 31.4')
ax.plot(f_axis, d_stop_upspeed, color='#CC6600', linewidth=2.5, linestyle='-',
        zorder=5, label='UP-stop:   d = (6/7)f + 36.4')

# DOWN boundary lines
ax.axhline(y=95, color='#CC0000', linewidth=2.5, linestyle='--',
           zorder=5, label='DOWN-trigger: d = 95%')
ax.axhline(y=90, color='#990000', linewidth=2.0, linestyle='--',
           zorder=5, label='DOWN-stop:    d = 90%')

# Shade the UP buffer zone
buffer_verts = np.vstack([
    np.column_stack([f_axis, d_trigger_upspeed]),
    np.column_stack([f_axis[::-1], d_stop_upspeed[::-1]]),
])
ax.fill(buffer_verts[:,0], buffer_verts[:,1], facecolor='#FFCC66',
        edgecolor='none', alpha=0.15, zorder=1)

# Shade DOWN zone (d > 95%)
ax.fill_between([10, 52], 95, 105, facecolor='#FF6666', alpha=0.10, zorder=1)
# Shade DOWN-HOLD zone
ax.fill_between([10, 52], 90, 95, facecolor='#FF9999', alpha=0.07, zorder=1)

# Mark operating zones with text
ax.annotate('UP (raise freq)', xy=(43, 62), fontsize=12, fontweight='bold',
            color='#3366CC', ha='center', va='center', zorder=6)
ax.annotate('STABLE\nZONE', xy=(24, 82), fontsize=13, fontweight='bold',
            color='#006600', ha='center', va='center',
            bbox=dict(boxstyle='round,pad=0.5', facecolor='#EEFFEE',
                     edgecolor='#006600', alpha=0.8), zorder=6)
ax.annotate('DOWN\n(d>95%)', xy=(43, 98), fontsize=11, fontweight='bold',
            color='#CC0000', ha='center', va='center', zorder=6)

# Legend
ax.legend(loc='upper left', fontsize=10, framealpha=0.9)

ax.set_xlabel('Frequency (kHz)', fontsize=13, fontweight='bold')
ax.set_ylabel('Duty Cycle (%)', fontsize=13, fontweight='bold')
ax.set_title('Frequency Modulation Strategy Evaluation\n'
             'Blue/Orange lines = UP thresholds | Red dashes = DOWN thresholds\n'
             'Background = measured efficiency (green=high, red=low)',
             fontsize=13, fontweight='bold')
ax.set_xlim(10, 52)
ax.set_ylim(5, 105)
ax.grid(True, alpha=0.25)

cbar = fig.colorbar(scatter, ax=ax, shrink=0.82, pad=0.02)
cbar.set_label('Efficiency (%)', fontsize=12, fontweight='bold')

plt.tight_layout()
outpath = os.path.join(HERE, "fig_strategy_zones.png")
fig.savefig(outpath, dpi=180, bbox_inches='tight', facecolor='white')
print(f"\nSaved plot: {outpath}")

# ── Final evaluation ──
print(f"\n{'='*75}")
print(f"  STRATEGY EVALUATION SUMMARY")
print(f"{'='*75}")

print(f"""
  [UP strategy thresholds]
    Trigger: d < (6/7)f + 31.4   (blue line)
    Stop:    d > (6/7)f + 36.4   (orange line)
    Buffer:  5 percentage points
    
  [DOWN strategy thresholds]  
    Trigger: d > 95%  (red dashed)
    Stop:    d < 90%  (dark red dashed)
    Buffer:  5 percentage points

  [Slope analysis]
    The slope of 6/7 ≈ 0.857 means: for every 7kHz frequency increase,
    the duty cycle threshold increases by 6 percentage points.
    This slope was presumably chosen to match the Vsec∝duty relationship.
    
  [Boundary points]:
""")
for fv, label in [(13, "min f"), (20, ""), (30, ""), (40, ""), (50, "max f")]:
    dt = (6/7)*fv + 31.43
    ds = (6/7)*fv + 36.43
    print(f"    f={fv}kHz: UP-start d<{dt:.1f}%, UP-stop d>{ds:.1f}%")

print(f"""
  [PROS of this strategy]
    1. The UP-slope line tracks the efficiency sweet spot well:
       higher freq needs higher duty to be in the efficient zone
    2. Buffer zones prevent oscillation between UP/DOWN modes
    3. DOWN thresholds (90-95%) are reasonable — they keep operation
       away from the 100% saturation region while being achievable
    
  [CONS / Potential issues]
    1. At low freq (13kHz): UP triggers at d<42.6%. But at 13kHz, 
       d=42.6% gives only ~75% efficiency based on raw data. The 
       strategy would STAY at low freq until duty creeps above 42.6%,
       which means efficiency stays poor.
       
    2. The slope 6/7 is arbitrary — was it derived from the Vsec/f
       relationship? If so, it may not align with the efficiency 
       optimum at equal power.
       
    3. At high freq (50kHz): UP triggers at d<74.3%. But in the raw 
       data, 50kHz 74% duty only gives ~80-82% efficiency. The 
       strategy would KEEP up-shifting past 50kHz if possible, which 
       may not be beneficial.
       
    4. The DOWN threshold at 95% is good but the STOP at 90% means:
       when duty finally drops from >95% down to 90%, the frequency 
       has decreased by some amount. At that new lower freq, 90% 
       might be too HIGH — and the DOWN cycle might re-trigger soon.
""")

plt.close()

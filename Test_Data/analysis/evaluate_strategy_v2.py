# -*- coding: utf-8 -*-
"""Re-evaluate with new UP trigger: d < f + 25 (was: d < 6/7*f + 31.43)"""
import re, os
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
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
f = a[:,0]/1000; d = a[:,1]; e = a[:,2]; ip = a[:,3]; po = a[:,4]*a[:,5]/1000

# ── Thresholds ──
def d_new_trig(fv):       return fv + 25                    # NEW UP trigger
def d_up_stop(fv):        return (6/7)*fv + 36.4285714286    # UP stop (unchanged)
def d_down_trig(fv=None): return 95
def d_down_stop(fv=None): return 90

# ── Boundary comparison ──
print("=== Boundary comparison: OLD vs NEW ===")
print(f"  {'freq':>5s} | {'OLD UP-trig':>12s}  {'NEW UP-trig':>12s}  {'UP-stop':>12s} | {'hold(old)':>10s} {'hold(new)':>10s}")
print("  " + "-"*85)
for fv in [13, 15, 20, 25, 30, 35, 40, 45, 50]:
    old_t = (6/7)*fv + 31.4286
    new_t = d_new_trig(fv)
    stop  = d_up_stop(fv)
    hold_old = stop - old_t
    hold_new = stop - new_t
    print(f"  {fv:4.0f}k | d<{old_t:6.1f}%     d<{new_t:6.1f}%      d>{stop:6.1f}%     |  {hold_old:5.1f}pp      {hold_new:5.1f}pp")

# ── Classify with NEW thresholds ──
cl_new = []
for i in range(len(f)):
    if d[i] > 95:
        cl_new.append('DOWN')
    elif d[i] > 90:
        cl_new.append('DOWN-HOLD')
    elif d[i] >= d_up_stop(f[i]):
        cl_new.append('STABLE')
    elif d[i] >= d_new_trig(f[i]):
        cl_new.append('UP-HOLD')
    else:
        cl_new.append('UP')
cl_new = np.array(cl_new)

# ── Classify with OLD thresholds ──
cl_old = []
for i in range(len(f)):
    old_t = (6/7)*f[i] + 31.4286
    if d[i] > 95:
        cl_old.append('DOWN')
    elif d[i] > 90:
        cl_old.append('DOWN-HOLD')
    elif d[i] >= d_up_stop(f[i]):
        cl_old.append('STABLE')
    elif d[i] >= old_t:
        cl_old.append('UP-HOLD')
    else:
        cl_old.append('UP')
cl_old = np.array(cl_old)

# ── Zone stats NEW ──
print(f"\n=== ZONE STATS (NEW thresholds) ===")
print(f"  {'Zone':<25s} {'n':>4s} {'eff_mean':>8s} {'eff_std':>6s} {'eff_min':>7s} {'eff_max':>7s} {'Ipri':>7s} {'Pout':>8s}")
print("  " + "-"*78)
for zn in ['UP', 'UP-HOLD', 'STABLE', 'DOWN-HOLD', 'DOWN']:
    m = cl_new == zn; nz = m.sum()
    if nz:
        print(f"  {zn:<25s} {nz:4d} {e[m].mean():8.1f}% {e[m].std():6.1f}% {e[m].min():7.1f}% {e[m].max():7.1f}% {ip[m].mean():7.2f}A {po[m].mean():8.2f}W")
    else:
        print(f"  {zn:<25s}    0")

# ── Zone stats OLD ──
print(f"\n=== ZONE STATS (OLD thresholds, for comparison) ===")
print(f"  {'Zone':<25s} {'n':>4s} {'eff_mean':>8s} {'eff_min':>7s} {'eff_max':>7s}")
print("  " + "-"*55)
for zn in ['UP', 'UP-HOLD', 'STABLE', 'DOWN-HOLD', 'DOWN']:
    m = cl_old == zn; nz = m.sum()
    if nz:
        print(f"  {zn:<25s} {nz:4d} {e[m].mean():8.1f}% {e[m].min():7.1f}% {e[m].max():7.1f}%")
    else:
        print(f"  {zn:<25s}    0")

# ── Points that changed zone ──
moved_out = (cl_old == 'UP') & (cl_new != 'UP')
moved_in  = (cl_old != 'UP') & (cl_new == 'UP')
print(f"\n=== Zone transitions OLD -> NEW ===")
print(f"  Moved OUT of UP zone: {moved_out.sum()} points")
print(f"  Moved INTO UP zone:   {moved_in.sum()} points")
print(f"  Net shift OUT of UP:  {moved_out.sum() - moved_in.sum()} points")
if moved_out.sum():
    freed = cl_new[moved_out]
    print(f"  Freed points redistribution:")
    for cz in ['UP-HOLD', 'STABLE']:
        nc = (freed == cz).sum()
        if nc:
            print(f"    -> {cz}: {nc} points, eff={e[moved_out][freed==cz].mean():.1f}%, "
                  f"f_range={f[moved_out][freed==cz].min():.0f}-{f[moved_out][freed==cz].max():.0f}kHz, "
                  f"d_range={d[moved_out][freed==cz].min():.0f}-{d[moved_out][freed==cz].max():.0f}%")

# ── De-confounded prediction ──
X = np.column_stack([np.ones(len(e)), f, d, ip])
b0, bf, bd, bi = np.linalg.lstsq(X, e, rcond=None)[0]
mi = np.median(ip)
print(f"\n=== De-confounded eff along threshold lines (Ipri={mi:.1f}A) ===")
print(f"  {'freq':>5s} | UP-trig(d=f+25)  |  UP-stop(6/7f+36.4) |  DOWN-stop(d=90) |  DOWN-trig(d=95)")
print("  " + "-"*87)
for fv in [15, 20, 25, 30, 35, 40, 45, 50]:
    nt = d_new_trig(fv); us = d_up_stop(fv)
    e_nt = b0 + bf*fv + bd*nt + bi*mi
    e_us = b0 + bf*fv + bd*us + bi*mi
    e_90 = b0 + bf*fv + bd*90 + bi*mi
    e_95 = b0 + bf*fv + bd*95 + bi*mi
    print(f"  {fv:4.0f}k | d={nt:5.1f}% e={e_nt:5.1f}%  |  d={us:5.1f}% e={e_us:5.1f}%   |  d=90% e={e_90:5.1f}%  |  d=95% e={e_95:5.1f}%")

# ── Summary ──
print(f"\n{'='*65}")
print(f"  EVALUATION SUMMARY (NEW: d < f+25)")
print(f"{'='*65}")
print(f"""
  [Changes from OLD to NEW]
    OLD: d < (6/7)f + 31.4  (slope=0.857, intercept=31.4)
    NEW: d < f + 25          (slope=1.000, intercept=25)
    
  [Key effects]
    1. At LOW freq (13-20kHz): trigger LOWERED significantly
       13kHz: 42.6% -> 38.0%  (-4.6pp, now triggers sooner)
       20kHz: 48.6% -> 45.0%  (-3.6pp)
       
    2. At HIGH freq (40-50kHz): trigger nearly unchanged
       40kHz: 65.7% -> 65.0%  (-0.7pp)
       50kHz: 74.3% -> 75.0%  (+0.7pp, slightly HIGHER)
       
    3. Buffer zone is now WIDER at low freq, NARROWER at high freq:
       13kHz: 5.0pp -> 9.6pp  (good: more cautious at low freq)
       50kHz: 5.0pp -> 4.3pp  (acceptable: still > 3pp)
       
    4. Lines never cross below ~80kHz (safe within operating range)
""")
print("="*65)

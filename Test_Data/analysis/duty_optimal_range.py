# -*- coding: utf-8 -*-
"""Find optimal duty cycle ranges per frequency band."""
import re, math
import numpy as np

rows = []
with open(r'd:\stm32\HVCCPS_V1.4\Test_Data\效率测试.txt', encoding='utf-8') as fh:
    for line in fh:
        m = re.findall(r'f:\s*(\d+)Hz, duty:\s*([\d.]+)%, eff:\s*([\d.]+)%, '
                       r'Ipri:\s*([\d.]+)A, Isec:\s*([\d.]+)mA, Vsec:\s*([\d.]+)V, '
                       r'Vpri:\s*([\d.]+)V', line)
        if m: rows.append([float(x) for x in m[0]])
a = np.array(rows)
freq_khz = a[:,0]/1000; duty = a[:,1]; eff = a[:,2]
ipri = a[:,3]; isec = a[:,4]; vsec = a[:,5]; pout = vsec*isec/1000

# Define frequency bands
bands = [
    ("Low    13-20kHz",  (13, 20)),
    ("Mid-L  20-30kHz",  (20, 30)),
    ("Mid-H  30-40kHz",  (30, 40)),
    ("High   40-50kHz",  (40, 50)),
]

# For each band, compute efficiency statistics per duty decile
print("=" * 85)
print("  Efficiency vs Duty Cycle, stratified by frequency band")
print("=" * 85)

for band_name, (f_lo, f_hi) in bands:
    mask = (freq_khz >= f_lo) & (freq_khz < f_hi)
    n_band = mask.sum()
    if n_band < 5: continue
    
    du = duty[mask]; ef = eff[mask]; fv = freq_khz[mask]; ip = ipri[mask]
    po = pout[mask]
    
    # Bin by duty in 5% increments
    duty_bins = np.arange(0, 105, 5)
    print(f"\n{'─'*80}")
    print(f"  [{band_name}]  n={n_band}")
    print(f"  {'Duty%':>8s} {'n':>4s} {'MeanEff':>8s} {'StdEff':>7s} {'MinEff':>8s} {'MaxEff':>7s} {'MeanIpri':>9s} {'MeanPout':>9s} {'Stars':>8s}")
    print(f"  {'─'*70}")
    
    for i in range(len(duty_bins)-1):
        d_lo, d_hi = duty_bins[i], duty_bins[i+1]
        bmask = (du >= d_lo) & (du < d_hi)
        nb = bmask.sum()
        if nb < 2: continue
        
        me = ef[bmask].mean(); se = ef[bmask].std(ddof=1) if nb>1 else 0
        mn = ef[bmask].min(); mx = ef[bmask].max()
        mi = ip[bmask].mean(); mp = po[bmask].mean()
        
        # Star rating: >=88% -> ***, >=83% -> **, >=78% -> *
        stars = '***' if me >= 88 else ('**' if me >= 83 else ('*' if me >= 78 else ''))
        
        print(f"  {d_lo:4d}-{d_hi:4d}% {nb:4d} {me:8.1f}% {se:7.1f}% {mn:8.1f}% {mx:7.1f}% {mi:9.2f}A {mp:9.2f}W {stars:>8s}")
    
    # Find peak duty range (sliding window of width=15)
    print(f"\n  --- Peak analysis (sliding 15% window) ---")
    best_mean = 0; best_range = None
    for d_start in np.arange(0, 100, 5):
        d_end = min(d_start + 15, 100)
        wm = (du >= d_start) & (du < d_end)
        if wm.sum() >= 3:
            wmean = ef[wm].mean()
            if wmean > best_mean:
                best_mean = wmean; best_range = (d_start, d_end, wm.sum())
    if best_range:
        print(f"  Best 15% window: {best_range[0]:.0f}-{best_range[1]:.0f}% (n={best_range[2]}, mean eff={best_mean:.1f}%)")

# Overall, all frequencies combined
print(f"\n{'='*85}")
print(f"  ALL FREQUENCIES COMBINED (n={len(eff)})")
print(f"  {'Duty%':>8s} {'n':>4s} {'MeanEff':>8s} {'StdEff':>7s} {'MinEff':>8s} {'MaxEff':>7s} {'MeanPout':>9s}")
print(f"  {'─'*60}")
for i in range(len(duty_bins)-1):
    d_lo, d_hi = duty_bins[i], duty_bins[i+1]
    bmask = (duty >= d_lo) & (duty < d_hi)
    nb = bmask.sum()
    if nb < 2: continue
    me = eff[bmask].mean(); se = eff[bmask].std(ddof=1) if nb>1 else 0
    mn = eff[bmask].min(); mx = eff[bmask].max(); mp = pout[bmask].mean()
    stars = '***' if me >= 88 else ('**' if me >= 83 else ('*' if me >= 78 else ''))
    print(f"  {d_lo:4d}-{d_hi:4d}% {nb:4d} {me:8.1f}% {se:7.1f}% {mn:8.1f}% {mx:7.1f}% {mp:9.2f}W {stars:>8s}")

# Summary table
print(f"\n{'='*85}")
print(f"  SUMMARY: High-efficiency duty ranges (>=83% avg)")
print(f"  Note: *** >= 88%, ** >= 83%, * >= 78%")
print(f"{'='*85}")
print(f"  {'Frequency Band':<20s} {'High-eff Duty Range':<25s} {'Peak Eff':<10s} {'Notes'}")
print(f"  {'─'*80}")
for band_name, (f_lo, f_hi) in bands:
    mask = (freq_khz >= f_lo) & (freq_khz < f_hi)
    du = duty[mask]; ef = eff[mask]
    
    # Find all duty bins with mean >= 83%
    high_bins = []
    for i in range(len(duty_bins)-1):
        d_lo_, d_hi_ = duty_bins[i], duty_bins[i+1]
        bm = (du >= d_lo_) & (du < d_hi_)
        if bm.sum() >= 2 and ef[bm].mean() >= 83:
            high_bins.append((d_lo_, d_hi_, ef[bm].mean()))
    
    if high_bins:
        # Merge adjacent bins
        merged = [[high_bins[0][0], high_bins[0][1], high_bins[0][2]]]
        for dlo, dhi, mef in high_bins[1:]:
            if dlo <= merged[-1][1]:  # adjacent or overlapping
                merged[-1][1] = max(merged[-1][1], dhi)
                merged[-1][2] = max(merged[-1][2], mef)
            else:
                merged.append([dlo, dhi, mef])
        range_str = ", ".join([f"{m[0]:.0f}-{m[1]:.0f}%" for m in merged])
        peak = max(m[2] for m in merged)
    else:
        range_str = "none"
        peak = 0
    
    peak_str = f"{peak:.1f}%" if peak > 0 else "--"
    note = ""
    if f_lo < 20: note = "(low freq: very forgiving)"
    elif f_lo >= 40: note = "(high freq: narrower sweet spot)"
    print(f"  {band_name:<20s} {range_str:<25s} {peak_str:<10s} {note}")

print()

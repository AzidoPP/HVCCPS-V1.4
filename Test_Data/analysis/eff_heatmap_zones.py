# -*- coding: utf-8 -*-
"""Efficiency heatmap v2: scatter + regression-predicted high-eff boundary."""
import re, os
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
from matplotlib.lines import Line2D
from scipy.spatial import ConvexHull
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
freq_khz = a[:,0] / 1000.0
duty_pct = a[:,1]
eff_pct  = a[:,2]
ipri     = a[:,3]

# ── Build regression model to predict eff from freq, duty, Ipri ──
X = np.column_stack([np.ones(len(eff_pct)), freq_khz, duty_pct, ipri])
coefs, _, _, _ = np.linalg.lstsq(X, eff_pct, rcond=None)
b0, bf, bd, bi = coefs
print(f"Model: eff = {b0:.1f} + {bf:.3f}*freq + {bd:.3f}*duty + {bi:.2f}*Ipri")

# ── Predict eff at "median Ipri" (equal current) across the mesh ──
med_ipri = np.median(ipri)
fi = np.linspace(freq_khz.min(), freq_khz.max(), 100)
di = np.linspace(duty_pct.min(), duty_pct.max(), 100)
F, D = np.meshgrid(fi, di)

# Predicted eff at median Ipri (equal-current surface)
E_pred = b0 + bf*F + bd*D + bi*med_ipri

# ── Figure ──
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(18, 8))

# ═══════════════════════════════════════════════════════════
# LEFT: Raw data heatmap
# ═══════════════════════════════════════════════════════════
sc1 = ax1.scatter(freq_khz, duty_pct, c=eff_pct, cmap='RdYlGn',
                  s=50, edgecolors='#333333', linewidth=0.5,
                  vmin=15, vmax=100, zorder=3, alpha=0.9)

# High-eff hull (>= 88%)
hull_mask = eff_pct >= 88
if hull_mask.sum() >= 3:
    pts = np.column_stack([freq_khz[hull_mask], duty_pct[hull_mask]])
    try:
        hull = ConvexHull(pts)
        hull_pts = np.vstack([pts[hull.vertices], pts[hull.vertices][0]])
        ax1.fill(hull_pts[:,0], hull_pts[:,1], facecolor='#FF0000',
                 edgecolor='#CC0000', linewidth=2.5, alpha=0.10, zorder=2)
        ax1.plot(hull_pts[:,0], hull_pts[:,1], color='#CC0000', linewidth=2.5,
                 zorder=4, label='Data: eff >= 88% hull')
    except Exception:
        pass

# Excellent hull (>= 95%)
hull_mask2 = eff_pct >= 95
if hull_mask2.sum() >= 3:
    pts2 = np.column_stack([freq_khz[hull_mask2], duty_pct[hull_mask2]])
    try:
        hull2 = ConvexHull(pts2)
        hull_pts2 = np.vstack([pts2[hull2.vertices], pts2[hull2.vertices][0]])
        ax1.fill(hull_pts2[:,0], hull_pts2[:,1], facecolor='#008800',
                 edgecolor='#006400', linewidth=2.0, alpha=0.12, zorder=2)
        ax1.plot(hull_pts2[:,0], hull_pts2[:,1], color='#006400', linewidth=2.0,
                 linestyle='--', zorder=4, label='Data: eff >= 95% hull')
    except Exception:
        pass

ax1.set_xlabel('Frequency (kHz)', fontsize=12, fontweight='bold')
ax1.set_ylabel('Duty Cycle (%)', fontsize=12, fontweight='bold')
ax1.set_title('RAW DATA: Measured Efficiency\n(confounded by current/power level)',
              fontsize=13, fontweight='bold')
ax1.grid(True, alpha=0.25, linestyle='--')
ax1.set_xlim(10, 52)
ax1.set_ylim(-2, 105)
ax1.legend(loc='lower right', fontsize=9, framealpha=0.85)

cbar1 = fig.colorbar(sc1, ax=ax1, shrink=0.82, pad=0.02)
cbar1.set_label('Efficiency (%)', fontsize=11, fontweight='bold')

# Annotate
best_raw = np.argmax(eff_pct)
ax1.annotate(f'{eff_pct[best_raw]:.1f}% (best)',
             xy=(freq_khz[best_raw], duty_pct[best_raw]),
             xytext=(freq_khz[best_raw]-8, duty_pct[best_raw]-15),
             fontsize=9, color='#006600', fontweight='bold',
             arrowprops=dict(arrowstyle='->', color='#006600', lw=1.2),
             bbox=dict(boxstyle='round', facecolor='#EEFFEE', alpha=0.8))

# ═══════════════════════════════════════════════════════════
# RIGHT: De-confounded prediction (equal Ipri = median)
# ═══════════════════════════════════════════════════════════
cf2 = ax2.contourf(F, D, E_pred, levels=25, cmap='RdYlGn',
                   alpha=0.65, antialiased=True)

# Overlay actual data points (greyed out, for reference)
ax2.scatter(freq_khz, duty_pct, c='#888888', s=15, alpha=0.3, zorder=3)

# 88% boundary line
cs88 = ax2.contour(F, D, E_pred, levels=[88], colors='#CC0000',
                    linewidths=3.5, linestyles='-', zorder=5)
# Fill >= 88% zone
ax2.contourf(F, D, E_pred, levels=[88, 110], colors=['#FFE0E0'],
             alpha=0.25, zorder=2)

# 92% boundary
ax2.contour(F, D, E_pred, levels=[92], colors='#880000',
            linewidths=2.5, linestyles='--', zorder=5)

ax2.set_xlabel('Frequency (kHz)', fontsize=12, fontweight='bold')
ax2.set_ylabel('Duty Cycle (%)', fontsize=12, fontweight='bold')
ax2.set_title(f'DE-CONFOUNDED: Predicted efficiency at Ipri = {med_ipri:.1f}A\n'
              f'(controlling for current, shows TRUE freq+duty effect)',
              fontsize=13, fontweight='bold')
ax2.grid(True, alpha=0.25, linestyle='--')
ax2.set_xlim(10, 52)
ax2.set_ylim(-2, 105)

cbar2 = fig.colorbar(cf2, ax=ax2, shrink=0.82, pad=0.02)
cbar2.set_label('Predicted Efficiency (%)', fontsize=11, fontweight='bold')

# Legend
leg2 = [
    Line2D([0],[0], color='#CC0000', lw=3.5, label='>=88% boundary'),
    Line2D([0],[0], color='#880000', lw=2.5, ls='--', label='>=92% boundary'),
]
ax2.legend(handles=leg2, loc='lower right', fontsize=9, framealpha=0.85)

# Annotation on right plot
ax2.annotate(f'TRUE high-eff zone\n(both high freq & high duty\nare efficient at equal current)',
             xy=(32, 70), fontsize=10, fontweight='bold', color='#990000',
             ha='center', va='center',
             bbox=dict(boxstyle='round,pad=0.6', facecolor='#FFEEEE',
                      edgecolor='#CC0000', alpha=0.9))

plt.tight_layout()
outpath = os.path.join(HERE, "fig_eff_heatmap_zones_v2.png")
fig.savefig(outpath, dpi=180, bbox_inches='tight', facecolor='white')
print(f"Saved: {outpath}")
print(f"Left: Raw data, red hull = eff>=88%, green hull = eff>=95%")
print(f"Right: Predicted eff at Ipri={med_ipri:.1f}A (de-confounded)")

# ── Text summary of zones ──
print(f"\n=== HIGH-EFFICIENCY ZONE BOUNDARIES (from regression at Ipri={med_ipri:.1f}A) ===")
for threshold in [88, 85, 82]:
    # Find freq range where predicted eff >= threshold across some duty range
    for f_test in [15, 20, 25, 30, 35, 40, 45, 50]:
        e_at_f = b0 + bf*f_test + bd*np.arange(0, 105) + bi*med_ipri
        duty_above = np.arange(0, 105)[e_at_f >= threshold]
        if len(duty_above) >= 2:
            print(f"  At {f_test:2.0f}kHz: eff >= {threshold}% when duty in [{duty_above[0]:.0f}%, {duty_above[-1]:.0f}%]")

plt.close()

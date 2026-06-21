# -*- coding: utf-8 -*-
"""Confounding Variable Analysis: Efficiency vs Current
PSFB 24V->HV, 100:1 turns ratio, fixed resistive load ~4.9kOhm.
Pure numpy implementation (avoid scipy DLL issues).
"""

import re, os, math
import numpy as np

# ─── Paths ───
HERE = os.path.dirname(os.path.abspath(__file__))
SRC  = os.path.join(HERE, "..", "效率测试.txt")

# ─── Pure-numpy statistics ───────────────────────────────────

def _betainc(a, b, x):
    """Regularized incomplete beta function I_x(a,b)."""
    if x < 0 or x > 1:
        return np.nan
    if x == 0 or x == 1:
        return x
    front = math.exp(math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b)
                     + a * math.log(x) + b * math.log(1 - x))
    f = 1.0; c = 1.0; d = 1.0 - (a + b) * x / (a + 1)
    if abs(d) < 1e-30: d = 1e-30
    d = 1.0 / d; h = d
    for m in range(1, 200):
        m2 = 2 * m
        aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2))
        d = 1.0 + aa * d
        if abs(d) < 1e-30: d = 1e-30
        c = 1.0 + aa / c
        if abs(c) < 1e-30: c = 1e-30
        d = 1.0 / d; h *= d * c
        aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1))
        d = 1.0 + aa * d
        if abs(d) < 1e-30: d = 1e-30
        c = 1.0 + aa / c
        if abs(c) < 1e-30: c = 1e-30
        d = 1.0 / d; delta = d * c; h *= delta
        if abs(delta - 1.0) < 1e-12:
            break
    return front * h

def _t_sf(t, df):
    """Student t survival function."""
    x = df / (df + t * t)
    return 0.5 * _betainc(df/2, 0.5, x) if t >= 0 else 1 - 0.5 * _betainc(df/2, 0.5, x)

def _f_sf(F, df1, df2):
    """F distribution survival function."""
    x = df2 / (df2 + df1 * F)
    return _betainc(df2/2, df1/2, x)

def pearsonr(x, y):
    """Pearson r and two-tailed p-value."""
    n = len(x)
    r = np.corrcoef(x, y)[0, 1]
    if abs(r) >= 1.0 - 1e-12:
        return r, 0.0
    t_stat = r * math.sqrt((n - 2) / (1 - r * r))
    p = 2 * _t_sf(abs(t_stat), n - 2)
    return r, min(p, 1.0)

def spearmanr(x, y):
    """Spearman rank correlation."""
    rx = np.argsort(np.argsort(x)).astype(float) + 1
    ry = np.argsort(np.argsort(y)).astype(float) + 1
    return pearsonr(rx, ry)

def partial_corr(y, x1, x2):
    """Partial correlation: rho(y, x1 | x2)."""
    X2 = np.column_stack([np.ones_like(x2), x2])
    beta_y = np.linalg.lstsq(X2, y, rcond=None)[0]
    resid_y = y - X2 @ beta_y
    beta_x = np.linalg.lstsq(X2, x1, rcond=None)[0]
    resid_x = x1 - X2 @ beta_x
    return pearsonr(resid_y, resid_x)

def ols(X, y):
    """OLS regression. Returns (coefs, R^2, y_pred)."""
    Xd = np.column_stack([np.ones(len(y)), X])
    coefs, ss_res, _, _ = np.linalg.lstsq(Xd, y, rcond=None)
    y_pred = Xd @ coefs
    ss_res = ss_res[0] if len(ss_res) > 0 else np.sum((y - y_pred)**2)
    ss_tot = np.sum((y - np.mean(y))**2)
    r2 = 1 - ss_res / ss_tot
    return coefs, r2, y_pred

def nested_f_test(y, X_small, X_large):
    """F-test: H0: extra variables in X_large have zero coefficients."""
    n = len(y)
    p_s, p_l = X_small.shape[1], X_large.shape[1]
    extra = p_l - p_s

    _, _, yp_f = ols(X_large, y)
    ssr_f = np.sum((y - yp_f)**2)

    _, _, yp_s = ols(X_small, y)
    ssr_s = np.sum((y - yp_s)**2)

    df1, df2 = extra, n - p_l - 1
    if ssr_f < 1e-15:
        return 1e10, 0.0, ssr_s, ssr_f
    F = ((ssr_s - ssr_f) / df1) / (ssr_f / df2)
    p = _f_sf(F, df1, df2)
    return F, p, ssr_s, ssr_f

# ─── Load data ─────────────────────────────────────────────────
rows = []
with open(SRC, encoding="utf-8") as fh:
    for line in fh:
        m = re.findall(
            r'f:\s*(\d+)Hz, duty:\s*([\d.]+)%, eff:\s*([\d.]+)%, '
            r'Ipri:\s*([\d.]+)A, Isec:\s*([\d.]+)mA, Vsec:\s*([\d.]+)V, '
            r'Vpri:\s*([\d.]+)V', line)
        if m:
            rows.append([float(x) for x in m[0]])

a = np.array(rows)
freq_hz, duty_pct, eff_pct, ipri, isec_ma, vsec, vpri = a.T
freq_khz = freq_hz / 1000.0
pout = vsec * isec_ma / 1000.0  # W
R_load = np.median(vsec / (isec_ma / 1000.0))
n = len(eff_pct)

print("=" * 78)
print("  Confounding Variable Analysis: Efficiency vs Current")
print("=" * 78)
print(f"  N = {n}, freq range: {freq_hz.min():.0f}-{freq_hz.max():.0f} Hz")
print(f"  Fixed load R = {R_load:.0f} Ohm")
print(f"  Vsec: {vsec.min():.0f}-{vsec.max():.0f} V, Ipri: {ipri.min():.3f}-{ipri.max():.3f} A")
print(f"  Efficiency: {eff_pct.min():.1f}%-{eff_pct.max():.1f}%")

# ══════════════════════════════════════════════════════════════
# 0. Structural constraint (design limitation)
# ══════════════════════════════════════════════════════════════
print("\n" + "=" * 78)
print("  0. STRUCTURAL CONSTRAINT of this experiment")
print("=" * 78)
print(f"""
  With a FIXED resistive load (~{R_load:.0f} Ohm), the following chain exists:

    (freq, duty) --> Vsec --> Isec = Vsec/R --> Pout = Vsec^2/R

  Implications:
  * Changing duty CYCLE necessarily changes OUTPUT POWER and INPUT CURRENT.
  * There is NO way to vary duty while holding Ipri/Pout constant in this setup.
  * If efficiency varies with power level (e.g., I^2*R conduction loss),
    then duty and current are MECHANICALLY COUPLED -- a true confound.

  HONEST answer: The experimental design itself prevents fully deconfounding
  the effects of duty/frequency from the effects of power/current level.
  Statistical analysis can QUANTIFY the coupling, but cannot BREAK it.

  The following analysis describes: how much coupling exists, whether
  current (Ipri) explains MORE of eff variance than freq/duty, and what
  remains after controlling for Ipri.
""")

# ══════════════════════════════════════════════════════════════
# 1. Correlation matrix
# ══════════════════════════════════════════════════════════════
print("=" * 78)
print("  1. Pearson correlation matrix")
print("=" * 78)

variables = {
    'freq_kHz':  freq_khz,  'duty_%': duty_pct,  'eff_%': eff_pct,
    'Ipri_A':    ipri,      'Isec_mA': isec_ma,  'Vsec_V': vsec, 'Pout_W': pout,
}
vnames = list(variables.keys())

print(f"\n{'':>12s}", end="")
for vn in vnames:
    print(f"{vn:>9s}", end="")
print()
for vi in vnames:
    print(f"{vi:>12s}", end="")
    for vj in vnames:
        r, _ = pearsonr(variables[vi], variables[vj])
        print(f"{r:9.3f}", end="")
    print()

# ══════════════════════════════════════════════════════════════
# 2. Hypothesis tests: eff vs key variables
# ══════════════════════════════════════════════════════════════
print("\n" + "=" * 78)
print("  2. Hypothesis tests: H0: rho(eff, X) = 0 vs H1: rho != 0")
print("=" * 78)

tests = [
    ("eff vs Ipri_A",     eff_pct, ipri),
    ("eff vs Isec_mA",    eff_pct, isec_ma),
    ("eff vs Pout_W",     eff_pct, pout),
    ("eff vs Vsec_V",     eff_pct, vsec),
    ("eff vs freq_kHz",   eff_pct, freq_khz),
    ("eff vs duty_%",     eff_pct, duty_pct),
]

print(f"\n{'Pair':<24s} {'Pearson r':>10s} {'p-val':>12s} {'Signif?':>8s} {'Spearman rho':>12s} {'p-val':>12s} {'Signif?':>8s}")
print("-" * 96)
for label, x, y in tests:
    r, p_r = pearsonr(x, y)
    s, p_s = spearmanr(x, y)
    sig_r = "<< p<0.001" if p_r < 0.001 else ("* p<0.05" if p_r < 0.05 else "NS")
    sig_s = "<< p<0.001" if p_s < 0.001 else ("* p<0.05" if p_s < 0.05 else "NS")
    print(f"{label:<24s} {r:10.4f} {p_r:12.4e} {sig_r:>8s} {s:12.4f} {p_s:12.4e} {sig_s:>8s}")

# ══════════════════════════════════════════════════════════════
# 3. Stratified by frequency: group-internal eff vs Ipri
# ══════════════════════════════════════════════════════════════
print("\n" + "=" * 78)
print("  3. Stratified: within each fixed frequency, eff vs Ipri corr")
print("     If freq is the confound source, this correlation should vanish")
print("=" * 78)

freqs_u = np.array(sorted(set(freq_hz)))
print(f"\n{'freq_kHz':>8s} {'n':>4s} {'Pearson r':>10s} {'p':>10s} {'Spearman rho':>12s} {'p':>10s} {'verdict':>10s}")
print("-" * 76)
sig_pos = sig_neg = ns = 0
for fv in freqs_u:
    mask = freq_hz == fv
    n_pts = mask.sum()
    if n_pts < 5:
        continue
    r_f, p_f = pearsonr(eff_pct[mask], ipri[mask])
    s_f, p_sf = spearmanr(eff_pct[mask], ipri[mask])
    if r_f > 0 and p_f < 0.05:
        verdict = "SIG_POS"; sig_pos += 1
    elif r_f < 0 and p_f < 0.05:
        verdict = "SIG_NEG"; sig_neg += 1
    else:
        verdict = "NS"; ns += 1
    print(f"{fv/1000:8.1f} {n_pts:4d} {r_f:10.4f} {p_f:10.4f} {s_f:12.4f} {p_sf:10.4f} {verdict:>10s}")

print(f"\n  Within-freq summary: {sig_pos} pos, {sig_neg} neg, {ns} not significant")
print(f"  --> After fixing frequency, eff-vs-Ipri correlation "
      + ("PERSISTS in many groups" if sig_pos + sig_neg > ns / 2 else "LARGELY WEAKENED"))

# ══════════════════════════════════════════════════════════════
# 4. Partial correlation
# ══════════════════════════════════════════════════════════════
print("\n" + "=" * 78)
print("  4. Partial correlation: controlling for Ipri / Pout")
print("     --> If r_partial << r_raw, current absorbed the explanatory power")
print("=" * 78)

print(f"\n{'Analysis':<50s} {'r':>10s} {'p-val':>12s} {'note':>15s}")
print("-" * 82)

r1, p1 = pearsonr(eff_pct, freq_khz)
rp1, pp1 = partial_corr(eff_pct, freq_khz, ipri)
print(f"{'eff vs freq (raw)':<50s} {r1:10.4f} {p1:12.4e} {'raw':>15s}")
print(f"{'eff vs freq | Ipri':<50s} {rp1:10.4f} {pp1:12.4e} {'partial':>15s}")

r2, p2 = pearsonr(eff_pct, duty_pct)
rp2, pp2 = partial_corr(eff_pct, duty_pct, ipri)
print(f"\n{'eff vs duty (raw)':<50s} {r2:10.4f} {p2:12.4e} {'raw':>15s}")
print(f"{'eff vs duty | Ipri':<50s} {rp2:10.4f} {pp2:12.4e} {'partial':>15s}")

rp3, pp3 = partial_corr(eff_pct, freq_khz, pout)
print(f"\n{'eff vs freq | Pout':<50s} {rp3:10.4f} {pp3:12.4e} {'partial':>15s}")

rp4, pp4 = partial_corr(eff_pct, duty_pct, pout)
print(f"{'eff vs duty | Pout':<50s} {rp4:10.4f} {pp4:12.4e} {'partial':>15s}")

rp5, pp5 = partial_corr(eff_pct, ipri, freq_khz)
print(f"\n{'eff vs Ipri | freq':<50s} {rp5:10.4f} {pp5:12.4e} {'partial':>15s}")

# ══════════════════════════════════════════════════════════════
# 5. Stepwise regression
# ══════════════════════════════════════════════════════════════
print("\n" + "=" * 78)
print("  5. Stepwise regression: does adding Ipri change freq/duty coefs?")
print("     --> If coefs change dramatically, confounding exists")
print("=" * 78)

X_f        = np.column_stack([freq_khz])
X_fd       = np.column_stack([freq_khz, duty_pct])
X_fdi      = np.column_stack([freq_khz, duty_pct, ipri])
X_fdp      = np.column_stack([freq_khz, duty_pct, pout])
X_i        = np.column_stack([ipri])

models = [
    ("M1: freq",                        X_f,        ["freq"]),
    ("M2: freq + duty",                 X_fd,       ["freq", "duty"]),
    ("M3: freq + duty + Ipri",          X_fdi,      ["freq", "duty", "Ipri"]),
    ("M4: freq + duty + Pout",          X_fdp,      ["freq", "duty", "Pout"]),
    ("M5: Ipri only",                   X_i,        ["Ipri"]),
]

print(f"\n{'Model':<30s} {'R^2':>8s} ", end="")
for lbl in ["freq(kHz)", "duty(%)", "Ipri(A)", "Pout(W)"]:
    print(f"{lbl:>11s}", end="")
print()
print("-" * 94)

for label, X_m, pred_names in models:
    coefs, r2, _ = ols(X_m, eff_pct)
    print(f"{label:<30s} {r2:8.4f} ", end="")
    for nm in ["freq(kHz)", "duty(%)", "Ipri(A)", "Pout(W)"]:
        if nm in pred_names:
            idx = pred_names.index(nm)
            print(f"{coefs[idx + 1]:11.4f}", end="")
        else:
            print(f"{'--':>11s}", end="")
    print()

# ══════════════════════════════════════════════════════════════
# 6. Nested F-test
# ══════════════════════════════════════════════════════════════
print("\n" + "=" * 78)
print("  6. Nested F-test: does adding Ipri / Pout significantly improve fitness?")
print("     H0: coefficients of added variables = 0")
print("=" * 78)

# M2(freq+duty) --> M3(+Ipri)
F1, p1, ssr_s, ssr_f = nested_f_test(eff_pct, X_fd, X_fdi)
ss_tot = np.sum((eff_pct - np.mean(eff_pct))**2)
r2_s = 1 - ssr_s / ss_tot
r2_f = 1 - ssr_f / ss_tot
print(f"\n  M2(freq+duty) --> M3(+Ipri):")
print(f"    R^2(M2) = {r2_s:.4f},  R^2(M3) = {r2_f:.4f}")
print(f"    F = {F1:.2f},  p = {p1:.4e}")
if p1 < 0.001:
    print("    ==> Ipri EXTREMELY SIGNIFICANT improvement (p < 0.001)")
elif p1 < 0.05:
    print("    ==> Ipri SIGNIFICANT improvement (p < 0.05)")
else:
    print(f"    ==> Ipri NOT significant (p = {p1:.4f})")

# M2(freq+duty) --> M4(+Pout)
F2, p2, ssr_s2, ssr_f2 = nested_f_test(eff_pct, X_fd, X_fdp)
r2_s2 = 1 - ssr_s2 / ss_tot
r2_f2 = 1 - ssr_f2 / ss_tot
print(f"\n  M2(freq+duty) --> M4(+Pout):")
print(f"    R^2(M2) = {r2_s2:.4f},  R^2(M4) = {r2_f2:.4f}")
print(f"    F = {F2:.2f},  p = {p2:.4e}")
if p2 < 0.001:
    print("    ==> Pout EXTREMELY SIGNIFICANT improvement (p < 0.001)")
elif p2 < 0.05:
    print("    ==> Pout SIGNIFICANT improvement (p < 0.05)")
else:
    print(f"    ==> Pout NOT significant (p = {p2:.4f})")

# Compare: which single variable explains more?
_, r2_fonly, _ = ols(X_f, eff_pct)
_, r2_ionly, _ = ols(X_i, eff_pct)
print(f"\n  Single-variable comparison:")
print(f"    eff ~ freq     R^2 = {r2_fonly:.4f}")
print(f"    eff ~ Ipri     R^2 = {r2_ionly:.4f}")
print(f"    ==> {'Ipri' if r2_ionly > r2_fonly else 'freq'} has MORE standalone explanatory power")

# ══════════════════════════════════════════════════════════════
# 7. Power-binned: fix power, see eff vs freq
# ══════════════════════════════════════════════════════════════
print("\n" + "=" * 78)
print("  7. Fixed output power bins: eff vs freq (control current manually)")
print("=" * 78)

n_bins = 5
pout_bins = np.percentile(pout, np.linspace(0, 100, n_bins + 1))
pout_bins[-1] = pout.max() + 1

print(f"\n  {'Power range':>20s}  {'n':>5s} {'avg_eff':>8s} {'eff-freq r':>10s} {'p':>10s} {'eff-Ipri r':>10s} {'p':>10s}")
print("  " + "-" * 78)

for i in range(n_bins):
    mask = (pout >= pout_bins[i]) & (pout < pout_bins[i + 1])
    n_bin = mask.sum()
    if n_bin < 8:
        continue
    r_ef, p_ef = pearsonr(eff_pct[mask], freq_khz[mask])
    r_ei, p_ei = pearsonr(eff_pct[mask], ipri[mask])
    print(f"  {pout_bins[i]:7.1f} - {pout_bins[i+1]:7.1f} W  "
          f"{n_bin:5d} {eff_pct[mask].mean():7.1f}% {r_ef:10.3f} {p_ef:10.4f} {r_ei:10.3f} {p_ei:10.4f}")

# ══════════════════════════════════════════════════════════════
# 8. Final honest summary
# ══════════════════════════════════════════════════════════════
print("\n" + "=" * 78)
print("  8. FINAL HONEST SUMMARY")
print("=" * 78)

r_eff_ipri, p_eff_ipri = pearsonr(eff_pct, ipri)
r_eff_freq, p_eff_freq = pearsonr(eff_pct, freq_khz)
r_eff_duty, p_eff_duty = pearsonr(eff_pct, duty_pct)

ratio_freq = abs(rp1 / r1) if abs(r1) > 0.01 else 1.0
ratio_duty = abs(rp2 / r2) if abs(r2) > 0.01 else 1.0

print(f"""
  [Q1] Is efficiency statistically correlated with current (Ipri)?

    eff vs Ipri:  Pearson r = {r_eff_ipri:+.4f},  p = {p_eff_ipri:.2e}
    --> {'YES, highly significant (p<0.001)' if p_eff_ipri < 0.001 else 'YES, significant (p<0.05)' if p_eff_ipri < 0.05 else 'NO significant correlation'}

  [Q2] Is Ipri a confounding variable for eff vs freq/duty?

    Partial correlation (controlling for Ipri):
      eff vs freq:  r_raw = {r1:+.4f}  -->  r_partial = {rp1:+.4f}  (retains {ratio_freq*100:.0f}%)
      eff vs duty:  r_raw = {r2:+.4f}  -->  r_partial = {rp2:+.4f}  (retains {ratio_duty*100:.0f}%)

    Regression R^2:
      freq + duty:            R^2 = {r2_s:.4f}
      freq + duty + Ipri:     R^2 = {r2_f:.4f}
      Ipri alone:             R^2 = {r2_ionly:.4f}
      freq alone:             R^2 = {r2_fonly:.4f}

    F-test (adding Ipri):  F = {F1:.1f},  p = {p1:.2e}
""")

# ─── Final verdict ───
print("  " + "=" * 74)
print("  VERDICT")
print("  " + "=" * 74)

if p1 < 0.001 and r2_ionly > r2_fonly:
    print("""
  YES -- Ipri/current IS a strong confounding variable.

  REASON:
  1. With fixed resistive load (R = {R:.0f} Ohm), Vsec = Isec * R.
     When duty increases, Vsec increases, so Isec and Pout MUST increase.
     This means duty <--> Ipri are mechanically coupled. You cannot vary
     one without varying the other in this experimental setup.

  2. The F-test (p = {pval:.2e}) strongly confirms that adding Ipri to
     the regression model significantly improves fit beyond freq+duty alone.

  3. Ipri alone explains MORE variance in efficiency (R^2 = {r2i:.4f})
     than frequency alone (R^2 = {r2f:.4f}).

  4. PHYSICAL INTERPRETATION:
     At higher Ipri (higher output power), conduction losses (I^2*R_loss)
     become a smaller fraction of total power, because the fixed losses
     (magnetizing, control circuitry) are amortized over more output.
     This makes efficiency APPEAR higher at higher duty/current -- but
     this is a POWER-LEVEL effect, not purely a duty/freq effect.

  WHAT THIS MEANS FOR YOUR CONCLUSIONS:
  * "Lower frequency is more efficient" -- may be partially because lower
    frequency allows higher duty -> higher power -> better utilization.
  * "Higher frequency loses efficiency" -- may be partially because the
    power level is lower (current is lower), not just because of switching
    losses at higher frequency.

  HOW TO FIX:
  * Use an ELECTRONIC LOAD in constant-power (CP) mode.
  * Run experiments at identical Pout for different (freq, duty) combos.
  * This would isolate the true effect of freq/duty on efficiency.
""".format(R=R_load, pval=p1, r2i=r2_ionly, r2f=r2_fonly))
elif abs(r_eff_ipri) > 0.3 and p_eff_ipri < 0.001:
    print(f"""
  YES -- Ipri/current is correlated with efficiency (r = {r_eff_ipri:.3f}),
  but the degree of confounding is moderate. After controlling for Ipri,
  freq/duty still retain some explanatory power. See the partial
  correlations above for specific numbers.

  The fixed-load design still couples duty to Ipri, but the coupling may
  not be the FULL story. There may be genuine freq/duty effects beyond
  the current/power-level effect.
""")
else:
    print(f"""
  NO -- Ipri/current does NOT appear to be a strong confound.
  Efficiency seems to vary with freq/duty independently of Ipri.
  The fixed-load coupling exists theoretically but is not dominating
  the efficiency signal in this dataset.
""")

print("=" * 78)
print("  Analysis complete.")
print("=" * 78)

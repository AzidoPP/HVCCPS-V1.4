# -*- coding: utf-8 -*-
"""
Targeted statistics for three questions:
  Q1) Is eff(80-90% duty) > eff(100% duty) real or measurement noise?
  Q2) Is there a per-frequency duty sweet-spot (~80-90%)? Duty-angle view.
  Q3) Same output via higher-freq+higher-duty vs lower-freq+lower-duty:
      does the "raise frequency" advantage keep helping up to 50kHz+?
PSFB 24V->HV, 100:1, fixed resistive load (~4.9k). eff = Vsec*Isec/(Vpri*Ipri).
Ipri from ACS712 on 8-bit ADC -> ~0.129 A/LSB  (dominant noise, it's in denom).
"""
import re, os
import numpy as np
from scipy import stats

HERE = os.path.dirname(os.path.abspath(__file__))
SRC  = os.path.join(HERE, "..", "效率测试.txt")
LSB_A = 3.3/256/0.100                 # 0.1289 A/LSB
SIG_Q = LSB_A/np.sqrt(12)             # std of one uniform LSB = 0.0372 A

rows=[]
for line in open(SRC, encoding="utf-8"):
    m=re.findall(r'f:\s*(\d+)Hz, duty:\s*([\d.]+)%, eff:\s*([\d.]+)%, '
                 r'Ipri:\s*([\d.]+)A, Isec:\s*([\d.]+)mA, Vsec:\s*([\d.]+)V, '
                 r'Vpri:\s*([\d.]+)V', line)
    if m: rows.append([float(x) for x in m[0]])
a=np.array(rows)
f,duty,eff,ipri,isec,vsec,vpri=a.T
fk=f/1000.0
pout=vsec*isec/1000.0
R   = np.median(vsec/(isec/1000.0))
freqs=np.array(sorted(set(f)))

print("="*72)
print("DATA: %d points, %d frequencies %s"%(len(a),len(freqs),
      ",".join("%gk"%x for x in freqs/1000)))
print("Load R = median(Vsec/Isec) = %.0f ohm  (Pout=Vsec^2/R)"%R)
print("="*72)

# ---------------------------------------------------------------------------
# NOISE FLOOR.  eff ~ Vsec^2/(R*Vpri*Ipri)  => relative noise from Ipri 8-bit:
#   sigma_eff/eff = SIG_Q/Ipri
print("\n[NOISE] quantization-limited 1-sigma on eff (from Ipri 8-bit):")
for ip in (0.5,1.0,1.5,2.0,3.0):
    print("   Ipri=%4.1fA -> sigma_eff ~ %.1f%% of reading"%(ip,100*SIG_Q/ip))

# empirical repeatability from exact replicate (freq,duty) groups
print("\n[NOISE] empirical std within replicate (freq,duty) groups:")
reps=[]
seen={}
for i in range(len(a)):
    key=(f[i],duty[i])
    seen.setdefault(key,[]).append(eff[i])
for key,v in seen.items():
    if len(v)>=3:
        ipg=np.mean([ipri[j] for j in range(len(a)) if f[j]==key[0] and duty[j]==key[1]])
        reps.append((key[0]/1000,key[1],len(v),np.std(v,ddof=1),ipg))
reps.sort()
print("   freq  duty  n   std(eff)  meanIpri   predicted_sigma")
for fr,du,n,sd,ipg in reps:
    print("   %4.0fk %4.0f%% %2d   %5.2f%%    %5.2fA    %5.2f%%"%(
        fr,du,n,sd,ipg,100*SIG_Q/ipg))

# ---------------------------------------------------------------------------
# Q1: paired across frequency  mean eff(80-90 duty) vs mean eff(100 duty)
print("\n"+"="*72)
print("Q1  80-90%% duty  vs  100%% duty   (paired within each frequency)")
print("="*72)
lo,hi=80,90
print(" freq   n8090 mean8090  n100 mean100   delta   (mean Ipri@100)")
d8090=[]; d100=[]; deltas=[]; fused=[]
for fv in freqs:
    s=f==fv
    m1=s&(duty>=lo)&(duty<=hi)
    m2=s&(duty>=99)
    if m1.sum()>=1 and m2.sum()>=1:
        e1=eff[m1].mean(); e2=eff[m2].mean(); dl=e1-e2
        d8090.append(e1); d100.append(e2); deltas.append(dl); fused.append(fv/1000)
        print("  %4.0fk   %2d   %6.2f%%   %2d  %6.2f%%  %+6.2f%%   (%.2fA)"%(
            fv/1000,m1.sum(),e1,m2.sum(),e2,dl,ipri[m2].mean()))
deltas=np.array(deltas)
print("\n  paired frequencies n=%d   mean delta=%+.2f%%  median=%+.2f%%"%(
    len(deltas),deltas.mean(),np.median(deltas)))
t,p_t=stats.ttest_rel(d8090,d100)
print("  paired t-test (two-sided): t=%.2f  p=%.4f  -> one-sided p=%.4f"%(
    t,p_t,p_t/2 if t>0 else 1-p_t/2))
try:
    w,p_w=stats.wilcoxon(deltas,alternative='greater')
    print("  Wilcoxon signed-rank (H1: delta>0): W=%.1f  p=%.4f"%(w,p_w))
except Exception as e:
    print("  Wilcoxon: ",e)
npos=(deltas>0).sum(); nneg=(deltas<0).sum()
p_sign=stats.binomtest(npos,npos+nneg,0.5,alternative='greater').pvalue
print("  sign test: %d up / %d down  one-sided p=%.4f"%(npos,nneg,p_sign))

# pooled (all individual points), removing frequency mean as block
print("\n  pooled per-point (block = subtract each freq's grand mean):")
allres=[]; alllab=[]
for fv in freqs:
    s=f==fv
    m1=s&(duty>=lo)&(duty<=hi); m2=s&(duty>=99)
    if m1.sum()>=1 and m2.sum()>=1:
        gm=np.concatenate([eff[m1],eff[m2]]).mean()
        allres+=list(eff[m1]-gm); alllab+=[1]*m1.sum()
        allres+=list(eff[m2]-gm); alllab+=[0]*m2.sum()
allres=np.array(allres); alllab=np.array(alllab)
g1=allres[alllab==1]; g0=allres[alllab==0]
t2,p2=stats.ttest_ind(g1,g0,equal_var=False)
print("    n(80-90)=%d  n(100)=%d   meandiff=%+.2f%%  Welch t=%.2f p=%.4f (1-sided %.4f)"%(
    len(g1),len(g0),g1.mean()-g0.mean(),t2,p2,p2/2 if t2>0 else 1-p2/2))

# ---------------------------------------------------------------------------
# Q2: per-frequency efficiency-vs-duty hump; locate peak duty (reliable pts)
print("\n"+"="*72)
print("Q2  per-frequency efficiency-vs-duty hump  (reliable Ipri>=0.8A)")
print("="*72)
print(" freq   nRel  best-meas: duty/eff/Vsec     quad-fit peak duty   eff@100  (peak-100)")
for fv in freqs:
    s=(f==fv)&(ipri>=0.8)
    if s.sum()<4 or np.ptp(duty[s])<25:
        continue
    du=duty[s]; ef=eff[s]
    c=np.polyfit(du,ef,2)
    dpk=-c[1]/(2*c[0]) if c[0]<0 else np.nan
    ds=np.linspace(du.min(),du.max(),200); es=np.polyval(c,ds)
    ipk=int(np.argmax(es))
    bm=int(np.argmax(ef))
    s100=(f==fv)&(duty>=99)
    e100=eff[s100].mean() if s100.any() else np.nan
    print("  %4.0fk   %2d   d=%3.0f%% e=%5.1f%% V=%4.0f   fit-peak d=%4.0f%% e=%5.1f%%   %5.1f%%  %+5.1f%%"%(
        fv/1000,s.sum(),du[bm],ef[bm],vsec[s][bm],ds[ipk],es[ipk],
        e100, (es[ipk]-e100) if not np.isnan(e100) else np.nan))

# ---------------------------------------------------------------------------
# Q3: same output voltage, eff vs frequency -> is there an optimum freq?
print("\n"+"="*72)
print("Q3  fixed output Vsec window: efficiency vs frequency (find optimum)")
print("="*72)
for Vt,half in [(170,12),(225,12),(285,12),(340,14),(450,16)]:
    sel=(vsec>=Vt-half)&(vsec<=Vt+half)
    if sel.sum()==0: continue
    print("\n  Vsec ~ %dV (+-%d)  ->  Pout ~ %.1f W :"%(Vt,half,Vt**2/R))
    order=np.argsort(fk[sel])
    ff=fk[sel][order]; ee=eff[sel][order]; dd=duty[sel][order]
    vv=vsec[sel][order]; ii=ipri[sel][order]
    best=None
    for fr in sorted(set(ff)):
        mm=ff==fr
        em=ee[mm].mean(); dm=dd[mm].mean()
        # max attainable Vsec at this freq (100% duty) to show load fraction
        s100=(np.abs(fk-fr)<1e-6)&(duty>=99)
        vmax=vsec[s100].mean() if s100.any() else np.nan
        lf=(Vt/vmax) if vmax==vmax else np.nan
        tag=""
        if best is None or em>best[1]: best=(fr,em)
        print("     f=%4.1fk  duty~%3.0f%%  eff=%5.1f%%  (Vmax@100%%=%4.0fV, V/Vmax=%s)"%(
            fr,dm,em,vmax,("%.2f"%lf if lf==lf else " n/a")))
    print("     -> best efficiency at f=%.1fk (%.1f%%)"%best)
print("\ndone.")

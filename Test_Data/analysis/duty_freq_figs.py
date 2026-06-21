# -*- coding: utf-8 -*-
"""Two figures: (A) eff-vs-duty hump per frequency w/ 100% markers;
(B) eff-vs-frequency at fixed Vsec windows (optimum-frequency ridge)."""
import re, os
import numpy as np
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import cm

HERE=os.path.dirname(os.path.abspath(__file__))
SRC=os.path.join(HERE,"..","效率测试.txt")
rows=[]
for line in open(SRC,encoding="utf-8"):
    m=re.findall(r'f:\s*(\d+)Hz, duty:\s*([\d.]+)%, eff:\s*([\d.]+)%, '
                 r'Ipri:\s*([\d.]+)A, Isec:\s*([\d.]+)mA, Vsec:\s*([\d.]+)V, '
                 r'Vpri:\s*([\d.]+)V',line)
    if m: rows.append([float(x) for x in m[0]])
a=np.array(rows); f,duty,eff,ipri,isec,vsec,vpri=a.T; fk=f/1000.0
R=np.median(vsec/(isec/1000.0))

# ---- FIG A: eff vs duty, dense freqs, hump + 100% markers ----
dense=[28000,32000,36000,40000,45000,50000]
fig,ax=plt.subplots(figsize=(9.5,6))
cols=cm.viridis(np.linspace(0,.9,len(dense)))
for fv,c in zip(dense,cols):
    s=f==fv
    du=duty[s]; ef=eff[s]; o=np.argsort(du); du,ef=du[o],ef[o]
    ax.plot(du,ef,'o',color=c,ms=4,alpha=.6)
    r=(ipri[s]>=0.8)  # reliable for the fit
    if r.sum()>=4:
        cc=np.polyfit(du[np.argsort(duty[s])][:0] if False else duty[s][r],
                      eff[s][r],2)
        xs=np.linspace(duty[s][r].min(),duty[s][r].max(),120)
        ax.plot(xs,np.polyval(cc,xs),'-',color=c,lw=2,label='%gkHz'%(fv/1000))
    s100=s&(duty>=99)
    if s100.any():
        ax.plot(duty[s100],eff[s100],'*',color=c,ms=16,mec='k',mew=.6)
ax.axvspan(80,90,color='orange',alpha=.12)
ax.text(85,96.5,'80-90%\nband',ha='center',fontsize=8,color='darkorange')
ax.set_xlabel('Duty [%]  (= load fraction at fixed freq; higher duty -> higher Vsec/power)')
ax.set_ylabel('Efficiency [%]')
ax.set_title('Q1/Q2: efficiency-vs-duty HUMP per frequency\n'
             'stars = 100% duty (full power).  Peak sits BELOW 100% for 28-45kHz; '
             '50kHz peak pushed to ~92%')
ax.set_ylim(60,98); ax.grid(alpha=.3); ax.legend(title='switching freq',ncol=2)
fig.tight_layout(); fig.savefig(os.path.join(HERE,'figA_duty_hump.png'),dpi=130)
plt.close(fig)

# ---- FIG B: eff vs frequency at fixed Vsec windows ----
fig,ax=plt.subplots(figsize=(9.5,6))
targets=[(170,12),(225,12),(285,12),(340,14),(450,16)]
cols=cm.plasma(np.linspace(.1,.85,len(targets)))
for (Vt,half),c in zip(targets,cols):
    sel=(vsec>=Vt-half)&(vsec<=Vt+half)
    if sel.sum()==0: continue
    fr=fk[sel]; ef=eff[sel]
    xs=[]; ys=[]
    for u in sorted(set(fr)):
        mm=fr==u; xs.append(u); ys.append(ef[mm].mean())
    ax.plot(xs,ys,'-o',color=c,lw=2,ms=5,
            label='Vsec~%dV (%.0fW)'%(Vt,Vt**2/R))
    i=int(np.argmax(ys))
    ax.plot(xs[i],ys[i],'*',color=c,ms=18,mec='k',mew=.6)
ax.set_xlabel('Switching frequency [kHz]')
ax.set_ylabel('Efficiency [%]')
ax.set_title('Q3: same output, efficiency vs frequency  (star = optimum)\n'
             'raising freq helps until ~45kHz for <=285V, then REVERSES at 50kHz;\n'
             'optimum freq slides DOWN as required output rises')
ax.grid(alpha=.3); ax.legend(title='fixed output')
fig.tight_layout(); fig.savefig(os.path.join(HERE,'figB_freq_optimum.png'),dpi=130)
plt.close(fig)
print("wrote figA_duty_hump.png  figB_freq_optimum.png  (R=%.0f ohm)"%R)

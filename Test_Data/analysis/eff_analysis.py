# -*- coding: utf-8 -*-
"""HVCCPS efficiency-vs-frequency analysis.
Fixed ~4.9k load, PSFB 24V->HV (100:1). eff = Vsec*Isec/(Vpri*Ipri).
Primary current from ACS712 on 8-bit ADC -> ~0.129 A/LSB, so low-current
points are noisy. We weight by current and build a (freq, Vsec) eff map.
"""
import re, os, json
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import cm
from scipy.interpolate import griddata
from scipy.ndimage import gaussian_filter

HERE = os.path.dirname(os.path.abspath(__file__))
SRC  = os.path.join(HERE, "..", "test data", "效率测试.txt")
OUT  = HERE
LSB_A = 3.3/256/0.100   # ACS712 100mV/A on 8-bit over ~3.3V VCC

# ---- parse ----
rows=[]
for line in open(SRC, encoding="utf-8"):
    m=re.findall(r'f:\s*(\d+)Hz, duty:\s*([\d.]+)%, eff:\s*([\d.]+)%, '
                 r'Ipri:\s*([\d.]+)A, Isec:\s*([\d.]+)mA, Vsec:\s*([\d.]+)V, '
                 r'Vpri:\s*([\d.]+)V', line)
    if m: rows.append([float(x) for x in m[0]])
a=np.array(rows)
f,duty,eff,ipri,isec,vsec,vpri=a.T
fk=f/1000.0
pin=vpri*ipri
pout=vsec*isec/1000.0
effc=pout/pin*100.0
# reliability: number of current LSBs (relative current SNR)
nlsb=ipri/LSB_A
reliable = ipri>=0.8           # >=~6 LSB, <~17% quant error
freqs=np.array(sorted(set(f)))

# ---------------------------------------------------------------------------
# per-frequency weighted quadratic fit eff(Vsec), weight = ipri (current SNR)
# returns fitted peak (eff*, Vsec*) within tested Vsec range
def fit_freq(fval):
    s=f==fval
    x=vsec[s]; y=effc[s]; w=ipri[s]
    order=np.argsort(x)
    x,y,w=x[order],y[order],w[order]
    out=dict(fk=fval/1000.0, n=int(s.sum()), x=x, y=y, w=w,
             nrel=int((ipri[s]>=0.8).sum()))
    if len(x)>=4 and x.ptp()>30:
        c=np.polyfit(x,y,2,w=w)
        out['coef']=c
        xs=np.linspace(x.min(),x.max(),200)
        ys=np.polyval(c,xs)
        i=int(np.argmax(ys))
        out['vstar']=xs[i]; out['estar']=ys[i]; out['xs']=xs; out['ys']=ys
    else:
        # too few/narrow: use best reliable measured point
        m=ipri[s]>=0.6
        if m.sum()==0: m=np.ones_like(x,bool)
        i=int(np.argmax(y[m]))
        out['vstar']=x[m][i]; out['estar']=y[m][i]
    return out

fits=[fit_freq(fv) for fv in freqs]

print("freq  n  nRel   eff*(fit)  @Vsec*   Pout*@peak   maxMeasEff(rel)")
for ft in fits:
    s=f==(ft['fk']*1000)
    rel=ipri[s]>=0.8
    mm = effc[s][rel].max() if rel.any() else float('nan')
    pstar=ft['vstar']**2/4885.0
    print("%4.0fk %3d  %3d   %6.1f%%   %5.0fV   %5.1fW       %6.1f%%"%(
        ft['fk'], ft['n'], ft['nrel'], ft['estar'], ft['vstar'], pstar, mm))

# ---------------------------------------------------------------------------
# FIG 1: master scatter freq vs Vsec, color=eff, size~reliability
fig,ax=plt.subplots(figsize=(9,6))
sz=20+120*np.clip(nlsb/16,0,1)
sc=ax.scatter(fk,vsec,c=effc,s=sz,cmap='viridis',vmin=55,vmax=95,
              edgecolor='k',linewidth=.3)
cb=plt.colorbar(sc); cb.set_label('Efficiency  Pout/Pin  [%]')
# ridge: vstar per freq
rf=[ft['fk'] for ft in fits]; rv=[ft['vstar'] for ft in fits]
ax.plot(rf,rv,'r-o',lw=2,ms=4,label='peak-eff ridge (per-freq fit)')
ax.set_xlabel('Switching frequency [kHz]')
ax.set_ylabel('Output voltage Vsec [V]   (Pout = Vsec$^2$/4.9k)')
ax.set_title('Efficiency map  —  marker size ∝ primary-current SNR (big = reliable)')
ax.legend(loc='upper right'); ax.grid(alpha=.3)
# secondary right axis: power
def v2p(v): return v**2/4885.0
ax2=ax.secondary_yaxis('right',functions=(lambda v:v**2/4885.0, lambda p:np.sqrt(p*4885.0)))
ax2.set_ylabel('Output power [W]')
fig.tight_layout(); fig.savefig(os.path.join(OUT,'fig1_eff_map.png'),dpi=130)
plt.close(fig)

# ---------------------------------------------------------------------------
# FIG 2: iso-Vsec efficiency vs frequency (from per-freq fits)
targets=[200,300,400,450,500]
fig,ax=plt.subplots(figsize=(9,6))
colors=cm.plasma(np.linspace(.1,.85,len(targets)))
for tv,col in zip(targets,colors):
    xs=[];ys=[]
    for ft in fits:
        if 'coef' in ft and ft['x'].min()-15<=tv<=ft['x'].max()+15:
            xs.append(ft['fk']); ys.append(np.polyval(ft['coef'],tv))
    if len(xs)>=3:
        ax.plot(xs,ys,'-o',color=col,label='Vsec=%dV  (%.0fW)'%(tv,tv**2/4885.0))
ax.set_xlabel('Switching frequency [kHz]')
ax.set_ylabel('Efficiency [%]')
ax.set_title('Efficiency vs frequency at fixed output (iso-Vsec / iso-power)\n'
             'higher output → optimum frequency shifts lower')
ax.legend(); ax.grid(alpha=.3)
fig.tight_layout(); fig.savefig(os.path.join(OUT,'fig2_iso_vsec.png'),dpi=130)
plt.close(fig)

# ---------------------------------------------------------------------------
# FIG 3: per-frequency reliable-efficiency envelope
fig,ax=plt.subplots(figsize=(9,6))
fx=[];emax=[];e90=[]
for ft in fits:
    s=(f==ft['fk']*1000)&(ipri>=0.8)
    if s.sum()>=1:
        fx.append(ft['fk']); emax.append(effc[s].max())
        e90.append(np.percentile(effc[s],75))
ax.plot(fx,emax,'-o',color='tab:green',label='best reliable point (Ipri≥0.8A)')
ax.plot(fx,e90,'--s',color='tab:blue',label='75th-pct reliable')
fitf=[ft['fk'] for ft in fits]; fite=[ft['estar'] for ft in fits]
ax.plot(fitf,fite,':^',color='tab:red',label='fitted peak of eff(Vsec)')
ax.set_xlabel('Switching frequency [kHz]'); ax.set_ylabel('Efficiency [%]')
ax.set_title('Per-frequency achievable efficiency (reliable points only)')
ax.legend(); ax.grid(alpha=.3); ax.set_ylim(75,97)
fig.tight_layout(); fig.savefig(os.path.join(OUT,'fig3_envelope.png'),dpi=130)
plt.close(fig)

# ---------------------------------------------------------------------------
# FIG 4: eff vs output power colored by frequency
fig,ax=plt.subplots(figsize=(9,6))
sc=ax.scatter(pout,effc,c=fk,s=sz,cmap='turbo',edgecolor='k',linewidth=.3)
cb=plt.colorbar(sc); cb.set_label('Frequency [kHz]')
ax.set_xlabel('Output power [W]'); ax.set_ylabel('Efficiency [%]')
ax.set_title('Efficiency vs output power (color = frequency)\n'
             'high-power region is only reachable at low freq, and is most efficient')
ax.grid(alpha=.3)
fig.tight_layout(); fig.savefig(os.path.join(OUT,'fig4_eff_vs_power.png'),dpi=130)
plt.close(fig)

# ---------------------------------------------------------------------------
# FIG 5: smoothed interpolated surface (freq, Vsec)->eff, contourf + ridge
gf=np.linspace(fk.min(),fk.max(),120)
gv=np.linspace(vsec.min(),vsec.max(),120)
GF,GV=np.meshgrid(gf,gv)
GE=griddata((fk,vsec),effc,(GF,GV),method='linear')
mask=np.isnan(GE)
GEf=np.where(mask,np.nanmean(effc),GE)
GEs=gaussian_filter(GEf,sigma=2.5)
GEs=np.where(mask,np.nan,GEs)
fig,ax=plt.subplots(figsize=(9,6))
cf=ax.contourf(GF,GV,GEs,levels=np.linspace(60,94,18),cmap='viridis',extend='both')
cb=plt.colorbar(cf); cb.set_label('Efficiency [%] (smoothed)')
cs=ax.contour(GF,GV,GEs,levels=[80,85,88,90,92],colors='w',linewidths=.7)
ax.clabel(cs,fmt='%d',fontsize=8)
ax.plot(rf,rv,'r-o',lw=2,ms=4,label='peak-eff ridge')
ax.scatter(fk,vsec,c='k',s=6,alpha=.4)
ax.set_xlabel('Switching frequency [kHz]')
ax.set_ylabel('Output voltage Vsec [V]')
ax.set_title('Smoothed efficiency surface — diagonal ridge\n'
             '(low V → high freq optimum; high V → low freq optimum)')
ax.legend(loc='upper right')
fig.tight_layout(); fig.savefig(os.path.join(OUT,'fig5_surface.png'),dpi=130)
plt.close(fig)

# ---------------------------------------------------------------------------
# interactive HTML 3D (plotly.js from CDN); embed raw points + smoothed mesh
pts=[{"x":round(float(a),1),"y":round(float(b),1),"z":round(float(c),2),
      "r":round(float(d),2)} for a,b,c,d in zip(fk,vsec,effc,ipri)]
# surface arrays (replace NaN with null for JSON)
def grid_json(M):
    return [[None if (isinstance(v,float) and np.isnan(v)) else round(float(v),2)
             for v in row] for row in M]
data=dict(pts=pts, gf=[round(float(v),2) for v in gf],
          gv=[round(float(v),1) for v in gv], ge=grid_json(GEs),
          ridge=dict(f=[round(float(v),1) for v in rf],
                     v=[round(float(v),1) for v in rv],
                     e=[round(float(ft['estar']),2) for ft in fits]))
html=r"""<!doctype html><html lang="zh"><head><meta charset="utf-8">
<title>HVCCPS 效率 3D 曲面</title>
<script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>
<style>body{font-family:Consolas,monospace;margin:0;background:#fff;color:#111}
#wrap{max-width:1100px;margin:0 auto;padding:16px}
h1{font-size:18px}.note{font-size:13px;color:#444;line-height:1.6}
#plot{width:100%;height:78vh}</style></head><body><div id="wrap">
<h1>HVCCPS V1.4 效率曲面 &nbsp;eff = Vsec·Isec / (Vpri·Ipri)，固定 ~4.9k 负载</h1>
<p class="note">轴：X=开关频率(kHz)，Y=输出电压 Vsec(V，∝√功率)，Z=效率(%)。
散点=实测(点越大=原边电流越大越可信，ACS712 8-bit 量化 0.129A/LSB)。
彩色网格=平滑插值面。红线=每个频率效率最高点连成的“山脊”。
拖动旋转。</p>
<div id="plot"></div></div>
<script>
const D=%%DATA%%;
const big=D.pts.map(p=>4+9*Math.min(p.r/2.0,1));
const scatter={type:'scatter3d',mode:'markers',name:'实测点',
 x:D.pts.map(p=>p.x),y:D.pts.map(p=>p.y),z:D.pts.map(p=>p.z),
 marker:{size:big,color:D.pts.map(p=>p.z),colorscale:'Viridis',
  cmin:60,cmax:94,opacity:.85,line:{width:.5,color:'#222'}},
 text:D.pts.map(p=>`f=${p.x}k V=${p.y} eff=${p.z}% Ipri=${p.r}A`),
 hoverinfo:'text'};
const surf={type:'surface',name:'平滑面',x:D.gf,y:D.gv,z:D.ge,
 colorscale:'Viridis',cmin:60,cmax:94,opacity:.65,showscale:true,
 colorbar:{title:'eff %'},contours:{z:{show:true,usecolormap:true,
  highlightcolor:'#fff',project:{z:true}}}};
const ridge={type:'scatter3d',mode:'lines+markers',name:'效率山脊',
 x:D.ridge.f,y:D.ridge.v,z:D.ridge.e,
 line:{color:'red',width:6},marker:{size:4,color:'red'}};
Plotly.newPlot('plot',[surf,scatter,ridge],{
 margin:{l:0,r:0,t:0,b:0},
 scene:{xaxis:{title:'频率 f (kHz)'},yaxis:{title:'Vsec (V)'},
  zaxis:{title:'效率 (%)'},camera:{eye:{x:-1.6,y:-1.5,z:.8}}},
 legend:{x:0,y:1}});
</script></body></html>"""
html=html.replace("%%DATA%%", json.dumps(data))
open(os.path.join(OUT,"efficiency_3d.html"),"w",encoding="utf-8").write(html)
print("\nwrote: fig1_eff_map.png fig2_iso_vsec.png fig3_envelope.png "
      "fig4_eff_vs_power.png fig5_surface.png efficiency_3d.html")

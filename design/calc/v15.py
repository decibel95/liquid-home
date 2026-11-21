exec(open('ok.py').read().split("print('base'")[0])
import colorsys
def hsf(h): return tuple(round(v*255) for v in colorsys.hsv_to_rgb((h%360)/360,1,1))
K=[2000,2700,3500,4500,5500,6535]
H=list(range(0,361,15))
res={}
for g in ('dark','light'):
    ks=[hx(etone(ct(k),g)[0]) for k in K]
    hs_=[hx(etone(hsf(h),g)[0]) for h in H]
    res[g]=(ks,hs_)
    for name,stops,pos in (('kelvin',ks,[(k-2000)/4535 for k in K]),('hue',hs_,[h/360 for h in H])):
        cols=[rgb(s) for s in stops]
        mt=mb=99; wt=None
        for i in range(1001):
            t=i/1000
            for j in range(len(pos)-1):
                if pos[j]<=t<=pos[j+1]:
                    f=(t-pos[j])/(pos[j+1]-pos[j]); c=tuple(round(cols[j][q]+(cols[j+1][q]-cols[j][q])*f) for q in range(3)); break
            a=cr(c,TRACK[g]); b=cr(c,BASE[g])
            if a<mt: mt=a; wt=hx(c)
            mb=min(mb,b)
        print(g,name,'stops',stops,'min vs track',round(mt,2),wt,'min vs base',round(mb,2))
for g,e in (('dark',((235,240,248),.62)),('light',((16,20,27),.62))):
    o=comp(e[0],e[1],BASE[g]); print('swatch outline',g,hx(o),'vs base',round(cr(o,BASE[g]),2))
# preset fills vs base (raw)
for n,c in [('warm 2700',ct(2700)),('neutral 4000',ct(4000)),('cool 6500',ct(6500)),('#ff4070',(255,64,112)),('#ff7f7d',(255,127,125))]:
    print('preset',n,hx(c),'dark',round(cr(c,BASE['dark']),2),'light',round(cr(c,BASE['light']),2),
      'outline-vs-fill dark',round(cr(c,comp((235,240,248),.62,BASE['dark'])),2),'light',round(cr(c,comp((16,20,27),.62,BASE['light'])),2))

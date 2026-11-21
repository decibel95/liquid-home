exec(open('ok.py').read().split("print('base'")[0])
import colorsys
def hsf(h): return tuple(round(v*255) for v in colorsys.hsv_to_rgb((h%360)/360,1,1))
K=[2000+i*4535/12 for i in range(13)]
H=list(range(0,361,30))
for g in ('dark','light'):
    for name,raw,pos in (('kelvin',[ct(k) for k in K],[i/12 for i in range(13)]),('hue',[hsf(h) for h in H],[i/12 for i in range(13)])):
        cols=[etone(c,g,3.15)[0] for c in raw]
        mt=mb=99; wt=wb=None
        for i in range(2401):
            t=i/2400
            j=min(int(t*12),11); f=t*12-j
            c=tuple(round(cols[j][q]+(cols[j+1][q]-cols[j][q])*f) for q in range(3))
            a=cr(c,TRACK[g]); b=cr(c,BASE[g])
            if a<mt: mt=a; wt=(hx(c),round(t*100,1))
            if b<mb: mb=b; wb=(hx(c),round(t*100,1))
        print(g,name,[hx(c) for c in cols],'track',round(mt,2),wt,'base',round(mb,2),wb)

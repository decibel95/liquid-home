import sys
exec(open('ok.py').read().split("print('base'")[0])
import colorsys
def hsf(h): return tuple(round(v*255) for v in colorsys.hsv_to_rgb((h%360)/360,1,1))
for step,mc in ((30,3.15),(30,3.2),(15,3.1)):
  for g in ('dark','light'):
    H=list(range(0,361,step)); cols=[etone(hsf(x),g,mc)[0] for x in H]; pos=[x/360 for x in H]
    mt=99
    for i in range(3001):
        t=i/3000
        for j in range(len(pos)-1):
            if pos[j]<=t<=pos[j+1]:
                f=(t-pos[j])/(pos[j+1]-pos[j]); c=tuple(round(cols[j][q]+(cols[j+1][q]-cols[j][q])*f) for q in range(3)); break
        mt=min(mt,cr(c,TRACK[g]))
    print(step,g,round(mt,3))

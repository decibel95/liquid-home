exec(open('rv.py').read().split('# independent')[0])
import colorsys
best=[]
for x in range(3600):
    c=tuple(round(v*255) for v in colorsys.hsv_to_rgb(x/3600,1,1))
    best.append((max(cr((255,255,255),c),cr((16,20,27),c)),x/10,c))
best.sort(); print(best[:3]); print([b for b in best if b[2]==(204,0,255)])

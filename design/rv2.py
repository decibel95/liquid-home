exec(open('rv.py').read().split('# independent')[0])
import colorsys
B={'d':h('#121318'),'l':h('#f9f9fb')}
T={'d':comp((255,255,255),.14,B['d']),'l':comp((16,20,27),.16,B['l'])}
print('tracks','#%02x%02x%02x'%T['d'],'#%02x%02x%02x'%T['l'])
for c,g in [('#e51f5c','l'),('#3b74ff','d'),('#ae6200','l'),('#797900','l'),('#64748b','l'),('#c74c4e','l'),('#ef0000','l'),('#4d7d94','l')]:
    print(c,g,round(cr(h(c),B[g]),2),round(cr(h(c),T[g]),2))
# knob: white disc + 2px #10141b ring over spectrum
def kel(k):
    import math
    k=k/100
    r=255 if k<=66 else 329.698727446*((k-60)**-0.1332047592)
    gg=(99.4708025861*math.log(k)-161.1195681661) if k<=66 else 288.1221695283*((k-60)**-0.0755148492)
    b=255 if k>=66 else (0 if k<=19 else 138.5177312231*math.log(k-10)-305.0447927307)
    return tuple(max(0,min(255,round(v))) for v in (r,gg,b))
spec=[kel(k) for k in range(2000,6536,25)]+[tuple(round(v*255) for v in colorsys.hsv_to_rgb(x/720,1,1)) for x in range(720)]
w=min(spec,key=lambda c:max(cr((255,255,255),c),cr((16,20,27),c)))
print('knob worst',w,round(max(cr((255,255,255),w),cr((16,20,27),w)),2))
# but: ring against track only (the part touching the track)
w2=min(spec,key=lambda c:cr((16,20,27),c)); print('ring-only worst',w2,round(cr((16,20,27),w2),2))

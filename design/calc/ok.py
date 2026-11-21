import math, colorsys, json, sys
def lum(c):
    def l(v):
        s=v/255; return s/12.92 if s<=0.03928 else ((s+0.055)/1.055)**2.4
    return 0.2126*l(c[0])+0.7152*l(c[1])+0.0722*l(c[2])
def cr(a,b):
    x,y=sorted([lum(a),lum(b)],reverse=True); return (x+0.05)/(y+0.05)
def comp(fg,a,bg): return tuple(round(fg[i]*a+bg[i]*(1-a)) for i in range(3))
def hx(c): return '#%02x%02x%02x'%tuple(int(round(v)) for v in c)
def rgb(h): h=h.lstrip('#'); return tuple(int(h[i:i+2],16) for i in (0,2,4))
GL={'dark':((18,20,26),.78,(17,17,17)),'light':((248,249,252),.72,(250,250,250))}
BASE={k:comp(v[0],v[1],v[2]) for k,v in GL.items()}
TRACK={'dark':comp((255,255,255),.14,BASE['dark']),'light':comp((16,20,27),.16,BASE['light'])}
BRIGHT={'dark':(255,255,255),'light':(16,20,27)}
NEU={'dark':'#d5dce6','light':'#64748b'}
# OKLab
def s2l(v):
    v/=255; return v/12.92 if v<=0.04045 else ((v+0.055)/1.055)**2.4
def l2s(v):
    v= 12.92*v if v<=0.0031308 else 1.055*v**(1/2.4)-0.055
    return v*255
def to_oklch(c):
    r,g,b=[s2l(v) for v in c]
    l=0.4122214708*r+0.5363325363*g+0.0514459929*b
    m=0.2119034982*r+0.6806995451*g+0.1073969566*b
    s=0.0883024619*r+0.2817188376*g+0.6299787005*b
    l,m,s=[x**(1/3) for x in (l,m,s)]
    L=0.2104542553*l+0.7936177850*m-0.0040720468*s
    a=1.9779984951*l-2.4285922050*m+0.4505937099*s
    bb=0.0259040371*l+0.7827717662*m-0.8086757660*s
    return L,math.hypot(a,bb),math.atan2(bb,a)
def from_oklch(L,C,h):
    a=C*math.cos(h); b=C*math.sin(h)
    l=(L+0.3963377774*a+0.2158037573*b)**3
    m=(L-0.1055613458*a-0.0638541728*b)**3
    s=(L-0.0894841775*a-1.2914855480*b)**3
    r=4.0767416621*l-3.3077115913*m+0.2309699292*s
    g=-1.2684380046*l+2.6097574011*m-0.3413193965*s
    bl=-0.0041960863*l-0.7034186147*m+1.7076147010*s
    return [l2s(x) if x>=0 else -1 for x in (r,g,bl)]
def ingamut(c): return all(-0.5<=v<=255.5 for v in c)
def clampC(L,C,h):
    lo,hi=0,C
    if ingamut(from_oklch(L,C,h)): return C
    for _ in range(30):
        mid=(lo+hi)/2
        if ingamut(from_oklch(L,mid,h)): lo=mid
        else: hi=mid
    return lo
def fix(c): return tuple(max(0,min(255,round(v))) for v in c)
def sat(c): return colorsys.rgb_to_hsv(*[v/255 for v in c])[1]
def worst(c,g): return min(cr(c,BASE[g]),cr(c,TRACK[g]))
def etone(c,g,minc=3.0):
    if sat(c)<0.2: return rgb(NEU[g]),'neutral'
    if worst(c,g)>=minc: return c,'kept'
    L,C,h=to_oklch(c); cur=c
    for i in range(100):
        L = L-0.01 if g=='light' else L+0.01
        L=max(0,min(1,L))
        cc=clampC(L,C,h); cur=fix(from_oklch(L,cc,h))
        if worst(cur,g)>=minc: return cur,'adjusted'
    return cur,'fail'
def icon(c,g,a): return cr(BRIGHT[g],comp(c,a,BASE[g]))
def ct(k):
    k=k/100
    r=255 if k<=66 else max(0,min(255,329.698727446*((k-60)**-0.1332047592)))
    gg=(99.4708025861*math.log(k)-161.1195681661) if k<=66 else 288.1221695283*((k-60)**-0.0755148492)
    gg=max(0,min(255,gg))
    b=255 if k>=66 else (0 if k<=19 else max(0,min(255,138.5177312231*math.log(k-10)-305.0447927307)))
    return (round(r),round(gg),round(b))
def hs(h,s):
    return tuple(round(v*255) for v in colorsys.hsv_to_rgb(h/360,s/100,1))
print('base',{k:hx(v) for k,v in BASE.items()},'track',{k:hx(v) for k,v in TRACK.items()})
for g in ('dark','light'):
    n=rgb(NEU[g]); print('neutral',g,NEU[g],'base',round(cr(n,BASE[g]),2),'track',round(cr(n,TRACK[g]),2),'icon',round(icon(n,g,.24),2))
sw=[('2700 K',ct(2700)),('4000 K',ct(4000)),('4500 K',ct(4500)),('5000 K',ct(5000)),('6500 K',ct(6500)),('Red',(255,0,0)),('Yellow',(255,255,0)),('Blue',(0,0,255)),('Pastel hs 200,30',hs(200,30)),
('Ceiling Lights 2631 K',(255,164,82)),('Kitchen + Entrance hs 345,75',(255,64,112)),('Living Room RGBWW',(255,127,125)),('Office RGBW',(255,128,128))]
rows=[]
for n,c in sw:
    r={'name':n,'in':hx(c),'sat':round(sat(c),2)}
    for g in ('dark','light'):
        o,how=etone(c,g)
        r[g]=dict(out=hx(o),how=how,base=round(cr(o,BASE[g]),2),track=round(cr(o,TRACK[g]),2),icon=round(icon(o,g,.24),2),inb=round(worst(c,g),2))
    rows.append(r); print(json.dumps(r))
json.dump(rows,open(sys.argv[1],'w'),indent=1)
# heat distance
print('dist ceil-heat',math.dist((255,164,82),(255,148,71)))
# compact knob: white disc + ring #10141b; min over spectrum of max contrast
spec=[ct(k) for k in range(2000,6536,50)]+[hs(h,100) for h in range(0,360,2)]
mm=min(max(cr((255,255,255),c),cr((16,20,27),c)) for c in spec)
worstc=min(spec,key=lambda c:max(cr((255,255,255),c),cr((16,20,27),c)))
print('compact knob min',round(mm,2),hx(worstc))
# knob vs glass base too
for g in ('dark','light'):
    print('knob ring vs base',g,round(cr((16,20,27),BASE[g]),2),'disc vs base',round(cr((255,255,255),BASE[g]),2))
# artwork no scrim, menu fg2 on light
FG={'dark':{'fg':((244,246,250),1),'fg2':((235,240,248),.78)},'light':{'fg':((16,20,27),1),'fg2':((16,20,27),.62),'menu_fg2':((16,20,27),.86)}}
covers=[('white',(255,255,255)),('very light #f4efe4',(244,239,228)),('saturated #3b2fd6',(59,47,214)),('saturated2 #d6336c',(214,51,108)),('very dark #121318',(18,19,24)),('black',(0,0,0))]
for sc_name,sc,a in [('none',(0,0,0),0),('dark black .4',(0,0,0),.4),('light white .5',(255,255,255),.5)]:
  for g in ('dark','light'):
    if sc_name=='dark black .4' and g=='light': continue
    if sc_name=='light white .5' and g=='dark': continue
    out=[]
    for n,cc in covers:
        behind=comp(sc,a,cc); gc,ga,_=GL[g]; base=comp(gc,ga,behind)
        out.append((n,{k:round(cr(comp(v[0],v[1],base),base),2) for k,v in FG[g].items()}))
    print(sc_name,g,out)

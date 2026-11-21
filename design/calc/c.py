import os
import math, colorsys, json
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
BRIGHT={'dark':(255,255,255),'light':(16,20,27)}
print('bases',{k:hx(v) for k,v in BASE.items()})
LT={'#facc15':'#b45309','#f87171':'#dc2626','#d5dce6':'#64748b'}
def tone(h,g): return LT.get(h,h) if g=='light' else h
NEUTRAL='#d5dce6'
def sat(c):
    return colorsys.rgb_to_hsv(*[v/255 for v in c])[1]
def etone(c,g,minc=3.0):
    if sat(c)<0.2: return rgb(tone(NEUTRAL,g)),'neutral'
    base=BASE[g]
    h,l,s=colorsys.rgb_to_hls(*[v/255 for v in c])
    cur=c; steps=0
    while cr(cur,base)<minc:
        l = l-0.01 if g=='light' else l+0.01
        l=max(0,min(1,l)); steps+=1
        cur=tuple(round(v*255) for v in colorsys.hls_to_rgb(h,l,s))
        if steps>200: break
    return cur,('kept' if steps==0 else 'adjusted')
def icon(c,g,a): 
    behind=comp(c,a,BASE[g]); return cr(BRIGHT[g],behind)
def ct(k):
    k=k/100
    r=255 if k<=66 else max(0,min(255,329.698727446*((k-60)**-0.1332047592)))
    gg=(99.4708025861*math.log(k)-161.1195681661) if k<=66 else 288.1221695283*((k-60)**-0.0755148492)
    gg=max(0,min(255,gg))
    b=255 if k>=66 else (0 if k<=19 else max(0,min(255,138.5177312231*math.log(k-10)-305.0447927307)))
    return (round(r),round(gg),round(b))
print('2631K',ct(2631),'2700K',ct(2700),'6500K',ct(6500),'2000',ct(2000),'6535',ct(6535))
out={}
print('\n== existing palette on own glass (colour vs base, icon-on-tile-tint, icon-on-badge-tint)')
for n,h in [('off','#9aa3b2'),('heat','#ff9447'),('cool','#5ab0ff'),('auto','#a99cff'),('dry','#40d3c8'),('fan_only','#d5dce6'),('error','#f87171'),('paused','#facc15'),('status_off','#6b7280')]:
    for g in ('dark','light'):
        c=rgb(tone(h,g)); print(n,g,tone(h,g),round(cr(c,BASE[g]),2),round(icon(c,g,.24),2),round(icon(c,g,.3),2))
print('\n== entity colours')
sw=[('Warm white 2700 K (derived input)',ct(2700)),('Cool white 6500 K (derived input)',ct(6500)),('Saturated red',(255,0,0)),('Yellow',(255,255,0)),('Blue',(0,0,255)),
('light.ceiling_lights 2631 K',(255,164,82)),('light.kitchen_lights hs 345,75',(255,64,112)),('light.entrance_color_white_lights hs 345,75',(255,64,112)),('light.living_room_rgbww_lights rgb_color',(255,127,125)),('light.office_rgbw_lights rgb_color',(255,128,128))]
res=[]
for n,c in sw:
    row={'name':n,'in':hx(c),'sat':round(sat(c),2)}
    for g in ('dark','light'):
        o,how=etone(c,g); row[g]={'in_ratio':round(cr(c,BASE[g]),2),'out':hx(o),'how':how,'ratio':round(cr(o,BASE[g]),2),'tile':round(icon(o,g,.24),2),'badge':round(icon(o,g,.3),2),'dist':round(math.dist(comp(o,.3,BASE[g]),BASE[g]),1)}
    res.append(row); print(json.dumps(row))
json.dump(res,open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'entity.json'),'w'),indent=1)
# artwork
print('\n== artwork text contrast')
FG={'dark':{'fg':((244,246,250),1),'fg2':((235,240,248),.78),'fg3':((235,240,248),.76)},'light':{'fg':((16,20,27),1),'fg2':((16,20,27),.62),'fg3':((16,20,27),.62)}}
for scrim in (1.0,0.7,0.6,0.5):
  for cov,cc in [('white',(255,255,255)),('very light placeholder #f4efe4',(244,239,228)),('very dark placeholder #121318',(18,19,24)),('black',(0,0,0))]:
    behind=tuple(v*scrim for v in cc)
    for g in ('dark','light'):
        gc,ga,_=GL[g]; base=comp(gc,ga,behind)
        r={k:round(cr(comp(v[0],v[1],base),base),2) for k,v in FG[g].items()}
        print(scrim,cov,g,hx(base),r)

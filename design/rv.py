def lin(v):
    s=v/255; return s/12.92 if s<=0.03928 else ((s+0.055)/1.055)**2.4
def L(c): return 0.2126*lin(c[0])+0.7152*lin(c[1])+0.0722*lin(c[2])
def cr(a,b):
    x,y=sorted([L(a),L(b)],reverse=True); return (x+.05)/(y+.05)
def comp(fg,a,bg): return tuple(round(fg[i]*a+bg[i]*(1-a)) for i in range(3))
def h(s): s=s.lstrip('#'); return tuple(int(s[i:i+2],16) for i in (0,2,4))
D=(18,20,26);LG=(248,249,252)
bases={'dark/#111':comp(D,.78,(17,17,17)),'dark/white':comp(D,.78,(255,255,255)),'dark/black':comp(D,.78,(0,0,0)),'light/#fafafa':comp(LG,.72,(250,250,250)),'light/black':comp(LG,.72,(0,0,0)),'light/white':comp(LG,.72,(255,255,255))}
print({k:'#%02x%02x%02x'%v for k,v in bases.items()})
# independent recompute
pairs=[('#ffa757','dark/#111'),('#e66d00','light/#fafafa'),('#ff0000','dark/#111'),('#ff0000','light/#fafafa'),('#949400','light/#fafafa'),('#4242ff','dark/#111'),('#ff524f','light/#fafafa'),('#64748b','light/#fafafa'),('#ff4070','light/#fafafa'),('#40d3c8','light/#fafafa')]
for c,b in pairs: print(c,b,round(cr(h(c),bases[b]),3))
print('--- mismatch backdrops')
for c in ['#4242ff','#ff0000','#ff4070','#e66d00','#949400','#ff524f','#ffa757','#d5dce6','#64748b','#0000ff']:
    print(c,{b:round(cr(h(c),v),2) for b,v in bases.items()})
# icon on tile tint for blue dark over white
for c,b in [('#4242ff','dark/white'),('#0000ff','light/black')]:
    behind=comp(h(c),.24,bases[b]); br=(255,255,255) if b.startswith('dark') else (16,20,27)
    print('icon',c,b,round(cr(br,behind),2))
# warm white vs heat
import math
for a,b in [('#ffa452','#ff9447'),('#e66d00','#ff9447')]:
    print(a,b,'dist',round(math.dist(h(a),h(b)),1))

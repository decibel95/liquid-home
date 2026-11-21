import os
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'c.py')).read().split("out={}")[0])
FG={'dark':{'fg':((244,246,250),1),'fg2':((235,240,248),.78),'bright':((255,255,255),1)},'light':{'fg':((16,20,27),1),'fg2':((16,20,27),.62),'bright':((16,20,27),1)}}
covers=[('white',(255,255,255)),('very light #f4efe4',(244,239,228)),('very dark #121318',(18,19,24)),('black',(0,0,0))]
for g,sc in [('dark',(0,0,0)),('light',(255,255,255))]:
  for a in (0.3,0.35,0.4,0.45,0.5):
    rows=[]
    for n,cc in covers:
      behind=comp(sc,a,cc); gc,ga,_=GL[g]; base=comp(gc,ga,behind)
      rows.append((n,hx(base),{k:round(cr(comp(v[0],v[1],base),base),2) for k,v in FG[g].items()}))
    print(g,a,rows)

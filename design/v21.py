exec(open('rv.py').read().split('# independent')[0])
B={'d':h('#121318'),'l':h('#f9f9fb')}
T={'d':comp((255,255,255),.14,B['d']),'l':comp((16,20,27),.16,B['l'])}
TON={'d':['#ff0000','#ff8000','#ffff00','#80ff00','#00ff00','#00ff80','#00ffff','#0080ff','#3b74ff','#935cff','#ff00ff','#ff0080','#ff0000'],
'l':['#ef0000','#bc5d00','#797900','#408500','#008900','#008a42','#008484','#0075e9','#0000ff','#8000ff','#d000d0','#e50072','#ef0000']}
K={'d':['#ff890e','#ffa757','#ffc18d','#ffdabb','#d5dce6','#d5dce6'],'l':['#b65f00','#ae6200','#a36a38','#917054','#64748b','#64748b']}
KP=[0,.154,.331,.551,.772,1]
def scan(stops,pos,g):
    cs=[h(s) for s in stops]; mt=mb=99; wc=None
    for i in range(2001):
        t=i/2000
        for j in range(len(pos)-1):
            if pos[j]<=t<=pos[j+1]:
                f=(t-pos[j])/(pos[j+1]-pos[j]); c=tuple(round(cs[j][q]+(cs[j+1][q]-cs[j][q])*f) for q in range(3)); break
        a=cr(c,T[g]); 
        if a<mt: mt=a; wc=c
        mb=min(mb,cr(c,B[g]))
    return round(mt,2),'#%02x%02x%02x'%wc,round(mb,2)
for g in 'dl':
    print(g,'hue',scan(TON[g],[i/12 for i in range(13)],g),'kelvin',scan(K[g],KP,g))
    print(g,'stops vs track',[round(cr(h(s),T[g]),2) for s in TON[g]])
o={'d':comp((235,240,248),.62,B['d']),'l':comp((16,20,27),.62,B['l'])}
for g in 'dl': print('outline',g,'#%02x%02x%02x'%o[g],round(cr(o[g],B[g]),2), 'ring',round(cr((255,255,255) if g=='d' else (16,20,27),B[g]),2))
print('cool white fill vs light base',round(cr(h('#fffefa'),B['l']),2))

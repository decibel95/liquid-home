exec(open('calc/c.py').read().split("out={}")[0])
for k in (2200,3000,3500,4000,4500,5000,5500):
    c=ct(k); 
    d,_=etone(c,'dark'); l,how=etone(c,'light')
    print(k,hx(c),round(sat(c),2),'dark',hx(d),'light',hx(l),how, 'heat-dist-dark',round(math.dist(d,rgb('#ff9447')),1))

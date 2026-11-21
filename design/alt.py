exec(open('rv.py').read().split('# independent')[0])
for cov in [(0,0,0),(255,255,255),(18,19,24),(200,30,30),(30,60,200)]:
    lb=comp(LG,.72,cov); db=comp(D,.78,cov)
    print(cov,'light noscrim base',lb,'fg2 .62',round(cr(comp((16,20,27),.62,lb),lb),2),'menu fg2 .86',round(cr(comp((16,20,27),.86,lb),lb),2),'fg',round(cr((16,20,27),lb),2),
          '| dark noscrim fg2',round(cr(comp((235,240,248),.78,db),db),2))
# art visibility: share of cover in final base
print('dark w/ scrim .4: cover weight', round(.22*.6,3),' light w/ white .5:', round(.28*.5,3), ' no scrim dark', .22, 'light', .28)

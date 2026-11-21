exec(open('rv.py').read().split('# independent')[0])
for t in ['#ffa757','#ffc18d','#ffedde','#fffffb','#ffff00','#00ffff','#00ff00','#0000ff','#ff0000','#ff4070']:
    print(t,'white knob',round(cr((255,255,255),h(t)),2),'dark knob',round(cr((16,20,27),h(t)),2))

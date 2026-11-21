class Component extends DCLogic {
  rgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  renderVals() {
    var self = this;
    var G = 'dark';
    var capReal = G === 'dark' ? 'rgba(235,240,248,0.76)' : 'rgba(16,20,27,0.62)';
    var capDerived = G === 'dark' ? '#ffb067' : '#7c3a05';
    var col = {
      kit: G === 'dark' ? '#ff4070' : '#e51f5c',
      rgbww: G === 'dark' ? '#ff7f7d' : '#c74c4e',
      neu: G === 'dark' ? '#d5dce6' : '#64748b'
    };
    var SUN = 'M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8z M12 2v2 M12 20v2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2 M20 12h2 M6.34 17.66l-1.41 1.41 M19.07 4.93l-1.41 1.41';
    var RAINBOW = 'M22 17a10 10 0 0 0-20 0 M6 17a6 6 0 0 1 12 0 M10 17a2 2 0 0 1 4 0';
    var BULB = 'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5 M9 18h6 M10 22h4';
    var NONE = 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18z';
    var TONED = G === 'dark'
      ? { k: ['#ff890e', '#ff9a3a', '#ffa95c', '#ffb677', '#ffc18d', '#ffcba1', '#ffd4b2', '#ffddc1', '#d5dce6', '#d5dce6', '#d5dce6', '#d5dce6', '#d5dce6'], h: ['#ff2117', '#ff8000', '#ffff00', '#80ff00', '#00ff00', '#00ff80', '#00ffff', '#0080ff', '#4078ff', '#9562ff', '#ff00ff', '#ff0080', '#ff2117'] }
      : { k: ['#b15c00', '#ae5f00', '#ac6000', '#a5631f', '#9f6835', '#976841', '#916b4c', '#8b6d54', '#64748b', '#64748b', '#64748b', '#64748b', '#64748b'], h: ['#ea0000', '#b85a00', '#767600', '#3e8200', '#008600', '#00833f', '#008181', '#006fdf', '#0000ff', '#8000ff', '#cb00cb', '#e00070', '#ea0000'] };
    function grad(stops) { return 'linear-gradient(to top, ' + stops.map(function (x, i) { return x + ' ' + (i * 100 / (stops.length - 1)).toFixed(1) + '%'; }).join(', ') + ')'; }
    function modes(active, c) {
      return [['Brightness', BULB, 'bright'], ['White', SUN, 'white'], ['Colour', RAINBOW, 'colour']].map(function (m) {
        var on = m[2] === active;
        return { label: m[0], icon: m[1], on: on ? 'true' : 'false', bg: on ? self.rgba(c, 0.2) : 'var(--lc-btn)', bd: on ? self.rgba(c, 0.45) : 'var(--lc-btn-edge)', fg: on ? 'var(--lc-fg)' : 'var(--lc-fg2)' };
      });
    }
    function card(o) {
      var on = o.on, c = o.col || col.neu, w = o.w || 444;
      return {
        g: 'g-' + G, w: w, mr: w < 400 ? 0 : 24, state: o.state, cap: o.cap, capC: o.derived ? capDerived : capReal,
        name: o.name, sub: o.sub,
        pressed: on ? 'true' : 'false', dis: !!o.dis, pwrLabel: (on ? 'Turn off ' : 'Turn on ') + o.name,
        pwrBg: on ? self.rgba(c, 0.28) : 'var(--lc-btn)', pwrOp: o.dis ? 0.5 : 1,
        big: o.big, unit: o.unit || '', what: o.what,
        isToggle: !!o.toggle, isSlider: !o.toggle, pct: o.pct || 0, vt: o.vt || o.big,
        img: on && o.mode === 'white' ? grad(TONED.k) : on && o.mode === 'colour' ? grad(TONED.h) : 'none',
        pillLabel: o.mode === 'white' ? 'Colour temperature' : o.mode === 'colour' ? 'Colour' : 'Brightness',
        col: c, op: o.dis ? 0.3 : 1, disS: o.dis ? 'true' : 'false',
        hasModes: !!o.mode, modes: o.mode ? modes(on ? o.mode : '', c) : [],
        hasChips: !!o.chips, chips: o.chips || [], chipCols: o.chips ? o.chips.length : 1
      };
    }
    var ceiling = { name: 'Ceiling Lights', sub: 'On, 2631 K', on: true, col: col.neu, big: '2631', unit: 'K', what: 'Warmth', pct: 13.9, vt: '2631 K', mode: 'white' };
    return {
      cards: [
        card(Object.assign({ state: '1. On, colour temperature (White mode)', cap: 'light.ceiling_lights, real' }, ceiling)),
        card({ state: '2. Colour (Colour mode)', cap: 'light.kitchen_lights, real', name: 'Kitchen Lights', sub: 'On', on: true, col: col.kit, big: '71', unit: '%', what: 'Colour', pct: 95.8, vt: 'Hue 345', mode: 'colour' }),
        card({ state: '3. Dimmed (Brightness mode)', cap: 'derived: Kitchen Lights at brightness 26', derived: true, name: 'Kitchen Lights', sub: 'On', on: true, col: col.kit, big: '10', unit: '%', what: 'Brightness', pct: 10, vt: '10%', mode: 'bright' }),
        card({ state: '4. Off', cap: 'light.bed_light, real', name: 'Bed Light', sub: 'Off', on: false, big: 'Off', what: 'Brightness', pct: 0, vt: 'Off', mode: 'none', chips: [{ k: 'Effect', v: 'None', icon: NONE, ic: 'var(--lc-fg2)' }] }),
        card({ state: '5. Unavailable', cap: 'derived: Office RGBW Lights', derived: true, name: 'Office RGBW Lights', sub: 'Unavailable', on: false, dis: true, big: '--', what: 'Brightness', pct: 0, vt: 'Unavailable', mode: 'none' }),
        card({ state: '6. Brightness only', cap: 'derived: Ceiling Lights, modes [brightness]', derived: true, name: 'Ceiling Lights', sub: 'On', on: true, col: col.neu, big: '71', unit: '%', what: 'Brightness', pct: 71, vt: '71%' }),
        card({ state: '7. On/off only', cap: 'derived: Entrance Color + White Lights, modes [onoff]', derived: true, name: 'Entrance Color + White Lights', sub: 'On', on: true, col: col.neu, big: 'On', what: 'Tap to switch', toggle: true }),
        card({ state: '8. Light group', cap: 'derived: Living Room Lights, 3 members', derived: true, name: 'Living Room Lights', sub: '3 of 3 on', on: true, col: col.neu, big: '71', unit: '%', what: 'Brightness, average', pct: 71, vt: '71%',
          chips: [{ k: 'Ceiling Lights', v: '71%', icon: BULB, ic: col.neu }, { k: 'Living Room RGBWW', v: '71%', icon: BULB, ic: col.rgbww }, { k: 'Entrance', v: '71%', icon: BULB, ic: col.kit }] }),
        card(Object.assign({}, ceiling, { state: '9. Narrow card, 320px (Brightness mode)', cap: 'light.ceiling_lights, real; readout scales with the card (18cqw)', w: 320, big: '71', unit: '%', what: 'Brightness', pct: 71, vt: '71%', mode: 'bright' }))
      ]
    };
  }
}

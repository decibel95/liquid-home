class Component extends DCLogic {
  rgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  panel(G) {
    var self = this, dark = G === 'dark';
    var kit = dark ? '#ff4070' : '#e51f5c', neu = dark ? '#d5dce6' : '#64748b', off = '#6b7280';
    function tile(name, sub, c, target) {
      return { name: name, sub: sub, target: target, pressed: c ? 'true' : 'false', off: !c, sOp: c ? 1 : 0.3,
        bg: c ? self.rgba(c, 0.24) : 'var(--lc-btn)', bd: c ? self.rgba(c, 0.45) : 'var(--lc-btn-edge)', fg: c ? 'var(--lc-bright)' : 'var(--lc-fg2)' };
    }
    function room(name, c, big, unit, foot, sel, op) {
      return { name: name, c: c, big: big, unit: unit, foot: foot, op: op || 1, pressed: sel ? 'true' : 'false', bg: sel ? 'var(--lc-room-on)' : 'var(--lc-room)', bd: sel ? 'var(--lc-room-on-edge)' : 'var(--lc-room-edge)' };
    }
    return {
      g: 'g-' + G, name: G, isDark: dark, isLight: !dark, title: dark ? 'Dark glass' : 'Light glass', ground: dark ? '#14161a' : '#e7e9ee',
      dial: dark ? '/_blob/ece25f49b0387e6691c272d987f05d98' : '/_blob/330a24442d9fc83743d6e5dbd48c0e6b',
      tile: dark ? '/_blob/57fbd63eaa069422f7a1746d87f09766' : '/_blob/fe126ca162845f3235bf1902280905d6',
      badge: dark ? '/_blob/037def036a14d741a750565cd9db7d39' : '/_blob/c3b76ed958f9f64ec3983613c9e2a1dc',
      cluster: dark ? '/_blob/0bc3c1da53560d60ebcba0ddba6206b5' : '/_blob/186e6f45986f2d69a709c58683bac5ef',
      c: neu, kgrad: dark ? 'linear-gradient(to top, #ff890e 0.0%, #ff9a3a 8.3%, #ffa95c 16.7%, #ffb677 25.0%, #ffc18d 33.3%, #ffcba1 41.7%, #ffd4b2 50.0%, #ffddc1 58.3%, #d5dce6 66.7%, #d5dce6 75.0%, #d5dce6 83.3%, #d5dce6 91.7%, #d5dce6 100.0%)' : 'linear-gradient(to top, #b15c00 0.0%, #ae5f00 8.3%, #ac6000 16.7%, #a5631f 25.0%, #9f6835 33.3%, #976841 41.7%, #916b4c 50.0%, #8b6d54 58.3%, #64748b 66.7%, #64748b 75.0%, #64748b 83.3%, #64748b 91.7%, #64748b 100.0%)', pwr: self.rgba(neu, 0.28), modeBg: self.rgba(neu, 0.2), modeBd: self.rgba(neu, 0.45), grp: self.rgba(neu, 0.28),
      tiles: [tile('Ceiling Lights', 'On, 2631 K', neu, '71%'), tile('Kitchen Lights', 'On', kit, '71%'), tile('Bed Light', 'Off', null, '--')],
      badges: [
        { name: 'Ceiling Lights', value: '71%', tint: self.rgba(neu, 0.3) },
        { name: 'Kitchen Lights', value: '71%', tint: self.rgba(kit, 0.3) },
        { name: 'Bed Light', value: 'Off', tint: self.rgba(off, 0.3) }
      ],
      rooms: [room('Ceiling Lights', neu, '71', '%', 'On, 2631 K', true), room('Living Room RGBWW Lights', 'var(--lc-fg3)', 'Off', '', 'Off', false), room('Entrance Color + White Lights', 'var(--lc-fg3)', '--', '', 'Unavailable', false, 0.5)]
    };
  }
  renderVals() {
    return { panels: [this.panel('dark'), this.panel('light')] };
  }
}

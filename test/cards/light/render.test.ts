// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { ICONS, parseColor, SPECTRUM } from '@decibel95/liquid-core';
import type { LightFixtureName } from '../../fixtures/lights';
import { $, $$, fakeHass, ids, pill, text } from './helpers';

afterEach(() => {
  document.body.innerHTML = '';
});

/** A CSS colour as r,g,b, whatever notation the DOM gives back. */
const rgbOf = (c: string) => parseColor(c).slice(0, 3).join(',');

type Glass = 'dark' | 'light';
interface Expect {
  readout: string;
  what: string;
  sub: string;
  role: 'slider' | 'switch';
  /** aria-valuenow (slider) or aria-checked (switch). */
  value: string;
  modes: string[];
  /** Fill colour per glass: entity colour (CON tables) or the neutral (TOK-14). */
  fill: Record<Glass, string>;
  chips: string[];
  on: boolean;
  available?: boolean;
}

const NEUTRAL = { dark: '#d5dce6', light: '#64748b' };
const CASES: Record<LightFixtureName, Expect> = {
  // CON-6: Kitchen rgb #ff4070, kept on dark, #e51f5c on light.
  dimmed: { readout: '10%', what: 'Brightness', sub: 'On', role: 'slider', value: '10', modes: ['Brightness', 'White', 'Colour'], fill: { dark: '#ff4070', light: '#e51f5c' }, chips: [], on: true },
  // CHO-11: readout --, subline Unavailable.
  unavailable: { readout: '--', what: 'Brightness', sub: 'Unavailable', role: 'slider', value: '0', modes: ['Brightness', 'Colour'], fill: NEUTRAL, chips: [], on: false, available: false },
  off: { readout: 'Off', what: 'Brightness', sub: 'Off', role: 'slider', value: '0', modes: ['Brightness', 'Colour'], fill: NEUTRAL, chips: [], on: false },
  brightnessOnly: { readout: '71%', what: 'Brightness', sub: 'On', role: 'slider', value: '71', modes: [], fill: NEUTRAL, chips: [], on: true },
  // TOK-8: the toggle frame, role switch.
  onOffOnly: { readout: 'On', what: 'Tap to switch', sub: 'On', role: 'switch', value: 'true', modes: [], fill: NEUTRAL, chips: [], on: true },
  // CHO-4: the group draws the neutral; members keep their colours on the chips.
  group: { readout: '71%', what: 'Brightness, average', sub: '3 of 3 on', role: 'slider', value: '71', modes: [], fill: NEUTRAL, chips: ['Ceiling Lights 71%', 'Living Room RGBWW Lights 71%', 'Entrance Color + White Lights On'], on: true },
  // CHO-15 effect chip; CHO-1 option B: colour temperature draws the neutral.
  effectList: { readout: '71%', what: 'Brightness', sub: 'On, 3000 K', role: 'slider', value: '71', modes: ['Brightness', 'White', 'Colour'], fill: NEUTRAL, chips: ['Effect Rainbow'], on: true },
  colourTemp: { readout: '71%', what: 'Brightness', sub: 'On, 2631 K', role: 'slider', value: '71', modes: ['Brightness', 'White', 'Colour'], fill: NEUTRAL, chips: [], on: true },
  colourHs: { readout: '71%', what: 'Brightness', sub: 'On', role: 'slider', value: '71', modes: ['Brightness', 'White', 'Colour'], fill: { dark: '#ff4070', light: '#e51f5c' }, chips: [], on: true },
  // CON-8: Office rgb #ff8080, light #c74e51.
  rgbw: { readout: '71%', what: 'Brightness', sub: 'On', role: 'slider', value: '71', modes: ['Brightness', 'Colour'], fill: { dark: '#ff8080', light: '#c74e51' }, chips: [], on: true },
  // CON-7: Living Room RGBWW rgb #ff7f7d, light #c74c4e.
  rgbww: { readout: '71%', what: 'Brightness', sub: 'On', role: 'slider', value: '71', modes: ['Brightness', 'Colour'], fill: { dark: '#ff7f7d', light: '#c74c4e' }, chips: [], on: true },
};

describe.each(['dark', 'light'] as const)('every fixture state on %s glass (plan 2.8)', (glass) => {
  it.each(Object.keys(CASES) as LightFixtureName[])('%s', async (name) => {
    const c = CASES[name];
    const h = fakeHass();
    const el = await h.mount(ids[name], { look: { glass } });
    const card = $(el, 'section.lc')!;
    expect(card.classList.contains(`g-${glass}`)).toBe(true);
    expect(card.classList.contains('rim')).toBe(true);
    // CHO-6: no glass tint layer; one surface only.
    expect($(el, '.tint')).toBeNull();
    expect($$(el, '.lc').length).toBe(1);

    expect(text($(el, '.ro-v'))).toBe(c.readout.replace(/(\d)(%)/, '$1$2'));
    expect(text($(el, '.ro .sub'))).toBe(c.what);
    expect(text($(el, 'header .sub'))).toBe(c.sub);

    const p = pill(el);
    expect(p.getAttribute('role')).toBe(c.role);
    expect(p.getAttribute(c.role === 'switch' ? 'aria-checked' : 'aria-valuenow')).toBe(c.value);
    expect(p.getAttribute('aria-disabled')).toBe(c.available === false ? 'true' : 'false');
    expect($$(el, '.mode').map((b) => text(b))).toEqual(c.modes);
    expect($$(el, '.chip').map((b) => `${text(b.querySelector('.k'))} ${text(b.querySelector('.v'))}`)).toEqual(c.chips);

    const fill = $(el, '.lc-slider-fill')!;
    expect(rgbOf(fill.style.backgroundColor)).toBe(rgbOf(c.fill[glass]));
    expect(fill.style.backgroundImage).toBe('none');

    const power = $(el, 'button.power')!;
    expect(power.getAttribute('aria-pressed')).toBe(String(c.on));
    // One power-button spec for the light card, tile and room header: "Switch {name}" with aria-pressed.
    expect(power.getAttribute('aria-label')).toBe(`Switch ${text($(el, 'h2'))}`);
    expect(power.hasAttribute('disabled')).toBe(c.available === false);
    expect(power.querySelector('path')!.getAttribute('d')).toBe(ICONS.power);
  });
});

describe('details per state', () => {
  it('unavailable (CHO-11): power at 0.5, pill at 0.3 through the slider, valuetext Unavailable', async () => {
    const h = fakeHass();
    const el = await h.mount(ids.unavailable);
    expect($(el, 'button.power')!.style.opacity).toBe('0.5');
    expect(pill(el).getAttribute('aria-valuetext')).toBe('Unavailable');
    // HA keeps the capability attributes of an unavailable light: its mode buttons show, disabled at 0.3.
    const modes = $$(el, '.mode') as HTMLButtonElement[];
    expect(modes.map((m) => [m.dataset.mode, m.disabled, m.style.opacity])).toEqual([
      ['brightness', true, '0.3'],
      ['colour', true, '0.3'],
    ]);
  });

  it('setPillMode opens the card in that mode (the sheet from the room White and Colour buttons), not stored', async () => {
    const h = fakeHass();
    const el = await h.mount(ids.colourHs);
    el.setPillMode('white');
    await el.updateComplete;
    expect($(el, '.mode[aria-pressed="true"]')!.dataset.mode).toBe('white');
    const other = await h.mount(ids.colourHs);
    expect($(other, '.mode[aria-pressed="true"]')!.dataset.mode).toBe('brightness');
    // A mode the light does not offer falls back to the first one it does.
    const dim = await h.mount(ids.brightnessOnly);
    dim.setPillMode('colour');
    await dim.updateComplete;
    expect(pill(dim).getAttribute('aria-label')).toBe('Ceiling Lights brightness');
  });

  it('unavailable with modes: mode buttons disabled at 0.3', async () => {
    const h = fakeHass();
    h.set(ids.colourHs, 'unavailable');
    const el = await h.mount(ids.colourHs);
    const modes = $$(el, '.mode');
    expect(modes.length).toBe(3);
    for (const m of modes) {
      expect(m.hasAttribute('disabled')).toBe(true);
      expect(m.style.opacity).toBe('0.3');
    }
  });

  it('power button tint 0.28 of the entity colour (CHO-7); mode button 0.20 / 0.45 (TOK-22)', async () => {
    const h = fakeHass();
    const el = await h.mount(ids.colourHs, { look: { glass: 'dark' } });
    expect(rgbOf($(el, 'button.power')!.style.background)).toBe('255,64,112');
    expect($(el, 'button.power')!.style.background.replace(/\s/g, '')).toContain('0.28');
    const sel = $(el, '.mode[aria-pressed="true"]')!;
    expect(sel.dataset.mode).toBe('brightness');
    expect(sel.style.background.replace(/\s/g, '')).toBe('rgba(255,64,112,0.2)');
    expect(sel.style.borderColor.replace(/\s/g, '')).toBe('rgba(255,64,112,0.45)');
  });

  it('mode buttons show bulb, sun and rainbow (ICO-1 to 3)', async () => {
    const h = fakeHass();
    const el = await h.mount(ids.colourHs);
    expect($$(el, '.mode path').map((p) => p.getAttribute('d'))).toEqual([ICONS.bulb, ICONS.sun, ICONS.rainbow]);
  });

  it('Q5: White mode on a colour light not in colour temperature shows the brightness beside an empty pill', async () => {
    const h = fakeHass();
    const el = await h.mount(ids.colourHs, { look: { glass: 'dark' } });
    $(el, '.mode[data-mode="white"]')!.click();
    await el.updateComplete;
    expect(text($(el, '.ro-v'))).toBe('71%');
    expect(text($(el, '.ro .sub'))).toBe('Brightness');
    expect($(el, '.lc-slider-fill')!.style.height).toBe('0%');
    expect(pill(el).getAttribute('aria-valuetext')).toBe('Not in white mode');
    expect(pill(el).getAttribute('aria-label')).toBe('Kitchen Lights warmth');
  });

  it('White mode in colour temperature: kelvin readout, toned kelvin spectrum (TOK-21), position fill', async () => {
    const h = fakeHass();
    const el = await h.mount(ids.colourTemp, { look: { glass: 'light' } });
    $(el, '.mode[data-mode="white"]')!.click();
    await el.updateComplete;
    expect(text($(el, '.ro-v'))).toBe('2631K');
    expect(text($(el, '.ro .sub'))).toBe('Warmth');
    expect(pill(el).getAttribute('aria-valuetext')).toBe('2631 K');
    const fill = $(el, '.lc-slider-fill')!;
    for (const stop of new Set(SPECTRUM.toned.light.kelvin)) expect(fill.style.backgroundImage.replace(/\s/g, '')).toMatch(new RegExp(`${rgbOf(stop).replace(/,/g, ',')}|${stop}`, 'i'));
    expect(parseFloat(fill.style.height)).toBeCloseTo(((2631 - 2000) / 4535) * 100, 1);
    expect($(el, '.mode[data-mode="white"]')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('Colour mode: hue position, toned hue spectrum, brightness readout', async () => {
    const h = fakeHass();
    const el = await h.mount(ids.colourHs, { look: { glass: 'dark' } });
    $(el, '.mode[data-mode="colour"]')!.click();
    await el.updateComplete;
    expect(parseFloat($(el, '.lc-slider-fill')!.style.height)).toBeCloseTo(345 / 3.6, 1);
    expect(text($(el, '.ro-v'))).toBe('71%');
    expect(pill(el).getAttribute('aria-valuetext')).toBe('Hue 345');
    expect(pill(el).getAttribute('aria-label')).toBe('Kitchen Lights colour');
  });

  it('controls.modes limits the mode buttons; a single mode hides them', async () => {
    const h = fakeHass();
    let el = await h.mount(ids.colourHs, { controls: { modes: ['brightness', 'colour'] } });
    expect($$(el, '.mode').map((b) => b.dataset.mode)).toEqual(['brightness', 'colour']);
    el = await h.mount(ids.colourHs, { controls: { modes: ['brightness'] } });
    expect($$(el, '.mode').length).toBe(0);
  });

  it('controls.effects: false hides the effect chip', async () => {
    const h = fakeHass();
    const el = await h.mount(ids.effectList, { controls: { effects: false } });
    expect($$(el, '.chip').length).toBe(0);
  });

  it('group member chips keep the member colour (CHO-4) and the bulb icon', async () => {
    const h = fakeHass();
    const el = await h.mount(ids.group, { look: { glass: 'dark' } });
    const icons = $$(el, '.chip > span:first-child');
    expect(icons.map((i) => rgbOf(i.style.color))).toEqual([rgbOf('#d5dce6'), rgbOf('#ff7f7d'), rgbOf('#d5dce6')]);
    expect($$(el, '.chip path').every((p) => p.getAttribute('d') === ICONS.bulb)).toBe(true);
  });

  it('name option overrides the friendly name; a missing entity shows the placeholder', async () => {
    const h = fakeHass();
    let el = await h.mount(ids.colourHs, { name: 'Kitchen' });
    expect(text($(el, 'h2'))).toBe('Kitchen');
    expect(pill(el).getAttribute('aria-label')).toBe('Kitchen brightness');
    el = await h.mount('light.nope');
    expect(text($(el, '.unavailable'))).toBe('Entity not found: light.nope');
  });

  it('theme glass follows HA dark mode', async () => {
    const dark = fakeHass({ glassDark: true });
    expect($(await dark.mount(ids.colourHs), 'section.lc')!.classList.contains('g-dark')).toBe(true);
    const light = fakeHass({ glassDark: false });
    expect($(await light.mount(ids.colourHs), 'section.lc')!.classList.contains('g-light')).toBe(true);
  });

  it('look.blur sets the blur variable; --lc-blur and --lc-radius take precedence in the stylesheet (D-3)', async () => {
    const h = fakeHass();
    const el = await h.mount(ids.colourHs, { look: { blur: 12 } });
    expect($(el, 'section.lc')!.style.getPropertyValue('--_blur')).toBe('12px');
    const css = (el.constructor as unknown as { elementStyles: { cssText: string }[] }).elementStyles.map((s) => s.cssText).join('\n');
    expect(css).toContain('border-radius: var(--lc-radius, var(--lc-radius-default))');
    expect(css).toContain('--lc-radius-default: 40px');
    expect(css).toContain('backdrop-filter: blur(var(--lc-blur, var(--_blur))) saturate(170%)');
    // One backdrop-filter: only the outer glass (plus its -webkit- twin).
    expect(css.match(/(?<!-webkit-)backdrop-filter:/g)!.length).toBe(1);
  });
});

describe('P11x', () => {
  it('renders the header-action slot after the power button, so a sheet can put its Close button there', async () => {
    const h = fakeHass();
    const el = await h.mount(ids.colourHs);
    const actions = $(el, 'header .actions')!;
    const slot = actions.querySelector('slot[name="header-action"]') as HTMLSlotElement | null;
    expect(slot).not.toBeNull();
    expect(actions.lastElementChild).toBe(slot);
    expect(slot!.previousElementSibling!.classList.contains('power')).toBe(true);
    const close = document.createElement('button');
    close.slot = 'header-action';
    close.textContent = 'Close';
    el.append(close);
    expect(slot!.assignedElements()).toEqual([close]);
  });

  it('an on/off-only group: toggle pill, no mode buttons, member chips', async () => {
    const h = fakeHass();
    h.set(ids.group, 'on', { supported_color_modes: ['onoff'], color_mode: 'onoff', brightness: null });
    const el = await h.mount(ids.group);
    expect(pill(el).getAttribute('role')).toBe('switch');
    expect(pill(el).getAttribute('aria-checked')).toBe('true');
    expect(text($(el, '.ro .sub'))).toBe('Tap to switch');
    expect(el.shadowRoot!.querySelectorAll('.mode').length).toBe(0);
    expect(el.shadowRoot!.querySelectorAll('.chip').length).toBe(3);
  });

  it('an empty colour temperature range hides the White button', async () => {
    const h = fakeHass();
    h.set(ids.colourTemp, 'on', { min_color_temp_kelvin: 2700, max_color_temp_kelvin: 2700, color_temp_kelvin: 2700 });
    const el = await h.mount(ids.colourTemp);
    expect([...el.shadowRoot!.querySelectorAll<HTMLElement>('.mode')].map((b) => b.dataset.mode)).toEqual(['brightness', 'colour']);
  });
});

describe('Lovelace API', () => {
  it('rejects a non-light entity', async () => {
    const h = fakeHass();
    await expect(h.mount('switch.x')).rejects.toThrow(/light entity/);
  });

  it('size, grid options and stub config (picks a dimmable light that is on)', async () => {
    const h = fakeHass();
    const el = await h.mount(ids.colourHs);
    expect(el.getCardSize()).toBe(8);
    expect(el.getGridOptions()).toEqual({ columns: 12, rows: 'auto', min_columns: 6 });
    const Card = el.constructor as unknown as { getStubConfig(h: unknown): Record<string, unknown> };
    const stub = Card.getStubConfig(h.hass);
    expect(stub.type).toBe('custom:liquid-home-light-card');
    expect(h.hass.states[stub.entity as string].state).toBe('on');
    expect(h.hass.states[stub.entity as string].attributes.supported_color_modes).not.toEqual(['onoff']);
  });

  // The picker entry is made in src/register.ts: test/register.test.ts.
});

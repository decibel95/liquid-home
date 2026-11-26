// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { $, $$, fakeHass, pill, pointer, text } from './helpers';
import { fanIds, type FanFixtureName } from '../../fans/fixtures';
import { CARD_TYPES, TAGS } from '../../../src/const';
import { defaultConfig, normalizeConfig, LiquidHomeFanCard } from '../../../src/cards/fan';
import { fanCardStyles } from '../../../src/cards/fan/styles';

const icon = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock('../../../src/cards/shared/header-icon', async (orig) => {
  const mod = await orig<typeof import('../../../src/cards/shared/header-icon')>();
  return { ...mod, renderHeaderIcon: (...args: unknown[]) => (icon.calls.push(args), mod.renderHeaderIcon(...(args as Parameters<typeof mod.renderHeaderIcon>))) };
});

/** Plan 2.5: every fixture state on both glasses, the Q8 a aria during a drag, and the P2-CHO-6 readout fit. */

beforeEach(() => {
  icon.calls = [];
});
afterEach(() => {
  document.body.innerHTML = '';
});

const GLASSES = ['dark', 'light'] as const;
const NEUTRAL = { dark: '#d5dce6', light: '#64748b' };

interface Want {
  big: string;
  label: string;
  sub: string;
  pill: 'slider' | 'switch';
  row: string[];
  chip?: string;
  power: 'on' | 'off' | 'disabled' | 'none' | 'unavailable';
  icon: 'active' | 'inactive' | 'unavailable';
}

const STATES: Record<string, [FanFixtureName, Want]> = {
  off: ['off', { big: 'Off', label: 'Speed', sub: 'Off', pill: 'slider', row: ['Oscillate', 'Reverse'], power: 'off', icon: 'inactive' }],
  '33': ['pct33', { big: '33%', label: 'Speed', sub: 'On', pill: 'slider', row: ['Oscillate', 'Reverse'], power: 'on', icon: 'active' }],
  '67': ['pct67', { big: '67%', label: 'Speed', sub: 'On', pill: 'slider', row: ['Oscillate', 'Reverse'], power: 'on', icon: 'active' }],
  '100': ['pct100', { big: '100%', label: 'Speed', sub: 'On', pill: 'slider', row: ['Oscillate', 'Reverse'], power: 'on', icon: 'active' }],
  'preset Auto': ['presetAuto', { big: 'Auto', label: 'Preset', sub: 'Auto', pill: 'slider', row: ['Oscillate', 'Reverse'], chip: 'Preset Auto', power: 'on', icon: 'active' }],
  oscillating: ['oscillating', { big: '33%', label: 'Speed', sub: 'On, oscillating', pill: 'slider', row: ['Oscillate', 'Reverse'], power: 'on', icon: 'active' }],
  reverse: ['reverse', { big: '67%', label: 'Speed', sub: 'On, reverse', pill: 'slider', row: ['Oscillate', 'Reverse'], power: 'on', icon: 'active' }],
  'preset-only': ['presetOnly', { big: 'Off', label: 'Tap to switch', sub: 'Off', pill: 'switch', row: [], chip: 'Preset None', power: 'off', icon: 'inactive' }],
  'preset-only Auto': ['presetOnlyAuto', { big: 'Auto', label: 'Preset', sub: 'Auto', pill: 'switch', row: [], chip: 'Preset Auto', power: 'on', icon: 'active' }],
  'on/off-only': ['onoff', { big: 'On', label: 'Tap to switch', sub: 'On', pill: 'switch', row: [], power: 'on', icon: 'active' }],
  'ten speeds': ['ten', { big: '40%', label: 'Speed', sub: 'On', pill: 'slider', row: [], chip: 'Preset None', power: 'on', icon: 'active' }],
  unavailable: ['unavailable', { big: '--', label: 'Speed', sub: 'Unavailable', pill: 'slider', row: ['Oscillate', 'Reverse'], chip: 'Preset None', power: 'unavailable', icon: 'unavailable' }],
  'long name': ['longName', { big: '67%', label: 'Speed', sub: 'On, oscillating', pill: 'slider', row: ['Oscillate', 'Reverse'], power: 'on', icon: 'active' }],
};

describe('every fixture state on both glasses', () => {
  for (const glass of GLASSES) {
    for (const [label, [fixture, want]] of Object.entries(STATES)) {
      it(`${label}, ${glass} glass`, async () => {
        const h = fakeHass({ echoMs: null, glassDark: glass === 'dark' });
        const el = await h.mount(fanIds[fixture], { look: { glass } });
        const name = h.states[fanIds[fixture]].attributes.friendly_name as string;
        expect($(el, 'section.lc')!.classList.contains(`g-${glass}`)).toBe(true);
        expect(text($(el, 'h2'))).toBe(name);
        expect(text($(el, 'header .sub'))).toBe(want.sub);
        expect(text($(el, '.ro-v'))).toBe(want.big);
        expect(text($(el, '.ro .sub'))).toBe(want.label);
        const sl = pill(el);
        expect(sl.getAttribute('role')).toBe(want.pill);
        if (want.pill === 'slider') {
          expect(sl.getAttribute('aria-label')).toBe(`Speed, ${name}`);
        } else {
          expect(sl.getAttribute('aria-label')).toBe(name);
          expect(sl.getAttribute('aria-checked')).toBe(String(want.power === 'on'));
        }
        expect($$(el, '.mode').map((b) => text(b))).toEqual(want.row);
        expect($(el, '.modes') === null).toBe(want.row.length === 0);
        expect(text($(el, '.chip')) || undefined).toBe(want.chip);
        const power = $(el, '.power') as HTMLButtonElement | null;
        if (want.power === 'none') expect(power).toBeNull();
        else {
          expect(power!.getAttribute('aria-label')).toBe(`Switch ${name}`);
          expect(power!.getAttribute('aria-pressed')).toBe(String(want.power === 'on'));
          expect(power!.disabled).toBe(want.power === 'unavailable' || want.power === 'disabled');
          if (want.power === 'unavailable') expect(power!.style.opacity).toBe('0.5');
        }
        expect(icon.calls.at(-1)).toEqual(['fan', want.icon, NEUTRAL[glass]]);
        // The fill is drawn in the fan_only neutral only (P2-COL-1).
        const fill = $(el, '.lc-slider-fill')!;
        expect(fill.style.backgroundColor.replace(/\s/g, '')).toMatch(glass === 'dark' ? /#d5dce6|rgb\(213,220,230\)/ : /#64748b|rgb\(100,116,139\)/);
        el.remove();
      });
    }
  }

  it('row: oscillate and reverse pressed state, neutral tint while active', async () => {
    const h = fakeHass({ echoMs: null });
    const el = await h.mount(fanIds.reverse);
    const [osc, rev] = $$(el, '.mode');
    expect([osc.getAttribute('aria-pressed'), rev.getAttribute('aria-pressed')]).toEqual(['false', 'true']);
    expect(rev.style.background.replace(/\s/g, '')).toBe('rgba(213,220,230,0.2)');
    expect(osc.style.background).toBe('');
  });

  it('active preset chip uses --lc-btn-on; controls.presets false hides it', async () => {
    const h = fakeHass({ echoMs: null });
    const el = await h.mount(fanIds.presetAuto);
    expect($(el, '.chip')!.style.background).toBe('var(--lc-btn-on)');
    expect($(el, '.chip')!.getAttribute('aria-label')).toBe('Preset: Auto');
    const hidden = await h.mount(fanIds.presetAuto, { controls: { presets: false } });
    expect($(hidden, '.chip')).toBeNull();
  });

  it('pill at HA\'s percentage under a preset (empty when null), aria value text is the preset', async () => {
    const h = fakeHass({ echoMs: null });
    const el = await h.mount(fanIds.presetAuto);
    expect($(el, '.lc-slider-fill')!.style.height).toBe('0%');
    expect(pill(el).getAttribute('aria-valuetext')).toBe('Auto');
    h.set(fanIds.presetAuto, 'on', { percentage: 33 });
    await el.updateComplete;
    expect($(el, '.lc-slider-fill')!.style.height).toBe('0%');
  });

  it('a speed fan at rest reads HA\'s value, not snapped (67 stays 67)', async () => {
    const h = fakeHass({ echoMs: null });
    const el = await h.mount(fanIds.pct67);
    expect(pill(el).getAttribute('aria-valuenow')).toBe('67');
    expect(pill(el).getAttribute('aria-valuetext')).toBe('67%');
    expect($(el, '.lc-slider-fill')!.style.height).toBe('67%');
  });

  it('entity not found and config errors', async () => {
    const h = fakeHass({ echoMs: null });
    const el = await h.mount('fan.nope');
    expect(text($(el, '.unavailable'))).toBe('Entity not found: fan.nope');
    const card = document.createElement(TAGS.fan) as LiquidHomeFanCard;
    expect(() => card.setConfig({ entity: 'light.a' })).toThrow();
    expect(customElements.get(TAGS.fan)).toBe(LiquidHomeFanCard);
    const cfg = normalizeConfig({ type: CARD_TYPES.fan, entity: 'fan.a', write_hold: 'x', controls: { presets: 'no' } });
    expect([cfg.write_hold, cfg.controls.presets, cfg.config_version]).toEqual([defaultConfig.write_hold, true, 1]);
    expect(LiquidHomeFanCard.getStubConfig(h.hass)).toMatchObject({ type: CARD_TYPES.fan, entity: fanIds.off });
  });
});

describe('Q8 a: snapped aria and readout while dragging, the fill follows the finger', () => {
  const PX = 2.8;
  const Y0 = 500;

  it('a drag to 10 % on a 3-speed fan reads aria-valuenow 0 and "Off"; the fill is at 10 %', async () => {
    const h = fakeHass({ echoMs: null });
    const el = await h.mount(fanIds.off);
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointermove', Y0 - 10 * PX);
    await el.updateComplete;
    const sl = pill(el);
    expect(sl.getAttribute('aria-valuenow')).toBe('0');
    expect(sl.getAttribute('aria-valuetext')).toBe('Off');
    expect(text($(el, '.ro-v'))).toBe('Off');
    expect(parseFloat($(el, '.lc-slider-fill')!.style.height)).toBeCloseTo(10, 5);

    pointer(el, 'pointermove', Y0 - 50 * PX);
    await el.updateComplete;
    expect(sl.getAttribute('aria-valuenow')).toBe('66');
    expect(sl.getAttribute('aria-valuetext')).toBe('66%');
    expect(text($(el, '.ro-v'))).toBe('66%');
    expect(parseFloat($(el, '.lc-slider-fill')!.style.height)).toBeCloseTo(50, 5);

    pointer(el, 'pointermove', Y0 - 20 * PX);
    await el.updateComplete;
    expect([sl.getAttribute('aria-valuenow'), sl.getAttribute('aria-valuetext'), text($(el, '.ro-v'))]).toEqual(['33', '33%', '33%']);
    pointer(el, 'pointerup', Y0 - 20 * PX);
    await el.updateComplete;
  });

  it('a drag from a preset shows the snapped step, not the preset', async () => {
    const h = fakeHass({ echoMs: null });
    const el = await h.mount(fanIds.presetAuto);
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointermove', Y0 - 40 * PX);
    await el.updateComplete;
    expect(text($(el, '.ro-v'))).toBe('33%');
    expect(text($(el, '.ro .sub'))).toBe('Speed');
    expect(pill(el).getAttribute('aria-valuetext')).toBe('33%');
    pointer(el, 'pointerup', Y0 - 40 * PX);
  });

  it('a 10-speed fan dragged to 44 % reads 40', async () => {
    const h = fakeHass({ echoMs: null });
    const el = await h.mount(fanIds.ten); // 40
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointermove', Y0 - 4 * PX);
    await el.updateComplete;
    expect(pill(el).getAttribute('aria-valuenow')).toBe('40');
    pointer(el, 'pointermove', Y0 - 6 * PX);
    await el.updateComplete;
    expect(pill(el).getAttribute('aria-valuenow')).toBe('50');
    pointer(el, 'pointerup', Y0 - 6 * PX);
  });
});

describe('P2-CHO-6: Dutch and German worst-case preset readouts fit or ellipsize', () => {
  const WORST = { nl: 'Natuurlijke windmodus', de: 'Nachtabsenkungsmodus' };

  it('the readout CSS steps down to the 44px cluster value and ends in an ellipsis', () => {
    const css = fanCardStyles.cssText.replace(/\s+/g, ' ');
    expect(css).toContain('.big { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }');
    expect(css).toContain('.big.fit { font-size: 44px; }');
  });

  for (const [lang, word] of Object.entries(WORST)) {
    it(`${lang}: "${word}" takes the 44px step when it overflows at 18cqw, and stays the same text`, async () => {
      const h = fakeHass({ echoMs: null, language: lang, formatEntityAttributeValue: (_s, _a, v) => (v === 'auto' ? word : v) });
      // happy-dom does no layout: an overflowing readout is simulated by its scroll width.
      const widths = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
        return this.classList.contains('big') && !this.classList.contains('fit') ? 400 : 100;
      });
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(160);
      const el = await h.mount(fanIds.presetAuto);
      await el.updateComplete;
      const big = $(el, '.big')!;
      expect(text(big)).toBe(word);
      expect(big.classList.contains('fit')).toBe(true);
      expect(text($(el, '.chip .v'))).toBe(word);
      widths.mockReturnValue(50);
      h.set(fanIds.presetAuto, 'on', { preset_mode: 'sleep' });
      await el.updateComplete;
      expect(big.classList.contains('fit')).toBe(false);
      vi.restoreAllMocks();
    });
  }
});

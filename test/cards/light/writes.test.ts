// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { $, fakeHass, ids, key, pill, pointer, text } from './helpers';
import type { LiquidHomeLightCard } from '../../../src/cards/light/card';
import { lightWriters } from '../../../src/lights/writer';
import { CARD_TYPES } from '../../../src/const';

/** Plan 2.5 and gate 2: leading write, at most one per 300 ms, final on release, turn_off at 0, hold, stale echoes. */

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
});
afterEach(async () => {
  document.body.innerHTML = '';
  await vi.runOnlyPendingTimersAsync();
  vi.useRealTimers();
});

/** Let promises and Lit updates settle without moving the clock. */
const settle = async (el?: LiquidHomeLightCard) => {
  await vi.advanceTimersByTimeAsync(0);
  if (el) await el.updateComplete;
};
const tick = async (ms: number, el?: LiquidHomeLightCard) => {
  await vi.advanceTimersByTimeAsync(ms);
  if (el) await el.updateComplete;
};
/** The pill is 280px (TOK-2) in happy-dom, so 2.8px is 1 %. */
const PX = 2.8;
const Y0 = 500;
const bright = (pct: number) => ({ domain: 'light', service: 'turn_on', data: { entity_id: ids.colourHs, brightness_pct: pct } });

describe('pill drag (throttle 300 ms, relative)', () => {
  it('a tap without movement sends nothing (relative drag, CHO-8)', async () => {
    const h = fakeHass({ echoMs: null });
    const el = await h.mount(ids.colourHs);
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointerup', Y0);
    await settle(el);
    expect(h.calls).toEqual([]);
  });

  it('leading write at once, then at most one per 300 ms with the latest value, and a final write on release', async () => {
    const h = fakeHass({ echoMs: null });
    const el = await h.mount(ids.colourHs); // 71 %
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointermove', Y0 - 10 * PX); // 81 %
    await settle(el);
    expect(h.calls).toEqual([bright(81)]);
    // The readout and fill follow at once, no write.
    expect(text($(el, '.ro-v'))).toBe('81%');

    for (const d of [12, 15, 20]) {
      pointer(el, 'pointermove', Y0 - d * PX);
      await tick(50, el);
    }
    expect(h.calls.length).toBe(1);
    await tick(150, el); // 300 ms after the leading write
    expect(h.calls).toEqual([bright(81), bright(91)]);

    pointer(el, 'pointermove', Y0 - 25 * PX); // 96 %
    await tick(20, el);
    expect(h.calls.length).toBe(2);
    pointer(el, 'pointerup', Y0 - 25 * PX);
    await settle(el);
    // Release sends the final value at once.
    expect(h.calls).toEqual([bright(81), bright(91), bright(96)]);
    await tick(1000, el);
    expect(h.calls.length).toBe(3);
  });

  it('release on the value last sent sends nothing more (dedupe)', async () => {
    const h = fakeHass({ echoMs: null });
    const el = await h.mount(ids.colourHs);
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointermove', Y0 - 10 * PX);
    await settle(el);
    pointer(el, 'pointerup', Y0 - 10 * PX);
    await tick(500, el);
    expect(h.calls).toEqual([bright(81)]);
  });

  it('dragging to 0 sends light.turn_off only on release', async () => {
    const h = fakeHass({ echoMs: null });
    const el = await h.mount(ids.colourHs);
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointermove', Y0 + 100 * PX);
    await tick(1000, el);
    expect(h.calls).toEqual([]);
    expect(text($(el, '.ro-v'))).toBe('Off');
    pointer(el, 'pointerup', Y0 + 100 * PX);
    await settle(el);
    expect(h.calls).toEqual([{ domain: 'light', service: 'turn_off', data: { entity_id: ids.colourHs } }]);
  });

  it('dragging to 0 and back up never sends turn_off', async () => {
    const h = fakeHass({ echoMs: null });
    const el = await h.mount(ids.colourHs);
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointermove', Y0 + 100 * PX);
    await tick(400, el);
    pointer(el, 'pointermove', Y0 - 5 * PX); // 0 + 105 % up from the grab point is clamped: 76 %... relative to 71
    await settle(el);
    pointer(el, 'pointerup', Y0 - 5 * PX);
    await tick(400, el);
    expect(h.calls.map((c) => c.service)).toEqual(['turn_on']);
    expect(h.calls[0].data.brightness_pct).toBe(76);
  });
});

describe('hold of the sent value (gate 2)', () => {
  it('a stale echo never makes the fill jump back; the newest value is held until HA reports it', async () => {
    const h = fakeHass({ echoMs: null });
    const el = await h.mount(ids.colourHs);
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointermove', Y0 - 10 * PX); // 81 sent
    await settle(el);
    pointer(el, 'pointermove', Y0 - 20 * PX); // 91 queued
    await tick(300, el); // 91 sent
    pointer(el, 'pointerup', Y0 - 20 * PX);
    await settle(el);
    expect(h.calls.map((c) => c.data.brightness_pct)).toEqual([81, 91]);

    // The echo of the older write arrives.
    h.apply('light', 'turn_on', { entity_id: ids.colourHs, brightness_pct: 81 });
    await settle(el);
    expect(pill(el).getAttribute('aria-valuenow')).toBe('91');
    expect(text($(el, '.ro-v'))).toBe('91%');

    // The newest echo ends the hold; a later change from elsewhere shows at once.
    h.apply('light', 'turn_on', { entity_id: ids.colourHs, brightness_pct: 91 });
    await settle(el);
    h.apply('light', 'turn_on', { entity_id: ids.colourHs, brightness_pct: 30 });
    await settle(el);
    expect(pill(el).getAttribute('aria-valuenow')).toBe('30');
  });

  it('the hold expires after write_hold seconds when HA never reports the value', async () => {
    const h = fakeHass({ echoMs: null });
    const el = await h.mount(ids.colourHs, { write_hold: 2 });
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointermove', Y0 - 10 * PX);
    await settle(el);
    pointer(el, 'pointerup', Y0 - 10 * PX);
    await tick(1900, el);
    expect(pill(el).getAttribute('aria-valuenow')).toBe('81');
    await tick(200, el);
    expect(pill(el).getAttribute('aria-valuenow')).toBe('71');
  });

  it('with a slow HA (echo after 2 s) the card holds the value and settles on it', async () => {
    const h = fakeHass({ echoMs: 2000 });
    const el = await h.mount(ids.colourHs);
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointermove', Y0 - 10 * PX);
    await settle(el);
    pointer(el, 'pointerup', Y0 - 10 * PX);
    await tick(1000, el);
    expect(pill(el).getAttribute('aria-valuenow')).toBe('81');
    await tick(1100, el);
    expect(h.states[ids.colourHs].attributes.brightness).toBe(207);
    expect(pill(el).getAttribute('aria-valuenow')).toBe('81');
    expect(h.calls.length).toBe(1);
  });
});

describe('keyboard (CHO-8) through the same writer', () => {
  it('a held arrow key respects 300 ms; key up flushes the final value', async () => {
    const h = fakeHass({ echoMs: null });
    const el = await h.mount(ids.colourHs);
    pill(el).focus();
    key(el, 'keydown', 'ArrowUp');
    await settle(el);
    expect(h.calls).toEqual([bright(72)]);
    for (let i = 0; i < 4; i++) {
      key(el, 'keydown', 'ArrowUp', true);
      await tick(50, el);
    }
    expect(h.calls.length).toBe(1);
    await tick(100, el);
    expect(h.calls).toEqual([bright(72), bright(76)]);
    key(el, 'keydown', 'ArrowUp', true);
    await settle(el);
    key(el, 'keyup', 'ArrowUp');
    await settle(el);
    expect(h.calls).toEqual([bright(72), bright(76), bright(77)]);
  });

  it('Page Up, Home and End; Down from 1 % turns off on key up', async () => {
    const h = fakeHass({ echoMs: 0 });
    const el = await h.mount(ids.colourHs);
    for (const k of ['PageUp', 'End', 'Home']) {
      key(el, 'keydown', k);
      key(el, 'keyup', k);
      await tick(400, el);
    }
    expect(h.calls.map((c) => c.data.brightness_pct)).toEqual([81, 100, 1]);
    key(el, 'keydown', 'ArrowDown');
    await settle(el);
    expect(h.calls.length).toBe(3);
    key(el, 'keyup', 'ArrowDown');
    await settle(el);
    expect(h.calls[3]).toEqual({ domain: 'light', service: 'turn_off', data: { entity_id: ids.colourHs } });
  });
});

describe('White and Colour payloads (gate 2 prototype)', () => {
  it('White sends color_temp_kelvin across the light range; the echo via mireds counts as the value', async () => {
    const h = fakeHass({ echoMs: 100 });
    const el = await h.mount(ids.colourTemp); // 2631 K, range 2000 to 6535
    $(el, '.mode[data-mode="white"]')!.click();
    await el.updateComplete;
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointermove', Y0 - 20 * PX);
    await settle(el);
    pointer(el, 'pointerup', Y0 - 20 * PX);
    await tick(500, el);
    const k = h.calls[0].data.color_temp_kelvin as number;
    expect(h.calls[0]).toEqual({ domain: 'light', service: 'turn_on', data: { entity_id: ids.colourTemp, color_temp_kelvin: k } });
    expect(Number.isInteger(k)).toBe(true);
    expect(k).toBe(Math.round(2000 + ((((2631 - 2000) / 4535) * 100 + 20) / 100) * 4535));
    expect(h.calls.length).toBe(1);
    expect(text($(el, '.ro-v'))).toBe(`${h.states[ids.colourTemp].attributes.color_temp_kelvin}K`);
  });

  it('Colour sends hs_color [hue, the light saturation], hue position x 3.6', async () => {
    const h = fakeHass({ echoMs: null });
    const el = await h.mount(ids.colourHs); // hs 345, 75
    $(el, '.mode[data-mode="colour"]')!.click();
    await el.updateComplete;
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointermove', Y0 + 50 * PX); // 95.83 - 50 = 45.83 % -> hue 165
    await settle(el);
    pointer(el, 'pointerup', Y0 + 50 * PX);
    await settle(el);
    expect(h.calls).toEqual([{ domain: 'light', service: 'turn_on', data: { entity_id: ids.colourHs, hs_color: [165, 75] } }]);
  });

  it('dragging White on a light in colour mode switches it to colour temperature', async () => {
    const h = fakeHass({ echoMs: 0 });
    const el = await h.mount(ids.colourHs);
    $(el, '.mode[data-mode="white"]')!.click();
    await el.updateComplete;
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointermove', Y0 - 50 * PX);
    await settle(el);
    pointer(el, 'pointerup', Y0 - 50 * PX);
    await tick(100, el);
    expect(h.calls[0].data).toEqual({ entity_id: ids.colourHs, color_temp_kelvin: 4268 });
    expect(text($(el, 'header .sub'))).toMatch(/^On, \d+ K$/);
  });
});

describe('buttons and the toggle', () => {
  it('power button: turn_off while on, bare turn_on while off', async () => {
    const h = fakeHass({ echoMs: 0 });
    const el = await h.mount(ids.colourHs);
    $(el, 'button.power')!.click();
    await tick(10, el);
    expect(h.calls[0]).toEqual({ domain: 'light', service: 'turn_off', data: { entity_id: ids.colourHs } });
    expect($(el, 'button.power')!.getAttribute('aria-pressed')).toBe('false');
    await tick(400, el);
    $(el, 'button.power')!.click();
    await tick(10, el);
    expect(h.calls[1]).toEqual({ domain: 'light', service: 'turn_on', data: { entity_id: ids.colourHs } });
  });

  it('on/off-only: a tap toggles, a drag counts as a tap (Q6), Space toggles', async () => {
    const h = fakeHass({ echoMs: 0 });
    const el = await h.mount(ids.onOffOnly);
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointerup', Y0);
    await tick(10, el);
    expect(h.calls.map((c) => c.service)).toEqual(['turn_off']);
    expect(pill(el).getAttribute('aria-checked')).toBe('false');
    await tick(400, el);
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointermove', Y0 - 80);
    pointer(el, 'pointerup', Y0 - 80);
    await tick(10, el);
    expect(h.calls.map((c) => c.service)).toEqual(['turn_off', 'turn_on']);
    await tick(400, el);
    key(el, 'keydown', ' ');
    await tick(10, el);
    expect(h.calls.map((c) => c.service)).toEqual(['turn_off', 'turn_on', 'turn_off']);
  });

  it('effect chip cycles the effect list (CHO-15)', async () => {
    const h = fakeHass({ echoMs: 0 });
    const el = await h.mount(ids.effectList); // rainbow of [rainbow, off]
    (el.shadowRoot!.querySelector('.chip') as HTMLElement).click();
    await tick(10, el);
    expect(h.calls[0]).toEqual({ domain: 'light', service: 'turn_on', data: { entity_id: ids.effectList, effect: 'off' } });
    expect(text($(el, '.chip .v'))).toBe('None');
  });

  it('an unavailable light ignores input', async () => {
    const h = fakeHass({ echoMs: 0 });
    const el = await h.mount(ids.unavailable);
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointermove', Y0 - 50);
    pointer(el, 'pointerup', Y0 - 50);
    key(el, 'keydown', 'ArrowUp');
    key(el, 'keyup', 'ArrowUp');
    $(el, 'button.power')!.click();
    await tick(500, el);
    expect(h.calls).toEqual([]);
  });

  it('a failed call shows the error and drops the held value', async () => {
    const h = fakeHass({ echoMs: null });
    const el = await h.mount(ids.colourHs);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.hass.callService = async () => {
      throw new Error('boom');
    };
    el.hass = h.hass;
    $(el, 'button.power')!.click();
    await tick(10, el);
    expect(text($(el, '.alert'))).toBe('boom');
    expect($(el, 'button.power')!.getAttribute('aria-pressed')).toBe('true');
    err.mockRestore();
  });
});

describe('writer lifetime (P11x LOW-10)', () => {
  it('switching the entity with setConfig releases the old writer and sends its pending value', async () => {
    const h = fakeHass({ echoMs: null });
    const el = await h.mount(ids.colourHs);
    key(el, 'keydown', 'ArrowUp');
    await settle(el);
    for (let i = 0; i < 3; i++) key(el, 'keydown', 'ArrowUp', true);
    await settle(el);
    expect(h.calls).toEqual([bright(72)]);
    expect(lightWriters.refs(ids.colourHs)).toBe(1);
    el.setConfig({ type: CARD_TYPES.light, entity: ids.rgbw });
    await tick(400, el);
    expect(lightWriters.refs(ids.colourHs)).toBe(0);
    expect(lightWriters.refs(ids.rgbw)).toBe(1);
    expect(h.calls).toEqual([bright(72), bright(75)]);
  });

  it('taking the card off the page mid-drag ends its hold and sends the final value', async () => {
    const h = fakeHass({ echoMs: null });
    const el = await h.mount(ids.colourHs);
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointermove', Y0 - 10 * PX);
    await settle(el);
    pointer(el, 'pointermove', Y0 - 20 * PX);
    await tick(50, el);
    expect(h.calls).toEqual([bright(81)]);
    document.body.removeChild(el);
    await tick(400);
    expect(h.calls).toEqual([bright(81), bright(91)]);
    expect(lightWriters.refs(ids.colourHs)).toBe(0);
  });

  it('taking the card off the page while dragged to 0 still sends turn_off', async () => {
    const h = fakeHass({ echoMs: null });
    const el = await h.mount(ids.colourHs);
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointermove', Y0 + 100 * PX);
    await tick(400, el);
    expect(h.calls).toEqual([]);
    document.body.removeChild(el);
    await tick(400);
    expect(h.calls).toEqual([{ domain: 'light', service: 'turn_off', data: { entity_id: ids.colourHs } }]);
  });

  it('removed and appended again, the card takes its writer back: ArrowUp sends, one ref', async () => {
    const h = fakeHass({ echoMs: null });
    const el = await h.mount(ids.colourHs);
    expect(lightWriters.refs(ids.colourHs)).toBe(1);
    el.remove();
    await tick(0);
    expect(lightWriters.refs(ids.colourHs)).toBe(0);
    document.body.append(el);
    await settle(el);
    expect(lightWriters.refs(ids.colourHs)).toBe(1);
    key(el, 'keydown', 'ArrowUp');
    key(el, 'keyup', 'ArrowUp');
    await settle(el);
    expect(h.calls).toEqual([bright(72)]);
    expect(lightWriters.refs(ids.colourHs)).toBe(1);
  });

  it('a synchronous DOM move (an HA relayout) keeps one ref', async () => {
    const h = fakeHass({ echoMs: null });
    const el = await h.mount(ids.colourHs);
    const box = document.createElement('div');
    document.body.append(box);
    box.append(el); // disconnect and connect in one task
    await settle(el);
    expect(lightWriters.refs(ids.colourHs)).toBe(1);
    key(el, 'keydown', 'ArrowUp');
    key(el, 'keyup', 'ArrowUp');
    await settle(el);
    expect(h.calls).toEqual([bright(72)]);
    expect(lightWriters.refs(ids.colourHs)).toBe(1);
    el.remove();
    await tick(0);
    expect(lightWriters.refs(ids.colourHs)).toBe(0);
  });

  it('a Colour drag to the top sends hue 360 (the wrap is kept, as the prototype)', async () => {
    const h = fakeHass({ echoMs: null });
    const el = await h.mount(ids.colourHs);
    $(el, '.mode[data-mode="colour"]')!.click();
    await el.updateComplete;
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointermove', Y0 - 50 * PX);
    await settle(el);
    pointer(el, 'pointerup', Y0 - 50 * PX);
    await settle(el);
    expect(h.calls).toEqual([{ domain: 'light', service: 'turn_on', data: { entity_id: ids.colourHs, hs_color: [360, 75] } }]);
  });
});

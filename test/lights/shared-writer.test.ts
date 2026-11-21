// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { $, $$, fakeHass, ids, pointer, text } from '../cards/light/helpers';
import '../../src/cards/tile';
import { lightWriters } from '../../src/lights';
import { TAGS } from '../../src/const';

/**
 * One product-wide writer per light (src/lights): a tile and a light card on the same entity share one queue, so
 * driving both at once gives at most one call per 300 ms and both cards always show the same pending value.
 */

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
});
afterEach(async () => {
  document.body.innerHTML = '';
  await vi.runOnlyPendingTimersAsync();
  vi.useRealTimers();
});

const PX = 2.8; // 1 % of the 280px pill
const Y0 = 500;

type Tile = HTMLElement & { hass?: unknown; setConfig(c: unknown): void; updateComplete: Promise<boolean> };

/** A light card and a tile on Kitchen Lights (71 %); the tile also gets every new hass the fake publishes. */
async function setup(echoMs: number | null) {
  const h = fakeHass({ echoMs });
  const card = await h.mount(ids.colourHs);
  const tile = document.createElement(TAGS.tile) as Tile;
  tile.setConfig({ type: `custom:${TAGS.tile}`, entity: ids.colourHs });
  tile.hass = h.hass;
  document.body.append(tile);
  await tile.updateComplete;
  const publish = h.publish;
  h.publish = () => {
    publish();
    tile.hass = h.hass;
  };
  return { h, card, tile };
}

describe('tile step and light card drag on one entity', () => {
  it('share one writer: one queue, at most one call per 300 ms while both are driven, no value contention', async () => {
    const { h, card, tile } = await setup(null);
    expect(lightWriters.refs(ids.colourHs)).toBe(2);

    // The fake clock's time of every call (the fake hass object the cards hold).
    const at: number[] = [];
    const call = h.hass.callService;
    h.hass.callService = ((...args: Parameters<typeof call>) => {
      at.push(Date.now());
      return call(...args);
    }) as typeof call;
    const up = () => $$(tile, '.step')[1] as HTMLButtonElement;
    const shown = () => ({ card: text($(card, '.ro-v')), tile: text($(tile, '.target')) });
    const mismatches: string[] = [];
    let presses = 0;

    pointer(card, 'pointerdown', Y0);
    // 1.5 s: the pill moves up every 20 ms, the tile's + is pressed every 110 ms.
    let y = Y0;
    for (let ms = 0; ms < 1500; ms += 10) {
      if (ms % 20 === 0) {
        y -= 0.5 * PX;
        pointer(card, 'pointermove', y);
      }
      if (ms % 110 === 0 && !up().disabled) {
        up().click();
        presses++;
      }
      await vi.advanceTimersByTimeAsync(10);
      await card.updateComplete;
      await tile.updateComplete;
      const s = shown();
      // Both cards read the one writer: the same pending value, never two competing ones.
      if (s.card !== s.tile) mismatches.push(`${ms}: card ${s.card}, tile ${s.tile}`);
    }
    expect(presses).toBeGreaterThan(5);
    expect(mismatches).toEqual([]);
    expect(at.length).toBeGreaterThan(3);
    for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1], `gap before call ${i}`).toBeGreaterThanOrEqual(300);
    expect(h.calls.every((c) => c.service === 'turn_on' && c.data.entity_id === ids.colourHs && typeof c.data.brightness_pct === 'number')).toBe(true);

    pointer(card, 'pointerup', y);
    await vi.advanceTimersByTimeAsync(1000);
    await card.updateComplete;
    await tile.updateComplete;
    // The final value of the shared queue went out, each value once, and both cards show it.
    const last = h.calls.at(-1)!.data.brightness_pct;
    expect(shown()).toEqual({ card: `${last}%`, tile: `${last}%` });
    const values = h.calls.map((c) => c.data.brightness_pct);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('power and toggle taps are immediate (writer.sendNow)', () => {
  it('a tile power tap right after a light card drag write goes out at once, inside the throttle window', async () => {
    const { h, card, tile } = await setup(null);
    pointer(card, 'pointerdown', Y0);
    pointer(card, 'pointermove', Y0 - 10 * PX);
    await vi.advanceTimersByTimeAsync(0);
    pointer(card, 'pointerup', Y0 - 10 * PX);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls.map((c) => c.service)).toEqual(['turn_on']);
    ($(tile, '.power') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls.map((c) => c.service)).toEqual(['turn_on', 'turn_off']);
  });

  it('the light card power button sends at once, twice within 300 ms', async () => {
    const { h, card } = await setup(0);
    ($(card, 'header .power') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(0);
    await card.updateComplete;
    expect(text($(card, '.ro-v'))).toBe('Off');
    ($(card, 'header .power') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls.map((c) => c.service)).toEqual(['turn_off', 'turn_on']);
  });

  it('the on/off-only toggle pill sends at once on tap', async () => {
    const h = fakeHass({ echoMs: 0 });
    const card = await h.mount(ids.onOffOnly);
    pointer(card, 'pointerdown', Y0);
    pointer(card, 'pointerup', Y0);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls).toEqual([{ domain: 'light', service: 'turn_off', data: { entity_id: ids.onOffOnly } }]);
  });
});

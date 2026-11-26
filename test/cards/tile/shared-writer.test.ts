// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeAssistant } from '@decibel95/liquid-core';
import '../../../src/cards/tile';
import '../../../src/cards/cover';
import '../../../src/cards/fan';
import { lightSheet } from '../../../src/cards/sheet/open';
import { coverWriters } from '../../../src/covers';
import { fanWriters } from '../../../src/fans';
import { createCoverSim, type CoverSim } from '../../covers/sim';
import { fakeHass as fanHass } from '../fan/helpers';
import { $, $$, FAKE_CLOCK, text, type AnyEl } from './helpers';

/**
 * Plan 2.6, shared writer (H4): a tile step and the pill of the card the tile opens in the sheet, on the same cover
 * (and on the same fan), go through one writer (WriterRegistry refs 2) and coalesce in its queue.
 */

let sims: CoverSim[] = [];
beforeEach(() => vi.useFakeTimers(FAKE_CLOCK));
afterEach(async () => {
  lightSheet()?.close();
  document.body.innerHTML = '';
  for (const s of sims) s.stopAll();
  sims = [];
  await vi.runOnlyPendingTimersAsync();
  vi.useRealTimers();
});

const Y0 = 500;
const tick = async (ms: number) => {
  await vi.advanceTimersByTimeAsync(ms);
};

/** Mount a tile on `entity`, open its card in the sheet from the name, and return both. */
async function tileWithSheet(entity: string, hass: HomeAssistant, follow: (l: (h: HomeAssistant) => void) => void) {
  const tile = document.createElement('liquid-home-tile') as AnyEl;
  tile.setConfig({ type: 'custom:liquid-home-tile', entity });
  tile.hass = hass;
  document.body.append(tile);
  await tile.updateComplete;
  ($(tile, 'button.body') as HTMLButtonElement).click();
  await tick(0);
  const sheet = lightSheet()!;
  await sheet.updateComplete;
  await tick(50);
  const card = sheet.shadowRoot!.querySelector(entity.startsWith('cover.') ? 'liquid-home-cover-card' : 'liquid-home-fan-card') as AnyEl;
  expect(card).not.toBeNull();
  // The sheet card follows the tile's hass (core openFor); both follow every published hass here.
  follow((h) => {
    tile.hass = h;
    card.hass = h;
  });
  await card.updateComplete;
  return { tile, card, sheet };
}

const slider = (card: AnyEl) => card.shadowRoot!.querySelector('.lc-slider') as HTMLElement;
const pointer = (card: AnyEl, type: string, clientY: number) =>
  slider(card).dispatchEvent(new PointerEvent(type, { pointerId: 1, clientY, button: 0, pointerType: 'touch', bubbles: true, cancelable: true }));

describe('tile step and sheet card pill on one cover', () => {
  it('share one writer (refs 2) and coalesce: the pending step is replaced by the pill value, one call', async () => {
    const sim = createCoverSim({ echoMs: null });
    sims.push(sim);
    const id = 'cover.hall_window';
    const { tile, card } = await tileWithSheet(id, sim.hass, (l) => sim.onHass(l));
    expect(coverWriters.refs(id)).toBe(2);

    // A tile Plus tap: pending 20, nothing sent (Q2 a debounce 500).
    ($$(tile, 'button.step')[1] as HTMLButtonElement).click();
    await tick(100);
    expect(text($(tile, '.target'))).toBe('20%');
    expect(sim.calls).toEqual([]);

    // Before the debounce ends, a pill drag in the sheet card. The pill starts at the shared pending 20 (one agreed
    // value), so 140 px up on the 280 px pill is +50: 70.
    pointer(card, 'pointerdown', Y0);
    pointer(card, 'pointermove', Y0 - 70);
    await tick(60);
    pointer(card, 'pointermove', Y0 - 140);
    await tick(60);
    // Nothing goes out while the pill holds the shared queue, also not the tile's pending step.
    expect(sim.calls).toEqual([]);
    pointer(card, 'pointerup', Y0 - 140);
    await tick(0);
    await tick(3000);
    expect(sim.calls).toEqual([{ domain: 'cover', service: 'set_cover_position', data: { entity_id: id, position: 70 } }]);
    // The tile shows the one held value, and the step never went out on its own.
    await tile.updateComplete;
    expect(text($(tile, '.target'))).toBe('10%');
    const w = coverWriters.acquire(id);
    expect(w.held('position')).toBe(70);
    coverWriters.release(w);
    expect(coverWriters.refs(id)).toBe(2);
  });

  it('a pill drag first, then a tile step on the held value: one queue, the step counts from the hold', async () => {
    const sim = createCoverSim({ echoMs: null });
    sims.push(sim);
    const id = 'cover.hall_window';
    const { tile, card } = await tileWithSheet(id, sim.hass, (l) => sim.onHass(l));
    pointer(card, 'pointerdown', Y0);
    pointer(card, 'pointermove', Y0 - 56);
    pointer(card, 'pointerup', Y0 - 56);
    await tick(0);
    expect(sim.calls.map((c) => c.data.position)).toEqual([30]);
    ($$(tile, 'button.step')[1] as HTMLButtonElement).click();
    await tick(500);
    // The baseline is the held 30, not HA's 10: one queue, one agreed value.
    expect(sim.calls.map((c) => c.data.position)).toEqual([30, 40]);
  });
});

describe('tile step and sheet card pill on one fan', () => {
  it('share one writer (refs 2): the second step and the pill coalesce into one call', async () => {
    const fh = fanHass();
    const id = 'fan.living_room_fan_33';
    const listeners: ((h: HomeAssistant) => void)[] = [];
    const publish = fh.publish;
    fh.publish = () => {
      publish();
      for (const l of listeners) l(fh.hass);
    };
    const { tile, card } = await tileWithSheet(id, fh.hass, (l) => listeners.push(l));
    expect(fanWriters.refs(id)).toBe(2);
    const at: number[] = [];
    const call = fh.hass.callService;
    for (const target of [tile, card]) {
      target.hass.callService = ((...args: Parameters<typeof call>) => {
        at.push(performance.now());
        return call(...args);
      }) as typeof call;
    }

    const t0 = performance.now();
    const faster = () => ($$(tile, 'button.step')[1] as HTMLButtonElement).click();
    faster(); // leading write: 66
    await tick(20);
    faster(); // pending: 100, inside the window
    await tick(20);
    expect(fh.calls.map((c) => c.data.percentage)).toEqual([66]);

    // The pill in the sheet, inside the same window: 200 px down from the pending 100 gives 29, snapped to 33.
    pointer(card, 'pointerdown', Y0);
    pointer(card, 'pointermove', Y0 + 200);
    pointer(card, 'pointerup', Y0 + 200);
    await tick(0);
    await tick(2000);
    // One call for the tile's second step and the pill together: the pending 100 never goes out, the pill's release
    // sends the coalesced final value (core throttle: release sends at once), and nothing follows.
    expect(fh.calls.map((c) => `${c.service} ${c.data.percentage}`)).toEqual(['set_percentage 66', 'set_percentage 33']);
    expect(at[0] - t0).toBeLessThan(1);
    expect(at[1] - t0).toBe(40);
  });
});

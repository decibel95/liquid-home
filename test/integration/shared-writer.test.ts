// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeAssistant } from '@decibel95/liquid-core';
import '../../src/index';
import { CARD_TYPES, TAGS } from '../../src/const';
import { lightSheet } from '../../src/cards/sheet/open';
import { coverWriters } from '../../src/covers';
import { fanWriters } from '../../src/fans';
import { createCoverSim, type CoverSim } from '../covers/sim';
import { fakeHass as fanHass } from '../cards/fan/helpers';
import { FAKE_CLOCK } from '../cards/tile/helpers';

/**
 * Plan 2.7, three-way shared writer (H6, after M2): the tile, the room strip and the card the tile opens in the sheet,
 * all on one cover (and on one fan), hold the one writer of that entity (WriterRegistry refs 3). A step from each goes
 * into the same queue and coalesces there; a surface that leaves releases only its own hold.
 */

type AnyEl = HTMLElement & Record<string, any>;
const $ = (el: AnyEl, sel: string) => el.shadowRoot!.querySelector(sel) as HTMLElement;
const $$ = (el: AnyEl, sel: string) => [...el.shadowRoot!.querySelectorAll(sel)] as HTMLElement[];
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

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

const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);
const Y0 = 500;
const pointer = (card: AnyEl, type: string, clientY: number) =>
  $(card, '.lc-slider').dispatchEvent(new PointerEvent(type, { pointerId: 1, clientY, button: 0, pointerType: 'touch', bubbles: true, cancelable: true }));

/**
 * A tile and a one-member list room on `entity`, and the entity's card opened in the sheet from the tile's name. Every
 * surface follows each published hass.
 */
async function threeSurfaces(entity: string, hass: HomeAssistant, follow: (l: (h: HomeAssistant) => void) => void) {
  const domain = entity.startsWith('cover.') ? 'cover' : 'fan';
  const tile = document.createElement(TAGS.tile) as AnyEl;
  tile.setConfig({ type: CARD_TYPES.tile, entity });
  tile.hass = hass;
  const room = document.createElement(TAGS.room) as AnyEl;
  room.setConfig({ type: CARD_TYPES.room, domains: [domain], entities: [entity] });
  room.hass = hass;
  document.body.append(tile, room);
  await tile.updateComplete;
  await room.updateComplete;
  ($(tile, 'button.body') as HTMLButtonElement).click();
  await tick(0);
  const sheet = lightSheet()!;
  await sheet.updateComplete;
  await tick(50);
  const card = sheet.shadowRoot!.querySelector(domain === 'cover' ? TAGS.cover : TAGS.fan) as AnyEl;
  expect(card).not.toBeNull();
  follow((h) => {
    tile.hass = h;
    room.hass = h;
    card.hass = h;
  });
  await card.updateComplete;
  return { tile, room, card, sheet };
}

const tileStep = (tile: AnyEl, i: 0 | 1) => ($$(tile, 'button.step')[i] as HTMLButtonElement).click();
const stripStep = (room: AnyEl, i: 0 | 1) => ($$(room, '.strip .step')[i] as HTMLButtonElement).click();

describe('one cover: tile, room strip and sheet card', () => {
  it('hold one CoverWriter (refs 3); a tile step, a strip step and a pill drag coalesce into one call', async () => {
    const sim = createCoverSim({ echoMs: null });
    sims.push(sim);
    const id = 'cover.hall_window';
    const { tile, room, card } = await threeSurfaces(id, sim.hass, (l) => sim.onHass(l));
    expect(coverWriters.refs(id)).toBe(3);

    // Tile Open 10%: pending 20 from HA's 10 (Q2 a, 500 ms debounce), nothing sent.
    tileStep(tile, 1);
    await tick(100);
    // Strip Open 10% inside the window: it counts from the shared pending 20, so 30; the queue restarts its debounce.
    stripStep(room, 1);
    await tick(100);
    await room.updateComplete;
    await tile.updateComplete;
    expect(sim.calls).toEqual([]);
    expect(text($(tile, '.target'))).toBe('30%');
    expect(text($(room, '.strip .target'))).toBe('Position 30%');

    // A pill drag in the sheet card before the debounce ends: it starts at the shared 30; 56 px up on the 280 px pill
    // is +20, so 50. Nothing goes out while it holds the queue.
    pointer(card, 'pointerdown', Y0);
    pointer(card, 'pointermove', Y0 - 28);
    await tick(60);
    pointer(card, 'pointermove', Y0 - 56);
    await tick(60);
    expect(sim.calls).toEqual([]);
    pointer(card, 'pointerup', Y0 - 56);
    await tick(0);
    await tick(3000);
    // One call for all three: the steps never went out on their own.
    expect(sim.calls).toEqual([{ domain: 'cover', service: 'set_cover_position', data: { entity_id: id, position: 50 } }]);
    const w = coverWriters.acquire(id);
    expect(w.held('position')).toBe(50);
    coverWriters.release(w);
  });

  it('a surface that leaves releases only its own hold; the others keep the one writer and its held value', async () => {
    const sim = createCoverSim({ echoMs: null });
    sims.push(sim);
    const id = 'cover.hall_window';
    const { tile, room, sheet } = await threeSurfaces(id, sim.hass, (l) => sim.onHass(l));
    const before = coverWriters.acquire(id);
    coverWriters.release(before);
    stripStep(room, 1);
    await tick(600);
    expect(sim.calls.map((c) => c.data.position)).toEqual([20]);

    // The room leaves: the tile and the sheet card keep the same writer, with the strip's held value still there.
    room.remove();
    expect(coverWriters.refs(id)).toBe(2);
    const w = coverWriters.acquire(id);
    expect(w).toBe(before);
    expect(w.held('position')).toBe(20);
    coverWriters.release(w);

    // The tile counts on from the held 20 through the same queue.
    tileStep(tile, 1);
    await tick(600);
    expect(sim.calls.map((c) => c.data.position)).toEqual([20, 30]);

    // The sheet card leaves (Close): only its hold goes.
    sheet.close();
    await tick(500);
    expect(coverWriters.refs(id)).toBe(1);
    expect(coverWriters.acquire(id)).toBe(before);
    coverWriters.release(before);
    tile.remove();
    expect(coverWriters.refs(id)).toBe(0);
  });

  it('the tile that opened the sheet leaves: its hold goes, and the sheet closes with its owner (core openFor)', async () => {
    const sim = createCoverSim({ echoMs: null });
    sims.push(sim);
    const id = 'cover.hall_window';
    const { tile } = await threeSurfaces(id, sim.hass, (l) => sim.onHass(l));
    tile.remove();
    expect(coverWriters.refs(id)).toBe(2);
    await tick(500);
    expect(coverWriters.refs(id)).toBe(1);
  });
});

describe('one fan: tile, room strip and sheet card', () => {
  /** The fan fake publishes to every surface. */
  function fan() {
    const fh = fanHass();
    const listeners: ((h: HomeAssistant) => void)[] = [];
    const publish = fh.publish;
    fh.publish = () => {
      publish();
      for (const l of listeners) l(fh.hass);
    };
    return { fh, follow: (l: (h: HomeAssistant) => void) => listeners.push(l) };
  }

  it('hold one FanWriter (refs 3); tile Faster, strip Faster and a pill drag in one window: the leading call and one final call', async () => {
    const { fh, follow } = fan();
    // Ten speeds at 40 % (test HA fan.lh_fixture_ten).
    const id = 'fan.lh_fixture_ten';
    const { tile, room, card } = await threeSurfaces(id, fh.hass, follow);
    expect(fanWriters.refs(id)).toBe(3);

    tileStep(tile, 1); // leading write: 50
    await tick(20);
    stripStep(room, 1); // pending 60 inside the 300 ms window, counted from the shared 50
    await tick(20);
    expect(fh.calls.map((c) => c.data.percentage)).toEqual([50]);
    await room.updateComplete;
    expect(text($(room, '.strip .target'))).toBe('Speed 60%');

    // The pill in the sheet inside the same window: 56 px up on the 280 px pill is +20 from the pending 60: 80.
    pointer(card, 'pointerdown', Y0);
    pointer(card, 'pointermove', Y0 - 56);
    pointer(card, 'pointerup', Y0 - 56);
    await tick(0);
    await tick(2000);
    // The pending 60 never goes out: the release sends the coalesced final value, and nothing follows.
    expect(fh.calls.map((c) => `${c.service} ${c.data.percentage}`)).toEqual(['set_percentage 50', 'set_percentage 80']);
  });

  it('a surface that leaves releases only its own hold', async () => {
    const { fh, follow } = fan();
    const id = 'fan.lh_fixture_ten';
    const { tile, room, sheet } = await threeSurfaces(id, fh.hass, follow);
    const before = fanWriters.acquire(id);
    fanWriters.release(before);
    room.remove();
    expect(fanWriters.refs(id)).toBe(2);
    const w = fanWriters.acquire(id);
    expect(w).toBe(before);
    fanWriters.release(w);
    // The tile still writes through it.
    tileStep(tile, 1);
    await tick(0);
    expect(fh.calls.map((c) => c.data.percentage)).toEqual([50]);
    sheet.close();
    await tick(500);
    expect(fanWriters.refs(id)).toBe(1);
    tile.remove();
    expect(fanWriters.refs(id)).toBe(0);
  });
});

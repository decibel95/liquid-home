// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { coverWriters, type CoverWriter } from '../../src/covers';
import { coverHarness, fill, ids, pill, pointer } from '../cards/cover/helpers';
import type { CoverSim } from './sim';

/**
 * Q6 a, per key: the sent value stays held until (1) HA reports exactly it, (2) the cover moved and stopped, (3)
 * another command goes out, (4) `write_hold` (10 s) after the last movement, or (5) the cover never moved and a fresh
 * echo came more than 400 ms after the send. Facts adaptations: HA has no tilt moving state (tilt ends by (1), (3),
 * (4) or (5)); the moving state counts for the position key only.
 */

let sims: CoverSim[] = [];
const writers: CoverWriter[] = [];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
});
afterEach(async () => {
  document.body.innerHTML = '';
  for (const w of writers.splice(0)) coverWriters.release(w);
  for (const s of sims) s.stopAll();
  sims = [];
  await vi.runOnlyPendingTimersAsync();
  vi.useRealTimers();
});

const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

/** The simulated HA and the cover's shared writer, observing every published hass (as a card does). */
function setup(id: string, opts: Parameters<typeof coverHarness>[0] = {}) {
  const h = coverHarness(opts);
  sims.push(h);
  const w = coverWriters.acquire(id);
  writers.push(w);
  w.hass = h.hass;
  h.onHass((hass) => w.observe(hass));
  /** What a pill or key gesture end does: set, then send at once. */
  const send = (patch: { position?: number; tilt_position?: number }) => {
    w.set(patch);
    w.sendPending();
  };
  return { h, w, send };
}

describe('the five end conditions', () => {
  it('(1) HA reports exactly the held value, even while still moving', async () => {
    const { h, w, send } = setup(ids.hall, { echoMs: null });
    send({ position: 50 });
    h.set(ids.hall, 'opening', { current_position: 30 });
    expect(w.held('position')).toBe(50);
    h.set(ids.hall, 'opening', { current_position: 50 });
    expect(w.held('position')).toBeUndefined();
  });

  it('(2) the cover moved and stopped', async () => {
    const { h, w, send } = setup(ids.hall, { echoMs: null });
    send({ position: 53 });
    h.set(ids.hall, 'opening');
    h.set(ids.hall, 'opening', { current_position: 20 });
    expect(w.held('position')).toBe(53);
    h.set(ids.hall, 'open', { current_position: 30 });
    expect(w.held('position')).toBeUndefined();
  });

  it('(3) another command: a new value replaces the hold, a discrete action ends it', async () => {
    const { w, send } = setup(ids.hall, { echoMs: null });
    send({ position: 53 });
    send({ position: 80 });
    expect(w.held('position')).toBe(80);
    w.act('stop_cover');
    expect(w.held('position')).toBeUndefined();
  });

  it('(4) 10 s after the last movement; each reported change restarts the 10 s', async () => {
    const { h, w, send } = setup(ids.hall, { echoMs: null });
    send({ position: 53 });
    h.set(ids.hall, 'opening');
    await tick(6000);
    h.set(ids.hall, 'opening', { current_position: 20 }); // a movement at 6 s
    await tick(9900);
    expect(w.held('position')).toBe(53);
    await tick(200); // 10 s after the movement
    expect(w.held('position')).toBeUndefined();
  });

  it('(4) uses write_hold: 3 s', async () => {
    const { w, send } = setup(ids.hall, { echoMs: null });
    w.hold = 3;
    send({ position: 53 });
    await tick(2900);
    expect(w.held('position')).toBe(53);
    await tick(200);
    expect(w.held('position')).toBeUndefined();
  });

  it('(5) never moved: an echo more than 400 ms after the send ends it at once', async () => {
    const { h, w, send } = setup(ids.hall, { echoMs: null });
    send({ position: 12 });
    await tick(500);
    expect(w.held('position')).toBe(12);
    h.set(ids.hall, 'open'); // fresh object, nothing moved, 500 ms
    expect(w.held('position')).toBeUndefined();
  });

  it('(5) never moved: an echo within 400 ms ends it at the 400 ms mark (prototype sweep), not before', async () => {
    const { h, w, send } = setup(ids.hall, { echoMs: null });
    send({ position: 12 });
    await tick(250);
    h.set(ids.hall, 'open'); // the echo at 250 ms
    await tick(140);
    expect(w.held('position')).toBe(12);
    await tick(20);
    expect(w.held('position')).toBeUndefined();
  });

  it('(5) does not fire when the cover starts moving after an early echo', async () => {
    const { h, w, send } = setup(ids.hall, { echoMs: null });
    send({ position: 50 });
    await tick(100);
    h.set(ids.hall, 'open'); // early echo, still
    await tick(100);
    h.set(ids.hall, 'opening'); // then it moves
    await tick(1000);
    expect(w.held('position')).toBe(50);
  });

  it('(5) waits while another key moves the cover: a tilt hold on a 511 cover keeps through position travel', async () => {
    const { h, w, send } = setup(ids.living, { echoMs: null });
    send({ tilt_position: 73 });
    await tick(500);
    h.set(ids.living, 'opening', { current_position: 80 });
    expect(w.held('tilt_position')).toBe(73);
  });

  it('(5) a hass update that leaves the cover state object as it was is no echo', async () => {
    const { h, w, send } = setup(ids.hall, { echoMs: null });
    send({ position: 12 });
    await tick(600);
    h.publish(); // same state object
    expect(w.held('position')).toBe(12);
  });
});

describe('travel', () => {
  it('a 30 s travel keeps the hold (each movement restarts the 10 s), released at arrival', async () => {
    const { h, w, send } = setup(ids.hallClosed, { motorMs: 3000 });
    send({ position: 100 });
    await tick(25000);
    expect(h.states[ids.hallClosed].state).toBe('opening');
    expect(w.held('position')).toBe(100);
    await tick(6000);
    expect(h.states[ids.hallClosed].attributes.current_position).toBe(100);
    expect(w.held('position')).toBeUndefined();
  });

  it('a stale echo does not move the hold: an older value reported keeps the newest held', async () => {
    const { h, w, send } = setup(ids.hall, { echoMs: null });
    send({ position: 30 });
    send({ position: 60 });
    h.set(ids.hall, 'opening', { current_position: 30 });
    expect(w.held('position')).toBe(60);
    expect(w.local.position).toBe(60);
  });

  it('the rounding cover settles at its reported value at arrival (prototype F1: 53 sent, 50 reported)', async () => {
    const { h, w, send } = setup(ids.hall);
    send({ position: 53 });
    await tick(4000);
    expect(w.held('position')).toBe(53);
    await tick(1000);
    expect(h.states[ids.hall].state).toBe('open');
    expect(h.states[ids.hall].attributes.current_position).toBe(50);
    expect(w.held('position')).toBeUndefined();
  });
});

describe('tilt (no tilt moving state in HA)', () => {
  it('a rounding tilt is released 10 s after its last change, not at arrival', async () => {
    const { h, w, send } = setup(ids.living);
    send({ tilt_position: 73 });
    await tick(2300); // 60 at 1.25 s, 70 at 2.25 s
    expect(h.states[ids.living].attributes.current_tilt_position).toBe(70);
    expect(w.held('tilt_position')).toBe(73);
    await tick(9900);
    expect(w.held('tilt_position')).toBe(73);
    await tick(100); // 10 s after the last tilt change
    expect(w.held('tilt_position')).toBeUndefined();
  });

  it('a tilt hold is not ended by a position stop on a 511 cover', async () => {
    const { h, w, send } = setup(ids.living);
    send({ tilt_position: 73 });
    send({ position: 90 });
    await tick(2400); // position 70 to 90 and stopped, tilt at 70
    expect(h.states[ids.living].state).toBe('open');
    expect(h.states[ids.living].attributes.current_position).toBe(90);
    expect(w.held('position')).toBeUndefined();
    expect(w.held('tilt_position')).toBe(73);
  });

  it('a pill write keeps the other key held; a step drops it (prototype dropHolds on a step)', async () => {
    const { w, send } = setup(ids.living, { echoMs: null });
    send({ tilt_position: 73 });
    send({ position: 40 });
    expect(w.held('tilt_position')).toBe(73);
    w.step(1);
    await tick(500);
    expect(w.held('position')).toBe(50);
    expect(w.held('tilt_position')).toBeUndefined();
  });
});

describe('sawMoving carry-over', () => {
  it('a new position hold inherits "saw moving" from the hold it replaces, so the stop still ends it', async () => {
    const { h, w, send } = setup(ids.hall, { echoMs: null });
    send({ position: 80 });
    h.set(ids.hall, 'opening', { current_position: 20 });
    // The writer has not seen the stop yet when the next value goes out.
    w.hass = { ...h.hass, states: { ...h.hass.states, [ids.hall]: { ...h.states[ids.hall], state: 'open' } } };
    send({ position: 40 });
    expect(w.held('position')).toBe(40);
    h.set(ids.hall, 'open', { current_position: 30 });
    expect(w.held('position')).toBeUndefined();
  });

  it('without a moving hold before it, a still cover is not ended by a non-moving report (condition 5 only)', async () => {
    const { h, w, send } = setup(ids.hall, { echoMs: null });
    send({ position: 40 });
    await tick(100);
    h.set(ids.hall, 'open', { current_position: 10 });
    expect(w.held('position')).toBe(40);
  });
});

describe('the fill shows the hold, the readout follows HA, aria "now" form', () => {
  it('while held and different: fill 53, readout 20, aria-valuetext "53%, now 20%"; at arrival all 50', async () => {
    const h = coverHarness();
    sims.push(h);
    const el = await h.mount(ids.hall);
    pointer(el, 'pointerdown', 500);
    for (let i = 1; i <= 8; i++) pointer(el, 'pointermove', 500 - (120 * i) / 8);
    pointer(el, 'pointerup', 380);
    await tick(1300);
    await el.updateComplete;
    expect(h.states[ids.hall].attributes.current_position).toBe(20);
    expect(fill(el)).toBe(53);
    expect(el.shadowRoot!.querySelector('.big')!.textContent).toBe('20');
    expect(el.shadowRoot!.querySelector('header .sub')!.textContent).toBe('Opening');
    expect(pill(el).getAttribute('aria-valuenow')).toBe('53');
    expect(pill(el).getAttribute('aria-valuetext')).toBe('53%, now 20%');
    await tick(3000);
    await el.updateComplete;
    expect(fill(el)).toBe(50);
    expect(pill(el).getAttribute('aria-valuetext')).toBe('50%');
  });
});

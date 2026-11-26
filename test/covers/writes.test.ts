// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoverWriter, coverWriters } from '../../src/covers';
import { $, callList, coverHarness, ids, key, pointer } from '../cards/cover/helpers';
import type { CoverSim } from './sim';

/**
 * Plan 2.4 writes (Q2 a): one call at the end of a pill or key gesture, dropped when equal to the baseline; steps
 * coalesce into one call 500 ms after the last tap; discrete actions at once, cancelling a pending step. Fake hass:
 * echo after 250 ms, motor 10 % per second (the prototype's simulated HA).
 */

let sims: CoverSim[] = [];
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
});
afterEach(async () => {
  document.body.innerHTML = '';
  for (const s of sims) s.stopAll();
  sims = [];
  await vi.runOnlyPendingTimersAsync();
  vi.useRealTimers();
});

const harness = (opts = {}) => {
  const h = coverHarness(opts);
  sims.push(h);
  return h;
};
const tick = async (ms: number, el?: HTMLElement & { updateComplete: Promise<boolean> }) => {
  await vi.advanceTimersByTimeAsync(ms);
  if (el) await el.updateComplete;
};
const Y0 = 500;

/** A shared writer as a tile or room strip holds it: follows the published hass. */
function stepWriter(h: CoverSim, id: string): CoverWriter {
  const w = coverWriters.acquire(id);
  w.hass = h.hass;
  h.onHass((hass) => w.observe(hass));
  return w;
}

/** The prototype's drag(): `steps` moves of dy / steps, 60 ms apart, then release. */
async function drag(h: CoverSim, el: HTMLElement & { updateComplete: Promise<boolean> }, dy: number, steps = 8) {
  pointer(el, 'pointerdown', Y0);
  for (let i = 1; i <= steps; i++) {
    pointer(el, 'pointermove', Y0 + (dy * i) / steps);
    await tick(60, el);
    expect(h.calls).toEqual([]);
  }
  pointer(el, 'pointerup', Y0 + dy);
  await tick(0, el);
}

describe('pill drag (Q2 a)', () => {
  it('no call while dragging, exactly one set_cover_position at release (prototype Hall Window drag: 53)', async () => {
    const h = harness();
    const el = await h.mount(ids.hall);
    await drag(h, el, -120);
    expect(callList(h)).toEqual(['cover.set_cover_position {"position":53}']);
    await tick(3000, el);
    expect(h.calls.length).toBe(1);
  });

  it('a release equal to the baseline sends nothing (current, then held)', async () => {
    const h = harness();
    const el = await h.mount(ids.hall);
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointermove', Y0 - 56);
    await tick(60, el);
    pointer(el, 'pointermove', Y0);
    pointer(el, 'pointerup', Y0);
    await tick(1000, el);
    expect(h.calls).toEqual([]);

    // Held 53: a second drag released on 53 is dropped, even while the cover still reports 20.
    await drag(h, el, -120);
    expect(h.calls.length).toBe(1);
    await tick(1300, el);
    expect(h.states[ids.hall].attributes.current_position).toBe(20);
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointermove', Y0 - 28);
    pointer(el, 'pointermove', Y0);
    pointer(el, 'pointerup', Y0);
    await tick(0, el);
    expect(callList(h)).toEqual(['cover.set_cover_position {"position":53}']);
  });

  it('tilt mode writes set_cover_tilt_position', async () => {
    const h = harness();
    const el = await h.mount(ids.living);
    $(el, '[data-mode="tilt"]')!.click();
    await el.updateComplete;
    await drag(h, el, -56, 4);
    expect(callList(h)).toEqual(['cover.set_cover_tilt_position {"tilt_position":70}']);
  });

  it('a tilt-only cover drags its tilt', async () => {
    const h = harness();
    const el = await h.mount(ids.pergola);
    await drag(h, el, 56, 4);
    expect(callList(h)).toEqual(['cover.set_cover_tilt_position {"tilt_position":40}']);
  });

  it('a drag while moving sends one write and the cover reverses and arrives', async () => {
    const h = harness();
    const el = await h.mount(ids.hall);
    $(el, '[data-action="open"]')!.click();
    await tick(2300, el); // opening, at 30
    expect(h.states[ids.hall].state).toBe('opening');
    h.calls.length = 0;
    await drag(h, el, 100, 8);
    expect(h.calls.length).toBe(1);
    const sent = h.calls[0].data.position as number;
    await tick(6000, el);
    expect(h.states[ids.hall].state).not.toBe('opening');
    expect(h.states[ids.hall].attributes.current_position).toBe(Math.round(sent / 10) * 10);
    expect(h.calls.length).toBe(1);
  });
});

describe('keyboard (one call per key gesture)', () => {
  it('a held ArrowUp with repeats gives exactly one call at keyup, none during the repeats', async () => {
    const h = harness();
    const el = await h.mount(ids.hall);
    key(el, 'keydown', 'ArrowUp');
    await tick(50, el);
    for (let i = 0; i < 5; i++) {
      key(el, 'keydown', 'ArrowUp', true);
      await tick(50, el);
    }
    await tick(1000, el);
    expect(h.calls).toEqual([]);
    key(el, 'keyup', 'ArrowUp');
    await tick(0, el);
    expect(callList(h)).toEqual(['cover.set_cover_position {"position":16}']);
  });

  it('PageDown gives one call at keyup (10 down)', async () => {
    const h = harness();
    const el = await h.mount(ids.living);
    key(el, 'keydown', 'PageDown');
    await tick(600, el);
    expect(h.calls).toEqual([]);
    key(el, 'keyup', 'PageDown');
    await tick(0, el);
    expect(callList(h)).toEqual(['cover.set_cover_position {"position":60}']);
  });

  it('prototype: two ArrowUp presses, one write on key up (12 from 10)', async () => {
    const h = harness();
    const el = await h.mount(ids.hall);
    key(el, 'keydown', 'ArrowUp');
    key(el, 'keydown', 'ArrowUp', true);
    key(el, 'keyup', 'ArrowUp');
    await tick(100, el);
    expect(callList(h)).toEqual(['cover.set_cover_position {"position":12}']);
  });
});

describe('steps (tile and room strip, Q2 a: debounce 500 ms)', () => {
  it('three Plus taps coalesce into one call 500 ms after the last tap (prototype: 20 to 50)', async () => {
    const h = harness();
    h.set(ids.hall, 'open', { current_position: 20 });
    const w = stepWriter(h, ids.hall);
    expect([w.step(1), w.step(1), w.step(1)]).toEqual([30, 40, 50]);
    // The pending step shows as the target.
    expect(w.local.position).toBe(50);
    await tick(499);
    expect(h.calls).toEqual([]);
    await tick(1);
    expect(callList(h)).toEqual(['cover.set_cover_position {"position":50}']);
    coverWriters.release(w);
  });

  it('each tap restarts the 500 ms', async () => {
    const h = harness();
    h.set(ids.hall, 'open', { current_position: 20 });
    const w = stepWriter(h, ids.hall);
    w.step(1);
    await tick(400);
    w.step(1);
    await tick(400);
    expect(h.calls).toEqual([]);
    await tick(100);
    expect(callList(h)).toEqual(['cover.set_cover_position {"position":40}']);
    coverWriters.release(w);
  });

  it('prototype: three slow Plus taps (600 ms apart) from 40 write 50, 60, 70 (baseline: the hold)', async () => {
    const h = harness();
    h.set(ids.hall, 'open', { current_position: 40 });
    const w = stepWriter(h, ids.hall);
    for (let i = 0; i < 3; i++) {
      w.step(1);
      await tick(600);
    }
    await tick(700);
    expect(callList(h)).toEqual(['cover.set_cover_position {"position":50}', 'cover.set_cover_position {"position":60}', 'cover.set_cover_position {"position":70}']);
    coverWriters.release(w);
  });

  it('baseline: the pending step, then the hold, then the target while moving, then the position', async () => {
    const h = harness();
    h.set(ids.hall, 'open', { current_position: 20 });
    const w = stepWriter(h, ids.hall);
    expect(w.baseline('position')).toBe(20);
    w.step(1);
    expect(w.baseline('position')).toBe(30); // pending
    await tick(500);
    expect(w.held('position')).toBe(30);
    expect(w.baseline('position')).toBe(30); // hold
    await tick(5000); // arrives at 30: hold released
    expect(w.held('position')).toBeUndefined();

    // Open: while opening, the baseline is 100 (inferred target), so Minus gives 90.
    w.act('open_cover');
    await tick(1300);
    expect(h.states[ids.hall].state).toBe('opening');
    expect(w.baseline('position')).toBe(100);
    expect(w.step(-1)).toBe(90);
    await tick(500);
    expect(callList(h).slice(-1)).toEqual(['cover.set_cover_position {"position":90}']);
    coverWriters.release(w);
  });

  it('the inferred target ends when the cover stops, and Close gives 0 while closing', async () => {
    const h = harness();
    const w = stepWriter(h, ids.hall); // open at 10
    w.act('open_cover');
    await tick(1300);
    expect(w.movingTarget()).toBe(100);
    w.act('stop_cover');
    await tick(300);
    expect(h.states[ids.hall].state).toBe('open');
    expect(w.movingTarget()).toBeUndefined();
    expect(w.baseline('position')).toBe(h.states[ids.hall].attributes.current_position);
    w.act('close_cover');
    await tick(300);
    expect(w.baseline('position')).toBe(0);
    coverWriters.release(w);
  });

  it('a tilt-only cover steps its tilt', async () => {
    const h = harness();
    const w = stepWriter(h, ids.pergola);
    w.step(-1);
    await tick(500);
    expect(callList(h)).toEqual(['cover.set_cover_tilt_position {"tilt_position":50}']);
    coverWriters.release(w);
  });

  it('a step to the value the cover already has sends nothing', async () => {
    const h = harness();
    h.set(ids.hall, 'open', { current_position: 20 });
    const w = stepWriter(h, ids.hall);
    w.step(1);
    w.step(-1);
    await tick(1000);
    expect(h.calls).toEqual([]);
    coverWriters.release(w);
  });

  it('no step beyond 0 or 100', async () => {
    const h = harness();
    const w = stepWriter(h, ids.hallOpen);
    expect(w.step(1)).toBeNull();
    coverWriters.release(w);
  });
});

describe('discrete actions', () => {
  it('go out at once and cancel a pending step (discard, then sendNow)', async () => {
    const h = harness();
    const el = await h.mount(ids.hall);
    const w = coverWriters.acquire(ids.hall);
    w.step(1);
    $(el, '[data-action="stop"]')!.click();
    await tick(0, el);
    expect(callList(h)).toEqual(['cover.stop_cover']);
    await tick(1000, el);
    expect(callList(h)).toEqual(['cover.stop_cover']);
    coverWriters.release(w);
  });

  it('prototype: Close then Stop during travel', async () => {
    const h = harness();
    h.set(ids.hall, 'open', { current_position: 60 });
    const el = await h.mount(ids.hall);
    $(el, '[data-action="close"]')!.click();
    await tick(700, el);
    expect(h.states[ids.hall].state).toBe('closing');
    expect(($(el, '[data-action="close"]') as HTMLButtonElement).disabled).toBe(true);
    $(el, '[data-action="stop"]')!.click();
    await tick(500, el);
    expect(callList(h)).toEqual(['cover.close_cover', 'cover.stop_cover']);
    expect(h.states[ids.hall].state).toBe('open');
    expect(h.states[ids.hall].attributes.current_position).toBe(60);
  });

  it('the toggle pill sends cover.toggle; while moving it stops (STOP), and is disabled without STOP', async () => {
    const h = harness({ travelMs: 4000 });
    const el = await h.mount(ids.kitchen);
    $(el, '.lc-slider')!.click();
    await tick(300, el);
    expect(h.states[ids.kitchen].state).toBe('opening');
    $(el, '.lc-slider')!.click();
    await tick(300, el);
    expect(callList(h)).toEqual(['cover.toggle', 'cover.toggle']);
    expect(h.states[ids.kitchen].state).toBe('open');

    const g = await h.mount(ids.garageOpening);
    expect($(g, '.lc-slider')!.getAttribute('aria-disabled')).toBe('true');
    $(g, '.lc-slider')!.click();
    await tick(300, g);
    expect(h.calls.length).toBe(2);
  });

  it('a discard during a drag keeps the drag: the release still sends its value (RV0 note 2)', async () => {
    const h = harness();
    const el = await h.mount(ids.hall);
    const w = coverWriters.acquire(ids.hall);
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointermove', Y0 - 56);
    await tick(60, el);
    w.discard();
    pointer(el, 'pointerup', Y0 - 56);
    await tick(0, el);
    expect(callList(h)).toEqual(['cover.set_cover_position {"position":30}']);
    coverWriters.release(w);
  });
});

describe('one writer per entity', () => {
  it('a card and a tile step share the writer and coalesce', async () => {
    const h = harness();
    h.set(ids.hall, 'open', { current_position: 20 });
    const el = await h.mount(ids.hall);
    const w = stepWriter(h, ids.hall);
    expect(coverWriters.refs(ids.hall)).toBe(2);
    w.step(1);
    w.step(1);
    await tick(500, el);
    expect(callList(h)).toEqual(['cover.set_cover_position {"position":40}']);
    coverWriters.release(w);
    el.remove();
    expect(coverWriters.refs(ids.hall)).toBe(0);
  });
});

describe('prototype call-list replay (lh03-proto selftest.mjs on Hall Window, selftest.log)', () => {
  it('drag, Close and Stop, two ArrowUp presses, three Plus taps, three slow Plus taps: the same calls', async () => {
    const h = harness();
    const el = await h.mount(ids.hall); // open at 10
    // selftest "Q2a one write on release": drag -120 px in 8 steps.
    await drag(h, el, -120);
    await tick(6000, el);
    // "Stop during travel": Close, 700 ms, Stop.
    $(el, '[data-action="close"]')!.click();
    await tick(700, el);
    $(el, '[data-action="stop"]')!.click();
    await tick(1100, el);
    // Back at 10, still: "keyboard: two presses, one write on key up".
    h.set(ids.hall, 'open', { current_position: 10 });
    await el.updateComplete;
    key(el, 'keydown', 'ArrowUp');
    key(el, 'keydown', 'ArrowUp', true);
    key(el, 'keyup', 'ArrowUp');
    await tick(3000, el);
    // "Q2a: three Plus taps coalesce into one write (50)" from 20.
    h.stopAll();
    h.set(ids.hall, 'open', { current_position: 20 });
    const w = stepWriter(h, ids.hall);
    w.step(1);
    w.step(1);
    w.step(1);
    expect(w.local.position).toBe(50);
    await tick(900, el);
    // "F2b: three slow Plus taps from 40 write 50, 60, 70".
    await tick(5000, el);
    h.stopAll();
    h.set(ids.hall, 'open', { current_position: 40 });
    for (let i = 0; i < 3; i++) {
      w.step(1);
      await tick(600, el);
    }
    await tick(700, el);
    expect(callList(h)).toEqual([
      'cover.set_cover_position {"position":53}',
      'cover.close_cover',
      'cover.stop_cover',
      'cover.set_cover_position {"position":12}',
      'cover.set_cover_position {"position":50}',
      'cover.set_cover_position {"position":50}',
      'cover.set_cover_position {"position":60}',
      'cover.set_cover_position {"position":70}',
    ]);
    coverWriters.release(w);
  });
});

describe('inferred moving target (RH1 1): HA decides the direction, nothing stale is reused', () => {
  /** A foreign `opening` at 60 (another app): the baseline is the position, so Minus gives 50. */
  const foreignOpening = async (h: CoverSim, w: CoverWriter) => {
    h.set(ids.hall, 'opening', { current_position: 60 });
    expect(w.movingTarget()).toBeUndefined();
    expect(w.baseline('position')).toBe(60);
    expect(w.step(-1)).toBe(50);
    await tick(500);
    expect(callList(h).slice(-1)).toEqual(['cover.set_cover_position {"position":50}']);
  };

  it('Open answered without a moving state (an instant cover) clears it', async () => {
    const h = harness({ echoMs: null });
    const w = stepWriter(h, ids.hall);
    w.act('open_cover');
    h.set(ids.hall, 'open', { current_position: 100 });
    await tick(1000);
    h.set(ids.hall, 'open', { current_position: 60 });
    await foreignOpening(h, w);
    coverWriters.release(w);
  });

  it('a failed Open clears it; a later pill release at 100 is not dropped', async () => {
    const h = harness({ echoMs: null });
    const w = stepWriter(h, ids.hall);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    w.hass = { ...h.hass, callService: async () => Promise.reject(new Error('offline')) } as typeof h.hass;
    w.act('open_cover');
    await tick(0);
    expect(err).toHaveBeenCalled();
    w.hass = h.hass;
    h.set(ids.hall, 'opening', { current_position: 60 });
    expect(w.movingTarget()).toBeUndefined();
    w.set({ position: 100 });
    w.sendPending();
    await tick(0);
    expect(callList(h)).toEqual(['cover.set_cover_position {"position":100}']);
    coverWriters.release(w);
  });

  it('toggle on a partly open cover takes its direction from HA (opening gives 100)', async () => {
    const h = harness({ echoMs: null });
    h.set(ids.hall, 'open', { current_position: 40 });
    const w = stepWriter(h, ids.hall);
    w.act('toggle');
    expect(w.movingTarget()).toBeUndefined();
    h.set(ids.hall, 'opening', { current_position: 40 }); // HA went up (its last direction)
    expect(w.movingTarget()).toBe(100);
    expect(w.step(-1)).toBe(90);
    coverWriters.release(w);
  });

  it('toggle answered by closing gives 0', async () => {
    const h = harness({ echoMs: null });
    h.set(ids.hall, 'open', { current_position: 40 });
    const w = stepWriter(h, ids.hall);
    w.act('toggle');
    h.set(ids.hall, 'closing');
    expect(w.baseline('position')).toBe(0);
    coverWriters.release(w);
  });

  it('no fresh state within write_hold clears the undirected marker', async () => {
    const h = harness({ echoMs: null });
    h.set(ids.hall, 'open', { current_position: 60 });
    const w = stepWriter(h, ids.hall);
    w.act('open_cover');
    await tick(10000);
    await foreignOpening(h, w);
    coverWriters.release(w);
  });

  it('a directed target ends at the stop and is not reused by a later foreign opening', async () => {
    const h = harness({ echoMs: null });
    const w = stepWriter(h, ids.hall);
    w.act('open_cover');
    h.set(ids.hall, 'opening');
    expect(w.movingTarget()).toBe(100);
    h.set(ids.hall, 'open', { current_position: 60 });
    expect(w.movingTarget()).toBeUndefined();
    await foreignOpening(h, w);
    coverWriters.release(w);
  });

  it('Stop and the tilt actions arm nothing', async () => {
    const h = harness({ echoMs: null });
    const w = stepWriter(h, ids.living);
    w.act('stop_cover');
    h.set(ids.living, 'opening');
    expect(w.movingTarget()).toBeUndefined();
    w.act('open_cover_tilt');
    h.set(ids.living, 'closing');
    expect(w.movingTarget()).toBeUndefined();
    coverWriters.release(w);
  });
});

describe('step flag (RH1 2) and step guard (RH1 3)', () => {
  it('a step that builds nothing leaves no flag: a later pill write keeps the other key held', async () => {
    const h = harness({ echoMs: null });
    const w = stepWriter(h, ids.living);
    w.set({ tilt_position: 73 });
    w.sendPending();
    w.step(1);
    w.step(-1);
    await tick(500);
    expect(h.calls.length).toBe(1);
    w.set({ position: 40 });
    w.sendPending();
    expect(w.held('position')).toBe(40);
    expect(w.held('tilt_position')).toBe(73);
    coverWriters.release(w);
  });

  it('a step and a pill write of the other key in one flush keep both held', async () => {
    const h = harness({ echoMs: null });
    const w = stepWriter(h, ids.living);
    w.step(1);
    w.set({ tilt_position: 73 });
    w.sendPending();
    await tick(0);
    expect(callList(h)).toEqual(['cover.set_cover_position {"position":80}', 'cover.set_cover_tilt_position {"tilt_position":73}']);
    expect(w.held('position')).toBe(80);
    expect(w.held('tilt_position')).toBe(73);
    coverWriters.release(w);
  });

  it('a step still drops the other key hold when it goes out alone', async () => {
    const h = harness({ echoMs: null });
    const w = stepWriter(h, ids.living);
    w.set({ tilt_position: 73 });
    w.sendPending();
    w.step(1);
    await tick(500);
    expect(w.held('position')).toBe(80);
    expect(w.held('tilt_position')).toBeUndefined();
    coverWriters.release(w);
  });

  it('no step on a cover without steps (toggle cover, tilt without SET_TILT_POSITION)', async () => {
    const h = harness({ echoMs: null });
    const w = stepWriter(h, ids.kitchen);
    expect(w.step(1)).toBeNull();
    expect(w.queue.isPending).toBe(false);
    coverWriters.release(w);
    h.set(ids.pergola, 'closed', { supported_features: 16 | 32 });
    const p = stepWriter(h, ids.pergola);
    expect(p.step(1)).toBeNull();
    await tick(1000);
    expect(h.calls).toEqual([]);
    coverWriters.release(p);
  });
});

describe('RH1 round 2: known directions, rollback scope, dispose, shared cards', () => {
  it('Close while opening with a stale opening report first: no target until closing, Minus never gives 90', async () => {
    const h = harness({ echoMs: null });
    h.set(ids.hall, 'opening', { current_position: 60 });
    const w = stepWriter(h, ids.hall);
    w.act('close_cover');
    h.set(ids.hall, 'opening', { current_position: 70 }); // reported before Close took effect
    expect(w.movingTarget()).toBeUndefined();
    expect(w.baseline('position')).toBe(70);
    h.set(ids.hall, 'closing', { current_position: 70 });
    expect(w.movingTarget()).toBe(0);
    expect(w.baseline('position')).toBe(0);
    expect(w.step(-1)).toBeNull();
    expect(w.step(1)).toBe(10);
    coverWriters.release(w);
  });

  it('Open: a non-moving report clears the marker; the inference is lost, never wrong', async () => {
    const h = harness({ echoMs: null });
    h.set(ids.hall, 'open', { current_position: 60 });
    const w = stepWriter(h, ids.hall);
    w.act('open_cover');
    h.set(ids.hall, 'open', { current_position: 60, friendly_name: 'Hall' }); // another attribute only
    h.set(ids.hall, 'opening', { current_position: 60 });
    expect(w.movingTarget()).toBeUndefined();
    expect(w.step(-1)).toBe(50);
    coverWriters.release(w);
  });

  it('toggle while moving (a stop) arms nothing: a later opening uses no target', async () => {
    const h = harness({ echoMs: null });
    h.set(ids.hall, 'opening', { current_position: 60 });
    const w = stepWriter(h, ids.hall);
    w.act('toggle');
    h.set(ids.hall, 'open', { current_position: 60 });
    h.set(ids.hall, 'opening', { current_position: 60 });
    expect(w.movingTarget()).toBeUndefined();
    expect(w.step(-1)).toBe(50);
    coverWriters.release(w);
  });

  it('a failed tilt call keeps the directed position target; only a failed action clears it', async () => {
    const h = harness({ echoMs: null });
    const w = stepWriter(h, ids.living);
    w.act('open_cover');
    h.set(ids.living, 'opening');
    expect(w.movingTarget()).toBe(100);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    w.hass = { ...h.hass, callService: async () => Promise.reject(new Error('offline')) } as typeof h.hass;
    w.set({ tilt_position: 20 });
    w.sendPending();
    await tick(0);
    expect(err).toHaveBeenCalledTimes(1);
    expect(w.held('tilt_position')).toBeUndefined();
    expect(w.movingTarget()).toBe(100);
    w.act('close_cover');
    await tick(0);
    expect(err).toHaveBeenCalledTimes(2);
    w.hass = h.hass;
    h.set(ids.living, 'closing');
    expect(w.movingTarget()).toBeUndefined();
    coverWriters.release(w);
  });

  it('write_hold 0 infers nothing', async () => {
    const h = harness({ echoMs: null });
    const w = stepWriter(h, ids.hall);
    w.hold = 0;
    w.act('open_cover');
    await tick(0);
    h.set(ids.hall, 'opening', { current_position: 20 });
    expect(w.movingTarget()).toBeUndefined();
    coverWriters.release(w);
  });

  it('dispose() clears the pending marker timer', async () => {
    const h = harness({ echoMs: null });
    const w = new CoverWriter(ids.hall);
    w.hass = h.hass;
    await tick(0);
    const before = vi.getTimerCount();
    w.act('open_cover');
    await tick(0);
    expect(vi.getTimerCount()).toBe(before + 1);
    w.dispose();
    expect(vi.getTimerCount()).toBe(before);
  });

  it('two cards share one writer through act, observe and step', async () => {
    const h = harness({ echoMs: null });
    h.set(ids.hall, 'open', { current_position: 20 });
    const a = await h.mount(ids.hall);
    const b = await h.mount(ids.hall);
    expect(coverWriters.refs(ids.hall)).toBe(2);
    $(a, '[data-action="open"]')!.click();
    await tick(0, a);
    h.set(ids.hall, 'opening', { current_position: 20 }); // both cards observe the shared writer
    await b.updateComplete;
    const w = stepWriter(h, ids.hall);
    expect(coverWriters.refs(ids.hall)).toBe(3);
    expect(w.movingTarget()).toBe(100);
    expect(w.step(-1)).toBe(90);
    await tick(500, b);
    expect(callList(h)).toEqual(['cover.open_cover', 'cover.set_cover_position {"position":90}']);
    // Both cards show the held 90 on the fill and Stop active.
    for (const el of [a, b]) {
      expect(parseFloat($(el, '.lc-slider-fill')!.style.height)).toBe(90);
      expect($(el, '[data-action="stop"]')!.style.borderColor).not.toBe('');
    }
    coverWriters.release(w);
  });
});

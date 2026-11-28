// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactiveController } from 'lit';
import { MediaClock, type MediaClockInputs } from '../../src/media';

/**
 * Plan 2.4 ticker clock (GD3): ticks only while playing, with a seek bar, not dragging, the page visible and the host
 * intersecting; any failing condition leaves no timer at all; visibilitychange and the shared observer restart it.
 */

/** A fake IntersectionObserver: every instance is recorded so the test can report entries and count instances. */
class FakeIO {
  static instances: FakeIO[] = [];
  readonly targets = new Set<Element>();
  constructor(
    readonly cb: (entries: { target: Element; isIntersecting: boolean }[]) => void,
    readonly options: { threshold?: number },
  ) {
    FakeIO.instances.push(this);
  }
  observe(t: Element) {
    this.targets.add(t);
  }
  unobserve(t: Element) {
    this.targets.delete(t);
  }
  disconnect() {
    this.targets.clear();
  }
  fire(target: Element, isIntersecting: boolean) {
    this.cb([{ target, isIntersecting }]);
  }
}

let visibility: DocumentVisibilityState = 'visible';

beforeAll(() => {
  // Installed before the first clock, so the one shared observer of this document is a FakeIO.
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeIO;
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(Date.parse('2026-11-27T12:00:00Z'));
  visibility = 'visible';
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

/** A host: an element with the ReactiveControllerHost methods; `updates` counts requestUpdate calls. */
function host() {
  const controllers: ReactiveController[] = [];
  const el = document.createElement('div') as HTMLDivElement & {
    addController(c: ReactiveController): void;
    removeController(c: ReactiveController): void;
    requestUpdate(): void;
    updateComplete: Promise<boolean>;
    updates: number;
    connect(): void;
    disconnect(): void;
  };
  el.updates = 0;
  el.addController = (c) => controllers.push(c);
  el.removeController = () => undefined;
  el.requestUpdate = () => el.updates++;
  el.updateComplete = Promise.resolve(true);
  el.connect = () => {
    document.body.appendChild(el);
    for (const c of controllers) c.hostConnected?.();
  };
  el.disconnect = () => {
    el.remove();
    for (const c of controllers) c.hostDisconnected?.();
  };
  return el;
}

function setup(start: Partial<MediaClockInputs> = {}) {
  const inputs: MediaClockInputs = { playing: true, seekBar: true, dragging: false, ...start };
  const h = host();
  const clock = new MediaClock(h, () => inputs);
  h.connect();
  return { h, clock, inputs, io: () => FakeIO.instances[0] };
}

const timers = () => vi.getTimerCount();

describe('MediaClock', () => {
  it('ticks once per second while playing, visible and intersecting; now is one second ahead while ticking', () => {
    const { h, clock } = setup();
    expect(clock.running).toBe(true);
    expect(timers()).toBe(1);
    const before = h.updates;
    vi.advanceTimersByTime(3000);
    expect(h.updates - before).toBe(3);
    expect(clock.now).toBe(Date.now() + 1000);
    h.disconnect();
  });

  it('stops on pause, on a drag, without a seek bar; no timer exists while stopped; restarts', () => {
    const { h, clock, inputs } = setup();
    for (const [k, v] of [['playing', false], ['dragging', true], ['seekBar', false]] as const) {
      (inputs as unknown as Record<string, boolean>)[k] = v;
      clock.update();
      expect(clock.running, k).toBe(false);
      expect(timers(), k).toBe(0);
      expect(clock.now).toBe(Date.now());
      const n = h.updates;
      vi.advanceTimersByTime(5000);
      expect(h.updates, k).toBe(n);
      (inputs as unknown as Record<string, boolean>)[k] = !v;
      clock.update();
      expect(clock.running, k).toBe(true);
      expect(timers(), k).toBe(1);
    }
    h.disconnect();
  });

  it('stops while the page is hidden; visibilitychange restarts it', () => {
    const { h, clock } = setup();
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    expect([clock.running, timers()]).toEqual([false, 0]);
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    expect([clock.running, timers()]).toEqual([true, 1]);
    h.disconnect();
  });

  it('stops off screen; the one shared observer (threshold 0) restarts it', () => {
    const a = setup();
    const b = setup();
    expect(FakeIO.instances.length).toBe(1);
    const io = a.io();
    expect(io.options).toEqual({ threshold: 0 });
    expect(io.targets.has(a.h) && io.targets.has(b.h)).toBe(true);
    io.fire(a.h, false);
    expect([a.clock.running, b.clock.running, timers()]).toEqual([false, true, 1]);
    io.fire(b.h, false);
    expect(timers()).toBe(0);
    io.fire(a.h, true);
    expect([a.clock.running, timers()]).toEqual([true, 1]);
    a.h.disconnect();
    b.h.disconnect();
  });

  it('starts and stops with a host update, never loops; cleans up on disconnect', () => {
    const { h, clock, inputs } = setup({ playing: false });
    expect(timers()).toBe(0);
    const n = h.updates;
    inputs.playing = true;
    clock.update();
    clock.update();
    expect(h.updates).toBe(n + 1);
    h.disconnect();
    expect([clock.running, timers()]).toEqual([false, 0]);
    expect(FakeIO.instances[0].targets.has(h)).toBe(false);
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(timers()).toBe(0);
    h.connect();
    expect([clock.running, timers()]).toEqual([true, 1]);
    h.disconnect();
  });
});

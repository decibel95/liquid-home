import { describe, expect, it } from 'vitest';
import type { HassEntity } from '@decibel95/liquid-core';
import { fanView, haIdx, haPct, keyStep, pageSteps, pillKeyStep, snapTo, snaps, speedCount, stepKeys, stepTarget } from '../../src/fans';
import { FAN_FIXTURES } from './fixtures';

/**
 * Plan 2.5, Q4 a variant A: HA's step math (fan/__init__.py _async_adjust_speed), snapTo and the slider keyStep.
 * Expected values come from HA's own integer formulas (written out below in integer arithmetic) and from the gate 2
 * prototype's functions, copied verbatim, never from the code under test.
 */

/** HA: new percentage = new_index * 100 // speed_count (integer division). */
const haFloorDiv = (i: number, n: number) => (i * 100 - ((i * 100) % n)) / n;
/** HA: current index = ceil(speed_count * percentage / 100), exact for integer percentages. */
const haCeil = (n: number, p: number) => Math.floor((n * p + 99) / 100);

/** The gate 2 prototype (lh03-proto/test/index.src.html, lines 592 to 595 and 902 to 907, q4 'a'), verbatim. */
const proto = (speeds: number) => {
  const e = { speeds, features: 55 };
  const fanStep = (x: typeof e) => 100 / x.speeds;
  const haIdxP = (x: typeof e, p: number) => Math.ceil(+((x.speeds * p) / 100).toFixed(9));
  const haPctP = (x: typeof e, i: number) => Math.floor((i * 100) / x.speeds);
  const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
  const snapActive = (x: typeof e) => x.speeds < 100;
  const snapToP = (x: typeof e, raw: number) => (raw < 0.5 ? 0 : !snapActive(x) ? Math.round(raw) : haPctP(x, Math.round(raw / fanStep(x))));
  const keyNext = (cur: number, d: number | 'home') => (d === 'home' ? haPctP(e, 1) : haPctP(e, clamp(Math.round(cur / fanStep(e)) + d, 0, e.speeds)));
  const pg = Math.max(1, Math.round(10 / (100 / Math.max(1, Math.round(100 / (keyNext(0, 1) || 100))))));
  return { haIdx: (p: number) => haIdxP(e, p), haPct: (i: number) => haPctP(e, i), snapTo: (r: number) => snapToP(e, r), keyNext, pg };
};

describe('speed count', () => {
  it('is round(100 / percentage_step), default step 1', () => {
    expect(speedCount(FAN_FIXTURES.off())).toBe(3);
    expect(speedCount(FAN_FIXTURES.ten())).toBe(10);
    expect(speedCount(FAN_FIXTURES.full())).toBe(100);
    expect(speedCount({ ...FAN_FIXTURES.full(), attributes: {} })).toBe(100);
  });
});

describe('haIdx and haPct match HA for 3, 4, 6, 10 and 100 speeds', () => {
  for (const n of [3, 4, 6, 10, 100]) {
    it(`${n} speeds`, () => {
      for (let i = 0; i <= n; i++) expect(haPct(n, i)).toBe(haFloorDiv(i, n));
      for (let p = 0; p <= 100; p++) expect(haIdx(n, p)).toBe(haCeil(n, p));
    });
  }

  it('a 33.33 step gives 33, 66, 100', () => {
    expect([1, 2, 3].map((i) => haPct(3, i))).toEqual([33, 66, 100]);
    // The 9-digit guard: 3 * 33.333333333333336 / 100 is 1.0000000000000002 in floating point, HA's index is 1.
    expect(haIdx(3, 100 / 3)).toBe(1);
  });

  it('67 Minus gives 33, 33 Minus gives off', () => {
    const k = keyStep(3)!;
    expect(k(67, 'ArrowDown')).toBe(33);
    expect(k(33, 'ArrowDown')).toBe(0);
  });
});

describe('snapTo (Q4 a: always snap below 100 speeds)', () => {
  it('below 0.5 is off; 0.5 is the first step on a 100-speed fan (identity)', () => {
    expect(snapTo(100, 0.4)).toBe(0);
    expect(snapTo(100, 0.5)).toBe(1);
    expect(snapTo(3, 0.4)).toBe(0);
    expect(snaps(100)).toBe(false);
    expect(snaps(99)).toBe(true);
    expect(snaps(3, false)).toBe(false);
  });

  it('a drag to 10 % on a 3-speed fan snaps to off; 17 % to the first step', () => {
    expect(snapTo(3, 10)).toBe(0);
    expect(snapTo(3, 16.6)).toBe(0);
    expect(snapTo(3, 16.7)).toBe(33);
    expect(snapTo(3, 50)).toBe(66);
    expect(snapTo(3, 84)).toBe(100);
    expect(snapTo(10, 44)).toBe(40);
    expect(snapTo(10, 45)).toBe(50);
    expect(snapTo(100, 44.4)).toBe(44);
  });

  it('equals the prototype for 3, 10 and 100 speeds on every 0.1 % of the pill', () => {
    for (const n of [3, 10, 100]) {
      const p = proto(n);
      for (let r = 0; r <= 1000; r++) expect(snapTo(n, r / 10)).toBe(p.snapTo(r / 10));
      for (let i = 0; i <= n; i++) expect(haPct(n, i)).toBe(p.haPct(i));
      for (let q = 0; q <= 100; q += 0.5) expect(haIdx(n, q)).toBe(p.haIdx(q));
    }
  });
});

describe('keyStep (Q4)', () => {
  const KEYS = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'PageUp', 'PageDown', 'Home', 'End'];

  it('3 speeds: arrows and Page one step, Home 33, End 100, Down from 33 to off', () => {
    const k = keyStep(3)!;
    expect(pageSteps(3)).toBe(1);
    expect([k(0, 'ArrowUp'), k(33, 'ArrowUp'), k(66, 'ArrowRight'), k(100, 'ArrowUp')]).toEqual([33, 66, 100, 100]);
    expect([k(100, 'ArrowDown'), k(66, 'ArrowLeft'), k(33, 'ArrowDown'), k(0, 'ArrowDown')]).toEqual([66, 33, 0, 0]);
    expect([k(33, 'PageUp'), k(66, 'PageDown')]).toEqual([66, 33]);
    expect([k(66, 'Home'), k(0, 'End')]).toEqual([33, 100]);
    expect(k(66, 'Enter')).toBeUndefined();
  });

  it('10 speeds: one step of 10, Page one step, Home 10, Down from 10 to off', () => {
    const k = keyStep(10)!;
    expect(pageSteps(10)).toBe(1);
    expect([k(40, 'ArrowUp'), k(40, 'ArrowDown'), k(40, 'PageUp'), k(40, 'PageDown')]).toEqual([50, 30, 50, 30]);
    expect([k(10, 'ArrowDown'), k(80, 'Home'), k(10, 'End')]).toEqual([0, 10, 100]);
    expect(k(100, 'PageUp')).toBe(100);
  });

  it('100 speeds: no keyStep (the core level keys, as the prototype); the 1 % keys behind it for the preset case', () => {
    expect(keyStep(100)).toBeUndefined();
    expect(keyStep(200)).toBeUndefined();
    const k = stepKeys(100);
    expect(pageSteps(100)).toBe(10);
    expect([k(40, 'ArrowUp'), k(40, 'ArrowLeft'), k(40, 'PageUp'), k(40, 'PageDown')]).toEqual([41, 39, 50, 30]);
    expect([k(1, 'ArrowDown'), k(5, 'PageDown'), k(95, 'PageUp'), k(55, 'Home'), k(1, 'End')]).toEqual([0, 0, 100, 1, 100]);
  });

  it('equals the prototype keyNext for every key and value on 3 and 10 speeds (100 speeds: none, as the prototype)', () => {
    for (const n of [3, 10]) {
      const p = proto(n);
      const k = keyStep(n)!;
      expect(pageSteps(n)).toBe(p.pg);
      for (let cur = 0; cur <= 100; cur++) {
        const want: Record<string, number> = {
          ArrowUp: p.keyNext(cur, 1),
          ArrowRight: p.keyNext(cur, 1),
          ArrowDown: p.keyNext(cur, -1),
          ArrowLeft: p.keyNext(cur, -1),
          PageUp: p.keyNext(cur, p.pg),
          PageDown: p.keyNext(cur, -p.pg),
          Home: p.keyNext(cur, 'home'),
          End: 100,
        };
        for (const key of KEYS) expect(k(cur, key)).toBe(want[key]);
      }
    }
  });
});

describe('step values move by exactly one HA step on every speed count (RH2 finding 3)', () => {
  /** A fan view at `p` percent with `count` speeds, for stepTarget. */
  const at = (count: number, p: number) =>
    fanView({ entity_id: 'fan.x', state: 'on', attributes: { supported_features: 63, percentage_step: 100 / count, percentage: p } } as unknown as HassEntity);

  it('counts 2 to 99: Up and Faster from each step give the next, Down and Slower the one before', () => {
    for (let c = 2; c <= 99; c++) {
      const k = keyStep(c)!;
      for (let i = 0; i <= c; i++) {
        const cur = haPct(c, i);
        if (i < c) {
          expect(k(cur, 'ArrowUp'), `${c} speeds, Up from ${cur}`).toBe(haPct(c, i + 1));
          expect(stepTarget(at(c, cur), 1), `${c} speeds, Faster from ${cur}`).toBe(haPct(c, i + 1));
        }
        if (i > 0) {
          expect(k(cur, 'ArrowDown'), `${c} speeds, Down from ${cur}`).toBe(haPct(c, i - 1));
          expect(stepTarget(at(c, cur), -1), `${c} speeds, Slower from ${cur}`).toBe(haPct(c, i - 1));
        }
      }
    }
  });

  it('98 on 99 speeds goes up to 98 + 1 step (HA index 98), not back to 98', () => {
    expect(keyStep(99)!(98, 'ArrowUp')).toBe(haPct(99, 99));
    expect(haIdx(99, 98)).toBe(98);
  });

  it('values between steps keep the round rule (67 Minus on 3 speeds is 33)', () => {
    expect(stepTarget(at(3, 67), -1)).toBe(33);
    expect(stepTarget(at(3, 67), 1)).toBe(100);
  });
});

describe('pill keys under a preset (RH2 finding 2)', () => {
  const preset = (count: number) =>
    fanView({ entity_id: 'fan.x', state: 'on', attributes: { supported_features: 63, percentage_step: 100 / count, percentage: null, preset_mode: 'auto', preset_modes: ['auto'] } } as unknown as HassEntity);

  for (const count of [3, 10, 60, 99, 100]) {
    it(`${count} speeds: Down, Left and Page Down do nothing, Up gives the lowest step, Home and End as always`, () => {
      const k = pillKeyStep(preset(count))!;
      // The core reads a preset pill as 1 % (levelPercent(0, true)).
      for (const key of ['ArrowDown', 'ArrowLeft', 'PageDown']) expect(k(1, key)).toBe(1);
      const lowest = haPct(count, 1);
      // A lowest step of 1 % equals the core's start value, so it goes out a hair above 1; snapTo sends 1.
      expect(snapTo(count, k(1, 'ArrowUp')!)).toBe(lowest);
      expect(snapTo(count, k(1, 'Home')!)).toBe(lowest);
      expect(k(1, 'ArrowUp')).not.toBe(1);
      expect(k(1, 'End')).toBe(100);
    });
  }

  it('with a percentage it is keyStep (undefined on 100 speeds)', () => {
    const on = (count: number) => fanView({ entity_id: 'fan.x', state: 'on', attributes: { supported_features: 55, percentage_step: 100 / count, percentage: 40 } } as unknown as HassEntity);
    expect(pillKeyStep(on(10))!(40, 'ArrowUp')).toBe(50);
    expect(pillKeyStep(on(100))).toBeUndefined();
  });
});

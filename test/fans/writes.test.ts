// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HassEntity } from '@decibel95/liquid-core';
import { $, $$, fakeHass, key, pill, pointer, text } from '../cards/fan/helpers';
import type { LiquidHomeFanCard } from '../../src/cards/fan/card';
import { buildFanCalls, fanView, fanWriters, stepFan, stepState, stepTarget } from '../../src/fans';
import { FAN_FIXTURES, fanIds } from './fixtures';

/**
 * Plan 2.5 writes: throttle 300 ms plus final on release, snapped values only, 0 waits for release, a value equal to
 * the in-flight hold or to HA's value is dropped, Q7 b steps and their disabled states, Q5 a, presets while off,
 * power gating. `performance` is faked too (the core queue reads it for the throttle window).
 */

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
});
afterEach(async () => {
  document.body.innerHTML = '';
  await vi.runOnlyPendingTimersAsync();
  vi.useRealTimers();
});

const settle = async (el?: LiquidHomeFanCard) => {
  await vi.advanceTimersByTimeAsync(0);
  if (el) await el.updateComplete;
};
const tick = async (ms: number, el?: LiquidHomeFanCard) => {
  await vi.advanceTimersByTimeAsync(ms);
  if (el) await el.updateComplete;
};
/** The pill is 280px (TOK-2) in happy-dom, so 2.8px is 1 %. */
const PX = 2.8;
const Y0 = 500;
const pct = (id: string, percentage: number) => ({ domain: 'fan', service: 'set_percentage', data: { entity_id: id, percentage } });
const STEPS_3 = [0, 33, 66, 100];

describe('pill drag: throttle 300 ms, final on release, snapped (Q4 a)', () => {
  it('leading write at once, at most one per 300 ms with the latest snapped value, final on release', async () => {
    const h = fakeHass({ echoMs: null });
    const id = fanIds.pct33;
    const el = await h.mount(id);
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointermove', Y0 - 30 * PX); // 63 % raw, step 66
    await settle(el);
    expect(h.calls).toEqual([pct(id, 66)]);
    expect(text($(el, '.ro-v'))).toBe('66%');

    for (const d of [40, 50, 60]) {
      pointer(el, 'pointermove', Y0 - d * PX); // 73, 83, 93 raw
      await tick(50, el);
    }
    expect(h.calls.length).toBe(1);
    await tick(150, el); // 300 ms after the leading write
    expect(h.calls).toEqual([pct(id, 66), pct(id, 100)]);

    pointer(el, 'pointermove', Y0 - 20 * PX); // 53 raw, step 66
    await tick(20, el);
    expect(h.calls.length).toBe(2);
    pointer(el, 'pointerup', Y0 - 20 * PX);
    await settle(el);
    expect(h.calls).toEqual([pct(id, 66), pct(id, 100), pct(id, 66)]);
    await tick(1000, el);
    expect(h.calls.length).toBe(3);
    expect(h.calls.every((c) => STEPS_3.includes(c.data.percentage as number))).toBe(true);
  });

  it('a drag that stays on HA\'s step sends nothing; a release on the value in flight sends nothing more', async () => {
    const h = fakeHass({ echoMs: null });
    const id = fanIds.pct33;
    const el = await h.mount(id);
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointermove', Y0 - 8 * PX); // 41 raw, step 33 = HA
    await settle(el);
    pointer(el, 'pointerup', Y0 - 8 * PX);
    await tick(500, el);
    expect(h.calls).toEqual([]);

    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointermove', Y0 - 30 * PX); // 66 sent
    await settle(el);
    pointer(el, 'pointermove', Y0 - 40 * PX); // 73 raw, still 66: equal to the value in flight
    await tick(400, el);
    pointer(el, 'pointerup', Y0 - 40 * PX);
    await tick(500, el);
    expect(h.calls).toEqual([pct(id, 66)]);
  });

  it('0 waits for the release (sendOnRelease), then set_percentage 0', async () => {
    const h = fakeHass({ echoMs: null });
    const id = fanIds.pct33;
    const el = await h.mount(id);
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointermove', Y0 + 20 * PX); // 13 raw: snaps to 0
    await tick(1000, el);
    expect(h.calls).toEqual([]);
    expect(text($(el, '.big'))).toBe('Off');
    pointer(el, 'pointerup', Y0 + 20 * PX);
    await settle(el);
    expect(h.calls).toEqual([pct(id, 0)]);
  });

  it('dragging from off sends the snapped step and turns the fan on through set_percentage', async () => {
    const h = fakeHass({ echoMs: null });
    const id = fanIds.off;
    const el = await h.mount(id);
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointermove', Y0 - 20 * PX); // 20 raw, step 33
    await settle(el);
    pointer(el, 'pointerup', Y0 - 20 * PX);
    await settle(el);
    expect(h.calls).toEqual([pct(id, 33)]);
  });

  it('a preset is left through set_percentage; a drag back to 0 from a preset sends 0 (preset counts as null)', async () => {
    const h = fakeHass({ echoMs: null });
    const id = fanIds.presetAuto;
    const el = await h.mount(id);
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointermove', Y0 - 1 * PX); // 1 raw: snaps to 0, waits
    await tick(400, el);
    expect(h.calls).toEqual([]);
    pointer(el, 'pointerup', Y0 - 1 * PX);
    await settle(el);
    expect(h.calls).toEqual([pct(id, 0)]);
  });

  it('a 100-speed fan is not snapped: the rounded finger value goes out', async () => {
    const h = fakeHass({ echoMs: null });
    const id = fanIds.full; // 40 %
    const el = await h.mount(id);
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointermove', Y0 - 7.3 * PX);
    await settle(el);
    pointer(el, 'pointerup', Y0 - 7.3 * PX);
    await settle(el);
    expect(h.calls).toEqual([pct(id, 47)]);
  });
});

describe('keyboard (core keyStep, same throttle, keyup flushes)', () => {
  it('ArrowUp steps 33, 66, 100: leading write, then the latest at keyup', async () => {
    const h = fakeHass({ echoMs: null });
    const id = fanIds.pct33;
    const el = await h.mount(id);
    key(el, 'keydown', 'ArrowUp');
    await settle(el);
    expect(h.calls).toEqual([pct(id, 66)]);
    key(el, 'keydown', 'ArrowUp', true);
    await tick(50, el);
    expect(h.calls.length).toBe(1);
    expect(text($(el, '.big'))).toBe('100');
    key(el, 'keyup', 'ArrowUp');
    await settle(el);
    expect(h.calls).toEqual([pct(id, 66), pct(id, 100)]);
  });

  it('Down from the lowest step is off and waits for keyup; Page Up on 10 speeds is one step; Home and End', async () => {
    const h = fakeHass({ echoMs: null });
    const el = await h.mount(fanIds.pct33);
    key(el, 'keydown', 'ArrowDown');
    await tick(500, el);
    expect(h.calls).toEqual([]);
    key(el, 'keyup', 'ArrowDown');
    await settle(el);
    expect(h.calls).toEqual([pct(fanIds.pct33, 0)]);

    const ten = await h.mount(fanIds.ten); // 40 %
    key(ten, 'keydown', 'PageUp');
    key(ten, 'keyup', 'PageUp');
    await tick(400, ten);
    key(ten, 'keydown', 'Home');
    key(ten, 'keyup', 'Home');
    await tick(400, ten);
    key(ten, 'keydown', 'End');
    key(ten, 'keyup', 'End');
    await tick(400, ten);
    expect(h.calls.slice(1)).toEqual([pct(fanIds.ten, 50), pct(fanIds.ten, 10), pct(fanIds.ten, 100)]);
  });
});

describe('hold (0.1 rule: the sent value until HA reports it or write_hold)', () => {
  it('shows the sent value without an echo for 10 s, then HA\'s value', async () => {
    const h = fakeHass({ echoMs: null });
    const id = fanIds.pct33;
    const el = await h.mount(id);
    key(el, 'keydown', 'ArrowUp');
    key(el, 'keyup', 'ArrowUp');
    await settle(el);
    expect(text($(el, '.big'))).toBe('66');
    await tick(9000, el);
    expect(text($(el, '.big'))).toBe('66');
    await tick(1500, el);
    expect(text($(el, '.big'))).toBe('33');
  });

  it('ends when HA reports the value', async () => {
    const h = fakeHass({ echoMs: 200 });
    const id = fanIds.pct33;
    const el = await h.mount(id);
    key(el, 'keydown', 'ArrowUp');
    key(el, 'keyup', 'ArrowUp');
    await tick(300, el);
    expect(h.states[id].attributes.percentage).toBe(66);
    h.set(id, 'on', { percentage: 33 }); // a later outside change shows at once
    await settle(el);
    expect(text($(el, '.big'))).toBe('33');
  });
});

describe('Q7 b steps (tile and room, model side): set_percentage, never increase or decrease_speed', () => {
  const writerOn = (h: ReturnType<typeof fakeHass>, id: string) => {
    const w = fanWriters.acquire(id);
    w.hass = h.hass;
    return w;
  };
  const view = (h: ReturnType<typeof fakeHass>, id: string, w: ReturnType<typeof fanWriters.acquire>) => fanView(h.hass.states[id], w.local);

  it('Faster on 10 speeds: leading write, then the latest after 300 ms (one throttle window)', async () => {
    const h = fakeHass({ echoMs: null });
    const id = fanIds.ten;
    const w = writerOn(h, id);
    for (let i = 0; i < 3; i++) stepFan(w, view(h, id, w), 1);
    await settle();
    expect(h.calls).toEqual([pct(id, 50)]);
    await tick(300);
    expect(h.calls).toEqual([pct(id, 50), pct(id, 70)]);
    expect(h.calls.some((c) => /speed/.test(c.service))).toBe(false);
    fanWriters.release(w);
  });

  it('67 Slower gives 33 on 3 speeds; then Slower is disabled at the lowest step', async () => {
    const h = fakeHass({ echoMs: null });
    const id = fanIds.pct67;
    const w = writerOn(h, id);
    expect(stepTarget(view(h, id, w), -1)).toBe(33);
    expect(stepFan(w, view(h, id, w), -1)).toBe(true);
    await settle();
    expect(stepState(h.hass, view(h, id, w))).toMatchObject({ minusDisabled: true, plusDisabled: false, text: '33%' });
    expect(stepFan(w, view(h, id, w), -1)).toBe(false);
    await tick(400);
    expect(h.calls).toEqual([pct(id, 33)]);
    fanWriters.release(w);
  });

  it('disabled states: minus at the lowest step, under a preset and while off; plus while off and at 100', () => {
    const st = (s: ReturnType<(typeof FAN_FIXTURES)[keyof typeof FAN_FIXTURES]>, local = {}) => stepState(undefined, fanView(s as unknown as HassEntity, local));
    expect(st(FAN_FIXTURES.pct33())).toMatchObject({ show: true, minusDisabled: true, plusDisabled: false });
    expect(st(FAN_FIXTURES.pct67())).toMatchObject({ minusDisabled: false, plusDisabled: false });
    expect(st(FAN_FIXTURES.pct100())).toMatchObject({ minusDisabled: false, plusDisabled: true });
    expect(st(FAN_FIXTURES.off())).toMatchObject({ minusDisabled: true, plusDisabled: true, text: '--' });
    expect(st(FAN_FIXTURES.presetAuto())).toMatchObject({ minusDisabled: true, plusDisabled: false, text: '--' });
    expect(st(FAN_FIXTURES.unavailable())).toMatchObject({ minusDisabled: true, plusDisabled: true });
    expect(st(FAN_FIXTURES.onoff())).toMatchObject({ show: false });
    expect(st(FAN_FIXTURES.full(), { percentage: 1 })).toMatchObject({ minusDisabled: true });
  });

  it('Faster under a preset leaves it at the lowest step', async () => {
    const h = fakeHass({ echoMs: null });
    const id = fanIds.presetAuto;
    const w = writerOn(h, id);
    expect(stepFan(w, view(h, id, w), 1)).toBe(true);
    await settle();
    expect(h.calls).toEqual([pct(id, 33)]);
    fanWriters.release(w);
  });

  it('the step base is the pending step, not HA', async () => {
    const h = fakeHass({ echoMs: null });
    const id = fanIds.ten;
    const w = writerOn(h, id);
    stepFan(w, view(h, id, w), 1); // 50 sent
    stepFan(w, view(h, id, w), 1); // 60 pending
    expect(view(h, id, w).percentage).toBe(60);
    stepFan(w, view(h, id, w), -1); // back to 50 = in flight: dropped at the window
    await tick(400);
    expect(h.calls).toEqual([pct(id, 50)]);
    fanWriters.release(w);
  });
});

describe('build: dropped writes and feature gating', () => {
  const s = (f: () => object) => f() as unknown as HassEntity;
  it('drops a speed equal to HA (off counts as 0, preset as null) or to the value in flight', () => {
    expect(buildFanCalls({ percentage: 0 }, s(FAN_FIXTURES.off), {})).toEqual([]);
    expect(buildFanCalls({ percentage: 33 }, s(FAN_FIXTURES.pct33), {})).toEqual([]);
    expect(buildFanCalls({ percentage: 66 }, s(FAN_FIXTURES.pct33), { percentage: 66 })).toEqual([]);
    expect(buildFanCalls({ percentage: 0 }, s(FAN_FIXTURES.presetAuto), {})).toHaveLength(1);
  });
  it('turn_off and turn_on only with their bits; no call when already in that state', () => {
    expect(buildFanCalls({ on: false }, s(FAN_FIXTURES.pct33), {})).toEqual([{ service: 'turn_off', data: { entity_id: fanIds.pct33 }, sets: { on: false, percentage: 0, preset_mode: null } }]);
    const noOff = { ...FAN_FIXTURES.pct33(), attributes: { ...FAN_FIXTURES.pct33().attributes, supported_features: 1 + 32 } } as unknown as HassEntity;
    expect(buildFanCalls({ on: false }, noOff, {})).toEqual([]);
    expect(buildFanCalls({ on: true }, s(FAN_FIXTURES.pct33), {})).toEqual([]);
    expect(buildFanCalls({ on: true }, s(FAN_FIXTURES.off), {})).toEqual([{ service: 'turn_on', data: { entity_id: fanIds.off }, sets: { on: true, percentage: null } }]);
  });
});

describe('card actions: power gating, presets (Q5 a), row', () => {
  it('power: turn_on while off, turn_off while on, at once', async () => {
    const h = fakeHass({ echoMs: null });
    const off = await h.mount(fanIds.off);
    $(off, '.power')!.click();
    const on = await h.mount(fanIds.pct67);
    $(on, '.power')!.click();
    await settle();
    expect(h.calls.map((c) => [c.service, c.data.entity_id])).toEqual([
      ['turn_on', fanIds.off],
      ['turn_off', fanIds.pct67],
    ]);
  });

  it('power is disabled on without TURN_OFF and off without TURN_ON, and hidden with neither', async () => {
    const h = fakeHass({ echoMs: null });
    h.set(fanIds.pct33, 'on', { supported_features: 1 + 32 });
    h.set(fanIds.off, 'off', { supported_features: 1 + 16 });
    h.set(fanIds.pct67, 'on', { supported_features: 1 + 2 });
    const a = await h.mount(fanIds.pct33);
    const b = await h.mount(fanIds.off);
    const c = await h.mount(fanIds.pct67);
    expect(($(a, '.power') as HTMLButtonElement).disabled).toBe(true);
    expect(($(b, '.power') as HTMLButtonElement).disabled).toBe(true);
    expect($(c, '.power')).toBeNull();
    $(a, '.power')!.click();
    $(b, '.power')!.click();
    await settle();
    expect(h.calls).toEqual([]);
  });

  it('chip while on: set_preset_mode with the next preset, wrapping after the last (Q5 a)', async () => {
    const h = fakeHass({ echoMs: null });
    const id = fanIds.presetAuto;
    h.set(id, 'on', { preset_mode: 'on' });
    const el = await h.mount(id);
    $(el, '.chip')!.click();
    await settle(el);
    expect(h.calls).toEqual([{ domain: 'fan', service: 'set_preset_mode', data: { entity_id: id, preset_mode: 'auto' } }]);
  });

  it('chip while off: turn_on with preset_mode; disabled without TURN_ON', async () => {
    const h = fakeHass({ echoMs: null });
    const el = await h.mount(fanIds.presetsOff);
    $(el, '.chip')!.click();
    await settle(el);
    expect(h.calls).toEqual([{ domain: 'fan', service: 'turn_on', data: { entity_id: fanIds.presetsOff, preset_mode: 'auto' } }]);

    h.set(fanIds.presetOnly, 'off', { supported_features: 8 + 16 });
    const noOn = await h.mount(fanIds.presetOnly);
    const chip = $(noOn, '.chip') as HTMLButtonElement;
    expect(chip.disabled).toBe(true);
    chip.click();
    await settle(noOn);
    expect(h.calls.length).toBe(1);
  });

  it('the chip cycles through every preset with echoes and wraps', async () => {
    const h = fakeHass({ echoMs: 50 });
    const id = fanIds.presetAuto;
    const el = await h.mount(id);
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      $(el, '.chip')!.click();
      await tick(100, el);
      seen.push(h.calls.at(-1)!.data.preset_mode as string);
    }
    expect(seen).toEqual(['smart', 'sleep', 'on', 'auto']);
  });

  it('oscillate and direction go out at once with the toggled value', async () => {
    const h = fakeHass({ echoMs: null });
    const el = await h.mount(fanIds.reverse);
    const [osc, dir] = $$(el, '.mode');
    osc.click();
    dir.click();
    await settle(el);
    expect(h.calls).toEqual([
      { domain: 'fan', service: 'oscillate', data: { entity_id: fanIds.reverse, oscillating: true } },
      { domain: 'fan', service: 'set_direction', data: { entity_id: fanIds.reverse, direction: 'forward' } },
    ]);
  });

  it('toggle pill: a tap on an on/off-only fan turns it off at once', async () => {
    const h = fakeHass({ echoMs: null });
    const el = await h.mount(fanIds.onoff);
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointerup', Y0);
    await settle(el);
    expect(h.calls).toEqual([{ domain: 'fan', service: 'turn_off', data: { entity_id: fanIds.onoff } }]);
  });
});

describe('races: a newer call replaces every value an older one holds (RH2 finding 1)', () => {
  const svc = (h: ReturnType<typeof fakeHass>) => h.calls.map((c) => [c.service, c.data.percentage ?? c.data.preset_mode ?? null]);
  /** The fan at 33 % without a preset, with presets (features 63). */
  const at33 = async (h: ReturnType<typeof fakeHass>) => {
    h.set(fanIds.presetAuto, 'on', { preset_mode: null, percentage: 33 });
    return h.mount(fanIds.presetAuto);
  };

  it('turn_off then turn_on, HA publishes only the final "on 67": shows 67, and a later drag to 0 is sent', async () => {
    const h = fakeHass({ echoMs: null });
    const id = fanIds.pct67;
    const el = await h.mount(id);
    $(el, '.power')!.click();
    await settle(el);
    $(el, '.power')!.click();
    await settle(el);
    expect(svc(h)).toEqual([
      ['turn_off', null],
      ['turn_on', null],
    ]);
    h.set(id, 'on', { percentage: 67 });
    await settle(el);
    expect([text($(el, '.ro-v')), text($(el, 'header .sub')), $(el, '.power')!.getAttribute('aria-pressed')]).toEqual(['67%', 'On', 'true']);
    await tick(5000, el);
    expect(text($(el, '.ro-v'))).toBe('67%');
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointermove', Y0 + 100 * PX);
    await settle(el);
    pointer(el, 'pointerup', Y0 + 100 * PX);
    await settle(el);
    expect(svc(h).at(-1)).toEqual(['set_percentage', 0]);
  });

  it('turn_off then turn_on with 200 ms echoes ends on, at 67', async () => {
    const h = fakeHass({ echoMs: 200 });
    const id = fanIds.pct67;
    const el = await h.mount(id);
    $(el, '.power')!.click();
    await settle(el);
    $(el, '.power')!.click();
    await settle(el);
    expect(text($(el, '.ro-v'))).not.toBe('Off');
    await tick(250, el);
    expect(h.states[id].state).toBe('on');
    expect(text($(el, '.ro-v'))).toBe('67%');
    await tick(500, el);
    expect([text($(el, '.ro-v')), $(el, '.power')!.getAttribute('aria-pressed')]).toEqual(['67%', 'true']);
  });

  it('chip, then a drag to 33 before the echo: the drag is sent, not dropped against HA\'s old 33', async () => {
    const h = fakeHass({ echoMs: null });
    const el = await at33(h);
    $(el, '.chip')!.click();
    await settle(el);
    expect(text($(el, '.ro-v'))).toBe('Auto');
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointermove', Y0 - 35 * PX); // from the empty preset pill: 35 raw, step 33
    await settle(el);
    pointer(el, 'pointerup', Y0 - 35 * PX);
    await settle(el);
    expect(svc(h)).toEqual([
      ['set_preset_mode', 'auto'],
      ['set_percentage', 33],
    ]);
    expect(text($(el, '.ro-v'))).toBe('33%');
    h.set(fanIds.presetAuto, 'on', { preset_mode: null, percentage: 33 });
    await tick(5000, el);
    expect(text($(el, '.ro-v'))).toBe('33%');
  });

  it('a drag to 66, then the chip before the echo: the readout follows the preset once HA reports it', async () => {
    const h = fakeHass({ echoMs: null });
    const el = await at33(h);
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointermove', Y0 - 35 * PX); // 68 raw, step 66
    await settle(el);
    pointer(el, 'pointerup', Y0 - 35 * PX);
    await settle(el);
    $(el, '.chip')!.click();
    await settle(el);
    expect(svc(h)).toEqual([
      ['set_percentage', 66],
      ['set_preset_mode', 'auto'],
    ]);
    expect(text($(el, '.ro-v'))).toBe('Auto');
    h.set(fanIds.presetAuto, 'on', { preset_mode: 'auto', percentage: null });
    await settle(el);
    expect([text($(el, '.ro-v')), text($(el, '.chip .v'))]).toEqual(['Auto', 'Auto']);
    await tick(5000, el);
    expect(text($(el, '.ro-v'))).toBe('Auto');
  });

  it('set_percentage 0, then the chip while off: turn_on with the preset, shown as the preset', async () => {
    const h = fakeHass({ echoMs: null });
    const el = await at33(h);
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointermove', Y0 + 50 * PX);
    await settle(el);
    pointer(el, 'pointerup', Y0 + 50 * PX);
    await settle(el);
    expect(text($(el, '.ro-v'))).toBe('Off');
    $(el, '.chip')!.click();
    await settle(el);
    expect(svc(h)).toEqual([
      ['set_percentage', 0],
      ['turn_on', 'auto'],
    ]);
    expect(h.calls[1].data).toEqual({ entity_id: fanIds.presetAuto, preset_mode: 'auto' });
    expect(text($(el, '.ro-v'))).toBe('Auto');
    h.set(fanIds.presetAuto, 'on', { preset_mode: 'auto', percentage: null });
    await tick(5000, el);
    expect(text($(el, '.ro-v'))).toBe('Auto');
  });

  it('every call names every key it changes in its sets', () => {
    const s = (f: () => object) => f() as unknown as HassEntity;
    const sets = (c: ReturnType<typeof buildFanCalls>) => c.map((x) => x.sets);
    expect(sets(buildFanCalls({ on: false }, s(FAN_FIXTURES.presetAuto), {}))).toEqual([{ on: false, percentage: 0, preset_mode: null }]);
    expect(sets(buildFanCalls({ on: true }, s(FAN_FIXTURES.off), {}))).toEqual([{ on: true, percentage: null }]);
    expect(sets(buildFanCalls({ percentage: 66 }, s(FAN_FIXTURES.pct33), {}))).toEqual([{ percentage: 66, preset_mode: null }]);
    expect(sets(buildFanCalls({ percentage: 33 }, s(FAN_FIXTURES.off), {}))).toEqual([{ percentage: 33, preset_mode: null, on: true }]);
    expect(sets(buildFanCalls({ percentage: 0 }, s(FAN_FIXTURES.pct33), {}))).toEqual([{ percentage: 0, preset_mode: null, on: false }]);
    expect(sets(buildFanCalls({ preset_mode: 'sleep' }, s(FAN_FIXTURES.presetAuto), {}))).toEqual([{ preset_mode: 'sleep', percentage: null }]);
    expect(sets(buildFanCalls({ preset_mode: 'auto' }, s(FAN_FIXTURES.presetsOff), {}))).toEqual([{ on: true, preset_mode: 'auto', percentage: null }]);
  });
});

describe('keys under a preset (RH2 finding 2)', () => {
  it('ArrowDown, ArrowLeft and Page Down under a preset send nothing; Up sends the lowest step', async () => {
    const h = fakeHass({ echoMs: null });
    const el = await h.mount(fanIds.presetAuto);
    for (const k of ['ArrowDown', 'ArrowLeft', 'PageDown']) {
      key(el, 'keydown', k);
      await settle(el);
      expect(text($(el, '.ro-v'))).toBe('Auto');
      // Nothing is sent, so aria keeps the preset during the key gesture and after it.
      expect(pill(el).getAttribute('aria-valuetext')).toBe('Auto');
      expect(pill(el).getAttribute('aria-valuenow')).not.toBe('0');
      key(el, 'keyup', k);
      await tick(400, el);
      expect(pill(el).getAttribute('aria-valuetext')).toBe('Auto');
    }
    expect(h.calls).toEqual([]);
    key(el, 'keydown', 'ArrowUp');
    key(el, 'keyup', 'ArrowUp');
    await settle(el);
    expect(h.calls).toEqual([pct(fanIds.presetAuto, 33)]);
  });

  it('Up under a preset on a 100-speed fan sends 1', async () => {
    const h = fakeHass({ echoMs: null });
    h.set(fanIds.full, 'on', { supported_features: 63, preset_modes: ['auto'], preset_mode: 'auto', percentage: null });
    const el = await h.mount(fanIds.full);
    key(el, 'keydown', 'ArrowDown');
    key(el, 'keyup', 'ArrowDown');
    await tick(400, el);
    key(el, 'keydown', 'ArrowUp');
    key(el, 'keyup', 'ArrowUp');
    await settle(el);
    expect(h.calls).toEqual([pct(fanIds.full, 1)]);
  });
});

describe('one shared writer per fan (RH2 finding 5)', () => {
  it('the card and a second consumer (a tile step) share one queue and one throttle window', async () => {
    const h = fakeHass({ echoMs: null });
    const id = fanIds.ten; // 40 %
    const el = await h.mount(id);
    const w = fanWriters.acquire(id);
    w.hass = h.hass;
    expect(fanWriters.refs(id)).toBe(2);
    key(el, 'keydown', 'ArrowUp'); // 50, leading write
    key(el, 'keyup', 'ArrowUp');
    await settle(el);
    expect(stepFan(w, fanView(h.hass.states[id], w.local), 1)).toBe(true); // 60, inside the window
    expect(stepFan(w, fanView(h.hass.states[id], w.local), 1)).toBe(true); // 70, coalesced
    await settle(el);
    expect(text($(el, '.ro-v'))).toBe('70%');
    expect(h.calls).toEqual([pct(id, 50)]);
    await tick(300, el);
    expect(h.calls).toEqual([pct(id, 50), pct(id, 70)]);
    fanWriters.release(w);
    expect(fanWriters.refs(id)).toBe(1);
  });

  it('a card leaving mid-drag ends its hold, sends what is pending and releases the writer', async () => {
    const h = fakeHass({ echoMs: null });
    const id = fanIds.pct33;
    const el = await h.mount(id);
    pointer(el, 'pointerdown', Y0);
    pointer(el, 'pointermove', Y0 - 30 * PX); // 66, leading
    await settle(el);
    pointer(el, 'pointermove', Y0 - 60 * PX); // 100, pending in the window
    await tick(50, el);
    expect(h.calls).toEqual([pct(id, 66)]);
    el.remove();
    await tick(300);
    expect(h.calls).toEqual([pct(id, 66), pct(id, 100)]);
    expect(fanWriters.refs(id)).toBe(0);
  });
});

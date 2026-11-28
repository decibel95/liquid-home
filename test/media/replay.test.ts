import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HassEntity } from '@decibel95/liquid-core';
import { createMediaWriter, mediaView, type MediaWriter } from '../../src/media';
import { entity } from './fixtures';
import { fakeHass, type FakeHass } from './hass';
import { Ctl, Ent, keyValues, ProtoHA } from './proto';

/**
 * Plan 5 H1 acceptance: replay the prototype's section 1 drag (pill, keys, tile steps), section 2 seek (drag and keys)
 * and section 3 taps (play, pause, next, previous, failure, power) plus mute, sound mode, shuffle and repeat, on the
 * prototype's own logic (proto.ts) and on the media writer, with the same latency (250 ms), and compare service, data
 * and call count; where the prototype shows an optimistic state, the drawn state is compared too.
 */

const LATENCY = 250;
const T0 = Date.parse('2026-11-27T12:00:00Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
  vi.setSystemTime(T0);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(async () => {
  await vi.runOnlyPendingTimersAsync();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** The gesture vocabulary both sides understand (what the card, tile and slider would call). */
interface Driver {
  volStart(): void;
  volPreview(v: number): void;
  volEnd(): void;
  step(dir: 1 | -1): void;
  seekPreview(s: number): void;
  seekEnd(): void;
  shown(): number;
  state(): string;
  play(): void;
  next(): void;
  previous(): void;
  mute(): void;
  power(): void;
  sound(mode: string): void;
  shuffle(): void;
  repeat(): void;
  failNext(): void;
  calls(): [string, Record<string, unknown>][];
}

interface Start {
  vol: number;
  pos: number;
  dur: number;
  shuffle?: boolean;
}

function proto(start: Start, tile: 'set' | 'step' = 'set'): Driver {
  const ent = new Ent({ vol: start.vol, pos: start.pos, dur: start.dur, posAt: Date.now(), shuffle: start.shuffle ?? false, tracks: [{ title: 'A', dur: start.dur }, { title: 'B', dur: start.dur }] });
  const ha = new ProtoHA(LATENCY);
  const c = new Ctl(ent, ha, tile);
  let lastVol: number | null = null;
  let lastSeek: number | null = null;
  return {
    volStart: () => {
      lastVol = null;
      c.volStart();
    },
    volPreview: (v) => {
      lastVol = v;
      c.volPreview(v);
    },
    volEnd: () => c.volEnd(lastVol),
    step: (d) => c.stepVolume(d),
    seekPreview: (s) => (lastSeek = s),
    seekEnd: () => lastSeek != null && c.seekEnd(lastSeek),
    shown: () => c.pos(),
    state: () => c.state(),
    play: () => c.togglePlay(),
    next: () => c.skip(1),
    previous: () => c.skip(-1),
    mute: () => c.toggleMute(),
    power: () => c.power(),
    sound: (m) => c.setSound(m),
    shuffle: () => c.shuffleTap(),
    repeat: () => c.repeatTap(),
    failNext: () => (ha.failNext = true),
    calls: () => ha.calls.map((x) => [x.svc, x.data]),
  };
}

/** Features of the replay player: the prototype card's controls (transport, volume, mute, seek, power, sound mode, shuffle, repeat). */
const FEATURES = 1 | 2 | 4 | 8 | 16 | 32 | 128 | 256 | 16384 | 32768 | 65536 | 262144;

function ours(start: Start, features = FEATURES): Driver & { h: FakeHass; w: MediaWriter } {
  const s: HassEntity = entity('media_player.replay', 'playing', {
    supported_features: features, volume_level: start.vol / 100, is_volume_muted: false, media_title: 'A', media_content_id: 'a',
    media_duration: start.dur, media_position: start.pos, media_position_updated_at: new Date(Date.now()).toISOString(),
    sound_mode: 'Music', sound_mode_list: ['Music', 'Movie'], shuffle: start.shuffle ?? false, repeat: 'off',
  });
  if (features === 914873) delete s.attributes.volume_level;
  const h = fakeHass([s], { latency: LATENCY });
  const w = createMediaWriter(s.entity_id);
  h.attach(w);
  const owner = {};
  const view = () => mediaView(h.hass.states[s.entity_id], { pending: w.pending });
  return {
    h,
    w,
    volStart: () => w.holdFor(owner),
    volPreview: (v) => w.setVolume(v),
    volEnd: () => w.endHoldFor(owner),
    step: (d) => void w.step(d),
    seekPreview: (x) => w.seekPreview(x),
    seekEnd: () => w.seekCommit(),
    shown: () => view().position!.seconds,
    state: () => view().state,
    play: () => w.playPause(),
    next: () => w.next(),
    previous: () => w.previous(),
    mute: () => w.mute(),
    power: () => w.power(),
    sound: (m) => w.selectSoundMode(m),
    shuffle: () => w.toggleShuffle(),
    repeat: () => w.cycleRepeat(),
    failNext: () => h.failNext(),
    calls: () => h.calls.map((c) => {
      const { entity_id: _id, ...data } = c.data;
      return [c.service, data];
    }),
  };
}

type Script = [number, (d: Driver, snap: (label: string) => void) => void][];

/** Run a timed script on a driver: every step is scheduled at t = 0 in order (ties keep script order). */
async function run(d: Driver, script: Script, until: number) {
  const snaps: string[] = [];
  const start = Date.now();
  for (const [at, step] of script) setTimeout(() => step(d, (label) => snaps.push(`${label}: ${d.state()}`)), at);
  await vi.advanceTimersByTimeAsync(until - (Date.now() - start));
  return { calls: d.calls(), snaps };
}

async function compare(script: Script, until: number, start: Start, opts: { tile?: 'set' | 'step'; features?: number } = {}) {
  vi.setSystemTime(T0);
  const p = await run(proto(start, opts.tile), script, until);
  vi.setSystemTime(T0);
  const o = ours(start, opts.features);
  const q = await run(o, script, until);
  o.w.dispose();
  return { p, q };
}

describe('section 1: volume drag, keys and tile steps', () => {
  it('pill drag (60 fps, 35 to 70 over 0.54 s) gives the same calls', async () => {
    const script: Script = [[0, (d) => d.volStart()]];
    for (let k = 0; k <= 34; k++) script.push([k * 16, (d) => d.volPreview(36 + k)]);
    script.push([620, (d) => d.volEnd()]);
    const { p, q } = await compare(script, 3000, { vol: 35, pos: 83, dur: 245 });
    expect(p.calls).toEqual([
      ['volume_set', { volume_level: 0.36 }],
      ['volume_set', { volume_level: 0.54 }],
      ['volume_set', { volume_level: 0.7 }],
    ]);
    expect(q.calls).toEqual(p.calls);
  });

  it('a held arrow key (first press, then auto-repeat) gives the same calls', async () => {
    const at = [0, 500, 533, 566, 600];
    const values = keyValues(70, 2, at.length, 100);
    const script: Script = [[0, (d) => d.volStart()], ...at.map((t, i) => [t, (d: Driver) => d.volPreview(values[i])] as Script[number]), [650, (d) => d.volEnd()]];
    const { p, q } = await compare(script, 3000, { vol: 70, pos: 83, dur: 245 });
    expect(p.calls.map((c) => c[1].volume_level)).toEqual([0.72, 0.74, 0.8]);
    expect(q.calls).toEqual(p.calls);
  });

  it('tile steps: three Plus taps, then three Minus taps, give the same calls', async () => {
    const script: Script = [0, 100, 200].map((t) => [t, (d) => d.step(1)] as Script[number]);
    script.push(...[1000, 1100, 1200].map((t) => [t, (d: Driver) => d.step(-1)] as Script[number]));
    const { p, q } = await compare(script, 3000, { vol: 35, pos: 83, dur: 245 });
    expect(p.calls.map((c) => c[1].volume_level)).toEqual([0.4, 0.5, 0.45, 0.35]);
    expect(q.calls).toEqual(p.calls);
  });

  it('tile steps with volume_up / volume_down (VOLUME_STEP only): one call per tap', async () => {
    const script: Script = [[0, (d) => d.step(1)], [100, (d) => d.step(1)], [200, (d) => d.step(1)], [300, (d) => d.step(-1)]];
    const { p, q } = await compare(script, 2000, { vol: 35, pos: 83, dur: 245 }, { tile: 'step', features: 914873 });
    expect(p.calls).toEqual([['volume_up', {}], ['volume_up', {}], ['volume_up', {}], ['volume_down', {}]]);
    expect(q.calls).toEqual(p.calls);
  });
});

describe('section 2: seek', () => {
  it('a relative drag sends one media_seek at release; a key gesture one at keyup', async () => {
    const script: Script = [
      [0, (d) => d.seekPreview(60)],
      [100, (d) => d.seekPreview(90.4)],
      [300, (d) => d.seekPreview(120.2)],
      [400, (d) => d.seekEnd()],
      [2000, (d) => {
        for (const v of keyValues(d.shown(), 5, 3, 300)) d.seekPreview(v);
      }],
      [2200, (d) => d.seekEnd()],
    ];
    const { p, q } = await compare(script, 9000, { vol: 20, pos: 45, dur: 300 });
    expect(p.calls).toEqual([['media_seek', { seek_position: 120 }], ['media_seek', { seek_position: 136 }]]);
    expect(q.calls).toEqual(p.calls);
  });
});

describe('section 3: transport taps', () => {
  it('play and pause flip at once, next and previous show Buffering, a failure reverts, power off and on', async () => {
    const snap = (label: string): Script[number][1] => (_d, s) => s(label);
    const script: Script = [
      [0, (d) => d.play()],
      [10, snap('after pause tap')],
      [400, snap('after pause echo')],
      [1000, (d) => d.play()],
      [1010, snap('after play tap')],
      [2000, (d) => d.next()],
      [2010, snap('after next tap')],
      [2400, snap('after next echo')],
      [3000, (d) => d.previous()],
      [3400, snap('after previous echo')],
      [4000, (d) => d.failNext()],
      [4000, (d) => d.play()],
      [4010, snap('after failing pause tap')],
      [4400, snap('after the failure')],
      [5000, (d) => d.power()],
      [6000, (d) => d.power()],
      [6400, snap('after power on')],
    ];
    const { p, q } = await compare(script, 8000, { vol: 35, pos: 83, dur: 245 });
    expect(p.calls.map((c) => c[0])).toEqual(['media_pause', 'media_play', 'media_next_track', 'media_previous_track', 'media_pause', 'turn_off', 'turn_on']);
    expect(q.calls).toEqual(p.calls);
    expect(p.snaps).toEqual([
      'after pause tap: paused',
      'after pause echo: paused',
      'after play tap: playing',
      'after next tap: buffering',
      'after next echo: playing',
      'after previous echo: playing',
      'after failing pause tap: paused',
      'after the failure: playing',
      'after power on: playing',
    ]);
    expect(q.snaps).toEqual(p.snaps);
  });

  it('mute, sound mode, shuffle and repeat give the same calls', async () => {
    const script: Script = [
      [0, (d) => d.mute()],
      [500, (d) => d.mute()],
      [1000, (d) => d.sound('Movie')],
      [1500, (d) => d.shuffle()],
      [2000, (d) => d.repeat()],
      [2500, (d) => d.repeat()],
      [3000, (d) => d.repeat()],
    ];
    const { p, q } = await compare(script, 5000, { vol: 35, pos: 83, dur: 245 });
    expect(p.calls).toEqual([
      ['volume_mute', { is_volume_muted: true }],
      ['volume_mute', { is_volume_muted: false }],
      ['select_sound_mode', { sound_mode: 'Movie' }],
      ['shuffle_set', { shuffle: true }],
      ['repeat_set', { repeat: 'all' }],
      ['repeat_set', { repeat: 'one' }],
      ['repeat_set', { repeat: 'off' }],
    ]);
    expect(q.calls).toEqual(p.calls);
  });
});

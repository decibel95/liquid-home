import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WriterLease, type HassEntity } from '@decibel95/liquid-core';
import { createMediaWriter, mediaView, mediaWriters, type MediaWriter } from '../../src/media';
import { DEMO, FIX } from './fixtures';
import { fakeHass, type FakeHassOptions } from './hass';

/**
 * Plan 2.4 "Tests that pin the rules", writes part: fake timers (performance too, the core queue reads it for the
 * throttle window) and a fake hass whose calls resolve and echo after 250 ms.
 */

const T0 = Date.parse('2026-11-27T12:00:00Z');
const cleanups: (() => void)[] = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] });
  vi.setSystemTime(T0);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(async () => {
  for (const c of cleanups.splice(0)) c();
  await vi.runOnlyPendingTimersAsync();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

/** One writer (as a card has through its lease) on a fake hass with the given fixture. */
function setup(make: () => HassEntity, opts: FakeHassOptions = {}) {
  const s = make();
  const h = fakeHass([s], opts);
  // A writer of its own (not the shared registry), so two setups of one fixture never share state; the card's lease
  // hold is the owner-based holdFor/endHoldFor it maps to.
  const w = createMediaWriter(s.entity_id);
  const owner = {};
  const lease = { hold: () => w.holdFor(owner), endHold: () => w.endHoldFor(owner) };
  w.hold = 10;
  h.attach(w);
  cleanups.push(() => w.dispose());
  const id = s.entity_id;
  return { h, w, lease, id, view: (now = Date.now()) => mediaView(h.hass.states[id], { entityId: id, now, pending: w.pending }) };
}

const vol = (v: number) => ['volume_set', { entity_id: expect.any(String), volume_level: v }];

describe('volume (GD1): throttle 300 ms, final on release, hold until the echo', () => {
  it('leading write at once, at most one per 300 ms with the latest value, final on release', async () => {
    const { h, w, lease } = setup(FIX.volume_mid);
    lease.hold();
    w.setVolume(40);
    await tick();
    expect(h.list()).toEqual([vol(0.4)]);
    for (const v of [45, 50, 55]) {
      await tick(50);
      w.setVolume(v);
    }
    await tick(100); // t = 250
    expect(h.calls.length).toBe(1);
    await tick(50); // t = 300
    expect(h.list()).toEqual([vol(0.4), vol(0.55)]);
    await tick(20);
    w.setVolume(61.4); // whole percent
    await tick(20);
    lease.endHold();
    await tick(300);
    expect(h.list()).toEqual([vol(0.4), vol(0.55), vol(0.61)]);
    expect(h.calls[1].at - h.calls[0].at).toBeGreaterThanOrEqual(300);
    await tick(1000);
    expect(h.calls.length).toBe(3);
    expect(h.calls.every((c) => c.domain === 'media_player')).toBe(true);
  });

  it('holds the sent value until HA reports it (a newer report of the old volume keeps it)', async () => {
    const { h, w, lease, view, id } = setup(FIX.volume_mid);
    lease.hold();
    w.setVolume(60);
    lease.endHold();
    expect(view()).toMatchObject({ volume: 60, volumeOrigin: 'pending' });
    await tick(100);
    h.set(id, null, { sound_mode: 'Movie' });
    expect(h.hass.states[id].attributes.volume_level).toBe(0.35);
    expect(view()).toMatchObject({ volume: 60, volumeOrigin: 'pending' });
    await tick(150); // echo at 250
    expect(h.list()).toEqual([vol(0.6)]);
    expect(w.pending.volume).toBeNull();
    expect(view()).toMatchObject({ volume: 60, volumeOrigin: 'ha' });
  });

  it('drops a write equal to HA\'s value or to the value in flight', async () => {
    const { h, w, lease } = setup(FIX.volume_mid);
    w.setVolume(35);
    await tick(400);
    expect(h.calls).toEqual([]);
    lease.hold();
    w.setVolume(70);
    await tick(100);
    w.setVolume(71);
    w.setVolume(70);
    lease.endHold();
    await tick(1000);
    expect(h.list()).toEqual([vol(0.7)]);
  });

  it('ends the hold after write_hold without an echo, and at once on a failed call', async () => {
    const a = setup(FIX.volume_mid, { echo: false });
    a.w.setVolume(20);
    await tick(9900);
    expect(a.view().volume).toBe(20);
    await tick(200);
    expect(a.view()).toMatchObject({ volume: 35, volumeOrigin: 'ha' });

    const b = setup(FIX.muted);
    b.h.failNext();
    b.w.setVolume(80);
    await tick(100);
    expect(b.view().volume).toBe(80);
    await tick(200);
    expect(b.view().volume).toBe(35);
    expect(b.w.error).toBe('fake failure');
  });

  it('does nothing without VOLUME_SET or while off', async () => {
    for (const make of [FIX.volume_step, DEMO.lounge_room, FIX.off, FIX.unavailable]) {
      const { h, w } = setup(make);
      w.setVolume(50);
      await tick(400);
      expect(h.calls, make().entity_id).toEqual([]);
    }
  });
});

describe('tile and strip steps (GD2)', () => {
  it('three Plus taps coalesce: a leading and one trailing volume_set', async () => {
    const { h, w, view } = setup(FIX.volume_mid);
    expect(w.step(1)).toBe(true);
    await tick(100);
    expect(w.step(1)).toBe(true);
    await tick(100);
    expect(w.step(1)).toBe(true);
    expect(view().volume).toBe(50);
    await tick(50);
    expect(h.list()).toEqual([vol(0.4)]);
    await tick(50);
    expect(h.list()).toEqual([vol(0.4), vol(0.5)]);
    await tick(1000);
    expect(h.calls.length).toBe(2);
  });

  it('Minus is disabled at 0 and Plus at 100, in the view and in the writer', async () => {
    const top = setup(DEMO.living_room);
    expect(top.view().can.stepUp).toBe(false);
    expect(top.w.step(1)).toBe(false);
    const low = setup(FIX.volume_zero);
    expect(low.view().can.stepDown).toBe(false);
    expect(low.w.step(-1)).toBe(false);
    await tick(400);
    expect([...top.h.calls, ...low.h.calls]).toEqual([]);
    // Up to 100 then disabled: the pending value is the base.
    const near = setup(() => FIX.volume_mid());
    near.h.set(near.id, null, { volume_level: 0.97 });
    expect(near.w.step(1)).toBe(true);
    expect(near.view()).toMatchObject({ volume: 100, can: { stepUp: false, stepDown: true } });
    expect(near.w.step(1)).toBe(false);
  });

  it('VOLUME_STEP only: volume_up or volume_down at once, one call per tap, no hold, never disabled', async () => {
    const { h, w, view } = setup(FIX.volume_step);
    for (let i = 0; i < 3; i++) expect(w.step(1)).toBe(true);
    expect(w.step(-1)).toBe(true);
    expect(h.calls.map((c) => c.service)).toEqual(['volume_up', 'volume_up', 'volume_up', 'volume_down']);
    expect(h.calls[0].data).toEqual({ entity_id: 'media_player.lh_fixture_volume_step' });
    expect(w.pending.volume).toBeNull();
    expect(view().can).toMatchObject({ stepUp: true, stepDown: true });
  });

  it('can.stepDown and can.stepUp agree with what step() does, for every fixture', () => {
    for (const make of [...Object.values(DEMO), ...Object.values(FIX)]) {
      for (const dir of [1, -1] as const) {
        const { w, view } = setup(make);
        const can = dir > 0 ? view().can.stepUp : view().can.stepDown;
        expect(w.step(dir), `${make().entity_id} ${dir}`).toBe(can);
      }
    }
  });
});

describe('seek (GD3)', () => {
  it('no call while dragging, exactly one media_seek at release, rounded', async () => {
    const { h, w, view } = setup(FIX.transport);
    for (const s of [100, 120.2, 150.4]) {
      w.seekPreview(s);
      await tick(50);
    }
    expect(h.calls).toEqual([]);
    expect(view().position).toMatchObject({ seconds: 150.4, held: true });
    w.seekCommit();
    expect(h.list()).toEqual([['media_seek', { entity_id: 'media_player.lh_fixture_seek_live', seek_position: 150 }]]);
    w.seekCommit();
    await tick(1000);
    expect(h.calls.length).toBe(1);
  });

  it('a key gesture sends one call at keyup; a release on the shown position sends nothing; cancel sends nothing', async () => {
    const { h, w, view } = setup(FIX.transport);
    const shown = view().position!.seconds;
    for (const n of [1, 2, 3]) w.seekPreview(Math.round(shown) + 5 * n);
    w.seekCommit();
    expect(h.list()).toEqual([['media_seek', { entity_id: expect.any(String), seek_position: 98 }]]);
    await tick(2000);
    w.seekPreview(view().position!.seconds + 0.3);
    w.seekCommit();
    w.seekPreview(10);
    w.seekCancel();
    w.seekCommit();
    expect(h.calls.length).toBe(1);
    expect(w.pending.position).toBeNull();
  });

  it('the hold extrapolates while playing, survives a stale report, ends within 2 s of the echo', async () => {
    const { h, w, view, id } = setup(FIX.transport);
    w.seekPreview(150);
    w.seekCommit();
    await tick(100);
    expect(view().position).toMatchObject({ seconds: 150.1, held: true });
    h.set(id, null, { is_volume_muted: false, sound_mode: 'Movie' }); // newer state, old position
    expect(w.pending.position).toBe(150);
    await tick(150); // echo at 250: 150 + 0.125
    expect(w.pending.position).toBeNull();
    expect(view().position).toMatchObject({ seconds: 150.125, held: false });
  });

  it('the hold ends after write_hold, on failure, and on another seek', async () => {
    const a = setup(FIX.transport, { echo: false });
    a.w.seekPreview(200);
    a.w.seekCommit();
    await tick(9900);
    expect(a.view().position).toMatchObject({ seconds: 209.9, held: true });
    await tick(200);
    expect(a.w.pending.position).toBeNull();

    const b = setup(FIX.transport);
    b.h.failNext();
    b.w.seekPreview(200);
    b.w.seekCommit();
    await tick(300);
    expect(b.w.pending.position).toBeNull();
    expect(b.view().position!.held).toBe(false);

    const c = setup(FIX.transport, { echo: false });
    c.w.seekPreview(200);
    c.w.seekCommit();
    await tick(100);
    c.w.seekPreview(20);
    c.w.seekCommit();
    expect(c.w.pending).toMatchObject({ position: 20 });
    expect(c.h.calls.map((x) => x.data.seek_position)).toEqual([200, 20]);
  });

  it('a paused hold does not move; nothing without SEEK or a position', async () => {
    const { w, view } = setup(FIX.paused, { echo: false });
    w.seekPreview(100);
    w.seekCommit();
    await tick(3000);
    expect(view().position!.seconds).toBe(100);
    for (const make of [DEMO.kitchen, DEMO.lounge_room]) {
      const x = setup(make);
      x.w.seekPreview(10);
      x.w.seekCommit();
      expect(x.h.calls).toEqual([]);
    }
  });
});

describe('play and pause (GD4, D-8)', () => {
  it('flips at once, ends at the echo; the position stops at the tap', async () => {
    const { h, w, view } = setup(FIX.transport);
    const before = view().position!.seconds;
    w.playPause();
    expect(view()).toMatchObject({ state: 'paused', haState: 'playing' });
    expect(h.list()).toEqual([['media_pause', { entity_id: 'media_player.lh_fixture_seek_live' }]]);
    await tick(200);
    expect(view().position!.seconds).toBe(before);
    await tick(100);
    expect(w.pending.state).toBeNull();
    expect(view()).toMatchObject({ state: 'paused', haState: 'paused' });
    w.playPause();
    expect(view().state).toBe('playing');
    expect(h.calls[1].service).toBe('media_play');
  });

  it('reverts on a rejected call', async () => {
    const { h, w, view } = setup(FIX.transport);
    h.failNext();
    w.playPause();
    expect(view().state).toBe('paused');
    await tick(300);
    expect(view().state).toBe('playing');
    expect(w.pending.state).toBeNull();
    expect(w.error).toBe('fake failure');
  });

  it('media_play for paused, idle and on; never media_play_pause', async () => {
    for (const make of [FIX.paused, FIX.idle, FIX.on]) {
      const { h, w, view } = setup(make);
      w.playPause();
      expect(view().state).toBe('playing');
      expect(h.calls.map((c) => c.service), make().entity_id).toEqual(['media_play']);
    }
    const noPause = setup(() => ({ ...FIX.transport(), attributes: { ...FIX.transport().attributes, supported_features: 16384 } }));
    noPause.w.playPause();
    expect(noPause.h.calls).toEqual([]);
  });

  it('disabled while buffering; ends after write_hold without an echo (HA wins)', async () => {
    const b = setup(FIX.buffering);
    b.w.playPause();
    expect(b.h.calls).toEqual([]);
    const { w, view } = setup(FIX.transport, { echo: false });
    w.playPause();
    await tick(9900);
    expect(view().state).toBe('paused');
    await tick(200);
    expect(view().state).toBe('playing');
  });
});

describe('next and previous (GD4)', () => {
  it('shows buffering with the position frozen until the title changes', async () => {
    const { h, w, view, id } = setup(FIX.transport);
    const before = view().position!.seconds;
    w.next();
    expect(h.list()).toEqual([['media_next_track', { entity_id: id }]]);
    expect(view()).toMatchObject({ state: 'buffering', pending: { trackChange: true } });
    w.playPause();
    expect(h.calls.length).toBe(1);
    await tick(100);
    h.set(id, null, { sound_mode: 'Movie' }); // a newer report of the same track
    expect(view().state).toBe('buffering');
    await tick(100);
    expect(view().position!.seconds).toBe(before);
    await tick(100); // echo: Track 2
    expect(view()).toMatchObject({ state: 'playing', now: { title: 'Track 2' }, pending: { trackChange: false } });
    expect(view().position!.seconds).toBeCloseTo(0.05, 5);
    w.previous();
    expect(h.calls[1].service).toBe('media_previous_track');
  });

  it('ends on failure, after write_hold, and when the state leaves playing', async () => {
    const a = setup(FIX.transport);
    a.h.failNext();
    a.w.next();
    await tick(300);
    expect(a.view().state).toBe('playing');

    const b = setup(FIX.transport, { echo: false });
    b.w.previous();
    await tick(9900);
    expect(b.view().state).toBe('buffering');
    await tick(200);
    expect(b.view().state).toBe('playing');

    const c = setup(FIX.transport, { echo: false });
    c.w.next();
    c.h.set(c.id, 'paused');
    expect(c.view().state).toBe('paused');
    expect(c.w.pending.trackChange).toBe(false);
  });

  it('needs its feature bit', () => {
    const { h, w } = setup(DEMO.living_room);
    w.next();
    w.previous();
    expect(h.calls).toEqual([]);
  });
});

describe('mute, power, chips, shuffle and repeat', () => {
  it('mute is optimistic and reverts on failure', async () => {
    const { h, w, view } = setup(FIX.volume_mid);
    w.mute();
    expect(view().muted).toBe(true);
    expect(h.list()).toEqual([['volume_mute', { entity_id: expect.any(String), is_volume_muted: true }]]);
    await tick(300);
    expect(w.pending.muted).toBeNull();
    expect(view().muted).toBe(true);
    h.failNext();
    w.mute();
    expect(view().muted).toBe(false);
    await tick(300);
    expect(view().muted).toBe(true);
  });

  it('power: turn_on while off or unknown (TURN_ON), else turn_off (TURN_OFF), no optimism', async () => {
    const cases: [() => HassEntity, string | null][] = [
      [FIX.off, 'turn_on'],
      [FIX.unknown, 'turn_on'],
      [FIX.standby, 'turn_on'],
      [FIX.transport, 'turn_off'],
      [FIX.onoff_only, 'turn_off'],
      [FIX.unavailable, null],
      [DEMO.browse, null],
    ];
    for (const [make, service] of cases) {
      const { h, w, view } = setup(make);
      const state = view().state;
      w.power();
      expect(h.calls.map((c) => c.service), make().entity_id).toEqual(service ? [service] : []);
      expect(view().state).toBe(state);
    }
  });

  it('source and sound mode: one call per selection, held until the echo, released on failure and after write_hold', async () => {
    const { h, w, view, id } = setup(FIX.tv_sources);
    w.selectSource('HDMI 1'); // the current value
    expect(h.calls).toEqual([]);
    w.selectSource('HDMI 2');
    expect(view().source).toBe('HDMI 2');
    h.set(id, null, { volume_level: 0.5 });
    expect(w.pending.source).toBe('HDMI 2');
    await tick(300);
    expect(w.pending.source).toBeNull();
    expect(h.list()).toEqual([['select_source', { entity_id: id, source: 'HDMI 2' }]]);
    h.failNext();
    w.selectSource('Plex');
    await tick(300);
    expect(view().source).toBe('HDMI 2');

    const m = setup(FIX.speaker_modes, { echo: false });
    m.w.selectSoundMode('Night');
    expect(m.view().soundMode).toBe('Night');
    expect(m.h.list()).toEqual([['select_sound_mode', { entity_id: m.id, sound_mode: 'Night' }]]);
    await tick(10_100);
    expect(m.view().soundMode).toBe('Music');
    const none = setup(DEMO.living_room);
    none.w.selectSource('dvd');
    expect(none.h.calls).toEqual([]);
  });

  it('(path S) shuffle toggles; repeat cycles off, all, one, off', async () => {
    const { h, w, view } = setup(FIX.shuffle_repeat);
    w.toggleShuffle();
    expect(view().shuffle).toBe(false);
    for (let i = 0; i < 3; i++) {
      await tick(300);
      w.cycleRepeat();
    }
    await tick(300);
    expect(h.calls.map((c) => [c.service, c.data.shuffle ?? c.data.repeat])).toEqual([
      ['shuffle_set', false],
      ['repeat_set', 'all'],
      ['repeat_set', 'one'],
      ['repeat_set', 'off'],
    ]);
    // Without echoes the pending value is the base: off, all, one.
    const q = setup(FIX.shuffle_repeat, { echo: false });
    q.w.cycleRepeat();
    q.w.cycleRepeat();
    expect(q.view().repeat).toBe('one');
    expect(q.h.calls.map((c) => c.data.repeat)).toEqual(['all', 'one']);
  });
});

describe('one shared writer per entity (WriterRegistry)', () => {
  it('a card and a tile on one entity share the queue: steps during a drag coalesce with it', async () => {
    const s = FIX.volume_mid();
    const h = fakeHass([s]);
    const card = new WriterLease<MediaWriter>(mediaWriters, () => undefined);
    const tile = new WriterLease<MediaWriter>(mediaWriters, () => undefined);
    const w = card.get(s.entity_id);
    expect(tile.get(s.entity_id)).toBe(w);
    expect(mediaWriters.refs(s.entity_id)).toBe(2);
    h.attach(w);
    card.hold();
    w.setVolume(40);
    await tick(100);
    tile.current!.step(1); // base: the pending 40
    await tick(100);
    card.endHold();
    await tick(400);
    expect(h.list()).toEqual([vol(0.4), vol(0.45)]);
    tile.release();
    card.release();
    expect(mediaWriters.refs(s.entity_id)).toBe(0);
  });
});

describe('discrete actions and the volume throttle', () => {
  it('go out at once and do not cancel a running volume throttle', async () => {
    const { h, w, lease } = setup(FIX.volume_mid);
    lease.hold();
    w.setVolume(40);
    await tick(50);
    w.setVolume(50);
    await tick(50);
    w.mute();
    w.selectSoundMode('Movie');
    expect(h.calls.map((c) => c.service)).toEqual(['volume_set', 'volume_mute', 'select_sound_mode']);
    await tick(200); // t = 300
    lease.endHold();
    await tick(500);
    expect(h.list().filter(([s]) => s === 'volume_set')).toEqual([vol(0.4), vol(0.5)]);
  });

  it('a disposed writer stops every timer and sends what is pending', async () => {
    const s = FIX.transport();
    const h = fakeHass([s], { echo: false });
    const w = createMediaWriter(s.entity_id);
    h.attach(w);
    w.next();
    w.mute();
    w.seekPreview(10);
    w.seekCommit();
    w.dispose();
    expect(vi.getTimerCount()).toBe(3); // the three calls in flight in the fake hass
    await tick(300);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('RH1: holds end on a change to the target, the seek hold survives play and pause, one error timer', () => {
  it('mute tapped twice 50 ms apart: an unrelated report and the first echo keep the second tap', async () => {
    const { h, w, view, id } = setup(FIX.volume_mid);
    const seen: (boolean | null)[] = [];
    w.mute();
    seen.push(view().muted);
    await tick(50);
    w.mute();
    seen.push(view().muted);
    await tick(50);
    h.set(id, null, { sound_mode: 'Movie' });
    seen.push(view().muted);
    await tick(150); // echo of the first tap: true
    expect(h.hass.states[id].attributes.is_volume_muted).toBe(true);
    seen.push(view().muted);
    await tick(50); // echo of the second tap: false
    seen.push(view().muted);
    expect(seen).toEqual([true, false, false, false, false]);
    expect(w.pending.muted).toBeNull();
  });

  it('play then pause on a paused player stays paused through the first echo', async () => {
    const { h, w, view, id } = setup(FIX.paused);
    const seen: string[] = [];
    w.playPause();
    seen.push(view().state);
    await tick(50);
    w.playPause();
    seen.push(view().state);
    h.set(id, null, { sound_mode: 'Movie' });
    seen.push(view().state);
    await tick(200); // echo of play
    expect(h.hass.states[id].state).toBe('playing');
    seen.push(view().state);
    await tick(50); // echo of pause
    seen.push(view().state);
    expect(seen).toEqual(['playing', 'paused', 'paused', 'paused', 'paused']);
    expect(w.pending.state).toBeNull();
    expect(h.calls.map((c) => c.service)).toEqual(['media_play', 'media_pause']);
  });

  it('a failed second tap reverts to what HA reported for the first', async () => {
    const { h, w, view } = setup(FIX.volume_mid);
    w.mute();
    await tick(50);
    h.failNext();
    w.mute();
    expect(view().muted).toBe(false);
    await tick(220); // first echo (true) at 250: the second tap is still in flight
    expect(view().muted).toBe(false);
    await tick(100); // the second call fails at 300
    expect([view().muted, w.pending.muted]).toEqual([true, null]);
  });

  it('play/pause ends at once when HA answers with another state (pause answered with idle)', () => {
    const { h, w, view, id } = setup(FIX.transport, { echo: false });
    w.playPause();
    expect(view().state).toBe('paused');
    h.set(id, 'idle');
    expect([view().state, w.pending.state]).toEqual(['idle', null]);
  });

  it('a pause during a seek hold freezes the held position; the pause echo does not end the hold; play moves it on', async () => {
    const { w, view } = setup(FIX.transport, { drop: ['media_seek'] });
    w.seekPreview(200);
    w.seekCommit();
    await tick(100);
    expect(view().position!.seconds).toBeCloseTo(200.1, 5);
    w.playPause();
    expect(view().position!.seconds).toBeCloseTo(200.1, 5);
    await tick(300); // pause echo at 350, HA's position about 83.4
    expect(w.pending.state).toBeNull();
    expect(view()).toMatchObject({ state: 'paused', position: { held: true } });
    expect(view().position!.seconds).toBeCloseTo(200.1, 5);
    w.playPause();
    await tick(100);
    expect(view().position!.seconds).toBeCloseTo(200.2, 5);
    await tick(10_000); // write_hold from the seek
    expect(w.pending.position).toBeNull();
  });

  it('a failed pause during a seek hold moves the held position on again', async () => {
    const { h, w, view } = setup(FIX.transport, { drop: ['media_seek'] });
    w.seekPreview(200);
    w.seekCommit();
    await tick(100);
    h.failNext();
    w.playPause();
    await tick(500); // fails at 350
    expect(view().state).toBe('playing');
    expect(view().position!.seconds).toBeCloseTo(200.35, 5);
  });

  it('every new error shows its full 6 s, discrete or from the volume queue', async () => {
    const a = setup(FIX.volume_mid);
    a.h.failNext();
    a.w.mute();
    await tick(4250); // failed at 250
    a.h.failNext();
    a.w.selectSoundMode('Movie');
    await tick(2000); // failed at 4500; the first error's 6 s are over at 6250
    expect(a.w.error).toBe('fake failure');
    await tick(4000);
    expect(a.w.error).not.toBeNull();
    await tick(600);
    expect(a.w.error).toBeNull();

    const b = setup(FIX.muted);
    b.h.failNext(2);
    b.w.setVolume(80); // the core send fails at 250
    await tick(4000);
    b.w.mute(); // fails at 4250
    await tick(2500); // past the core's own 6 s
    expect(b.w.error).toBe('fake failure');
    await tick(4000);
    expect(b.w.error).toBeNull();
  });

  it('next ends on a media_content_id change alone and on an entity_picture change alone', () => {
    for (const attr of [{ media_content_id: 'track-9' }, { entity_picture: '/api/media_player_proxy/x?cache=new' }]) {
      const { h, w, view, id } = setup(FIX.transport, { echo: false });
      w.next();
      h.set(id, null, { sound_mode: 'Movie' });
      expect(view().state).toBe('buffering');
      h.set(id, null, attr);
      expect([view().state, w.pending.trackChange]).toEqual(['playing', false]);
    }
  });

  it('next tapped while paused: Buffering until the track changes or the state changes', () => {
    const a = setup(FIX.paused, { echo: false });
    a.w.next();
    expect(a.view().state).toBe('buffering');
    a.h.set(a.id, null, { sound_mode: 'Movie' }); // still paused, same track
    expect(a.view().state).toBe('buffering');
    a.h.set(a.id, null, { media_title: 'Another' });
    expect(a.view().state).toBe('paused');

    const b = setup(FIX.paused, { echo: false });
    b.w.next();
    b.h.set(b.id, 'idle');
    expect([b.view().state, b.w.pending.trackChange]).toEqual(['idle', false]);
  });
});

describe('RH1 round 2', () => {
  const iso = () => new Date(Date.now()).toISOString();

  it('a seek echo that arrives with a change to paused ends the hold', async () => {
    const { h, w, view, id } = setup(FIX.transport, { drop: ['media_seek'] });
    w.seekPreview(200);
    w.seekCommit();
    await tick(4000);
    h.set(id, 'paused', { media_position: 204, media_position_updated_at: iso() });
    expect(w.pending.position).toBeNull();
    expect(view().position).toMatchObject({ seconds: 204, held: false });
  });

  it('previous that restarts the same track ends Buffering at the fresh position; a normal track change still ends it', async () => {
    const { h, w, view, id } = setup(FIX.transport, { echo: false });
    w.previous();
    await tick(100);
    h.set(id, null, { sound_mode: 'Movie' }); // same stamp
    h.set(id, null, { media_position: 50, media_position_updated_at: iso() }); // fresh, but not near 0
    expect(view().state).toBe('buffering');
    await tick(100);
    h.set(id, null, { media_position: 0.4, media_position_updated_at: iso() }); // same title, content id and picture
    expect([view().state, w.pending.trackChange]).toEqual(['playing', false]);
    expect(view().position!.seconds).toBeCloseTo(0.4, 5);

    const n = setup(FIX.transport);
    n.w.next();
    await tick(100);
    expect(n.view().state).toBe('buffering');
    await tick(200);
    expect(n.view()).toMatchObject({ state: 'playing', now: { title: 'Track 2' }, pending: { trackChange: false } });
  });

  it('repeat cycles through all three values with taps in flight and a failing middle tap', async () => {
    const { h, w, view, id } = setup(FIX.shuffle_repeat);
    const seen: string[] = [];
    w.cycleRepeat();
    seen.push(view().repeat);
    await tick(50);
    h.failNext();
    w.cycleRepeat();
    seen.push(view().repeat);
    await tick(50);
    w.cycleRepeat();
    seen.push(view().repeat);
    await tick(160); // echo of all at 250
    expect(h.hass.states[id].attributes.repeat).toBe('all');
    seen.push(view().repeat);
    await tick(50); // the middle tap fails at 300
    seen.push(view().repeat);
    await tick(50); // echo of off at 350
    seen.push(view().repeat);
    expect(seen).toEqual(['all', 'one', 'off', 'off', 'off', 'off']);
    expect(h.calls.map((c) => c.data.repeat)).toEqual(['all', 'one', 'off']);
    expect(w.pending.repeat).toBeNull();
  });

  it('shuffle and source double taps keep the second tap through an unrelated report and the first echo', async () => {
    const sh = setup(FIX.shuffle_repeat);
    const s1: boolean[] = [];
    sh.w.toggleShuffle();
    s1.push(sh.view().shuffle);
    await tick(50);
    sh.w.toggleShuffle();
    s1.push(sh.view().shuffle);
    sh.h.set(sh.id, null, { sound_mode: 'Movie' });
    s1.push(sh.view().shuffle);
    await tick(210); // echo of false
    s1.push(sh.view().shuffle);
    await tick(50); // echo of true
    s1.push(sh.view().shuffle);
    expect(s1).toEqual([false, true, true, true, true]);
    expect(sh.h.calls.map((c) => c.data.shuffle)).toEqual([false, true]);
    expect(sh.w.pending.shuffle).toBeNull();

    const so = setup(FIX.tv_sources);
    const s2: (string | null)[] = [];
    so.w.selectSource('HDMI 2');
    await tick(50);
    so.w.selectSource('HDMI 1');
    s2.push(so.view().source);
    so.h.set(so.id, null, { volume_level: 0.5 });
    s2.push(so.view().source);
    await tick(210); // echo of HDMI 2
    expect(so.h.hass.states[so.id].attributes.source).toBe('HDMI 2');
    s2.push(so.view().source);
    await tick(50); // echo of HDMI 1
    s2.push(so.view().source);
    expect(s2).toEqual(['HDMI 1', 'HDMI 1', 'HDMI 1', 'HDMI 1']);
    expect(so.h.calls.map((c) => c.data.source)).toEqual(['HDMI 2', 'HDMI 1']);
    expect(so.w.pending.source).toBeNull();
  });
});

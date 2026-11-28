/**
 * A faithful port of the gate 2 prototype's write logic (lh04-proto/index.html: `Ent`, the fake `HA`,
 * `throttleWriter`, `Ctl`, and the Card's shuffle and repeat handlers), for the replay tests. Left out: DOM, logs,
 * gesture counters, the debounce strategy B (not chosen at GD1) and the section 3 restriction of `failNext`.
 * Recommended settings (GD1, GD2): throttle 300 ms, hold on, tile `set` (or `step` for the step-only comparison).
 */

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export interface ProtoCall {
  svc: string;
  data: Record<string, unknown>;
  at: number;
}

interface Track {
  title: string;
  dur: number;
}
const TRACKS: Track[] = [
  { title: 'I Wanna Be A Hippy (Flamman & Abraxas Radio Mix)', dur: 245 },
  { title: 'Paper Lanterns', dur: 213 },
  { title: 'Static Bloom', dur: 187 },
];

type Cause = { seq?: number; svc?: string };

export class Ent {
  subs = new Set<(c: Cause) => void>();
  state = 'playing';
  vol = 35;
  muted = false;
  pos = 83;
  posAt = Date.now();
  tracks = TRACKS;
  track = 0;
  source = '';
  sound = 'Music';
  shuffle = false;
  repeat = 'off';
  title = TRACKS[0].title;
  dur = 245;
  constructor(o: Partial<Ent> = {}) {
    Object.assign(this, o);
  }
  position(t = Date.now()) {
    return clamp(this.state === 'playing' ? this.pos + (t - this.posAt) / 1000 : this.pos, 0, this.dur);
  }
  patch(p: Partial<Ent>, cause: Cause = {}) {
    Object.assign(this, p);
    for (const f of Array.from(this.subs)) f(cause);
  }
  loadTrack(i: number, cause: Cause) {
    const n = this.tracks.length;
    this.track = ((i % n) + n) % n;
    const t = this.tracks[this.track];
    this.patch({ title: t.title, dur: t.dur, pos: 0, posAt: Date.now(), state: 'playing' }, cause);
  }
}

export class ProtoHA {
  seq = 0;
  failNext = false;
  calls: ProtoCall[] = [];
  constructor(readonly latency: number) {}
  call(ent: Ent, svc: string, data: Record<string, unknown>, o: { failable?: boolean } = {}) {
    const seq = ++this.seq;
    this.calls.push({ svc, data, at: Date.now() });
    const lat = this.latency;
    const promise = new Promise<void>((res, rej) =>
      setTimeout(() => {
        if (o.failable && this.failNext) {
          this.failNext = false;
          rej(new Error('fake failure'));
          return;
        }
        this.apply(ent, svc, data, lat, { seq, svc });
        res();
      }, lat),
    );
    promise.catch(() => undefined);
    return { seq, promise };
  }
  apply(ent: Ent, svc: string, d: Record<string, unknown>, lat: number, cause: Cause) {
    const now = Date.now();
    switch (svc) {
      case 'volume_set': ent.patch({ vol: Math.round((d.volume_level as number) * 100) }, cause); break;
      case 'volume_up': ent.patch({ vol: clamp(ent.vol + 10, 0, 100) }, cause); break;
      case 'volume_down': ent.patch({ vol: clamp(ent.vol - 10, 0, 100) }, cause); break;
      case 'volume_mute': ent.patch({ muted: !!d.is_volume_muted }, cause); break;
      case 'media_play': ent.patch({ state: 'playing', pos: ent.position(now), posAt: now }, cause); break;
      case 'media_pause': ent.patch({ state: 'paused', pos: ent.position(now), posAt: now }, cause); break;
      case 'media_seek': ent.patch({ pos: clamp((d.seek_position as number) + (ent.state === 'playing' ? lat / 2000 : 0), 0, ent.dur), posAt: now }, cause); break;
      case 'media_next_track': ent.loadTrack(ent.track + 1, cause); break;
      case 'media_previous_track': ent.loadTrack(ent.track - 1, cause); break;
      case 'select_sound_mode': ent.patch({ sound: d.sound_mode as string }, cause); break;
      case 'shuffle_set': ent.patch({ shuffle: !!d.shuffle }, cause); break;
      case 'repeat_set': ent.patch({ repeat: d.repeat as string }, cause); break;
      case 'turn_off': ent.patch({ state: 'off', pos: ent.position(now), posAt: now }, cause); break;
      case 'turn_on': ent.patch({ state: 'playing', posAt: now }, cause); break;
    }
  }
}

export function throttleWriter(send: (v: number) => void, ms: number) {
  let pending: number | undefined;
  let sent: number | undefined;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const fire = () => {
    if (pending === undefined || pending === sent) return false;
    sent = pending;
    send(sent);
    return true;
  };
  return {
    preview(v: number) {
      pending = v;
      if (timer == null) {
        fire();
        timer = setTimeout(function tick() {
          timer = null;
          if (fire()) timer = setTimeout(tick, ms);
        }, ms);
      }
    },
    end(v: number | null) {
      if (timer) clearTimeout(timer);
      timer = null;
      if (v != null) pending = v;
      fire();
    },
  };
}

type Pend = { state: string; pos: number; at: number };

export class Ctl {
  pend: Pend | null = null;
  pendN = 0;
  pendMute: boolean | null = null;
  vHold: { v: number; timer: ReturnType<typeof setTimeout> } | null = null;
  sHold: { pos: number; at: number; seq: number } | null = null;
  cHold: Record<string, string> = {};
  pv: { vol: number | null } = { vol: null };
  writer: ReturnType<typeof throttleWriter> | null = null;
  stepW: ReturnType<typeof throttleWriter> | null = null;
  stepEnd?: ReturnType<typeof setTimeout>;

  constructor(readonly ent: Ent, readonly ha: ProtoHA, readonly tile: 'set' | 'step' = 'set') {
    ent.subs.add((c) => this.echo(c));
  }
  call(svc: string, data: Record<string, unknown>, o?: { failable?: boolean }) {
    return this.ha.call(this.ent, svc, data, o);
  }
  state() { return this.pend ? this.pend.state : this.ent.state; }
  muted() { return this.pendMute != null ? this.pendMute : this.ent.muted; }
  vol() { return this.pv.vol != null ? this.pv.vol : this.vHold ? this.vHold.v : this.ent.vol; }
  pos(now = Date.now()) {
    const e = this.ent;
    let p: number;
    if (this.pend) p = this.pend.pos + (this.pend.state === 'playing' ? (now - this.pend.at) / 1000 : 0);
    else if (this.sHold) p = this.sHold.pos + (e.state === 'playing' ? (now - this.sHold.at) / 1000 : 0);
    else p = e.position(now);
    return clamp(p, 0, e.dur);
  }
  echo(cause: Cause) {
    if (this.vHold && this.ent.vol === this.vHold.v) this.clearVHold();
    if (this.sHold && cause.svc === 'media_seek' && (cause.seq ?? 0) >= this.sHold.seq) this.sHold = null;
    if (this.cHold.sound != null && this.ent.sound === this.cHold.sound) delete this.cHold.sound;
  }
  clearVHold() {
    if (this.vHold) {
      clearTimeout(this.vHold.timer);
      this.vHold = null;
    }
  }
  setVHold(v: number) {
    this.clearVHold();
    if (v === this.ent.vol) return;
    this.vHold = { v, timer: setTimeout(() => (this.vHold = null), 5000) };
  }
  sendVol(v: number) {
    const r = this.call('volume_set', { volume_level: +(v / 100).toFixed(2) });
    r.promise.catch(() => {
      if (this.vHold && this.vHold.v === v) this.clearVHold();
    });
  }
  volStart() { this.writer = throttleWriter((v) => this.sendVol(v), 300); }
  volPreview(v: number) {
    this.pv.vol = v;
    this.writer?.preview(v);
  }
  volEnd(final: number | null) {
    const w = this.writer;
    this.writer = null;
    this.pv.vol = null;
    w?.end(final);
    if (final != null) this.setVHold(final);
  }
  stepVolume(dir: 1 | -1) {
    if (this.tile === 'set') {
      const base = this.vHold ? this.vHold.v : this.ent.vol;
      const n = clamp(base + 5 * dir, 0, 100);
      if (n === base) return;
      if (!this.stepW)
        this.stepW = throttleWriter((v) => {
          this.sendVol(v);
          clearTimeout(this.stepEnd);
          this.stepEnd = setTimeout(() => (this.stepW = null), 400);
        }, 300);
      this.stepW.preview(n);
      this.setVHold(n);
    } else {
      this.call(dir > 0 ? 'volume_up' : 'volume_down', {});
    }
  }
  togglePlay() {
    const nxt = this.state() === 'playing' ? 'paused' : 'playing';
    this.pend = { state: nxt, pos: this.pos(), at: Date.now() };
    const r = this.call(nxt === 'playing' ? 'media_play' : 'media_pause', {}, { failable: true });
    r.promise.then(() => undefined, () => undefined).then(() => (this.pend = null));
  }
  skip(dir: 1 | -1) {
    this.pend = { state: 'buffering', pos: this.pos(), at: Date.now() };
    this.pendN++;
    const r = this.call(dir > 0 ? 'media_next_track' : 'media_previous_track', {}, { failable: true });
    r.promise.then(() => undefined, () => undefined).then(() => {
      if (--this.pendN <= 0) {
        this.pend = null;
        this.pendN = 0;
      }
    });
  }
  toggleMute() {
    const nxt = !this.muted();
    this.pendMute = nxt;
    const r = this.call('volume_mute', { is_volume_muted: nxt }, { failable: true });
    r.promise.then(() => undefined, () => undefined).then(() => (this.pendMute = null));
  }
  power() { this.call(this.ent.state === 'off' ? 'turn_on' : 'turn_off', {}); }
  seekEnd(v: number) {
    const r = this.call('media_seek', { seek_position: Math.round(v) });
    this.sHold = { pos: v, at: Date.now(), seq: r.seq };
    r.promise.catch(() => {
      if (this.sHold && this.sHold.seq === r.seq) this.sHold = null;
    });
    setTimeout(() => {
      if (this.sHold && this.sHold.seq === r.seq) this.sHold = null;
    }, 6000);
  }
  setSound(val: string) {
    this.cHold.sound = val;
    const r = this.call('select_sound_mode', { sound_mode: val });
    r.promise.catch(() => delete this.cHold.sound);
  }
  /** Card.wire: the sheet's Shuffle and Repeat buttons. */
  shuffleTap() { this.call('shuffle_set', { shuffle: !this.ent.shuffle }); }
  repeatTap() { this.call('repeat_set', { repeat: ({ off: 'all', all: 'one', one: 'off' } as Record<string, string>)[this.ent.repeat] }); }
}

/** The prototype Slider's key arithmetic: each key moves from the last value (else the shown one), rounded, clamped. */
export function keyValues(shown: number, step: number, presses: number, max: number): number[] {
  const out: number[] = [];
  let cur = shown;
  for (let i = 0; i < presses; i++) {
    cur = clamp(Math.round(cur + step), 0, max);
    out.push(cur);
  }
  return out;
}

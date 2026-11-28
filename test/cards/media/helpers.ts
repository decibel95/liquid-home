import { WriterRegistry, type HassEntity, type HomeAssistant } from '@decibel95/liquid-core';
import type { MediaPending, MediaView, MediaViewOptions, MediaWriter } from '../../../src/media/types';
import { CARD_TYPES, TAGS } from '../../../src/const';
import { MEDIA_FIXTURES, type MediaFixtureName } from './fixtures';

/**
 * Test doubles for the media card (plan 2.5). The card builds against src/media/types.ts only; this branch has the H0
 * stub of src/media, so the tests replace two things through vi.mock (see render.test.ts):
 * - `mediaView`: the stub's view plus the parts of plan 2.4 the stub leaves out (now playing lines, position, artwork,
 *   volume of inactive states, steps), built from the types, so every layout state can be drawn;
 * - `mediaWriters`: a registry of fake writers whose every method is a recorded spy (`calls`), so a gesture's call list
 *   can be compared with the prototype's.
 */

const LIVE = ['playing', 'paused', 'buffering'];
const ACTIVE = ['on', 'idle', 'playing', 'paused', 'buffering'];
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

/** The stub's view completed with plan 2.4 (now playing, position, artwork, inactive volume, steps). */
export function completeView(base: MediaView, entity: HassEntity | undefined, options: MediaViewOptions = {}): MediaView {
  const a: Record<string, unknown> = entity?.attributes ?? {};
  const st = base.haState;
  const active = ACTIVE.includes(st);
  const pending = base.pending;
  const state = !base.available ? st : pending.trackChange ? 'buffering' : (pending.state ?? st);
  const empty = { title: null, secondary: null, episode: null, tertiary: null };
  const tertiary = str(a.app_name) ?? str(a.source);
  let now: MediaView['now'] = empty;
  if (st === 'idle' || st === 'standby') now = { ...empty, tertiary };
  else if (!['off', 'unavailable', 'unknown'].includes(st)) {
    const type = a.media_content_type;
    const tv = type === 'tvshow' && str(a.media_series_title);
    now = {
      title: str(a.media_title),
      secondary: type === 'music' ? str(a.media_artist) : type === 'tvshow' ? str(a.media_series_title) : null,
      episode: tv
        ? {
            series: tv,
            season: Number(a.media_season),
            episode: Number(a.media_episode),
          }
        : null,
      tertiary,
    };
  }
  const dur = a.media_duration;
  const pos = a.media_position;
  let position: MediaView['position'] = null;
  if (typeof dur === 'number' && dur > 0 && typeof pos === 'number') {
    const at = typeof a.media_position_updated_at === 'string' ? Date.parse(a.media_position_updated_at) : NaN;
    const t = options.now ?? Date.now();
    let s = pending.position ?? pos;
    if (pending.position == null && st === 'playing' && Number.isFinite(at)) s += (t - at) / 1000;
    position = {
      seconds: Math.min(dur, Math.max(0, s)),
      duration: dur,
      held: pending.position != null,
    };
  }
  const volume = active ? base.volume : null;
  const stepOn = active && (base.kind === 'step' || (base.kind === 'volume' && volume != null));
  return {
    ...base,
    state: state as MediaView['state'],
    active,
    volume,
    can: {
      ...base.can,
      stepDown: stepOn && (base.kind === 'step' || volume! > 0),
      stepUp: stepOn && (base.kind === 'step' || volume! < 100),
    },
    now,
    position,
    artwork: LIVE.includes(st) ? (str(a.entity_picture_local) ?? str(a.entity_picture)) : null,
  };
}

/** Every writer call, in order, as `method(args)`: the call list a gesture produces. */
export const calls: string[] = [];

const NONE: MediaPending = {
  volume: null,
  position: null,
  positionAt: null,
  state: null,
  trackChange: false,
  muted: null,
  source: null,
  soundMode: null,
  shuffle: null,
  repeat: null,
};

export type FakeWriter = MediaWriter & {
  pending: MediaPending;
  error: string | null;
};

/** A writer whose methods record their calls; `pending` and `error` are plain fields a test may set. */
export function fakeWriter(entityId: string): FakeWriter {
  const rec =
    (name: string, ret?: unknown) =>
    (...args: unknown[]) => {
      calls.push(`${name}(${args.map((x) => (typeof x === 'object' ? '' : String(x))).join(', ')})`);
      return ret;
    };
  return {
    entityId,
    hold: 10,
    hass: undefined,
    pending: { ...NONE },
    error: null,
    subscribe: () => () => undefined,
    holdFor: rec('holdFor'),
    endHoldFor: rec('endHoldFor'),
    sendPending: () => undefined,
    dispose: () => undefined,
    observe: () => undefined,
    setVolume: rec('setVolume'),
    step: rec('step', true) as MediaWriter['step'],
    seekPreview: rec('seekPreview'),
    seekCommit: rec('seekCommit'),
    seekCancel: rec('seekCancel'),
    playPause: rec('playPause'),
    next: rec('next'),
    previous: rec('previous'),
    mute: rec('mute'),
    power: rec('power'),
    selectSource: rec('selectSource'),
    selectSoundMode: rec('selectSoundMode'),
    toggleShuffle: rec('toggleShuffle'),
    cycleRepeat: rec('cycleRepeat'),
  };
}

export const fakeRegistry = () => new WriterRegistry<MediaWriter>(fakeWriter);

export type MediaCardEl = HTMLElement & {
  hass?: HomeAssistant;
  inSheet: boolean;
  setConfig(c: Record<string, unknown>): void;
  updateComplete: Promise<boolean>;
  requestUpdate(): void;
};

/** A fake hass over the media fixtures. */
export function fakeHass(opts: { glassDark?: boolean; language?: string; extra?: HassEntity[] } = {}) {
  const states: Record<string, HassEntity> = {};
  for (const make of Object.values(MEDIA_FIXTURES)) {
    const s = make();
    states[s.entity_id] = s;
  }
  for (const s of opts.extra ?? []) states[s.entity_id] = s;
  const language = opts.language ?? 'en';
  const hass = {
    states,
    entities: {},
    devices: {},
    areas: {},
    language,
    locale: { language },
    themes: { darkMode: opts.glassDark ?? true },
    callService: async () => undefined,
  } as unknown as HomeAssistant;
  return {
    hass,
    states,
    async mount(fixture: MediaFixtureName | string, config: Record<string, unknown> = {}) {
      const entity = fixture in MEDIA_FIXTURES ? MEDIA_FIXTURES[fixture as MediaFixtureName]().entity_id : fixture;
      const el = document.createElement(TAGS.media) as MediaCardEl;
      el.setConfig({ type: CARD_TYPES.media, entity, ...config });
      el.hass = hass;
      document.body.append(el);
      await el.updateComplete;
      return el;
    },
  };
}

export const $ = (el: HTMLElement, sel: string) => el.shadowRoot!.querySelector(sel) as HTMLElement | null;
export const $$ = (el: HTMLElement, sel: string) => [...el.shadowRoot!.querySelectorAll(sel)] as HTMLElement[];
export const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

export function keyOn(target: HTMLElement, type: 'keydown' | 'keyup', k: string) {
  target.dispatchEvent(
    new KeyboardEvent(type, {
      key: k,
      bubbles: true,
      cancelable: true,
      composed: true,
    }),
  );
}

export function pointerOn(target: HTMLElement, type: string, x: number, y: number, pointerId = 1) {
  target.dispatchEvent(
    new PointerEvent(type, {
      pointerId,
      clientX: x,
      clientY: y,
      button: 0,
      pointerType: 'touch',
      bubbles: true,
      cancelable: true,
    }),
  );
}

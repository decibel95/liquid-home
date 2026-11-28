import type { HassEntity, HomeAssistant } from '@decibel95/liquid-core';
import { mediaView, type MediaWriter } from '../../src/media';

export interface Call {
  domain: string;
  service: string;
  data: Record<string, unknown>;
  at: number;
}

export interface FakeHassOptions {
  /** Milliseconds until the call resolves and HA's state echoes (default 250). */
  latency?: number;
  /** False: the call resolves but HA never reports anything (write_hold tests). */
  echo?: boolean;
  /** Services whose calls resolve without an echo (an integration that never reports them). */
  drop?: string[];
}

const iso = (ms: number) => new Date(ms).toISOString();
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * A fake hass with HA's echo after `latency` ms (plan 2.4: 250 ms). A call records itself at once, then after the
 * latency either fails (`failNext`) or applies its effect to the state (a new object for that entity only, as HA's
 * websocket does), publishes a new hass to every attached writer (`observe`, as a card's shouldUpdate does) and
 * resolves. The media effects follow the prototype's fake HA: position rebased at play and pause, a seek echo stamped
 * at half the latency while playing, volume_up/down by the integration's 10 %, next and previous load another track.
 */
export function fakeHass(fixtures: HassEntity[], opts: FakeHassOptions = {}) {
  const latency = opts.latency ?? 250;
  const echo = opts.echo ?? true;
  const states: Record<string, HassEntity> = {};
  for (const s of fixtures) states[s.entity_id] = s;
  const calls: Call[] = [];
  const writers = new Set<MediaWriter>();
  let failNext = 0;
  let trackNo = 1;
  let hass!: HomeAssistant;

  const build = (): HomeAssistant => {
    hass = {
      states: { ...states },
      entities: {},
      devices: {},
      areas: {},
      language: 'en',
      locale: { language: 'en' },
      themes: { darkMode: true },
      config: { unit_system: { temperature: '°C' } },
      callService: (domain: string, service: string, data: Record<string, unknown> = {}) => {
        calls.push({ domain, service, data, at: Date.now() });
        const fail = failNext > 0;
        if (fail) failNext--;
        return new Promise<void>((resolve, reject) => {
          setTimeout(() => {
            if (fail) return reject(new Error('fake failure'));
            if (echo && !opts.drop?.includes(service)) api.apply(service, data);
            resolve();
          }, latency);
        });
      },
    } as unknown as HomeAssistant;
    return hass;
  };

  const api = {
    states,
    calls,
    latency,
    get hass() {
      return hass;
    },
    /** The next `n` calls reject after the latency, with no echo. */
    failNext(n = 1) {
      failNext = n;
    },
    attach(w: MediaWriter) {
      writers.add(w);
      w.hass = hass;
      w.observe(hass);
    },
    publish() {
      build();
      for (const w of writers) w.observe(hass);
    },
    /** Replace the state of an entity (a report from HA) and publish. */
    set(id: string, state: string | null, attributes: Record<string, unknown> = {}) {
      const s = states[id];
      states[id] = { ...s, state: state ?? s.state, attributes: { ...s.attributes, ...attributes }, last_updated: iso(Date.now()) };
      api.publish();
    },
    /** Service and data only, entity_id included. */
    list: () => calls.map((c) => [c.service, c.data] as const),
    apply(service: string, data: Record<string, unknown>) {
      const id = data.entity_id as string;
      const s = states[id];
      if (!s) return;
      const now = Date.now();
      const a: Record<string, unknown> = { ...s.attributes };
      let state = s.state;
      const rebase = () => {
        const p = mediaView(s, { now }).position;
        if (p) {
          a.media_position = p.seconds;
          a.media_position_updated_at = iso(now);
        }
      };
      switch (service) {
        case 'volume_set':
          a.volume_level = data.volume_level;
          break;
        case 'volume_up':
          a.volume_level = round2(Math.min(1, Number(a.volume_level ?? 0) + 0.1));
          break;
        case 'volume_down':
          a.volume_level = round2(Math.max(0, Number(a.volume_level ?? 0) - 0.1));
          break;
        case 'volume_mute':
          a.is_volume_muted = data.is_volume_muted;
          break;
        case 'media_play':
          rebase();
          state = 'playing';
          break;
        case 'media_pause':
          rebase();
          state = 'paused';
          break;
        case 'media_seek':
          a.media_position = Number(data.seek_position) + (state === 'playing' ? latency / 2000 : 0);
          a.media_position_updated_at = iso(now);
          break;
        case 'media_next_track':
        case 'media_previous_track':
          trackNo += service === 'media_next_track' ? 1 : -1;
          Object.assign(a, { media_title: `Track ${trackNo}`, media_content_id: `track-${trackNo}`, media_position: 0, media_position_updated_at: iso(now) });
          if (typeof a.entity_picture === 'string') a.entity_picture = a.entity_picture.replace(/cache=.*$/, `cache=t${trackNo}`);
          state = 'playing';
          break;
        case 'select_source':
          a.source = data.source;
          break;
        case 'select_sound_mode':
          a.sound_mode = data.sound_mode;
          break;
        case 'shuffle_set':
          a.shuffle = data.shuffle;
          break;
        case 'repeat_set':
          a.repeat = data.repeat;
          break;
        case 'turn_on':
          state = 'playing';
          break;
        case 'turn_off':
          state = 'off';
          break;
      }
      states[id] = { ...s, state, attributes: a, last_updated: iso(now) };
      api.publish();
    },
  };
  build();
  return api;
}

export type FakeHass = ReturnType<typeof fakeHass>;

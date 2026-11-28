import type { HassEntity, HomeAssistant } from '@decibel95/liquid-core';
import { applyMediaCall, MEDIA_FIXTURES, entity } from '../media/fixtures';
import type { Call } from './helpers';

/**
 * Derived media states the media card fixtures lack, for the tile icon matrix (plan 2.6, P3-CHO-14), labelled as the
 * fixture files label theirs: a player with volume but neither transport nor TURN bits (the icon stays a disabled
 * button), and a player with only PAUSE (Play disabled while paused).
 */
export const MEDIA_EXTRA = {
  /** VOLUME_SET only (4), playing: no PLAY, PAUSE, TURN_ON or TURN_OFF, the icon is disabled. */
  noAction: () => entity('media_player.lh_derived_no_action', 'playing', { friendly_name: 'Bare', supported_features: 4, volume_level: 0.5 }),
  /** PAUSE and VOLUME_SET (5), paused: Play needs PLAY, so the icon is disabled at 0.3. */
  pauseOnly: () => entity('media_player.lh_derived_pause_only', 'paused', { friendly_name: 'Pause Only', supported_features: 5, volume_level: 0.5 }),
  /** VOLUME_SET, playing, no volume_level: nothing to step from, so the steps are hidden (no "--"). */
  noLevel: () => entity('media_player.lh_derived_no_level', 'playing', { friendly_name: 'No Level', supported_features: 16389 }),
  /** A long name, title and artist for the ellipsis check. */
  longName: () =>
    entity('media_player.lh_derived_long_name', 'playing', {
      friendly_name: 'Upstairs Guest Bathroom Ceiling Speaker Over The Bathtub Left Side Near The Window',
      supported_features: 30141,
      volume_level: 0.35,
      media_title: 'A very long track title that runs well past the tile',
      media_artist: 'An equally long artist name',
      media_content_type: 'music',
    }),
};

export interface MediaHass {
  readonly hass: HomeAssistant;
  states: Record<string, HassEntity>;
  calls: Call[];
  /** Called with every new hass (an echo). */
  onHass(l: (h: HomeAssistant) => void): void;
}

/**
 * A fake hass over the media card fixtures plus MEDIA_EXTRA. Calls are recorded at once; with `echoMs` HA applies them
 * as a fake player after that delay (test/cards/media/fixtures.ts applyMediaCall) and publishes a new hass.
 */
export function mediaHass(opts: { darkMode?: boolean; echoMs?: number | null } = {}): MediaHass {
  const states: Record<string, HassEntity> = {};
  for (const make of [...Object.values(MEDIA_FIXTURES), ...Object.values(MEDIA_EXTRA)]) {
    const s = make();
    states[s.entity_id] = s;
  }
  const calls: Call[] = [];
  const listeners: ((h: HomeAssistant) => void)[] = [];
  let hass!: HomeAssistant;
  const build = () => {
    hass = {
      states: { ...states },
      entities: {},
      devices: {},
      areas: {},
      config: { unit_system: { temperature: '°C' } },
      language: 'en',
      locale: { language: 'en', number_format: 'language' },
      themes: { darkMode: opts.darkMode ?? true },
      callService: async (domain: string, service: string, data: Record<string, unknown> = {}) => {
        calls.push({ domain, service, data });
        const echo = opts.echoMs;
        if (echo == null) return;
        setTimeout(() => {
          const id = data.entity_id as string;
          if (states[id]) states[id] = applyMediaCall(states[id], service, data);
          build();
          for (const l of listeners) l(hass);
        }, echo);
      },
    } as unknown as HomeAssistant;
  };
  build();
  return {
    get hass() {
      return hass;
    },
    states,
    calls,
    onHass: (l) => listeners.push(l),
  };
}

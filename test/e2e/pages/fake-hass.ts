import type { HomeAssistant } from '@decibel95/liquid-core';
import { createHarness } from '../../../dev/harness';
import { MEDIA_FIXTURES } from '../../cards/media/fixtures';
import { LIGHT_FIXTURES, type LightFixtureName, type LightState } from '../../fixtures/lights';

/**
 * A fake hass for the e2e pages: the dev harness (derived light fixtures, service calls applied after a delay) plus
 * extra lights cloned from the fixtures and two Liquid Climate climate entities, with the `config` Liquid Climate
 * reads. Nothing talks to Home Assistant.
 */
export interface PageHass {
  /** The current hass, shared by every card on the page. */
  current(): HomeAssistant;
  subscribe(listener: (hass: HomeAssistant) => void): void;
  /** Fixture name to entity id. */
  ids: Record<LightFixtureName, string>;
  /** Ids of the extra lights (`light.e2e_light_1` ...), in order. */
  extraLights: string[];
  climateIds: string[];
  /** A cover (position, `cover.e2e_window`) and a fan (3 speeds, `fan.e2e_fan`) for the two-bundle page. */
  coverId: string;
  fanId: string;
  /** A media player (`media_player.e2e_player`, playing, volume and seek) for the two-bundle page. */
  mediaId: string;
  /** Ids of the extra media players (`media_player.e2e_media_1` ...), in order (opts.extraMedia). */
  extraMedia: string[];
  /** Ids of the extra climate entities (`climate.e2e_lc_1` ...), in order. */
  extraClimates: string[];
  calls: { domain: string; service: string; data: Record<string, unknown> }[];
}

const CLIMATE_ATTRS = {
  hvac_modes: ['off', 'heat', 'cool', 'heat_cool'],
  min_temp: 10,
  max_temp: 30,
  target_temp_step: 0.5,
  temperature_unit: '°C',
  current_humidity: 48,
  fan_modes: ['auto', 'low', 'medium', 'high'],
  fan_mode: 'auto',
  supported_features: 1 | 8,
};

export function createPageHass(opts: { extraMedia?: number; mediaArt?: boolean; extraLights?: number; language?: string; delay?: number; climateState?: string; extraClimates?: number } = {}): PageHass {
  const calls: PageHass['calls'] = [];
  const harness = createHarness({
    language: opts.language ?? 'en',
    delay: opts.delay,
    onCall: (domain, service, data) => calls.push({ domain, service, data }),
  });

  // Extra lights: clones of the fixtures that can be switched on, with their own entity ids.
  const donors = ['dimmed', 'colourTemp', 'colourHs', 'rgbw', 'brightnessOnly', 'rgbww', 'onOffOnly', 'off'] as LightFixtureName[];
  const extraLights: string[] = [];
  for (let i = 1; i <= (opts.extraLights ?? 0); i++) {
    const donor = LIGHT_FIXTURES[donors[(i - 1) % donors.length]!]() as LightState;
    const id = `light.e2e_light_${i}`;
    harness.states[id] = { ...donor, entity_id: id, attributes: { ...donor.attributes, friendly_name: `Light ${i}` } };
    extraLights.push(id);
  }

  const entity = (id: string, state: string, attributes: Record<string, unknown>) =>
    ({ entity_id: id, state, attributes, last_changed: '2026-11-18T12:00:00+00:00', last_updated: '2026-11-18T12:00:00+00:00', context: { id, parent_id: null, user_id: null } }) as unknown as LightState;
  const coverId = 'cover.e2e_window';
  const fanId = 'fan.e2e_fan';
  harness.states[coverId] = entity(coverId, 'open', { friendly_name: 'Hall Window', supported_features: 15, current_position: 60 });
  harness.states[fanId] = entity(fanId, 'on', { friendly_name: 'Living Room Fan', supported_features: 55, percentage: 66, percentage_step: 100 / 3, oscillating: false, direction: 'forward' });

  const mediaId = 'media_player.e2e_player';
  const player = MEDIA_FIXTURES.living_room();
  harness.states[mediaId] = { ...player, entity_id: mediaId, attributes: { ...player.attributes, friendly_name: 'Living Room Speaker' } } as unknown as LightState;
  // Extra players for the media performance page: playing with a seek line and volume, covers rotated over the six synthetic ones.
  const covers = ['dark', 'light', 'saturated', 'busy', 'r43', 'wide'] as const;
  const extraMedia: string[] = [];
  for (let i = 1; i <= (opts.extraMedia ?? 0); i++) {
    const id = `media_player.e2e_media_${i}`;
    const base = MEDIA_FIXTURES.living_room();
    harness.states[id] = {
      ...base,
      entity_id: id,
      attributes: { ...base.attributes, friendly_name: `Speaker ${i}`, entity_picture: opts.mediaArt === false ? undefined : `/dev/covers/cover-${covers[(i - 1) % covers.length] === 'r43' ? '43' : covers[(i - 1) % covers.length]}.png`, media_title: `Track ${i}`, volume_level: 0.2 + ((i * 7) % 60) / 100, media_position: 20 + ((i * 37) % 150), media_position_updated_at: new Date().toISOString() },
    } as unknown as LightState;
    extraMedia.push(id);
  }

  const climateIds = ['climate.e2e_living', 'climate.e2e_bedroom'];
  climateIds.forEach((id, i) => {
    harness.states[id] = {
      entity_id: id,
      state: opts.climateState ?? 'heat',
      attributes: { ...CLIMATE_ATTRS, friendly_name: i === 0 ? 'Living Room Climate' : 'Bedroom Climate', current_temperature: 19.6 + i, temperature: 21 },
      last_changed: '2026-11-18T12:00:00+00:00',
      last_updated: '2026-11-18T12:00:00+00:00',
      context: { id, parent_id: null, user_id: null },
    } as unknown as LightState;
  });
  const extraClimates: string[] = [];
  for (let i = 1; i <= (opts.extraClimates ?? 0); i++) {
    const id = `climate.e2e_lc_${i}`;
    harness.states[id] = {
      entity_id: id,
      state: opts.climateState ?? 'heat',
      attributes: { ...CLIMATE_ATTRS, friendly_name: `Climate ${i}`, current_temperature: 19 + (i % 5), temperature: 21, hvac_action: opts.climateState === 'heat' ? 'heating' : 'idle' },
      last_changed: '2026-11-18T12:00:00+00:00',
      last_updated: '2026-11-18T12:00:00+00:00',
      context: { id, parent_id: null, user_id: null },
    } as unknown as LightState;
    extraClimates.push(id);
  }
  harness.publish();

  // One decorated hass object per underlying publish, so card change detection sees a new object only on a change.
  let source: HomeAssistant | undefined;
  let decorated: HomeAssistant | undefined;
  const decorate = (h: HomeAssistant): HomeAssistant => {
    if (h !== source) {
      source = h;
      decorated = { ...h, config: { unit_system: { temperature: '°C' }, version: '2025.1.4' } } as unknown as HomeAssistant;
    }
    return decorated!;
  };

  return {
    current: () => decorate(harness.hass),
    subscribe: (listener) => harness.onHass((h) => listener(decorate(h))),
    ids: harness.ids,
    extraLights,
    climateIds,
    coverId,
    fanId,
    mediaId,
    extraMedia,
    extraClimates,
    calls,
  };
}

/** Loads a bundle as an ES module the way HA does for a dashboard resource. */
export async function loadBundle(name: 'liquid-home' | 'liquid-climate'): Promise<void> {
  await import(/* @vite-ignore */ `/__bundles/${name}.js`);
}

/** Dark page ground with soft colour blobs, so backdrop-filter has something to blur. */
export const PAGE_CSS = `
  body { margin: 0; background: #0b0e14; color: #f4f6fa; font-family: system-ui, sans-serif; }
  main { position: relative; padding: 24px; min-height: 100vh; box-sizing: border-box; }
  .blob { position: fixed; border-radius: 50%; filter: blur(90px); pointer-events: none; z-index: 0; }
  .b1 { width: 520px; height: 520px; left: -160px; top: 80px; background: #24324a; opacity: .8; }
  .b2 { width: 460px; height: 460px; right: -160px; bottom: 60px; background: #3a3320; opacity: .7; }
  .b3 { width: 380px; height: 380px; left: 40%; top: 30%; background: #2a3a30; opacity: .6; }
  main > * { position: relative; z-index: 1; }
`;

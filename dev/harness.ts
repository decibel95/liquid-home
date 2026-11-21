import type { HomeAssistant } from '@decibel95/liquid-core';
import { LIGHT_FIXTURES, type LightFixtureName, type LightState } from '../test/fixtures/lights';

export type Listener = (hass: HomeAssistant) => void;

export interface Harness {
  hass: HomeAssistant;
  states: Record<string, LightState>;
  ids: Record<LightFixtureName, string>;
  onHass(listener: Listener): void;
  publish(): void;
  setLanguage(lang: string): void;
}

/**
 * A fake hass built from the derived fixtures (test/fixtures/lights.ts). Service calls are reported to `onCall`
 * and the light.turn_on / turn_off / toggle effects are applied to the fake states after `delay` ms, like a device
 * that answers late. Nothing talks to Home Assistant.
 */
export function createHarness(opts: { language?: string; delay?: number; onCall?: (domain: string, service: string, data: Record<string, unknown>) => void } = {}): Harness {
  const delay = opts.delay ?? 800;
  const states: Record<string, LightState> = {};
  const ids = {} as Record<LightFixtureName, string>;
  for (const [name, make] of Object.entries(LIGHT_FIXTURES) as [LightFixtureName, () => LightState][]) {
    const s = make();
    states[s.entity_id] = s;
    ids[name] = s.entity_id;
  }
  const listeners: Listener[] = [];
  let language = opts.language ?? 'en';

  const build = (): HomeAssistant =>
    ({
      states: { ...states },
      entities: {},
      devices: {},
      areas: {},
      language,
      locale: { language, number_format: 'language', time_format: 'language' },
      themes: { darkMode: false },
      callService: async (domain: string, service: string, data: Record<string, unknown> = {}) => {
        opts.onCall?.(domain, service, data);
        setTimeout(() => apply(domain, service, data), delay);
      },
    }) as unknown as HomeAssistant;

  let hass = build();
  const api: Harness = {
    get hass() {
      return hass;
    },
    states,
    ids,
    onHass: (l) => listeners.push(l),
    publish() {
      hass = build();
      for (const l of listeners) l(hass);
    },
    setLanguage(lang) {
      language = lang;
      api.publish();
    },
  };

  function apply(domain: string, service: string, data: Record<string, unknown>) {
    if (domain !== 'light') return;
    const raw = data.entity_id;
    const targets = Array.isArray(raw) ? (raw as string[]) : typeof raw === 'string' ? [raw] : [];
    for (const id of targets) {
      const s = states[id];
      if (!s || s.state === 'unavailable') continue;
      const on = service === 'turn_on' || (service === 'toggle' && s.state === 'off');
      const attributes = { ...s.attributes };
      if (on) {
        if (typeof data.brightness === 'number') attributes.brightness = data.brightness;
        if (typeof data.brightness_pct === 'number') attributes.brightness = Math.round((data.brightness_pct / 100) * 255);
      }
      states[id] = { ...s, state: on ? 'on' : 'off', attributes };
    }
    api.publish();
  }

  return api;
}

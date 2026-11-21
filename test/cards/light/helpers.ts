import type { HomeAssistant } from '@decibel95/liquid-core';
import { LIGHT_FIXTURES, type LightFixtureName, type LightState } from '../../fixtures/lights';
import { CARD_TYPES, TAGS } from '../../../src/const';
import '../../../src/cards/light';
import type { LiquidHomeLightCard } from '../../../src/cards/light/card';

export interface Call {
  domain: string;
  service: string;
  data: Record<string, unknown>;
}

/**
 * A fake hass over the derived fixtures. Every call is recorded; with `echoMs` set, the light services are applied to
 * the states after that delay (as HA reports them back) and a new hass object is published to the mounted cards.
 */
export function fakeHass(opts: { echoMs?: number | null; glassDark?: boolean } = {}) {
  const states: Record<string, LightState> = {};
  for (const make of Object.values(LIGHT_FIXTURES)) {
    const s = make();
    states[s.entity_id] = s;
  }
  const calls: Call[] = [];
  const cards = new Set<LiquidHomeLightCard>();
  let hass: HomeAssistant;
  const build = () => {
    hass = {
      states: { ...states },
      entities: {},
      devices: {},
      areas: {},
      language: 'en',
      locale: { language: 'en' },
      themes: { darkMode: opts.glassDark ?? true },
      config: { unit_system: { temperature: '°C' } },
      callService: async (domain: string, service: string, data: Record<string, unknown> = {}) => {
        calls.push({ domain, service, data });
        if (opts.echoMs != null) setTimeout(() => api.apply(domain, service, data), opts.echoMs);
      },
    } as unknown as HomeAssistant;
    return hass;
  };
  build();
  const api = {
    states,
    calls,
    get hass() {
      return hass;
    },
    /** Replace a state (or patch its attributes) and publish. */
    set(id: string, state: string, attributes: Record<string, unknown> = {}) {
      states[id] = { ...states[id], state, attributes: { ...states[id].attributes, ...attributes } };
      api.publish();
    },
    publish() {
      build();
      for (const c of cards) c.hass = hass;
    },
    /** What HA does with a light call: brightness_pct to brightness, colour modes, effect. */
    apply(domain: string, service: string, data: Record<string, unknown>) {
      if (domain !== 'light') return;
      const id = data.entity_id as string;
      const s = states[id];
      if (!s) return;
      if (service === 'turn_off') {
        states[id] = { ...s, state: 'off', attributes: { ...s.attributes, brightness: null } };
      } else {
        const a: Record<string, unknown> = { ...s.attributes };
        if (typeof data.brightness_pct === 'number') a.brightness = Math.round((data.brightness_pct / 100) * 255);
        else if (s.state !== 'on' && a.brightness == null) a.brightness = 255;
        if (typeof data.color_temp_kelvin === 'number') {
          // HA stores mireds: report the kelvin it converts back to.
          a.color_temp_kelvin = Math.round(1e6 / Math.round(1e6 / data.color_temp_kelvin));
          a.color_mode = 'color_temp';
        }
        if (Array.isArray(data.hs_color)) {
          a.hs_color = [Number(data.hs_color[0]) + 0.001, Number(data.hs_color[1])];
          a.color_mode = 'hs';
          a.color_temp_kelvin = null;
        }
        if (typeof data.effect === 'string') a.effect = data.effect;
        states[id] = { ...s, state: 'on', attributes: a };
      }
      api.publish();
    },
    async mount(entity: string, config: Record<string, unknown> = {}) {
      const el = document.createElement(TAGS.light) as LiquidHomeLightCard;
      el.setConfig({ type: CARD_TYPES.light, entity, ...config });
      el.hass = hass;
      cards.add(el);
      document.body.append(el);
      await el.updateComplete;
      return el;
    },
  };
  return api;
}

export const ids = Object.fromEntries(Object.entries(LIGHT_FIXTURES).map(([n, make]) => [n, make().entity_id])) as Record<LightFixtureName, string>;

export const $ = (el: HTMLElement, sel: string) => el.shadowRoot!.querySelector(sel) as HTMLElement | null;
export const $$ = (el: HTMLElement, sel: string) => [...el.shadowRoot!.querySelectorAll(sel)] as HTMLElement[];
export const pill = (el: HTMLElement) => $(el, '.lc-slider')!;
export const text = (el: HTMLElement | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

export function pointer(el: HTMLElement, type: string, clientY: number, pointerId = 1) {
  pill(el).dispatchEvent(new PointerEvent(type, { pointerId, clientY, button: 0, pointerType: 'touch', bubbles: true, cancelable: true }));
}

export function key(el: HTMLElement, type: 'keydown' | 'keyup', k: string, repeat = false) {
  pill(el).dispatchEvent(new KeyboardEvent(type, { key: k, repeat, bubbles: true, cancelable: true }));
}

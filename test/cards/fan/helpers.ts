import type { HomeAssistant } from '@decibel95/liquid-core';
import { applyFanCall, FAN_FIXTURES, type FanState } from '../../fans/fixtures';
import { CARD_TYPES, TAGS } from '../../../src/const';
import '../../../src/cards/fan';
import type { LiquidHomeFanCard } from '../../../src/cards/fan/card';

export interface Call {
  domain: string;
  service: string;
  data: Record<string, unknown>;
}

/**
 * A fake hass over the fan fixtures. Every call is recorded; with `echoMs` set, the fan services are applied as HA's
 * demo fan does (fixtures.ts applyFanCall) after that delay and a new hass object is published to the mounted cards.
 */
export function fakeHass(opts: { echoMs?: number | null; glassDark?: boolean; language?: string; formatEntityAttributeValue?: (s: unknown, a: string, v: string) => string } = {}) {
  const states: Record<string, FanState> = {};
  for (const make of Object.values(FAN_FIXTURES)) {
    const s = make();
    states[s.entity_id] = s;
  }
  const calls: Call[] = [];
  const cards = new Set<LiquidHomeFanCard>();
  const language = opts.language ?? 'en';
  let hass: HomeAssistant;
  const build = () => {
    hass = {
      states: { ...states },
      entities: {},
      devices: {},
      areas: {},
      language,
      locale: { language },
      themes: { darkMode: opts.glassDark ?? true },
      config: { unit_system: { temperature: '°C' } },
      ...(opts.formatEntityAttributeValue ? { formatEntityAttributeValue: opts.formatEntityAttributeValue } : {}),
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
    cards,
    get hass() {
      return hass;
    },
    set(id: string, state: string, attributes: Record<string, unknown> = {}) {
      states[id] = { ...states[id], state, attributes: { ...states[id].attributes, ...attributes } };
      api.publish();
    },
    publish() {
      build();
      for (const c of cards) c.hass = hass;
    },
    apply(domain: string, service: string, data: Record<string, unknown>) {
      if (domain !== 'fan') return;
      const id = data.entity_id as string;
      if (!states[id]) return;
      states[id] = applyFanCall(states[id], service, data);
      api.publish();
    },
    async mount(entity: string, config: Record<string, unknown> = {}) {
      const el = document.createElement(TAGS.fan) as LiquidHomeFanCard;
      el.setConfig({ type: CARD_TYPES.fan, entity, ...config });
      el.hass = hass;
      cards.add(el);
      document.body.append(el);
      await el.updateComplete;
      return el;
    },
  };
  return api;
}

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

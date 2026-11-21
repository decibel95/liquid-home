import type { vi } from 'vitest';
import type { HomeAssistant } from '@decibel95/liquid-core';
import { LIGHT_FIXTURES, type LightFixtureName, type LightState } from '../../fixtures/lights';

export interface Call {
  domain: string;
  service: string;
  data: Record<string, unknown>;
}

export interface FakeHass {
  hass: HomeAssistant;
  ids: Record<LightFixtureName, string>;
  states: Record<string, LightState>;
  calls: Call[];
  /** A new hass object with `patch` applied to one state, as HA pushes it. */
  update(id: string, patch: Partial<LightState>): HomeAssistant;
}

/** A fake hass over the derived light fixtures. Service calls are recorded and resolve at once; nothing changes state by itself. */
export function fakeHass(opts: { darkMode?: boolean; language?: string } = {}): FakeHass {
  const states: Record<string, LightState> = {};
  const ids = {} as Record<LightFixtureName, string>;
  for (const [name, make] of Object.entries(LIGHT_FIXTURES) as [LightFixtureName, () => LightState][]) {
    const s = make();
    states[s.entity_id] = s;
    ids[name] = s.entity_id;
  }
  const calls: Call[] = [];
  const build = (): HomeAssistant =>
    ({
      states: { ...states },
      entities: {},
      devices: {},
      areas: {},
      config: { unit_system: { temperature: '°C' } },
      language: opts.language ?? 'en',
      locale: { language: opts.language ?? 'en', number_format: 'language' },
      themes: { darkMode: opts.darkMode ?? true },
      callService: async (domain: string, service: string, data: Record<string, unknown> = {}) => {
        calls.push({ domain, service, data });
      },
    }) as unknown as HomeAssistant;
  const api: FakeHass = {
    hass: build(),
    ids,
    states,
    calls,
    update(id, patch) {
      states[id] = { ...states[id], ...patch, attributes: { ...states[id].attributes, ...(patch.attributes ?? {}) } };
      api.hass = build();
      return api.hass;
    },
  };
  return api;
}

export type AnyEl = HTMLElement & Record<string, any>;

export const $ = (el: AnyEl, sel: string) => el.shadowRoot!.querySelector(sel) as HTMLElement | null;
export const $$ = (el: AnyEl, sel: string) => [...el.shadowRoot!.querySelectorAll(sel)] as HTMLElement[];
export const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

/** Let Lit render and pending microtasks (a resolved service call) settle, under fake or real timers. */
export async function settle(el?: AnyEl): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve();
    if (el) await el.updateComplete;
  }
}

type RuleMap = Record<string, Record<string, string>>;

/** Rules of a stylesheet text: top-level selector to declarations, and at-rule prelude to its inner rules. */
function parseCss(cssText: string): { rules: RuleMap; atRules: Record<string, RuleMap> } {
  const rules: RuleMap = {};
  const atRules: Record<string, RuleMap> = {};
  const body = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0;
  let buf = '';
  let sel = '';
  let inner = '';
  for (const ch of body) {
    if (depth >= 1) inner += ch;
    if (ch === '{') {
      depth++;
      if (depth === 1) {
        sel = buf.trim().replace(/\s+/g, ' ');
        buf = '';
        inner = '';
      } else buf += ch;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        if (sel.startsWith('@')) atRules[sel] = parseCss(inner.slice(0, -1)).rules;
        else {
          const decl: Record<string, string> = {};
          for (const part of buf.split(';')) {
            const k = part.indexOf(':');
            if (k > 0) decl[part.slice(0, k).trim()] = part.slice(k + 1).trim().replace(/\s+/g, ' ');
          }
          rules[sel] = decl;
        }
        buf = '';
      } else buf += ch;
    } else buf += ch;
  }
  return { rules, atRules };
}

/** Top-level rules of a stylesheet text: selector to declarations (property to value, whitespace collapsed). */
export const cssRules = (cssText: string): RuleMap => parseCss(cssText).rules;

/** At-rules of a stylesheet text (@media, @keyframes): prelude to its rules. */
export const cssAtRules = (cssText: string): Record<string, RuleMap> => parseCss(cssText).atRules;

/** The write queue measures its window with performance.now(), so that clock is faked along with the timers. */
export const FAKE_CLOCK = { toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'] } as Parameters<typeof vi.useFakeTimers>[0];

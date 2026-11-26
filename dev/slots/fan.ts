import type { HomeAssistant } from '@decibel95/liquid-core';
import { CARD_TYPES, TAGS } from '../../src/const';
import { applyFanCall, FAN_FIXTURES, type FanFixtureName, type FanState } from '../../test/fans/fixtures';
import type { SlotMount } from './types';

type Card = HTMLElement & { hass?: HomeAssistant; setConfig(c: Record<string, unknown>): void };

/** Harness grounds per glass, as the light slot (CHO-14). */
const GROUND = { dark: 'transparent', light: '#e7e9ee' } as const;
const INK = { dark: 'rgba(235, 240, 248, 0.6)', light: 'rgba(16, 20, 27, 0.62)' } as const;

/**
 * Dev harness slot of the fan card: one card per fan fixture state (plan 2.5) on dark and on light glass. The fan
 * states live here, on top of the harness hass; fan calls are logged and applied as HA's demo fan after 0.8 s.
 * `?fan=<fixture>` shows one fixture only, `?glass=dark|light` one glass only (for screenshots).
 */
export const mount: SlotMount = (ctx) => {
  const params = new URLSearchParams(location.search);
  const only = params.get('fan');
  const glasses = (['dark', 'light'] as const).filter((g) => !params.get('glass') || params.get('glass') === g);
  const names = (Object.keys(FAN_FIXTURES) as FanFixtureName[]).filter((n) => !only || n === only);
  const fans: Record<string, FanState> = {};
  for (const make of Object.values(FAN_FIXTURES)) {
    const s = make();
    fans[s.entity_id] = s;
  }
  const cards: Card[] = [];
  let base = ctx.hass;
  let hass = base;

  const publish = () => {
    hass = {
      ...base,
      states: { ...base.states, ...fans },
      callService: async (domain: string, service: string, data: Record<string, unknown> = {}) => {
        if (domain !== 'fan') return base.callService(domain, service, data);
        ctx.log(`${new Date().toLocaleTimeString()}  fan.${service} ${JSON.stringify(data)}`);
        setTimeout(() => {
          const id = data.entity_id as string;
          if (fans[id]) fans[id] = applyFanCall(fans[id], service, data);
          publish();
        }, 800);
      },
    } as HomeAssistant;
    for (const c of cards) c.hass = hass;
  };
  publish();

  for (const glass of glasses) {
    const row = document.createElement('div');
    row.dataset.glass = glass;
    Object.assign(row.style, { display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'flex-start', padding: '24px', borderRadius: '24px', background: GROUND[glass], width: '100%', boxSizing: 'border-box' });
    for (const name of names) {
      const cell = document.createElement('figure');
      cell.dataset.fixture = name;
      Object.assign(cell.style, { margin: '0', display: 'flex', flexDirection: 'column', gap: '8px', width: '444px', maxWidth: '100%' });
      const cap = document.createElement('figcaption');
      cap.textContent = `${name} (${glass} glass)`;
      Object.assign(cap.style, { fontSize: '12px', color: INK[glass] });
      const card = document.createElement(TAGS.fan) as Card;
      card.setConfig({ type: CARD_TYPES.fan, entity: FAN_FIXTURES[name]().entity_id, look: { glass } });
      card.hass = hass;
      cards.push(card);
      cell.append(cap, card);
      row.append(cell);
    }
    ctx.container.append(row);
  }

  ctx.onHass((next) => {
    base = next;
    publish();
  });
};

import type { SlotMount } from './types';
import type { LightFixtureName } from '../../test/fixtures/lights';
import { CARD_TYPES, TAGS } from '../../src/const';

/** Harness grounds per glass (CHO-14: #0b0e14 with the orbs for dark, #e7e9ee for light). */
const GROUND = { dark: 'transparent', light: '#e7e9ee' } as const;
const INK = { dark: 'rgba(235, 240, 248, 0.6)', light: 'rgba(16, 20, 27, 0.62)' } as const;

/**
 * Dev harness slot of the light card: one card per fixture state (plan 2.8) on dark and on light glass.
 * `?light=<fixture>` shows one fixture only, `?glass=dark|light` one glass only (for screenshots).
 */
export const mount: SlotMount = (ctx) => {
  const params = new URLSearchParams(location.search);
  const only = params.get('light');
  const glasses = (['dark', 'light'] as const).filter((g) => !params.get('glass') || params.get('glass') === g);
  const names = (Object.keys(ctx.ids) as LightFixtureName[]).filter((n) => !only || n === only);
  const cards: (HTMLElement & { hass?: unknown })[] = [];

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
      const card = document.createElement(TAGS.light) as HTMLElement & { setConfig(c: unknown): void; hass?: unknown };
      card.setConfig({ type: CARD_TYPES.light, entity: ctx.ids[name], look: { glass } });
      card.hass = ctx.hass;
      cards.push(card);
      cell.append(cap, card);
      row.append(cell);
    }
    ctx.container.append(row);
  }

  // A narrow card (320px), as the design canvas draws it.
  if ((!only || only === 'colourHs') && glasses.includes('dark')) {
    const narrow = document.createElement(TAGS.light) as HTMLElement & { setConfig(c: unknown): void; hass?: unknown };
    narrow.setConfig({ type: CARD_TYPES.light, entity: ctx.ids.colourHs, look: { glass: 'dark' } });
    narrow.style.width = '320px';
    narrow.dataset.fixture = 'narrow';
    narrow.hass = ctx.hass;
    cards.push(narrow);
    ctx.container.append(narrow);
  }

  ctx.onHass((hass) => {
    for (const c of cards) c.hass = hass;
  });
};

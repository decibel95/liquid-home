import type { HomeAssistant } from '@decibel95/liquid-core';
import { CARD_TYPES, TAGS } from '../../src/const';
import { COVER_FIXTURES, coverIds, type CoverFixtureName } from '../../test/covers/fixtures';
import { createCoverSim } from '../../test/covers/sim';
import type { SlotMount } from './types';

type Card = HTMLElement & { hass?: HomeAssistant; setConfig(c: Record<string, unknown>): void; setPillMode?(m: 'position' | 'tilt'): void };

/** Harness grounds per glass, as the light card slot (CHO-14). */
const GROUND = { dark: 'transparent', light: '#e7e9ee' } as const;
const INK = { dark: 'rgba(235, 240, 248, 0.6)', light: 'rgba(16, 20, 27, 0.62)' } as const;

/** The states of plan 2.4 "every fixture state", in order; `tilt` opens the card in Tilt mode. */
const SHOWN: { name: string; fixture: CoverFixtureName; tilt?: boolean }[] = [
  { name: 'position', fixture: 'hall' },
  { name: 'tilt-only', fixture: 'pergola' },
  { name: 'position + tilt, Position', fixture: 'living' },
  { name: 'position + tilt, Tilt', fixture: 'living', tilt: true },
  { name: 'toggle open', fixture: 'kitchenOpen' },
  { name: 'toggle closed', fixture: 'kitchen' },
  { name: 'toggle opening', fixture: 'kitchenOpening' },
  { name: 'toggle closing', fixture: 'kitchenClosing' },
  { name: 'garage', fixture: 'garage' },
  { name: 'unavailable', fixture: 'unavailable' },
  { name: 'long name', fixture: 'longName' },
  { name: 'closing', fixture: 'hallClosing' },
];

/**
 * Dev harness slot of the cover card: every fixture state of plan 2.4 on dark and on light glass, over the gate 2
 * prototype's simulated HA (echo 250 ms, motor 10 % per second, the request rounded to 10), so drags, steps and the
 * hold can be tried. `?cover=<fixture>` shows one fixture, `?glass=dark|light` one glass. The harness language
 * switcher is followed through ctx.onHass.
 */
export const mount: SlotMount = (ctx) => {
  const params = new URLSearchParams(location.search);
  const only = params.get('cover');
  const glasses = (['dark', 'light'] as const).filter((g) => !params.get('glass') || params.get('glass') === g);
  const sim = createCoverSim({
    language: ctx.hass.locale?.language ?? 'en',
    travelMs: 4000,
    onCall: (c) => ctx.log(`${new Date().toLocaleTimeString()}  ${c.domain}.${c.service} ${JSON.stringify(c.data)}`),
  });
  const cards: Card[] = [];
  const shown = SHOWN.filter((s) => !only || s.fixture === only);

  for (const glass of glasses) {
    const row = document.createElement('div');
    row.dataset.glass = glass;
    Object.assign(row.style, { display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'flex-start', padding: '24px', borderRadius: '24px', background: GROUND[glass], width: '100%', boxSizing: 'border-box' });
    for (const s of shown) {
      const cell = document.createElement('figure');
      cell.dataset.fixture = s.fixture;
      Object.assign(cell.style, { margin: '0', display: 'flex', flexDirection: 'column', gap: '8px', width: '444px', maxWidth: '100%' });
      const cap = document.createElement('figcaption');
      cap.textContent = `${s.name} (${glass} glass)`;
      Object.assign(cap.style, { fontSize: '12px', color: INK[glass] });
      const card = document.createElement(TAGS.cover) as Card;
      card.setConfig({ type: CARD_TYPES.cover, entity: coverIds[s.fixture], look: { glass } });
      if (s.tilt) card.setPillMode?.('tilt');
      card.hass = sim.hass;
      cards.push(card);
      cell.append(cap, card);
      row.append(cell);
    }
    ctx.container.append(row);
  }

  sim.onHass((hass) => {
    for (const c of cards) c.hass = hass;
  });
  // The harness language switcher publishes a new hass: follow its language.
  ctx.onHass((hass) => {
    const lang = hass.locale?.language ?? hass.language;
    if (lang && lang !== sim.hass.locale?.language) sim.setLanguage(lang);
  });
  ctx.log(`Cover slot: ${Object.keys(COVER_FIXTURES).length} fixtures (demo covers real, the rest derived).`);
};

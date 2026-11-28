import type { HassEntity, HomeAssistant } from '@decibel95/liquid-core';
import { CARD_TYPES, TAGS } from '../../src/const';
import { applyMediaCall, MEDIA_FIXTURES, type MediaFixtureName } from '../../test/cards/media/fixtures';
import type { SlotMount } from './types';

type Card = HTMLElement & {
  hass?: HomeAssistant;
  setConfig(c: Record<string, unknown>): void;
};

/** Harness grounds per glass, as the light, cover and fan slots (CHO-14). */
const GROUND = { dark: 'transparent', light: '#e7e9ee' } as const;
const INK = {
  dark: 'rgba(235, 240, 248, 0.6)',
  light: 'rgba(16, 20, 27, 0.62)',
} as const;

/** The cells, in the order of the canvas boards MediaCardDark and MediaCardLight; `narrow` draws the card at 320 px. */
const CELLS: { name: MediaFixtureName; narrow?: boolean }[] = [
  { name: 'kitchen' },
  { name: 'playing' },
  { name: 'living_room' },
  { name: 'artwork_16x9' },
  { name: 'paused' },
  { name: 'buffering' },
  { name: 'seek_live' },
  { name: 'long_track' },
  { name: 'idle' },
  { name: 'standby' },
  { name: 'off' },
  { name: 'unavailable' },
  { name: 'unknown' },
  { name: 'muted' },
  { name: 'volume_mid' },
  { name: 'volume_step' },
  { name: 'lounge_room' },
  { name: 'speaker_modes' },
  { name: 'onoff_only' },
  { name: 'onoff_off' },
  { name: 'no_artwork' },
  { name: 'long_title' },
  { name: 'rtl_title' },
  { name: 'grouped' },
  { name: 'living_room', narrow: true },
  { name: 'tv_sources' },
  { name: 'shuffle_repeat' },
  { name: 'group' },
];

/**
 * Dev harness slot of the media card: one card per media fixture state (plan 2.5) on dark and on light glass. The
 * media states live here, on top of the harness hass; media calls are logged and applied as a fake player after
 * 0.8 s (test/cards/media/fixtures.ts applyMediaCall). `?media=<fixture>` shows one fixture only, `?glass=dark|light`
 * one glass only (for screenshots).
 */
export const mount: SlotMount = (ctx) => {
  const params = new URLSearchParams(location.search);
  const only = params.get('media');
  const glasses = (['dark', 'light'] as const).filter((g) => !params.get('glass') || params.get('glass') === g);
  const cells = CELLS.filter((c) => !only || c.name === only);
  const players: Record<string, HassEntity> = {};
  for (const make of Object.values(MEDIA_FIXTURES)) {
    const s = make();
    players[s.entity_id] = s;
  }
  const cards: Card[] = [];
  let base = ctx.hass;
  let hass = base;

  const publish = () => {
    hass = {
      ...base,
      states: { ...base.states, ...players },
      callService: async (domain: string, service: string, data: Record<string, unknown> = {}) => {
        if (domain !== 'media_player') return base.callService(domain, service, data);
        ctx.log(`${new Date().toLocaleTimeString()}  media_player.${service} ${JSON.stringify(data)}`);
        setTimeout(() => {
          const id = data.entity_id as string;
          if (players[id]) players[id] = applyMediaCall(players[id], service, data);
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
    Object.assign(row.style, {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '24px',
      alignItems: 'flex-start',
      padding: '24px',
      borderRadius: '24px',
      background: GROUND[glass],
      width: '100%',
      boxSizing: 'border-box',
    });
    for (const cell of cells) {
      const figure = document.createElement('figure');
      figure.dataset.fixture = cell.narrow ? `${cell.name}_320` : cell.name;
      Object.assign(figure.style, {
        margin: '0',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        width: cell.narrow ? '320px' : '444px',
        maxWidth: '100%',
      });
      const cap = document.createElement('figcaption');
      cap.textContent = `${cell.name}${cell.narrow ? ', 320 px' : ''} (${glass} glass)`;
      Object.assign(cap.style, { fontSize: '12px', color: INK[glass] });
      const card = document.createElement(TAGS.media) as Card;
      card.setConfig({
        type: CARD_TYPES.media,
        entity: MEDIA_FIXTURES[cell.name]().entity_id,
        look: { glass },
      });
      card.hass = hass;
      cards.push(card);
      figure.append(cap, card);
      row.append(figure);
    }
    ctx.container.append(row);
  }

  ctx.onHass((next) => {
    base = next;
    publish();
  });
};

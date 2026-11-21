import type { HomeAssistant } from '@decibel95/liquid-core';
import { TAGS } from '../../src/const';
import type { LightFixtureName } from '../../test/fixtures/lights';
import type { SlotMount } from './types';

type Card = HTMLElement & { hass?: HomeAssistant; setConfig(c: Record<string, unknown>): void };

/** Canvas grounds (CHO-14): dark glass over the dark harness page, light glass over the light canvas ground. */
export const GROUNDS = { dark: '#0b0e14', light: '#e7e9ee' } as const;

/** One column per glass, each on its own ground, with a caption. Shared with the badge slot. */
export function glassColumn(container: HTMLElement, glass: 'dark' | 'light', caption: string): HTMLElement {
  const col = document.createElement('div');
  col.dataset.glass = glass;
  col.style.cssText = `display:flex;flex-direction:column;gap:12px;padding:20px;border-radius:20px;background:${GROUNDS[glass]};color:${glass === 'dark' ? '#f4f6fa' : '#10141b'}`;
  const h = document.createElement('div');
  h.textContent = caption;
  h.style.cssText = 'font-size:12px;opacity:.7';
  col.append(h);
  container.append(col);
  return col;
}

/** A labelled row: fixture name beside the card. */
export function labelled(parent: HTMLElement, label: string, el: HTMLElement): void {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:10px';
  const tag = document.createElement('span');
  tag.textContent = label;
  tag.style.cssText = 'width:96px;flex:none;font-size:11px;opacity:.6';
  row.append(tag, el);
  parent.append(row);
}

/** Dev harness slot of the tile: every fixture state on both glasses, plus the tap actions. */
export const mount: SlotMount = (ctx) => {
  const cards: Card[] = [];
  for (const glass of ['dark', 'light'] as const) {
    const col = glassColumn(ctx.container, glass, `${glass} glass`);
    for (const [name, id] of Object.entries(ctx.ids) as [LightFixtureName, string][]) {
      const tile = document.createElement(TAGS.tile) as Card;
      tile.setConfig({ type: `custom:${TAGS.tile}`, entity: id, look: { glass } });
      tile.style.width = '420px';
      tile.dataset.fixture = name;
      tile.hass = ctx.hass;
      cards.push(tile);
      labelled(col, name, tile);
    }
  }
  ctx.onHass((hass) => cards.forEach((c) => (c.hass = hass)));
};

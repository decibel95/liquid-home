import type { HomeAssistant } from '@decibel95/liquid-core';
import { TAGS } from '../../src/const';
import type { LightFixtureName } from '../../test/fixtures/lights';
import type { SlotMount } from './types';
import { glassColumn, labelled } from './tile';

type Card = HTMLElement & { hass?: HomeAssistant; setConfig(c: Record<string, unknown>): void };

/** Dev harness slot of the badge: every fixture state on both glasses, pill and round (icon_only). */
export const mount: SlotMount = (ctx) => {
  const cards: Card[] = [];
  for (const glass of ['dark', 'light'] as const) {
    const col = glassColumn(ctx.container, glass, `${glass} glass, pill and round (tap opens the sheet)`);
    for (const [name, id] of Object.entries(ctx.ids) as [LightFixtureName, string][]) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px';
      for (const icon_only of [false, true]) {
        const badge = document.createElement(TAGS.badge) as Card;
        badge.setConfig({ type: `custom:${TAGS.badge}`, entity: id, icon_only, tap_action: 'sheet', look: { glass } });
        badge.dataset.fixture = name;
        badge.hass = ctx.hass;
        cards.push(badge);
        row.append(badge);
      }
      labelled(col, name, row);
    }
  }
  ctx.onHass((hass) => cards.forEach((c) => (c.hass = hass)));
};

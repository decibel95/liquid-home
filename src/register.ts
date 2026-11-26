import { ensureLiquidFont } from '@decibel95/liquid-core';
import { DOCS_URL, TAGS } from './const';

/** One entry of Home Assistant's card or badge picker. */
export interface PickerEntry {
  type: string;
  name: string;
  description: string;
  preview?: boolean;
  documentationURL?: string;
}

declare global {
  interface Window {
    customCards?: PickerEntry[];
    customBadges?: PickerEntry[];
  }
}

/** The picker entries, the one place they are made (names per D-16). English, as Liquid Climate's. */
export const PICKER = {
  light: {
    type: TAGS.light,
    name: 'Liquid Home light card',
    description: 'Glass card for one light: a big brightness pill with Brightness, White and Colour modes, and effects.',
    preview: true,
    documentationURL: `${DOCS_URL}/cards/light`,
  },
  cover: {
    type: TAGS.cover,
    name: 'Liquid Home cover card',
    description: 'Glass card for one cover: a big position pill with open, stop and close buttons, and tilt.',
    preview: true,
    documentationURL: `${DOCS_URL}/cards/cover`,
  },
  fan: {
    type: TAGS.fan,
    name: 'Liquid Home fan card',
    description: 'Glass card for one fan: a big speed pill with power, oscillate, direction and presets.',
    preview: true,
    documentationURL: `${DOCS_URL}/cards/fan`,
  },
  tile: {
    type: TAGS.tile,
    name: 'Liquid Home tile',
    description: 'Compact glass row for a light, cover or fan: icon action, status and steps. Tap to open its card as a sheet.',
    preview: true,
    documentationURL: `${DOCS_URL}/cards/tile`,
  },
  badge: {
    type: TAGS.badge,
    name: 'Liquid Home badge',
    description: 'Glass status pill for a light, cover or fan: its state and level.',
    preview: true,
    documentationURL: `${DOCS_URL}/cards/badge`,
  },
  room: {
    type: TAGS.room,
    name: 'Liquid Home room',
    description: 'The lights, covers and fans of a room in one glass card: a tile for each, a strip for the selected one and a header power button for the lights.',
    preview: true,
    documentationURL: `${DOCS_URL}/cards/room`,
  },
} satisfies Record<string, PickerEntry>;

/** Adds an entry unless one with its `type` is there (a second bundle, or Liquid Climate's own entries), as Liquid Climate's register(). */
function register(list: PickerEntry[], entry: PickerEntry) {
  if (!list.some((c) => c.type === entry.type)) list.push(entry);
}

window.customCards = window.customCards || [];
for (const entry of [PICKER.light, PICKER.cover, PICKER.fan, PICKER.tile, PICKER.badge, PICKER.room]) register(window.customCards, entry);
// The badge is in both lists, as the Liquid Climate badge.
window.customBadges = window.customBadges || [];
register(window.customBadges, PICKER.badge);

// The Inter font ships next to the bundle (liquid-inter.woff2, copied there by the build and attached to the release),
// as the liquid-core README ("Font") describes. @vite-ignore keeps the runtime URL (no inlined font); the bundle's own
// query (HACS serves it as ?hacstag=...) is copied so a new release also refreshes the cached font.
// Contract with vite.config.ts: this file name must be a key of FONT_ASSETS (build output and the dev route
// /src/liquid-inter.woff2); test/font.test.ts checks it.
const u = new URL(/* @vite-ignore */ './liquid-inter.woff2', import.meta.url);
u.search = new URL(import.meta.url).search;
ensureLiquidFont(u.href);

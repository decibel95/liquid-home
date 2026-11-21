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
  tile: {
    type: TAGS.tile,
    name: 'Liquid Home tile',
    description: 'Compact glass row for a light: power, status, brightness steppers. Tap to open the light card as a sheet.',
    preview: true,
    documentationURL: `${DOCS_URL}/cards/tile`,
  },
  badge: {
    type: TAGS.badge,
    name: 'Liquid Home badge',
    description: 'Glass status pill for a light: on or off and its brightness.',
    preview: true,
    documentationURL: `${DOCS_URL}/cards/badge`,
  },
  room: {
    type: TAGS.room,
    name: 'Liquid Home room',
    description: 'Every light of a room in one glass card: a tile per light, a strip for the selected one and a header power button.',
    preview: true,
    documentationURL: `${DOCS_URL}/cards/room`,
  },
} satisfies Record<string, PickerEntry>;

/** Adds an entry unless one with its `type` is there (a second bundle, or Liquid Climate's own entries), as Liquid Climate's register(). */
function register(list: PickerEntry[], entry: PickerEntry) {
  if (!list.some((c) => c.type === entry.type)) list.push(entry);
}

window.customCards = window.customCards || [];
for (const entry of [PICKER.light, PICKER.tile, PICKER.badge, PICKER.room]) register(window.customCards, entry);
// The badge is in both lists, as the Liquid Climate badge.
window.customBadges = window.customBadges || [];
register(window.customBadges, PICKER.badge);

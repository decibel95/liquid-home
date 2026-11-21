declare const __LH_VERSION__: string | undefined;

/** Card version, injected from package.json at build time (see vite.config.ts). */
export const VERSION: string = typeof __LH_VERSION__ === 'string' ? __LH_VERSION__ : 'dev';

/** The config schema version. Bump it together with a step in the card's migrate.ts. */
export const CONFIG_VERSION = 1;

/**
 * Docs base for the editor help links. Page scheme: `${DOCS_URL}/cards/<card>#<card>-<section>`,
 * with <card> one of light, tile, badge, room.
 * Public docs site on GitHub Pages; must match the URLs in .github/ISSUE_TEMPLATE/config.yml
 */
export const DOCS_URL = 'https://decibel95.github.io/liquid-home';

/** Public repository and issue tracker; must match .github/ISSUE_TEMPLATE/config.yml and package.json. */
export const REPO_URL = 'https://github.com/decibel95/liquid-home';
export const ISSUES_URL = `${REPO_URL}/issues`;

/** Custom element tag names. */
export const TAGS = {
  light: 'liquid-home-light-card',
  lightEditor: 'liquid-home-light-card-editor',
  tile: 'liquid-home-tile',
  tileEditor: 'liquid-home-tile-editor',
  badge: 'liquid-home-badge',
  badgeEditor: 'liquid-home-badge-editor',
  room: 'liquid-home-room',
  roomEditor: 'liquid-home-room-editor',
  sheet: 'liquid-home-sheet',
} as const;

export type CardKey = 'light' | 'tile' | 'badge' | 'room';

/** `type:` values users write in YAML. */
export const CARD_TYPES: Record<CardKey, string> = {
  light: `custom:${TAGS.light}`,
  tile: `custom:${TAGS.tile}`,
  badge: `custom:${TAGS.badge}`,
  room: `custom:${TAGS.room}`,
};

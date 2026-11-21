import en from './locales/en.json';
import nl from './locales/nl.json';
import de from './locales/de.json';
import fr from './locales/fr.json';
import es from './locales/es.json';
import it from './locales/it.json';
import { CARD_LOCALES as light } from '../cards/light/i18n';
import { CARD_LOCALES as tile } from '../cards/tile/i18n';
import { CARD_LOCALES as badge } from '../cards/badge/i18n';
import { CARD_LOCALES as room } from '../cards/room/i18n';
import { createI18n, flatten, type I18nHass, type I18nLayer } from '@decibel95/liquid-core';

/** The six shipped languages (see CONTRIBUTING-translations.md). */
export const LANGUAGES = ['en', 'nl', 'de', 'fr', 'es', 'it'] as const;
export type Language = (typeof LANGUAGES)[number];

type Tree = { [key: string]: string | Tree };

/** Product strings: shared by all cards. */
const PRODUCT: Record<Language, Tree> = { en, nl, de, fr, es, it };

/** One layer per language from nested JSON trees, flattened to dotted keys by core. */
function layer(trees: Record<Language, Tree>, prefix = ''): I18nLayer {
  return Object.fromEntries(LANGUAGES.map((l) => [l, flatten(trees[l], prefix)]));
}

/** Card strings live under their card name: `light.card.name`, `tile.card.name`. */
const CARDS = { light, tile, badge, room } as const;

/**
 * Core createI18n prepends the core layer (`core.*`); later layers win, so product wins over core and a card
 * over product. Card keys are namespaced by card name, so cards never clash with each other.
 */
const I18N = createI18n([layer(PRODUCT), ...Object.entries(CARDS).map(([name, c]) => layer(c as Record<Language, Tree>, `${name}.`))]);

/** The string for `key` in the hass language (tag, base tag, then en), the key itself when missing. {name} placeholders are filled from vars. */
export function t(hass: { locale?: { language?: string }; language?: string } | null | undefined, key: string, vars?: Record<string, string | number>): string {
  return I18N.t(hass as I18nHass, key, vars);
}

import { describe, expect, it, vi } from 'vitest';
import enProduct from '../src/i18n/locales/en.json';
import nlProduct from '../src/i18n/locales/nl.json';
import deProduct from '../src/i18n/locales/de.json';
import frProduct from '../src/i18n/locales/fr.json';
import esProduct from '../src/i18n/locales/es.json';
import itProduct from '../src/i18n/locales/it.json';
import { CARD_LOCALES as light } from '../src/cards/light/i18n';
import { CARD_LOCALES as tile } from '../src/cards/tile/i18n';
import { CARD_LOCALES as badge } from '../src/cards/badge/i18n';
import { CARD_LOCALES as room } from '../src/cards/room/i18n';

type Tree = { [key: string]: string | Tree };
const flatten = (tree: Tree, prefix = ''): Record<string, string> =>
  Object.fromEntries(Object.entries(tree).flatMap(([k, v]) => (typeof v === 'string' ? [[prefix + k, v]] : Object.entries(flatten(v, `${prefix}${k}.`)))));
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

const LANGS = ['en', 'nl', 'de', 'fr', 'es', 'it'] as const;
const sets: Record<string, Record<(typeof LANGS)[number], Tree>> = {
  product: { en: enProduct, nl: nlProduct, de: deProduct, fr: frProduct, es: esProduct, it: itProduct },
  light,
  tile,
  badge,
  room,
};

describe.each(Object.entries(sets))('%s strings', (_name, locales) => {
  const en = flatten(locales.en);

  it.each(LANGS)('%s has exactly the keys and placeholders of en', (lang) => {
    const flat = flatten(locales[lang]);
    expect(Object.keys(flat).sort()).toEqual(Object.keys(en).sort());
    for (const [key, value] of Object.entries(flat)) expect(placeholders(value), `${lang} ${key}`).toBe(placeholders(en[key]));
  });

  it.each(LANGS)('%s has no empty string and no em-dash', (lang) => {
    for (const [key, value] of Object.entries(flatten(locales[lang]))) {
      expect(value.trim(), `${lang} ${key}`).not.toBe('');
      expect(value, `${lang} ${key}`).not.toContain(String.fromCharCode(0x2014));
    }
  });
});

describe('t() layer merge', () => {
  it('uses the hass language, then en, then the key', async () => {
    const { t } = await import('../src/i18n');
    expect(t({ language: 'nl' }, 'light.card.name')).toBe('Lichtkaart');
    expect(t({ language: 'nl-BE' }, 'product.name')).toBe('Liquid Home');
    expect(t({ language: 'pt-BR' }, 'product.name')).toBe('Liquid Home');
    expect(t(null, 'no.such.key')).toBe('no.such.key');
  });
});

describe('t() smoke', () => {
  it('interpolates {param} and leaves unknown placeholders', async () => {
    const { t } = await import('../src/i18n');
    expect(t({ language: 'en' }, 'no.key {x}')).toBe('no.key {x}');
    expect(t({ language: 'en' }, 'hello {name}, {n}', { name: 'Kim', n: 2 })).toBe('hello Kim, 2');
  });

  it('falls back to en for a language without strings', async () => {
    const { t } = await import('../src/i18n');
    expect(t({ language: 'pl' }, 'light.card.name')).toBe('Light card');
  });

  it('keeps card strings apart: no key occurs in two card namespaces', async () => {
    const { t } = await import('../src/i18n');
    const names = ['light', 'tile', 'badge', 'room'].map((c) => t({ language: 'nl' }, `${c}.card.name`));
    expect(new Set(names).size).toBe(4);
    expect(t({ language: 'nl' }, 'card.name')).toBe('card.name');
  });
});

describe('t() precedence', () => {
  it('card strings win over product strings', async () => {
    vi.resetModules();
    const tree = (v: string) => ({ light: { x: v } });
    vi.doMock('../src/i18n/locales/en.json', () => ({ default: tree('product') }));
    vi.doMock('../src/cards/light/i18n', () => ({ CARD_LOCALES: { en: { x: 'card' }, nl: { x: 'card' }, de: { x: 'card' }, fr: { x: 'card' }, es: { x: 'card' }, it: { x: 'card' } } }));
    const { t } = await import('../src/i18n');
    expect(t({ language: 'en' }, 'light.x')).toBe('card');
    vi.doUnmock('../src/i18n/locales/en.json');
    vi.doUnmock('../src/cards/light/i18n');
    vi.resetModules();
  });
});

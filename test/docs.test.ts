// @vitest-environment happy-dom
/// <reference types="vite/client" />
import { describe, expect, it, vi } from 'vitest';
import anchorMap from '../docs/anchors.json';
import docsConfig from '../docs/.vitepress/config.ts?raw';
import hacs from '../hacs.json';
import { CARD_TYPES, DOCS_URL } from '../src/const';
import { PICKER } from '../src/register';
import { MEDIA_THROTTLE_MS, SEEK_ECHO_S, TRACK_RESTART_S, VOLUME_STEP_PERCENT } from '../src/media/writer';
import { defaultConfig as light, normalizeConfig as normalizeLight, LIGHT_MODES } from '../src/cards/light/config';
import { defaultConfig as tile, TAP_ACTIONS, normalizeConfig as normalizeTile } from '../src/cards/tile/config';
import { defaultConfig as badge } from '../src/cards/badge/config';
import { defaultConfig as room, normalizeConfig as normalizeRoom } from '../src/cards/room/config';
import { defaultConfig as cover } from '../src/cards/cover/config';
import { defaultConfig as fan } from '../src/cards/fan/config';
import { defaultConfig as mediaCard } from '../src/cards/media/config';
// The media scripts are untyped .mjs files.
// @ts-expect-error no declaration file
import { SCENES } from '../scripts/media/stills.mjs';
// @ts-expect-error no declaration file
import { ANIMATIONS } from '../scripts/media/animations.mjs';

// The markdown sources of the docs site (node_modules, the build output and public are not in these globs).
const pages = import.meta.glob(['../docs/*.md', '../docs/cards/*.md'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const media = Object.keys(import.meta.glob('../docs/public/media/**/*')).map((f) => f.slice('../docs/public'.length));

/** The page path ("/cards/light") of a markdown source. */
const pagePath = (file: string) => file.replace('../docs', '').replace(/\.md$/, '').replace(/\/index$/, '') || '/';
const source = (path: string) => pages[`../docs${path === '/' ? '/index' : path}.md`];

/** Heading ids outside code fences: the explicit `{#id}`. Headings without one are listed by line. */
function headingIds(markdown: string): { ids: Set<string>; missing: number[] } {
  const ids = new Set<string>();
  const missing: number[] = [];
  let fence = false;
  markdown.split(/\r?\n/).forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (fence) return;
    const m = /^#{1,6}\s+(.*?)\s*$/.exec(line);
    if (!m) return;
    const explicit = /\s\{#([^}\s]+)\}$/.exec(m[1]);
    if (explicit) ids.add(explicit[1]);
    else missing.push(i + 1);
  });
  return { ids, missing };
}

const ids = new Map<string, Set<string>>();
const headings = new Map<string, Set<string>>();
for (const [file, md] of Object.entries(pages)) {
  const h = headingIds(md);
  headings.set(file, h.ids);
  ids.set(pagePath(file), h.ids);
}

const split = (target: string): [string, string] => {
  const [path, hash = ''] = target.split('#');
  return [path, hash];
};

describe('docs anchors', () => {
  it('finds the docs pages', () => {
    expect([...ids.keys()]).toEqual(
      expect.arrayContaining(['/', '/getting-started', '/theming', '/languages', '/troubleshooting', '/cards/light', '/cards/cover', '/cards/fan', '/cards/media', '/cards/tile', '/cards/badge', '/cards/room']),
    );
  });

  it('every heading has an explicit {#id}, so the anchors do not depend on a slug rule', () => {
    for (const [file, md] of Object.entries(pages)) {
      expect(headingIds(md).missing.map((line) => `${file}:${line}`), `headings without {#id} in ${file}`).toEqual([]);
    }
  });

  it('heading ids are unique on a page', () => {
    for (const [file, md] of Object.entries(pages)) {
      const all = [...md.matchAll(/^#{1,6}\s+.*\{#([^}\s]+)\}\s*$/gm)].map((m) => m[1]);
      expect(all.filter((id, i) => all.indexOf(id) !== i), file).toEqual([]);
    }
  });

  it('every anchor in anchors.json is a heading id on its page', () => {
    for (const [name, target] of Object.entries(anchorMap.anchors)) {
      const [path, hash] = split(target);
      expect(ids.has(path), `${name}: no page ${path}`).toBe(true);
      expect(ids.get(path)!.has(hash), `${name}: no heading id ${hash} on ${path}`).toBe(true);
    }
  });

  it('every anchor is `<card>-<slug>` on the page of that card, as the editors build their help links', () => {
    for (const [name, target] of Object.entries(anchorMap.anchors)) {
      const [card, slug] = name.split('.');
      expect(target, name).toBe(`/cards/${card}#${card}-${slug.replaceAll('_', '-')}`);
    }
  });

  it('documents the anchors the editors need for tap action and write hold', () => {
    expect(anchorMap.anchors).toMatchObject({
      'tile.tap_action': '/cards/tile#tile-tap-action',
      'tile.write_hold': '/cards/tile#tile-write-hold',
      'badge.tap_action': '/cards/badge#badge-tap-action',
    });
  });

  it('every internal link in the docs points at an existing page and heading', () => {
    for (const [file, md] of Object.entries(pages)) {
      for (const m of md.matchAll(/\]\(#([^)\s]+)\)/g)) {
        expect(headings.get(file)!.has(m[1]), `${file}: link to missing heading on the same page #${m[1]}`).toBe(true);
      }
      for (const m of md.matchAll(/\]\((\/[^)\s]*)\)/g)) {
        const [path, hash] = split(m[1]);
        if (path.startsWith('/media/')) continue;
        expect(ids.has(path), `${file}: link to missing page ${m[1]}`).toBe(true);
        if (hash) expect(ids.get(path)!.has(hash), `${file}: link to missing heading ${m[1]}`).toBe(true);
      }
    }
  });
});

/** Every key of a default config as a dotted path, objects flattened (`look.glass`), arrays kept whole. */
function paths(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v) ? paths(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

/** Options that have no default (and so are not in defaultConfig) but exist in the config types. */
const OPTIONAL = {
  light: ['name', 'controls.modes'],
  tile: ['name', 'controls.modes', 'controls.presets', 'controls.sources', 'controls.sound_modes'],
  badge: ['name'],
  room: ['title', 'area', 'entities', 'power_entity', 'domains'],
  cover: ['name'],
  fan: ['name'],
  media: ['name'],
} as const;

describe.each([
  ['light', light],
  ['tile', tile],
  ['badge', badge],
  ['room', room],
  ['cover', cover],
  ['fan', fan],
  ['media', mediaCard],
] as const)('%s options', (card, defaults) => {
  const text = source(`/cards/${card}`);
  const options = text.slice(text.indexOf('## Options'), text.indexOf('## Editor groups'));
  const documented = new Set([...options.matchAll(/^\|\s*`([^`]+)`/gm)].map((m) => m[1]));
  const all = [...new Set([...paths(defaults as Record<string, unknown>).filter((p) => p !== 'type'), ...OPTIONAL[card]])];

  it('has an Options table', () => {
    expect(documented.size).toBeGreaterThan(3);
  });

  it('documents every option in the Options table (the look options as one `look` row)', () => {
    for (const option of all) {
      const ok = documented.has(option) || (option.startsWith('look.') && documented.has('look'));
      expect(ok, `${card}: option ${option} is not in the Options table of docs/cards/${card}.md`).toBe(true);
    }
  });

  it('lists no option that does not exist', () => {
    const known = new Set([...all, 'look', 'controls', 'type']);
    for (const d of documented) expect(known.has(d), `${card}: documented option ${d} is not an option of the card`).toBe(true);
  });

  it('shows the default of every option with a default', () => {
    const rows = [...options.matchAll(/^\|\s*`([^`]+)`\s*\|\s*([^|]*)\|/gm)];
    const byName = new Map(rows.map((r) => [r[1], r[2].trim()]));
    const defaultOf = (path: string) => path.split('.').reduce<any>((o, k) => o?.[k], defaults);
    for (const [name, shown] of byName) {
      if (name === 'look' || name === 'controls') continue;
      const def = defaultOf(name);
      if (def === undefined || def === '' || name === 'source') continue;
      expect(shown, `${card}: default of ${name}`).toContain(String(def));
    }
  });

  it('writes the card type in the page', () => {
    expect(text).toContain(`type: ${CARD_TYPES[card]}`);
  });

  it('has its editor help sections', () => {
    const own = [...ids.get(`/cards/${card}`)!];
    for (const [name, target] of Object.entries(anchorMap.anchors)) if (name.startsWith(`${card}.`)) expect(own).toContain(split(target)[1]);
  });
});

/** The values in backticks in the description cell of an option row, e.g. `sheet`, `more-info`, `none`. */
function valuesOf(markdown: string, option: string): string[] {
  const row = markdown.split('\n').find((l) => l.startsWith(`| \`${option}\``));
  expect(row, `row ${option}`).toBeDefined();
  return [...row!.split('|').slice(3).join('|').matchAll(/`([^`]+)`/g)].map((m) => m[1]);
}

describe('docs allowed values match the code', () => {
  it('tap_action on the tile and the badge lists exactly the values the code accepts', () => {
    for (const card of ['tile', 'badge']) {
      const doc = valuesOf(source(`/cards/${card}`), 'tap_action');
      expect([...new Set(doc)].sort(), card).toEqual([...TAP_ACTIONS].sort());
      for (const v of doc) expect(normalizeTile({ entity: 'light.a', tap_action: v }).tap_action, `${card} ${v}`).toBe(v);
    }
    expect(normalizeTile({ entity: 'light.a', tap_action: 'bogus' }).tap_action).toBe('sheet');
  });

  it('source lists exactly area and list', () => {
    const doc = [...new Set(valuesOf(source('/cards/room'), 'source'))];
    expect([...doc].sort()).toEqual(['area', 'list']);
    for (const v of doc) expect(normalizeRoom({ source: v }).source).toBe(v);
  });

  it('look.glass and look.motion list exactly the values the code keeps', () => {
    const theming = source('/theming');
    const glass = valuesOf(theming, 'glass');
    const motion = valuesOf(theming, 'motion');
    expect(glass.sort()).toEqual(['dark', 'light', 'theme']);
    expect(motion.sort()).toEqual(['minimal', 'rich', 'subtle']);
    for (const g of glass) expect(normalizeLight({ entity: 'light.a', look: { glass: g } }).look.glass).toBe(g);
    for (const m of motion) expect(normalizeLight({ entity: 'light.a', look: { motion: m } }).look.motion).toBe(m);
    expect(normalizeLight({ entity: 'light.a', look: { glass: 'x', motion: 'x' } }).look).toMatchObject({ glass: 'theme', motion: 'rich' });
  });

  it('controls.modes on the light card lists exactly the light modes', () => {
    const row = valuesOf(source('/cards/light'), 'controls.modes');
    expect([...row].sort()).toEqual([...LIGHT_MODES].sort());
  });
});

describe('docs content', () => {
  it('every example YAML on the card pages has a known card type and a light, cover, fan or media player entity', () => {
    const types = Object.values(CARD_TYPES);
    for (const card of ['light', 'tile', 'badge', 'room']) {
      const text = source(`/cards/${card}`);
      for (const m of text.matchAll(/```yaml\n([\s\S]*?)```/g)) {
        const t = /type:\s*(\S+)/.exec(m[1])?.[1];
        expect(types, `${card}: ${t}`).toContain(t);
        for (const e of m[1].matchAll(/\b(entity|power_entity):\s*(\S+)/g)) expect(e[2], card).toMatch(e[1] === 'power_entity' ? /^light\.[a-z0-9_]+$/ : /^(light|cover|fan|media_player)\.[a-z0-9_]+$/);
      }
    }
  });

  it('names the picker entries exactly as the cards register them', () => {
    const start = source('/getting-started');
    for (const entry of Object.values(PICKER)) expect(start, entry.name).toContain(entry.name);
    expect(start).toContain('badge picker');
  });

  it('every card page links back to the picker name', () => {
    for (const [card, entry] of Object.entries(PICKER)) expect(source(`/cards/${card}`), card).toContain(`"${entry.name}"`);
  });

  it('states the minimum Home Assistant version of hacs.json', () => {
    expect(source('/getting-started')).toContain(`Home Assistant ${hacs.homeassistant}`);
    expect(source('/')).not.toBeUndefined();
  });

  it('documents the writes: 300 ms throttle, hold of the sent value, release at 0 turns off', () => {
    const text = source('/cards/light');
    expect(text).toMatch(/300 ms/);
    expect(text).toMatch(/write_hold/);
    expect(text).toMatch(/0 %[^\n]*light\.turn_off/);
    expect(source('/cards/light')).toMatch(/`10`/);
  });

  it('theming names the shared variables, and says --lc-tint and look.tint do not apply', () => {
    const text = source('/theming');
    expect(text).toContain('`--lc-blur`');
    expect(text).toContain('`--lc-radius`');
    expect(text).toMatch(/`--lc-tint`\s*\|\s*No effect/);
    expect(text).toMatch(/no `look\.tint`/i);
  });

  it('has no em-dash or en-dash anywhere in the docs sources', () => {
    for (const [file, md] of Object.entries(pages)) expect(md, file).not.toMatch(/[\u2013\u2014]/);
    expect(docsConfig).not.toMatch(/[\u2013\u2014]/);
  });
});

describe('media docs match the code constants', () => {
  it('names the throttle, the seek echo window, the track restart rule and the step size', () => {
    const text = source('/cards/media');
    expect(text).toContain(`${MEDIA_THROTTLE_MS} ms`);
    expect(text).toMatch(new RegExp(`within ${SEEK_ECHO_S} s`));
    expect(text).toMatch(new RegExp(`under ${TRACK_RESTART_S} s`));
    expect(text).toContain(`${VOLUME_STEP_PERCENT} %`);
    expect(source('/cards/tile')).toContain(`${VOLUME_STEP_PERCENT} %`);
  });

  it('says where media players are covered on the other pages', () => {
    expect(source('/cards/room')).toContain('media_player');
    expect(source('/troubleshooting')).toMatch(/media player without an area/);
    expect(source('/troubleshooting')).toContain('entity_picture');
    expect(source('/theming')).toContain('faint tint');
    expect(source('/getting-started')).toContain('The seven cards');
  });
});

describe('docs base path', () => {
  it('DOCS_URL has no trailing slash and a one-segment path', () => {
    expect(DOCS_URL.endsWith('/')).toBe(false);
    expect(new URL(DOCS_URL).pathname).toMatch(/^\/[^/]+$/);
  });

  it('the VitePress base is the path of DOCS_URL with a trailing slash', async () => {
    vi.stubEnv('DOCS_BASE', '');
    vi.resetModules();
    const { default: config } = await import('../docs/.vitepress/config');
    vi.unstubAllEnvs();
    expect(config.base).toBe(`${new URL(DOCS_URL).pathname}/`);
  });
});

describe('docs media', () => {
  it('has a light and a dark still for every scene of the media pipeline, and the animations', () => {
    expect(SCENES).toEqual(['light', 'cover', 'fan', 'media', 'tile', 'badge', 'room']);
    for (const scene of SCENES as string[]) for (const theme of ['light', 'dark']) expect(media).toContain(`/media/${scene}-${theme}.png`);
    for (const name of Object.keys(ANIMATIONS)) {
      expect(media).toContain(`/media/${name}.webp`);
      expect(media).toContain(`/media/${name}.gif`);
    }
  });

  it('every /media/ reference in the pages is a file in docs/public/media', () => {
    let seen = 0;
    for (const [file, text] of Object.entries(pages)) {
      for (const m of text.matchAll(/\/media\/[\w./-]+/g)) {
        seen++;
        expect(media, `${file} references ${m[0]}`).toContain(m[0]);
      }
    }
    expect(seen).toBeGreaterThan(10);
  });

  it('every card page shows its light and dark still', () => {
    for (const card of ['light', 'cover', 'fan', 'media', 'tile', 'badge', 'room']) {
      const text = source(`/cards/${card}`);
      expect(text, card).toContain(`/media/${card}-light.png`);
      expect(text, card).toContain(`/media/${card}-dark.png`);
    }
  });

  it('every image has alt text', () => {
    for (const [file, md] of Object.entries(pages)) for (const m of md.matchAll(/<img\b[^>]*>/g)) expect(m[0], file).toMatch(/\balt="[^"]+"/);
  });
});

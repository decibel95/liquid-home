// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { HomeAssistant } from '@decibel95/liquid-core';
import './cards/sheet/stub-light-card';
import '../src/cards/light';
import '../src/cards/badge';
import '../src/cards/room';
import { CARD_TYPES, TAGS } from '../src/const';
import { LIGHT_FIXTURES, type LightFixtureName } from './fixtures/lights';
import { makeHass } from './cards/room/helpers';

/**
 * WCAG 2.5.3 (label in name), as axe-core's label-content-name-mismatch checks it: a control with an aria-label and
 * visible text must have every word of the visible text, in order, in its accessible name. Visible text is the text
 * nodes joined without separators (as axe joins them), leaving out visually hidden `.sr` text.
 */

/** axe curateTokens: NFKD, parentheticals out, everything but letters and digits is a separator, lower case. */
const tokens = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);

const contiguous = (name: string[], label: string[]) => name.some((_, i) => label.every((t, j) => name[i + j] === t));

function visibleText(el: Element): string {
  let out = '';
  for (const n of el.childNodes) {
    if (n.nodeType === 3) out += n.nodeValue ?? '';
    else if (n instanceof Element && !n.classList.contains('sr') && !(n as HTMLElement).hidden) out += visibleText(n);
  }
  return out;
}

/** Every labelled button with visible text in a card's shadow root, with its label and visible text. */
function labelled(card: HTMLElement) {
  return [...card.shadowRoot!.querySelectorAll('button[aria-label]')]
    .map((b) => ({ label: b.getAttribute('aria-label')!, text: visibleText(b).replace(/\s+/g, ' ').trim() }))
    .filter((x) => tokens(x.text).length > 0);
}

const mismatches = (card: HTMLElement) => labelled(card).filter((x) => !contiguous(tokens(x.label), tokens(x.text)));

function hassOf(): HomeAssistant {
  const states = Object.fromEntries(Object.values(LIGHT_FIXTURES).map((make) => { const s = make(); return [s.entity_id, s]; }));
  return { states, entities: {}, devices: {}, areas: {}, language: 'en', locale: { language: 'en' }, themes: { darkMode: true }, callService: async () => {} } as unknown as HomeAssistant;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('accessible names hold the visible text (WCAG 2.5.3)', () => {
  it('the checker catches the old chip markup and accepts the spaced one (self check)', () => {
    const old = document.createElement('div');
    old.innerHTML = '<button aria-label="Ceiling Lights: 71%"><span class="k">Ceiling Lights</span><span class="v">71%</span></button>';
    const spaced = document.createElement('div');
    spaced.innerHTML = '<button aria-label="Ceiling Lights: 71%"><span class="k">Ceiling Lights</span> <span class="v">71%</span></button>';
    const check = (d: HTMLElement) => contiguous(tokens('Ceiling Lights: 71%'), tokens(visibleText(d.firstElementChild!)));
    expect([check(old), check(spaced)]).toEqual([false, true]);
  });

  it.each(Object.keys(LIGHT_FIXTURES) as LightFixtureName[])('light card, %s: member chips, effect chip, power and modes', async (name) => {
    const card = document.createElement(TAGS.light) as HTMLElement & { setConfig(c: unknown): void; hass?: HomeAssistant; updateComplete: Promise<boolean> };
    card.setConfig({ type: CARD_TYPES.light, entity: LIGHT_FIXTURES[name]().entity_id });
    card.hass = hassOf();
    document.body.append(card);
    await card.updateComplete;
    expect(mismatches(card)).toEqual([]);
  });

  it('the group chips and the effect chip are checked (they carry aria-labels)', async () => {
    const hass = hassOf();
    const ids = [LIGHT_FIXTURES.group().entity_id, LIGHT_FIXTURES.effectList().entity_id];
    const checked: string[] = [];
    for (const entity of ids) {
      const card = document.createElement(TAGS.light) as HTMLElement & { setConfig(c: unknown): void; hass?: HomeAssistant; updateComplete: Promise<boolean> };
      card.setConfig({ type: CARD_TYPES.light, entity });
      card.hass = hass;
      document.body.append(card);
      await card.updateComplete;
      checked.push(...labelled(card).filter((x) => x.label.includes(':')).map((x) => `${x.label} | ${x.text}`));
    }
    expect(checked).toEqual(
      expect.arrayContaining(['Ceiling Lights: 71% | Ceiling Lights 71%', 'Effect: Rainbow | Effect Rainbow']),
    );
  });

  it.each(Object.keys(LIGHT_FIXTURES) as LightFixtureName[])('badge (pill), %s', async (name) => {
    const badge = document.createElement(TAGS.badge) as HTMLElement & { setConfig(c: unknown): void; hass?: HomeAssistant; updateComplete: Promise<boolean> };
    badge.setConfig({ type: CARD_TYPES.badge, entity: LIGHT_FIXTURES[name]().entity_id, tap_action: 'sheet' });
    badge.hass = hassOf();
    document.body.append(badge);
    await badge.updateComplete;
    expect(labelled(badge)).toHaveLength(1);
    expect(mismatches(badge)).toEqual([]);
  });

  it('room card tiles, strip and header (list and area sources)', async () => {
    const { hass, ids } = makeHass();
    for (const config of [{ entities: [ids.colourTemp, ids.off, ids.unavailable, ids.onOffOnly, ids.group] }, { area: 'living_room' }]) {
      const card = document.createElement(TAGS.room) as HTMLElement & { setConfig(c: unknown): void; hass?: HomeAssistant; updateComplete: Promise<boolean> };
      card.setConfig({ type: CARD_TYPES.room, ...config });
      card.hass = hass;
      document.body.append(card);
      await card.updateComplete;
      expect(labelled(card).length).toBeGreaterThan(3);
      expect(mismatches(card)).toEqual([]);
    }
  });
});

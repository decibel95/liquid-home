import type { HomeAssistant } from '@decibel95/liquid-core';
import { TAGS } from '../../src/const';
import type { LightFixtureName } from '../../test/fixtures/lights';
import { coverIds } from '../../test/covers/fixtures';
import { EXTRA } from '../../test/cards/tile/domains';
import type { SlotContext, SlotMount } from './types';
import { mediaIds } from '../../test/cards/media/fixtures';
import { COVER_SHOWN, FAN_SHOWN, MEDIA_SHOWN, domainCaption, domainSource, glassColumn, labelled } from './tile';

type Card = HTMLElement & { hass?: HomeAssistant; setConfig(c: Record<string, unknown>): void };

/** A pill and a round badge of `entity` in one labelled row. */
function badgeRow(parent: HTMLElement, label: string, entity: string, glass: 'dark' | 'light', hass: HomeAssistant, list: Card[]): void {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:10px';
  for (const icon_only of [false, true]) {
    const badge = document.createElement(TAGS.badge) as Card;
    badge.setConfig({ type: `custom:${TAGS.badge}`, entity, icon_only, tap_action: 'sheet', look: { glass } });
    badge.dataset.fixture = label;
    badge.dataset.entity = entity;
    badge.dataset.round = String(icon_only);
    badge.hass = hass;
    list.push(badge);
    row.append(badge);
  }
  labelled(parent, label, row);
}

/**
 * Long-name pill badges of each domain (the gate 3 fix: at 390 px the name ellipsizes and the page does not scroll
 * sideways). `container` gets one wrapping row per glass; the Playwright check mounts this into a 390 px page.
 */
export function mountLongNames(container: HTMLElement, ctx: SlotContext, glasses: readonly ('dark' | 'light')[] = ['dark', 'light']): void {
  const domains = domainSource(ctx);
  const lights: Card[] = [];
  const others: Card[] = [];
  // Names longer than a 390 px row: the fixture names, and longer ones through the `name` option.
  const LONG = 'Upstairs Guest Bathroom Skylight Over The Bathtub Left Side Near The Window';
  const items: [string, string, Record<string, unknown>][] = [
    [ctx.ids.colourHs, 'light', { name: `${LONG} Lights` }],
    [EXTRA.coverLong().entity_id, 'cover', {}],
    [coverIds.longName, 'cover', { name: `${LONG} Blind` }],
    [EXTRA.fanLong().entity_id, 'fan', {}],
    [EXTRA.fanLong().entity_id, 'fan', { name: `${LONG} Ceiling Fan` }],
  ];
  for (const glass of glasses) {
    const row = document.createElement('div');
    row.dataset.glass = glass;
    row.dataset.long = 'true';
    // A view's badge row: wrapping, as HA lays out badges.
    row.style.cssText = `display:flex;flex-wrap:wrap;gap:8px;padding:12px;border-radius:16px;background:${glass === 'dark' ? '#0b0e14' : '#e7e9ee'}`;
    for (const [entity, domain, extra] of items) {
      const badge = document.createElement(TAGS.badge) as Card;
      badge.setConfig({ type: `custom:${TAGS.badge}`, entity, tap_action: 'sheet', look: { glass }, ...extra });
      badge.dataset.entity = entity;
      badge.dataset.domain = domain;
      const hass = domain === 'light' ? ctx.hass : domains.hass;
      badge.hass = hass;
      (domain === 'light' ? lights : others).push(badge);
      row.append(badge);
    }
    container.append(row);
  }
  ctx.onHass((hass) => lights.forEach((c) => (c.hass = hass)));
  domains.onHass((hass) => others.forEach((c) => (c.hass = hass)));
}

/**
 * Long-name media pill badges, in their own wrapping row (`data-long-media`, so the gate 3 long-name rows keep their
 * five badges): the long-title fixture's name and a longer one through `name`, for the 390 px check (plan 2.6).
 */
function mountLongMedia(container: HTMLElement, hass: HomeAssistant, glass: 'dark' | 'light', list: Card[]): void {
  const row = document.createElement('div');
  row.dataset.glass = glass;
  row.dataset.longMedia = 'true';
  row.style.cssText = `display:flex;flex-wrap:wrap;gap:8px;padding:12px;border-radius:16px;background:${glass === 'dark' ? '#0b0e14' : '#e7e9ee'}`;
  for (const extra of [{}, { name: 'Upstairs Guest Bathroom Ceiling Speaker Over The Bathtub Left Side Near The Window' }]) {
    const badge = document.createElement(TAGS.badge) as Card;
    badge.setConfig({ type: `custom:${TAGS.badge}`, entity: mediaIds.long_title, tap_action: 'sheet', look: { glass }, ...extra });
    badge.dataset.entity = mediaIds.long_title;
    badge.dataset.domain = 'media';
    badge.hass = hass;
    list.push(badge);
    row.append(badge);
  }
  container.append(row);
}

/**
 * Dev harness slot of the badge: every light fixture state, then the cover, fan and media states of plan 2.6, on both
 * glasses, pill and round (icon_only), and the long-name rows. `?domain=light|cover|fan|media` shows one domain only,
 * `?glass=dark|light` one glass (for screenshots).
 */
export const mount: SlotMount = (ctx) => {
  const params = new URLSearchParams(location.search);
  const only = params.get('domain');
  const glasses = (['dark', 'light'] as const).filter((g) => !params.get('glass') || params.get('glass') === g);
  const lights: Card[] = [];
  const others: Card[] = [];
  const domains = domainSource(ctx);
  for (const glass of glasses) {
    const col = glassColumn(ctx.container, glass, `${glass} glass, pill and round (tap opens the sheet)`);
    if (!only || only === 'light') {
      for (const [name, id] of Object.entries(ctx.ids) as [LightFixtureName, string][]) badgeRow(col, name, id, glass, ctx.hass, lights);
    }
    if (!only || only === 'cover') {
      domainCaption(col, 'covers');
      for (const [label, id] of COVER_SHOWN) badgeRow(col, label, id, glass, domains.hass, others);
    }
    if (!only || only === 'fan') {
      domainCaption(col, 'fans');
      for (const [label, id] of FAN_SHOWN) badgeRow(col, label, id, glass, domains.hass, others);
    }
    if (!only || only === 'media') {
      domainCaption(col, 'media players');
      for (const [label, id] of MEDIA_SHOWN) badgeRow(col, label, id, glass, domains.hass, others);
      const long = document.createElement('div');
      col.append(long);
      mountLongMedia(long, domains.hass, glass, others);
    }
    domainCaption(col, 'long names');
    const long = document.createElement('div');
    col.append(long);
    mountLongNames(long, ctx, [glass]);
  }
  ctx.onHass((hass) => lights.forEach((c) => (c.hass = hass)));
  domains.onHass((hass) => others.forEach((c) => (c.hass = hass)));
};

import type { HassEntity, HomeAssistant } from '@decibel95/liquid-core';
import { TAGS } from '../../src/const';
import type { LightFixtureName } from '../../test/fixtures/lights';
import { coverIds } from '../../test/covers/fixtures';
import { createCoverSim } from '../../test/covers/sim';
import { applyFanCall, FAN_FIXTURES, fanIds, type FanState } from '../../test/fans/fixtures';
import { EXTRA } from '../../test/cards/tile/domains';
import { applyMediaCall, MEDIA_FIXTURES, mediaIds } from '../../test/cards/media/fixtures';
import type { SlotContext, SlotMount } from './types';

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

/** The cover states the tile and badge slots show (plan 2.6: every cover kind, the D-15 cases, moving, unavailable). */
export const COVER_SHOWN: [string, string][] = [
  ['position', coverIds.hall],
  ['position closed', coverIds.hallClosed],
  ['opening, STOP', coverIds.hallOpening],
  ['tilt-only', coverIds.pergola],
  ['position + tilt', coverIds.living],
  ['toggle closed', coverIds.kitchen],
  ['toggle open', coverIds.kitchenOpen],
  ['garage', coverIds.garage],
  ['garage opening', coverIds.garageOpening],
  ['D-15 position', EXTRA.positionOnly().entity_id],
  ['D-15 moving', EXTRA.positionStopOpening().entity_id],
  ['D-15 open only', EXTRA.openOnly().entity_id],
  ['D-15 tilt', EXTRA.tiltOpenOnly().entity_id],
  ['unavailable', coverIds.unavailable],
  ['long name', coverIds.longName],
];

/** The fan states the tile and badge slots show (plan 2.6: speed, preset, preset-only, on/off-only, no TURN bits). */
export const FAN_SHOWN: [string, string][] = [
  ['speed 67', fanIds.pct67],
  ['speed off', fanIds.off],
  ['preset Auto', fanIds.presetAuto],
  ['preset-only', fanIds.presetOnly],
  ['on/off-only', fanIds.onoff],
  ['no TURN bits', EXTRA.noTurn().entity_id],
  ['off, no TURN_ON', EXTRA.offNoTurnOn().entity_id],
  ['unavailable', fanIds.unavailable],
  ['long name', fanIds.longName],
];

/**
 * The media states the tile and badge slots show (plan 2.6): the real demo players, every fixture state, the volume
 * kinds, on/off-only, no artwork, a long title, grouped, sources, sound modes, shuffle and repeat.
 */
export const MEDIA_SHOWN: [string, string][] = [
  ['demo kitchen', mediaIds.kitchen],
  ['demo living room', mediaIds.living_room],
  ['demo lounge room', mediaIds.lounge_room],
  ['demo group', mediaIds.group],
  ['playing', mediaIds.playing],
  ['paused', mediaIds.paused],
  ['buffering', mediaIds.buffering],
  ['idle', mediaIds.idle],
  ['standby', mediaIds.standby],
  ['off', mediaIds.off],
  ['off, no TURN_ON', mediaIds.off_no_turn_on],
  ['unavailable', mediaIds.unavailable],
  ['unknown', mediaIds.unknown],
  ['muted 35', mediaIds.muted],
  ['volume 35', mediaIds.volume_mid],
  ['volume step', mediaIds.volume_step],
  ['on/off-only', mediaIds.onoff_only],
  ['on/off-only off', mediaIds.onoff_off],
  ['no artwork', mediaIds.no_artwork],
  ['long title', mediaIds.long_title],
  ['grouped', mediaIds.grouped],
  ['tv sources', mediaIds.tv_sources],
  ['speaker modes', mediaIds.speaker_modes],
  ['shuffle repeat', mediaIds.shuffle_repeat],
];

/**
 * The hass for cover, fan and media tiles and badges: the harness hass with the cover sim on top (the gate 2 prototype's
 * simulated HA: echo 250 ms, motor 10 % per second), the fan fixtures (applied as HA's demo fan after 0.8 s) and the
 * derived EXTRA states (calls logged only) and the media fixtures (applied as a fake player after 0.8 s, as the media
 * slot). Every call is logged; the harness language is followed.
 */
export function domainSource(ctx: SlotContext): { readonly hass: HomeAssistant; onHass(l: (h: HomeAssistant) => void): void } {
  const log = (domain: string, service: string, data: Record<string, unknown>) =>
    ctx.log(`${new Date().toLocaleTimeString()}  ${domain}.${service} ${JSON.stringify(data)}`);
  const sim = createCoverSim({ travelMs: 4000, onCall: (c) => log(c.domain, c.service, c.data) });
  const fans: Record<string, FanState> = {};
  for (const make of Object.values(FAN_FIXTURES)) {
    const s = make();
    fans[s.entity_id] = s;
  }
  const extras: Record<string, HassEntity> = {};
  for (const make of Object.values(EXTRA)) {
    const s = make() as HassEntity;
    extras[s.entity_id] = s;
  }
  const players: Record<string, HassEntity> = {};
  for (const make of Object.values(MEDIA_FIXTURES)) {
    const s = make();
    players[s.entity_id] = s;
  }
  const listeners: ((h: HomeAssistant) => void)[] = [];
  let base = ctx.hass;
  let hass = base;
  const publish = () => {
    hass = {
      ...base,
      states: { ...base.states, ...sim.hass.states, ...(fans as unknown as Record<string, HassEntity>), ...extras, ...players },
      callService: async (domain: string, service: string, data: Record<string, unknown> = {}) => {
        const id = data.entity_id as string;
        if (domain === 'cover' && sim.hass.states[id]) return sim.hass.callService(domain, service, data);
        if (domain === 'fan' && fans[id]) {
          log(domain, service, data);
          setTimeout(() => {
            fans[id] = applyFanCall(fans[id], service, data);
            publish();
          }, 800);
          return;
        }
        if (domain === 'media_player' && players[id]) {
          log(domain, service, data);
          setTimeout(() => {
            players[id] = applyMediaCall(players[id], service, data);
            publish();
          }, 800);
          return;
        }
        if (extras[id]) return log(domain, service, data);
        return base.callService(domain, service, data);
      },
    } as HomeAssistant;
    for (const l of listeners) l(hass);
  };
  sim.onHass(publish);
  ctx.onHass((next) => {
    base = next;
    publish();
  });
  publish();
  return {
    get hass() {
      return hass;
    },
    onHass: (l) => listeners.push(l),
  };
}

/** A caption between the domains of a glass column. */
export function domainCaption(col: HTMLElement, label: string): void {
  const h = document.createElement('div');
  h.textContent = label;
  h.style.cssText = 'font-size:12px;opacity:.7;margin-top:8px';
  col.append(h);
}

/**
 * Dev harness slot of the tile: every light fixture state, then the cover, fan and media states of plan 2.6, on both
 * glasses. `?domain=light|cover|fan|media` shows one domain only, `?glass=dark|light` one glass (for screenshots).
 */
export const mount: SlotMount = (ctx) => {
  const params = new URLSearchParams(location.search);
  const only = params.get('domain');
  const glasses = (['dark', 'light'] as const).filter((g) => !params.get('glass') || params.get('glass') === g);
  const lights: Card[] = [];
  const others: Card[] = [];
  const domains = domainSource(ctx);
  const add = (col: HTMLElement, label: string, entity: string, glass: 'dark' | 'light', list: Card[], hass: HomeAssistant) => {
    const tile = document.createElement(TAGS.tile) as Card;
    tile.setConfig({ type: `custom:${TAGS.tile}`, entity, look: { glass } });
    tile.style.width = '420px';
    tile.dataset.fixture = label;
    tile.dataset.entity = entity;
    tile.hass = hass;
    list.push(tile);
    labelled(col, label, tile);
  };
  for (const glass of glasses) {
    const col = glassColumn(ctx.container, glass, `${glass} glass`);
    if (!only || only === 'light') {
      for (const [name, id] of Object.entries(ctx.ids) as [LightFixtureName, string][]) add(col, name, id, glass, lights, ctx.hass);
    }
    if (!only || only === 'cover') {
      domainCaption(col, 'covers');
      for (const [label, id] of COVER_SHOWN) add(col, label, id, glass, others, domains.hass);
    }
    if (!only || only === 'fan') {
      domainCaption(col, 'fans');
      for (const [label, id] of FAN_SHOWN) add(col, label, id, glass, others, domains.hass);
    }
    if (!only || only === 'media') {
      domainCaption(col, 'media players');
      for (const [label, id] of MEDIA_SHOWN) add(col, label, id, glass, others, domains.hass);
    }
  }
  ctx.onHass((hass) => lights.forEach((c) => (c.hass = hass)));
  domains.onHass((hass) => others.forEach((c) => (c.hass = hass)));
};

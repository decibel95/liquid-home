import type { HomeAssistant } from '@decibel95/liquid-core';
import { t } from '../../i18n';
import { isLightEntity } from '../../lights';
import { isCoverEntity } from '../../covers';
import { isFanEntity } from '../../fans';
import { isMediaEntity } from '../../media';
import { DEFAULT_DOMAINS, ROOM_DOMAINS, roomEntries, type RoomConfig, type RoomDomain } from './config';

/** The registries a room reads: the same ones the Liquid Climate cluster groups its rooms by. */
type Registries = Pick<HomeAssistant, 'states' | 'entities' | 'devices' | 'areas'>;

export interface RoomMember {
  entity: string;
  /** The `name` override from `entities`, else the friendly name, else the entity id. */
  name: string;
}

/** A light entity id: the one check of the light domain (src/lights). */
export const isLight = isLightEntity;

/** The room domain of an entity id (light, cover, fan or media_player), or undefined for any other entity. */
export function domainOf(id: unknown): RoomDomain | undefined {
  if (isLightEntity(id)) return 'light';
  if (isCoverEntity(id)) return 'cover';
  if (isFanEntity(id)) return 'fan';
  if (isMediaEntity(id)) return 'media_player';
  return undefined;
}

/**
 * Why a `list` entry cannot be a member of a room with these domains, as the setConfig error: the entity's own domain
 * when it is a cover, fan or media player the room does not show, else the domains the room accepts. Undefined when it is fine.
 */
export function entryError(id: string, domains: readonly RoomDomain[] = DEFAULT_DOMAINS): string | undefined {
  const d = domainOf(id);
  if (d && domains.includes(d)) return undefined;
  if (d) return `"${id}" in entities is a ${d}, and domains does not include ${d}`;
  const allowed = ROOM_DOMAINS.filter((x) => domains.includes(x));
  const list = allowed.length > 1 ? `${allowed.slice(0, -1).join(', ')} or ${allowed[allowed.length - 1]}` : allowed[0];
  return `"${id}" in entities is not a ${list}`;
}

/** The entity's own area, else its device's area (as the Liquid Climate cluster's areaOf). */
export function areaOf(hass: Partial<Registries>, entityId: string): string | undefined {
  const e = hass.entities?.[entityId];
  if (e?.area_id) return e.area_id;
  const device = e?.device_id ? hass.devices?.[e.device_id] : undefined;
  return device?.area_id ?? undefined;
}

/** Hidden or disabled in the entity registry. */
export function isHiddenEntity(hass: Partial<Registries>, entityId: string): boolean {
  const e = hass.entities?.[entityId];
  return !!e && (e.hidden === true || !!e.hidden_by || !!e.disabled_by);
}

export function entityName(hass: Partial<Registries>, entityId: string): string {
  return hass.states?.[entityId]?.attributes.friendly_name || hass.entities?.[entityId]?.name || entityId;
}

const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });

/**
 * The members of an area: every visible entity of an allowed domain whose own area or whose device's area is `area`,
 * grouped by domain (lights, covers, fans, media players), each group by name. The configured `power_entity` is left out, since the
 * header button already stands for it.
 */
function areaEntities(hass: Partial<Registries>, area: string, skip: string[], domains: readonly RoomDomain[] = DEFAULT_DOMAINS): string[] {
  const ids = new Set([...Object.keys(hass.states ?? {}), ...Object.keys(hass.entities ?? {})]);
  const rank = (id: string) => domains.indexOf(domainOf(id)!);
  return [...ids]
    .filter((id) => rank(id) >= 0 && !skip.includes(id) && !isHiddenEntity(hass, id) && areaOf(hass, id) === area)
    .sort((a, b) => rank(a) - rank(b) || byText(entityName(hass, a), entityName(hass, b)) || (a < b ? -1 : 1));
}

/**
 * The room's members in display order, of the configured `domains` only (default lights, as 0.2). `list`: the
 * `entities` in their own order. `area`: every entity of those domains in the area (its own area or its device's),
 * lights first, then covers, then fans, then media players, minus `exclude` and the power entity. No area and no entities: none, and the
 * card shows its placeholder.
 */
export function roomMembers(hass: Partial<Registries>, cfg: Pick<RoomConfig, 'source' | 'area' | 'entities' | 'exclude' | 'power_entity' | 'domains'>): RoomMember[] {
  const exclude = cfg.exclude ?? [];
  const domains = cfg.domains ?? DEFAULT_DOMAINS;
  if (cfg.source === 'list') {
    return roomEntries(cfg)
      .filter((e) => domains.includes(domainOf(e.entity)!) && !exclude.includes(e.entity))
      .map((e) => ({ entity: e.entity, name: e.name || entityName(hass, e.entity) }));
  }
  if (!cfg.area) return [];
  const skip = [...exclude, ...(cfg.power_entity ? [cfg.power_entity] : [])];
  return areaEntities(hass, cfg.area, skip, domains).map((id) => ({ entity: id, name: entityName(hass, id) }));
}

/** Nothing to show yet: an area card without an area, or a list without entities (the "choose an area" placeholder). */
export function needsSetup(cfg: Pick<RoomConfig, 'source' | 'area' | 'entities'>): boolean {
  return cfg.source === 'list' ? roomEntries(cfg).length === 0 : !cfg.area;
}

/** The header title: `title`, else the area name (D-16), else "Lights". */
export function roomTitle(hass: Partial<Registries> & { language?: string }, cfg: Pick<RoomConfig, 'title' | 'source' | 'area'>): string {
  if (cfg.title) return cfg.title;
  if (cfg.source === 'area' && cfg.area) return hass.areas?.[cfg.area]?.name ?? cfg.area;
  return t(hass, 'room.title');
}

/** The first area, by name, that holds a light: the picker's stub config. */
export function firstAreaWithLights(hass: Partial<Registries> | undefined): string | undefined {
  if (!hass?.areas) return undefined;
  const areas = Object.values(hass.areas).sort((a, b) => byText(a.name, b.name) || (a.area_id < b.area_id ? -1 : 1));
  return areas.find((a) => areaEntities(hass, a.area_id, []).length > 0)?.area_id;
}

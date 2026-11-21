import type { HomeAssistant } from '@decibel95/liquid-core';
import { t } from '../../i18n';
import { isLightEntity } from '../../lights';
import { roomEntries, type RoomConfig } from './config';

/** The registries a room reads: the same ones the Liquid Climate cluster groups its rooms by. */
type Registries = Pick<HomeAssistant, 'states' | 'entities' | 'devices' | 'areas'>;

export interface RoomMember {
  entity: string;
  /** The `name` override from `entities`, else the friendly name, else the entity id. */
  name: string;
}

/** A light entity id: the one check of the light domain (src/lights). */
export const isLight = isLightEntity;

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
 * The lights of an area: every visible light whose own area or whose device's area is `area`, by name. The configured
 * `power_entity` is left out, since the header button already stands for it.
 */
function areaLights(hass: Partial<Registries>, area: string, skip: string[]): string[] {
  const ids = new Set([...Object.keys(hass.states ?? {}), ...Object.keys(hass.entities ?? {})]);
  return [...ids]
    .filter((id) => isLight(id) && !skip.includes(id) && !isHiddenEntity(hass, id) && areaOf(hass, id) === area)
    .sort((a, b) => byText(entityName(hass, a), entityName(hass, b)) || (a < b ? -1 : 1));
}

/**
 * The room's lights in display order. `list`: the `entities` in their own order (lights only). `area`: every light in
 * the area, minus `exclude` and the power entity. No area and no entities: none, and the card shows its placeholder.
 */
export function roomMembers(hass: Partial<Registries>, cfg: Pick<RoomConfig, 'source' | 'area' | 'entities' | 'exclude' | 'power_entity'>): RoomMember[] {
  const exclude = cfg.exclude ?? [];
  if (cfg.source === 'list') {
    return roomEntries(cfg)
      .filter((e) => isLight(e.entity) && !exclude.includes(e.entity))
      .map((e) => ({ entity: e.entity, name: e.name || entityName(hass, e.entity) }));
  }
  if (!cfg.area) return [];
  const skip = [...exclude, ...(cfg.power_entity ? [cfg.power_entity] : [])];
  return areaLights(hass, cfg.area, skip).map((id) => ({ entity: id, name: entityName(hass, id) }));
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
  return areas.find((a) => areaLights(hass, a.area_id, []).length > 0)?.area_id;
}

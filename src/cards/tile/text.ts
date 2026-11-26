import { num, type HassEntity, type HomeAssistant } from '@decibel95/liquid-core';
import { t } from '../../i18n';
import { isLightEntity, membersOn, type LightView } from '../../lights';
import { isCoverEntity } from '../../covers';
import { isFanEntity } from '../../fans';

/**
 * setConfig error of the tile and the badge: stays English (no hass yet when HA validates a config; see
 * CONTRIBUTING-translations.md). It starts with the 0.2 wording.
 */
export const ENTITY_ERROR = 'Choose a light entity (light.*), a cover (cover.*) or a fan (fan.*)';

/** The domains the generic tile and badge draw (plan 2.6); the tags stay generic (0.1 D-4). */
export type TileDomain = 'light' | 'cover' | 'fan';

/** The domain of an entity id the tile and badge accept, or undefined for any other id. */
export const tileDomain = (id: unknown): TileDomain | undefined =>
  isLightEntity(id) ? 'light' : isCoverEntity(id) ? 'cover' : isFanEntity(id) ? 'fan' : undefined;

/** "45%" through the core percent string, in the user's number format. */
export const percentText = (hass: HomeAssistant, pct: number): string => t(hass, 'core.percent', { value: num(hass, pct, 0) });

/** The short value: "45%", "On" (an on/off-only light), "Off", "--" for unavailable. The badge says "Unavailable" itself. */
export function valueText(hass: HomeAssistant, v: LightView): string {
  if (!v.available) return '--';
  if (!v.on) return t(hass, 'core.off');
  return v.level === null ? t(hass, 'tile.on') : percentText(hass, v.level);
}

/**
 * The tile subline: "Unavailable", "Off", "On", "On, 2631 K" in colour temperature, "2 of 3 on" for a group
 * (the approved canvas wording).
 */
export function statusText(hass: HomeAssistant, s: HassEntity | undefined, v: LightView | undefined, entity: string): string {
  if (!s || !v) return t(hass, 'tile.entityNotFound', { entity });
  if (!v.available) return t(hass, 'core.unavailable');
  if (v.group) return t(hass, 'tile.groupOn', { on: membersOn(hass.states, v), total: v.members.length });
  if (!v.on) return t(hass, 'core.off');
  if (v.kelvin !== null) return t(hass, 'tile.onKelvin', { kelvin: num(hass, Math.round(v.kelvin), 0) });
  return t(hass, 'tile.on');
}

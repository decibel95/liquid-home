import { num, type HassEntity, type HomeAssistant } from '@decibel95/liquid-core';
import { t } from '../../i18n';
import { membersOn, type LightView } from '../../lights';

/** setConfig error of the tile and the badge: stays English (no hass yet when HA validates a config; see CONTRIBUTING-translations.md). */
export const ENTITY_ERROR = 'Choose a light entity (light.*)';

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

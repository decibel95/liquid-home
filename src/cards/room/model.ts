import { num, type HassEntity, type HomeAssistant } from '@decibel95/liquid-core';
import { t } from '../../i18n';
import { colourOf, COLOUR_MODES, lightView, membersOn, neutralColour, type Glass, type LightPatch, type LightView } from '../../lights';
import type { RoomMember } from './members';

type Hass = Pick<HomeAssistant, 'states'> & { language?: string; locale?: { language?: string } };

/** What a room tile and the strip show for one light: the shared light view plus the room card's texts. */
export interface MemberView {
  member: RoomMember;
  stateObj?: HassEntity;
  /** The shared light view (src/lights), undefined when the entity does not exist. */
  light?: LightView;
  available: boolean;
  on: boolean;
  /** supported_color_modes is only onoff: no level, no steps (CHO-10). */
  onOffOnly: boolean;
  /** A light group (an entity_id list): drawn in the neutral (CHO-4). */
  group: boolean;
  /** Brightness percent 1 to 100 while on and dimmable, else null. */
  pct: number | null;
  /** Big tile text: the level, "On" for an on/off-only light, "Off", or "--" (CHO-11). */
  value: string;
  /** The unit after the level ("%"), empty otherwise. */
  unit: string;
  /** Footer and strip subline: "On", "On, 2631 K", "Off", "Unavailable", or "2 of 3 on" for a group. */
  status: string;
  /** Icon colour while on (COL-1, CHO-1 B, CHO-4); the card draws var(--lc-fg3) while off. */
  colour: string;
  /** Strip mode buttons: what the light supports and which one is active. */
  white: boolean;
  colourMode: boolean;
  whiteActive: boolean;
  colourActive: boolean;
}

/**
 * The view of one member, from the shared light view (src/lights) with the shared writer's held and pending values
 * (`local`) on top, so a step or power change from any card shows here at once.
 */
export function memberView(hass: Hass, member: RoomMember, glass: Glass, local: LightPatch = {}): MemberView {
  const s = hass.states[member.entity];
  const v = s ? lightView(s, local) : undefined;
  const available = !!v?.available;
  const on = !!v?.on;
  const pct = v?.level ?? null;
  const value = !available ? '--' : !on ? t(hass, 'core.off') : pct === null ? t(hass, 'room.on') : String(pct);
  let status: string;
  if (!v || !available) status = t(hass, 'core.unavailable');
  else if (v.group) status = t(hass, 'room.summary', { n: membersOn(hass.states, v), total: v.members.length });
  else if (!on) status = t(hass, 'core.off');
  else status = v.kelvin !== null ? t(hass, 'room.onKelvin', { kelvin: num(hass as HomeAssistant, Math.round(v.kelvin), 0) }) : t(hass, 'room.on');
  const whiteActive = on && v!.colorMode === 'color_temp';
  return {
    member,
    stateObj: s,
    light: v,
    available,
    on,
    onOffOnly: !!v?.onoff,
    group: !!v?.group,
    pct,
    value,
    unit: pct === null ? '' : '%',
    status,
    colour: v ? colourOf(v, glass) : neutralColour(glass),
    white: !!v?.supportsWhite,
    colourMode: !!v?.supportsColour,
    whiteActive,
    colourActive: on && !whiteActive && !!v?.supportsColour && COLOUR_MODES.includes(v!.colorMode ?? ''),
  };
}

/** "2 of 3 on": members on out of all members, as the prototype's room header. */
export function roomSummary(hass: Hass, views: MemberView[]): string {
  return t(hass, 'room.summary', { n: views.filter((v) => v.on).length, total: views.length });
}

/** The single call the header power button sends, or null when there is nothing to switch. */
export interface PowerCall {
  service: 'turn_on' | 'turn_off';
  entity_id: string | string[];
}

/**
 * The header power button (plan 2.5, prototype `RM.pwr`). The room counts as on when its `power_entity` is on, or,
 * without one (or while that entity has no on/off state yet), when any member is on: the rule of a Home Assistant light
 * group and of the prototype's group view. A press while on turns everything off, otherwise everything on, in ONE call:
 * to `power_entity` when set, else to every available member at once. Unavailable members are left out of the call
 * (Home Assistant skips them anyway); with none available, or an unavailable power entity, the button is disabled.
 */
export function powerState(hass: Hass, views: MemberView[], powerEntity?: string): { on: boolean; disabled: boolean; call: PowerCall | null } {
  const ps = powerEntity ? hass.states[powerEntity] : undefined;
  const known = ps?.state === 'on' || ps?.state === 'off';
  const on = powerEntity && known ? ps!.state === 'on' : views.some((v) => v.on);
  const service = on ? 'turn_off' : 'turn_on';
  if (powerEntity) {
    const disabled = !ps || ps.state === 'unavailable';
    return { on, disabled, call: disabled ? null : { service, entity_id: powerEntity } };
  }
  const ids = views.filter((v) => v.available).map((v) => v.member.entity);
  return { on, disabled: ids.length === 0, call: ids.length ? { service, entity_id: ids } : null };
}

import { num, PALETTE, tone, type HassEntity, type HomeAssistant, type ICONS } from '@decibel95/liquid-core';
import { t } from '../../i18n';
import { colourOf, COLOUR_MODES, lightView, membersOn, neutralColour, type Glass, type LightPatch, type LightView } from '../../lights';
import { coverColour, coverGlyph, coverSub, coverTileSub, hasPositionBit, isCoverActive, isCoverUnavailable, positionOf } from '../../covers';
import { fanColour, fanReadout, fanSub, fanView, type FanPatch, type FanView } from '../../fans';
import { isMediaLit, mediaStateWord, mediaTileSub, mediaView, type MediaPending, type MediaView } from '../../media';
import type { RoomMember } from './members';

type Hass = Pick<HomeAssistant, 'states'> & { language?: string; locale?: { language?: string } };

/** What every room tile shows, whatever the domain (P2-CHO-19): name, glyph, big value, status, on or off. */
interface TileView {
  member: RoomMember;
  stateObj?: HassEntity;
  /** The room tile glyph: bulb, blinds or door, fan, speaker. */
  glyph: keyof typeof ICONS;
  available: boolean;
  /** Counts for the summary and tints the icon: a light or fan on, a cover open or moving, a player playing or buffering (or an on/off-only player in on, isMediaLit). */
  on: boolean;
  /** Big tile text (the prototype's roomValue). */
  value: string;
  /** The unit after the value ("%"), empty otherwise. */
  unit: string;
  /** Footer and strip subline. */
  status: string;
  /** Icon colour while on; the card draws var(--lc-fg3) while off, closed or unavailable. */
  colour: string;
}

/** A cover member: the tile follows the motor (HA's position), never a held value (Q6 a). */
export interface CoverMemberView extends TileView {
  domain: 'cover';
}

/** A fan member, with the shared fan view (src/fans) and the writer's optimistic values on top. */
export interface FanMemberView extends TileView {
  domain: 'fan';
  /** The shared fan view, undefined when the entity does not exist. */
  fan?: FanView;
}

/** A media player member, with the shared media view (src/media) and the writer's pending values on top. */
export interface MediaMemberView extends TileView {
  domain: 'media_player';
  /** The shared media view; for a missing entity it reads as unavailable. */
  media: MediaView;
  /** The state word ("Playing", "Paused", "Off", "Unavailable"), the second part of the tile's aria label. */
  stateWord: string;
}

/** One member of any domain. */
export type RoomView = MemberView | CoverMemberView | FanMemberView | MediaMemberView;

/** What a room tile and the strip show for one light: the shared light view plus the room card's texts. */
export interface MemberView {
  domain: 'light';
  glyph: 'bulb';
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
    domain: 'light',
    glyph: 'bulb',
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

/**
 * A cover tile (prototype roomValue and roomSub): the position in percent on a cover that reports one, else the state
 * word; the tile subline with the tilt; blinds, or a door for the door, garage and gate classes (P2-CHO-7).
 */
export function coverMemberView(hass: Hass, member: RoomMember, glass: Glass): CoverMemberView {
  const s = hass.states[member.entity];
  const available = !isCoverUnavailable(s);
  const p = positionOf(s);
  const pct = available && hasPositionBit(s) && p !== null;
  return {
    domain: 'cover',
    member,
    stateObj: s,
    glyph: coverGlyph(s),
    available,
    on: isCoverActive(s),
    value: !available ? '--' : pct ? String(Math.round(p!)) : coverSub(hass, s),
    unit: pct ? '%' : '',
    status: coverTileSub(hass, s),
    colour: coverColour(glass),
  };
}

/**
 * A fan tile (prototype roomValue and roomSub): the card readout's value (the speed in percent, Off, the preset, On or
 * "--") with the shared writer's held and pending values (`local`) on top, and the fan subline.
 */
export function fanMemberView(hass: Hass, member: RoomMember, glass: Glass, local: FanPatch = {}): FanMemberView {
  const s = hass.states[member.entity];
  const v = s ? fanView(s, local) : undefined;
  const h = hass as HomeAssistant;
  const r = v ? fanReadout(h, v) : { big: '--', unit: '' };
  return {
    domain: 'fan',
    member,
    stateObj: s,
    fan: v,
    glyph: 'fan',
    available: !!v?.available,
    on: !!v?.on,
    value: r.big,
    unit: r.unit,
    status: v ? fanSub(h, v) : t(hass, 'core.unavailable'),
    colour: fanColour(glass),
  };
}

/**
 * A media player tile (P3-CHO-23): the speaker glyph, tinted in the neutral (P3-COL-1) while playing or buffering (or an
 * on/off-only player in on, isMediaLit: it counts as active); the
 * value is the volume in percent for a player with VOLUME_SET while it is on (active), else the state word, "--" while
 * unavailable; the footer is the tile subline. No artwork: the room keeps its single glass surface.
 */
export function mediaMemberView(hass: Hass, member: RoomMember, glass: Glass, pending?: MediaPending): MediaMemberView {
  const s = hass.states[member.entity];
  const v = mediaView(s, { entityId: member.entity, pending });
  const word = mediaStateWord(hass, v);
  const volume = v.available && v.kind === 'volume' && v.volume != null;
  return {
    domain: 'media_player',
    member,
    stateObj: s,
    media: v,
    stateWord: word,
    glyph: 'speaker',
    available: v.available,
    on: isMediaLit(v),
    value: !v.available ? '--' : volume ? String(v.volume) : word,
    unit: volume ? '%' : '',
    status: mediaTileSub(hass, v),
    colour: tone(PALETTE.neutral, glass),
  };
}

/**
 * The header summary (D-9, P3-CHO-25): a room of lights only keeps "2 of 3 on"; a room with a cover, a fan or a media
 * player reads "3 of 5 active", counting lights on, covers open or moving, fans on, and players playing or buffering (an on/off-only player in on counts).
 */
export function roomSummary(hass: Hass, views: RoomView[]): string {
  const key = views.every((v) => v.domain === 'light') ? 'room.summary' : 'room.summaryActive';
  return t(hass, key, { n: views.filter((v) => v.on).length, total: views.length });
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

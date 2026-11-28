import { LitElement, html, nothing, svg, type PropertyValues, type TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import {
  CHEVRON,
  CLUSTER_ICON,
  clusterChrome,
  ICONS,
  TINT,
  WriterLease,
  callEntityService,
  focusRing,
  glassTokens,
  hassNeedsRender,
  resolveGlass,
  rgba,
  type HomeAssistant,
} from '@decibel95/liquid-core';
import { defaultLook } from '../../config';
import { CARD_TYPES, TAGS } from '../../const';
import { t } from '../../i18n';
import { normalizeConfig as normalizeLightConfig, type LightCardConfig } from '../light/config';
import { defaultConfig as coverDefaults } from '../cover/config';
import { defaultConfig as fanDefaults } from '../fan/config';
import { defaultConfig as mediaDefaults } from '../media/config';
import { closeLightSheet, lightSheet, openEntitySheet, openLightSheet, reconfigureLightSheet, type EntitySheetConfig, type LightSheetOptions } from '../sheet/open';
import { DEFAULT_DOMAINS, normalizeConfig, roomEntries, type RoomConfig } from './config';
import { domainOf, entryError, firstAreaWithLights, isLight, needsSetup, roomMembers, roomTitle, type RoomMember } from './members';
import {
  coverMemberView,
  fanMemberView,
  mediaMemberView,
  memberView,
  powerState,
  roomSummary,
  type CoverMemberView,
  type FanMemberView,
  type MediaMemberView,
  type MemberView,
  type RoomView,
} from './model';
import { roomStyles } from './styles';
import { brightnessPatch, groupMembers, LIGHT_ERROR_KEY, lightWriters, neutralColour, stepLevel, type LightWriter } from '../../lights';
import { coverMode, coverWriters, rowActions, rowHidden, stepState as coverStepState, type CoverAction, type CoverWriter } from '../../covers';
import { fanView, fanWriters, powerDisabled, powerPatch, stepFan, stepState as fanStepState, type FanWriter } from '../../fans';
import { mediaWriters, type MediaState, type MediaWriter } from '../../media';

type Glass = 'dark' | 'light';
type AnyWriter = LightWriter | CoverWriter | FanWriter | MediaWriter;
/** The writers the room interacts through with a hold time (lights have none). */
type HoldWriter = CoverWriter | FanWriter | MediaWriter;

/** One registry per domain: the room, the tiles and the sheet of one entity share its writer (plan 2.4, 2.5). */
const REGISTRIES = { light: lightWriters, cover: coverWriters, fan: fanWriters, media_player: mediaWriters };
/** The hold time (`write_hold`) of each domain's card: the room has no option of its own and uses the card default. */
const HOLD = { cover: coverDefaults.write_hold, fan: fanDefaults.write_hold, media_player: mediaDefaults.write_hold };
/** Media states that draw Previous and Next (P3-CHO-6, as the media card's button row). */
const MEDIA_LIVE: readonly MediaState[] = ['playing', 'paused', 'buffering'];
/** Media states where Play sends media_play (GD4, the shared writer's rule). */
const MEDIA_PLAYABLE: readonly MediaState[] = ['paused', 'idle', 'on'];
/** Media states without volume steps (P3-CHO-17): off, standby (no volume reported) and unknown (the off layout). */
const MEDIA_NO_STEPS: readonly MediaState[] = ['off', 'standby', 'unknown'];
/** The cover row icons, as the cover card (src/cards/cover/card.ts). */
const ROW_ICONS = { open: ICONS.chevronUp, stop: ICONS.stop, close: ICONS.chevronDown };

/** A strip action button (cover Open, Stop, Close; fan power and Oscillate): the room's mode button. */
interface StripAction {
  icon: string;
  /** The power glyph draws at the step stroke, as the header power (the prototype's room strip). */
  stroke?: 'step';
  /** Previous: skip-forward mirrored (ICO-8, as the media card). */
  mirror?: boolean;
  label: string;
  disabled: boolean;
  /** Drawn with the active tint (cover Stop while moving, fan on, oscillating, Pause while playing). */
  active: boolean;
  /** aria-pressed on toggles (fan power, Oscillate); actions (cover row) have none. */
  pressed?: boolean;
  run: () => void;
}


/**
 * The room card (CHO-12): the Liquid Climate cluster card with lights as room tiles, the strip for the selected light and
 * a header power button for the room. One glass surface (the section); room tiles and buttons draw no glass of their own.
 */
export class LiquidHomeRoom extends LitElement {
  @property({ attribute: false }) hass!: HomeAssistant;
  @state() private _config?: RoomConfig;
  @state() private _tick = 0;
  /** The member the strip controls. Pinned during render (not a reactive state, so that is allowed). */
  private _selected?: string;
  /**
   * One lease per member: the product-wide writer of that light, cover, fan or media player (src/lights, src/covers,
   * src/fans, src/media), shared with tiles and the sheet.
   */
  private _leases = new Map<string, WriterLease<AnyWriter>>();
  private _watched: string[] = [];
  /** A failed header power call, spoken through the alert span. Emptied when the next press starts. */
  @state() private _powerError = '';

  // ---- Lovelace API ----------------------------------------------------

  setConfig(raw: Record<string, unknown>): void {
    if (!raw || typeof raw !== 'object') throw new Error('Liquid Home: invalid room card config');
    const next = normalizeConfig(raw);
    for (const e of roomEntries(next)) {
      const err = entryError(e.entity, next.domains);
      if (err) throw new Error(`Liquid Home: ${err}`);
    }
    if (next.power_entity && !isLight(next.power_entity)) throw new Error(`Liquid Home: power_entity "${next.power_entity}" is not a light`);
    this._config = next;
    this._watched = [];
    // The card this room opened follows the new config (its name override and look), or closes when the room no
    // longer holds that member (a list source without it, it is excluded now, or its domain left `domains`).
    const open = lightSheet()?.owner === this ? lightSheet()!.entity : undefined;
    if (open && this._stillMember(open)) reconfigureLightSheet(this, this.sheetConfig(open) as LightCardConfig);
    else if (open) closeLightSheet(this);
  }

  /** As the Liquid Climate cluster: the full section width, height from the content. */
  getGridOptions() {
    return { columns: 'full', rows: 'auto', min_columns: 12 };
  }

  /** About 330px in the wide layout (header, one row of room tiles, the strip) at 50px per unit. */
  getCardSize(): number {
    return 7;
  }

  static async getConfigElement(): Promise<HTMLElement> {
    return document.createElement(TAGS.roomEditor);
  }

  /** The first area with lights, so the picker preview shows a real room (D-16: the title follows the area name). */
  static getStubConfig(hass?: HomeAssistant): Record<string, unknown> {
    const area = firstAreaWithLights(hass);
    return { type: CARD_TYPES.room, source: 'area', ...(area ? { area } : {}), config_version: 1 };
  }

  override connectedCallback(): void {
    super.connectedCallback();
    // Re-attached (a dashboard edit, a view switch): render again so the leases released on disconnect come back.
    this.requestUpdate();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    // Releasing sends whatever is still pending, so a change is never lost.
    for (const lease of this._leases.values()) lease.release();
    this._leases.clear();
  }

  protected override shouldUpdate(changed: PropertyValues): boolean {
    if (changed.has('hass') && this.hass) for (const lease of this._leases.values()) lease.current?.observe(this.hass);
    if (!changed.has('hass') || changed.size > 1 || !this._config || !this._watched.length) return true;
    return hassNeedsRender(changed.get('hass') as HomeAssistant | undefined, this.hass, this._watched);
  }

  // ---- Members ---------------------------------------------------------

  /** The shared writer of a member, from the registry of its domain. */
  private _writer(entity: string): LightWriter | undefined;
  private _writer<W extends AnyWriter>(entity: string): W | undefined;
  private _writer(entity: string): AnyWriter | undefined {
    // Detached: no new leases (disconnectedCallback would not release them); read what exists.
    if (!this.isConnected) return this._leases.get(entity)?.current;
    let lease = this._leases.get(entity);
    if (!lease) {
      const registry = REGISTRIES[domainOf(entity) ?? 'light'] as unknown as ConstructorParameters<typeof WriterLease<AnyWriter>>[0];
      lease = new WriterLease<AnyWriter>(registry, () => this._tick++);
      this._leases.set(entity, lease);
    }
    const w = lease.get(entity);
    if (this.hass && !w.hass) w.hass = this.hass;
    return w;
  }

  /**
   * The writer of a cover, fan or media player this card is about to write through, with the hold time of that domain's
   * card (`write_hold`, default 10 s): the card that interacts sets it, as those cards do. The room has no option of
   * its own. A media writer also gets the latest hass, as the media card does before a gesture.
   */
  private _interacting<W extends HoldWriter>(entity: string): W | undefined {
    const w = this._writer<W>(entity);
    const d = domainOf(entity);
    if (!w || !d || d === 'light') return w;
    w.hold = HOLD[d];
    if (d === 'media_player' && this.hass) (w as MediaWriter).hass = this.hass;
    return w;
  }

  /** The view of one member, by its domain. */
  private _view(m: RoomMember, glass: Glass): RoomView {
    const d = domainOf(m.entity);
    if (d === 'cover') {
      this._writer(m.entity);
      return coverMemberView(this.hass, m, glass);
    }
    if (d === 'fan') return fanMemberView(this.hass, m, glass, this._writer<FanWriter>(m.entity)?.local);
    // The pending values are read fresh each render (H1 writer notes), so a step from any card shows here at once.
    if (d === 'media_player') return mediaMemberView(this.hass, m, glass, this._writer<MediaWriter>(m.entity)?.pending);
    return memberView(this.hass, m, glass, this._writer(m.entity)?.local);
  }

  /** Member views in display order. Releases the writers of members that left the room. */
  private _views(cfg: RoomConfig, glass: Glass): RoomView[] {
    const members = roomMembers(this.hass, cfg);
    const views = members.map((m) => this._view(m, glass));
    const ids = new Set(members.map((m) => m.entity));
    for (const [id, lease] of this._leases) {
      if (ids.has(id)) continue;
      lease.release();
      this._leases.delete(id);
    }
    const groupMembers = views.flatMap((v) => (v.domain === 'light' && v.group ? (v.stateObj!.attributes.entity_id as string[]) : []));
    this._watched = [...ids, ...groupMembers, ...(cfg.power_entity ? [cfg.power_entity] : [])];
    return views;
  }

  // ---- Interaction -----------------------------------------------------

  private _select(id: string) {
    if (this._selected === id) return;
    this._selected = id;
    this.requestUpdate();
  }

  /** The header power button: lights only (P2-CHO-17), `views` are the light members. */
  private _power(views: MemberView[]) {
    const p = powerState(this.hass, views, this._config?.power_entity);
    if (!p.call) return;
    // ONE call for the whole room (plan 2.5): the power entity, or every available member in one entity_id list.
    // First drop what the shared writers would still send, so a trailing step cannot turn a light back on.
    this._discardWrites(views);
    this._powerError = '';
    const title = this._config ? roomTitle(this.hass, this._config) : '';
    void callEntityService(this.hass, 'light', p.call.service, { entity_id: p.call.entity_id }).catch(() => {
      this._powerError = `${title}: ${t(this.hass, LIGHT_ERROR_KEY)}`;
    });
  }

  /**
   * Before the header power call: every member's shared writer (and the power entity's, when a card holds one) drops
   * its pending change, armed timer and held values (core EntityWriter.discard). Sends already issued still land.
   */
  private _discardWrites(views: MemberView[]) {
    for (const v of views) (this._leases.get(v.member.entity)?.current as LightWriter | undefined)?.discard();
    // The power entity and, for a group, its own members: another card (a tile, the sheet) may hold their writers.
    const pe = this._config?.power_entity;
    const others = pe ? [pe, ...groupMembers(this.hass.states[pe])] : [];
    for (const id of new Set(others)) {
      if (this._leases.has(id) || lightWriters.refs(id) === 0) continue;
      const w = lightWriters.acquire(id);
      w.discard();
      lightWriters.release(w);
    }
  }

  /** From the level as it is now (state plus anything held or pending), so quick presses before a render add up. */
  private _step(member: RoomMember, dir: 1 | -1) {
    const w = this._writer(member.entity);
    const v = memberView(this.hass, member, 'dark', w?.local);
    const next = v.light && stepLevel(v.light, dir);
    if (w && next) w.set(brightnessPatch(next));
  }

  /** A cover step (Q2 a): 10 % from the writer's baseline; taps coalesce into one call 500 ms after the last one. */
  private _coverStep(member: RoomMember, dir: 1 | -1) {
    this._interacting<CoverWriter>(member.entity)?.step(dir);
  }

  /** A discrete cover action (Open, Stop, Close): at once, ending every hold and pending step of the cover. */
  private _coverAct(member: RoomMember, action: CoverAction) {
    this._interacting<CoverWriter>(member.entity)?.act(action);
  }

  /** A fan step (Q7 b): from the view with this writer's pending step, throttled 300 ms plus a final call. */
  private _fanStep(member: RoomMember, dir: 1 | -1) {
    const w = this._interacting<FanWriter>(member.entity);
    const s = this.hass.states[member.entity];
    if (w && s) stepFan(w, fanView(s, w.local), dir);
  }

  /** Whether `entity` is still one of this room's lights under the current config (and hass, for an area source). */
  private _stillMember(entity: string): boolean {
    const cfg = this._config;
    if (!cfg) return false;
    if (this.hass) return roomMembers(this.hass, cfg).some((m) => m.entity === entity);
    return roomEntries(cfg).some((e) => e.entity === entity) && !(cfg.exclude ?? []).includes(entity);
  }

  /**
   * The card config for a member's sheet, by its domain: the light, cover, fan or media card with the member's entity,
   * its name override and this card's look.
   */
  sheetConfig(entity: string): EntitySheetConfig {
    const d = domainOf(entity);
    if (d !== 'cover' && d !== 'fan' && d !== 'media_player') return this.lightConfig(entity) as unknown as EntitySheetConfig;
    const entry = roomEntries(this._config ?? {}).find((e) => e.entity === entity);
    return { type: CARD_TYPES[d === 'media_player' ? 'media' : d], entity, ...(entry?.name ? { name: entry.name } : {}), look: this._config?.look };
  }

  /** The light card config for a member's sheet: its entity, its name override and this card's look. */
  lightConfig(entity: string): LightCardConfig {
    const entry = roomEntries(this._config ?? {}).find((e) => e.entity === entity);
    return normalizeLightConfig({
      type: CARD_TYPES.light,
      entity,
      ...(entry?.name ? { name: entry.name } : {}),
      look: this._config?.look,
    });
  }

  /**
   * The strip's name opens the member's card in the sheet, with History (plan 2.9); White and Colour open the light
   * card in that pill mode (as the prototype).
   */
  private _open(member: RoomMember, opts?: LightSheetOptions) {
    if (domainOf(member.entity) === 'light') openLightSheet(this, this.lightConfig(member.entity), opts);
    else openEntitySheet(this, this.sheetConfig(member.entity));
  }

  // ---- Rendering -------------------------------------------------------

  private _icon(path: string, { size, stroke }: { size: number; stroke: number }, mirror = false) {
    return svg`<svg class=${mirror ? 'i mirror' : 'i'} width=${size} height=${size} viewBox="0 0 24 24" stroke-width=${stroke} aria-hidden="true"><path d=${path}></path></svg>`;
  }

  /**
   * The room tile's name: the light, its big value and its status, in the order the tile shows them, so it holds every
   * word the tile shows (WCAG 2.5.3, "Kitchen Lights, 10%, On"). An unavailable light's "--" is left out. A media player
   * reads the same way (name, volume or state word, footer, "Kitchen, 100%, Artist, Title"), then the state word when
   * neither of those already says it (P3-CHO-23): the footer is the track, and the state is otherwise only the glyph's tint.
   */
  private _tileLabel(v: RoomView): string {
    if (v.domain === 'media_player') {
      const shown = v.available ? `${v.value}${v.unit}` : '';
      // Every visible piece stays, even a repeat (value and footer both "Paused"); only the added state word is dropped
      // when the value or the footer already says it.
      const seen = [shown, v.status];
      return [v.member.name, ...seen.filter(Boolean), ...(seen.includes(v.stateWord) ? [] : [v.stateWord])].join(', ');
    }
    return [v.member.name, ...(v.available ? [`${v.value}${v.unit}`] : []), v.status].join(', ');
  }

  private _roomTile(v: RoomView, selected: boolean) {
    return html`<button
      class="room press ${selected ? 'sel' : ''} ${v.available ? '' : 'unavail'}"
      aria-pressed=${selected ? 'true' : 'false'}
      aria-label=${this._tileLabel(v)}
      @click=${() => this._select(v.member.entity)}
    >
      <span class="rhead">
        <span class="rname">${v.member.name}</span>
        <span class="ricon" style=${styleMap({ color: v.on ? v.colour : 'var(--lc-fg3)' })}>${this._icon(ICONS[v.glyph], CLUSTER_ICON.room)}</span>
      </span>
      <span class="rv" aria-hidden="true"><span class="big">${v.value}</span>${v.unit ? html`<span class="deg">${v.unit}</span>` : nothing}</span>
      <span class="foot" title=${v.status}>${v.status}</span>
    </button>`;
  }

  private _modeButton(v: MemberView, kind: 'white' | 'colour') {
    const active = kind === 'white' ? v.whiteActive : v.colourActive;
    const shown = kind === 'white' ? v.white : v.colourMode;
    return html`<button
      class="press mode"
      ?hidden=${!shown}
      ?disabled=${!v.available}
      aria-label=${t(this.hass, kind === 'white' ? 'room.white' : 'room.colour')}
      aria-pressed=${active ? 'true' : 'false'}
      aria-haspopup="dialog"
      style=${styleMap({
        background: active ? rgba(v.colour, TINT.tile) : undefined,
        borderColor: active ? rgba(v.colour, TINT.tileEdge) : undefined,
        color: active ? 'var(--lc-bright)' : 'var(--lc-fg2)',
      })}
      @click=${() => this._open(v.member, { mode: kind })}
    >
      ${this._icon(kind === 'white' ? ICONS.sun : ICONS.rainbow, CLUSTER_ICON.mode)}
    </button>`;
  }

  /** A strip action: the room's mode button, with the active tint of the light mode buttons in the neutral (P2-COL-1). */
  private _actionButton(a: StripAction, colour: string) {
    const active = a.active && !a.disabled;
    return html`<button
      class="press mode"
      ?disabled=${a.disabled}
      aria-label=${a.label}
      aria-pressed=${a.pressed === undefined ? nothing : a.pressed ? 'true' : 'false'}
      style=${styleMap({
        background: active ? rgba(colour, TINT.tile) : undefined,
        borderColor: active ? rgba(colour, TINT.tileEdge) : undefined,
        color: active ? 'var(--lc-bright)' : 'var(--lc-fg2)',
      })}
      @click=${() => !a.disabled && a.run()}
    >
      ${this._icon(a.icon, a.stroke ? CLUSTER_ICON.step : CLUSTER_ICON.mode, a.mirror)}
    </button>`;
  }

  /**
   * The strip's minus and plus around the value (the light strip's steps, `aria-disabled` keeps focus). `text: null`
   * draws the two buttons without a value (a volume-step-only player: the card cannot read HA's level, P3-CHO-17).
   */
  private _steps(o: { label: string; text: string | null; minus: string; plus: string; minusOff: boolean; plusOff: boolean; step: (dir: 1 | -1) => void }) {
    return html`<div class="steps">
      <button class="press step" aria-label=${o.minus} aria-disabled=${o.minusOff ? 'true' : 'false'} @click=${() => !o.minusOff && o.step(-1)}>
        ${this._icon(ICONS.minus, CLUSTER_ICON.step)}
      </button>
      ${o.text === null ? nothing : html`<span class="target" aria-live="polite" aria-atomic="true"><span class="sr">${o.label} </span>${o.text}</span>`}
      <button class="press step" aria-label=${o.plus} aria-disabled=${o.plusOff ? 'true' : 'false'} @click=${() => !o.plusOff && o.step(1)}>
        ${this._icon(ICONS.plus, CLUSTER_ICON.step)}
      </button>
    </div>`;
  }

  /** The strip of any domain: the name button (opens the sheet with History), the actions and the steps. */
  private _stripFrame(v: RoomView, group: { label: string; buttons: TemplateResult[] } | null, steps: TemplateResult | typeof nothing) {
    const name = v.member.name;
    const err = this._leases.get(v.member.entity)?.current?.error;
    const verb = err ?? v.status;
    return html`<div class="strip ${group ? '' : 'nomodes'}" role="group" aria-label=${t(this.hass, 'room.controls', { name })}>
      <button class="who" aria-haspopup="dialog" aria-label=${t(this.hass, 'room.open', { name, state: verb })} @click=${() => this._open(v.member)}>
        <span class="wtext">
          <span class="sname">${name}</span>
          <span class="sverb ${err ? 'warn' : ''}">${verb}</span>
        </span>
        <span class="chev">${this._icon(CHEVRON, CLUSTER_ICON.chevron)}</span>
      </button>
      ${group ? html`<div class="modes" role="group" aria-label=${group.label}>${group.buttons}</div>` : nothing} ${steps}
    </div>`;
  }

  /**
   * A cover's strip (P2-CHO-18): Open, Stop, Close (each with its feature bit, disabled per HA canOpen and canClose,
   * Stop tinted while moving, the tilt forms on a tilt-only cover) and the 10 % steps through the shared writer.
   */
  private _coverStrip(v: CoverMemberView) {
    const s = v.stateObj;
    const mode = coverMode(s);
    const actions: StripAction[] = rowHidden(s, mode)
      ? []
      : rowActions(s, mode)
          .filter((a) => a.visible)
          .map((a) => ({ icon: ROW_ICONS[a.button], label: t(this.hass, a.label), disabled: a.disabled, active: a.active, run: () => this._coverAct(v.member, a.action) }));
    const w = this._leases.get(v.member.entity)?.current as CoverWriter | undefined;
    const st = coverStepState(s, w?.queue.pending);
    const colour = v.colour;
    const group = actions.length
      ? { label: t(this.hass, 'cover.action.group'), buttons: actions.map((a) => this._actionButton(a, colour)) }
      : null;
    const steps = st.show
      ? this._steps({
          label: t(this.hass, st.key === 'tilt_position' ? 'cover.readout.tilt' : 'cover.readout.position'),
          text: !v.available || st.value === null ? '--' : t(this.hass, 'core.percent', { value: Math.round(st.value) }),
          minus: t(this.hass, st.minusLabel),
          plus: t(this.hass, st.plusLabel),
          minusOff: st.minusDisabled,
          plusOff: st.plusDisabled,
          step: (dir) => this._coverStep(v.member, dir),
        })
      : nothing;
    return this._stripFrame(v, group, steps);
  }

  /**
   * A fan's strip (P2-CHO-18): power (with TURN_ON or TURN_OFF, gated as the fan card's power) and Oscillate (with its
   * bit), and the speed steps on a speed fan. Direction and presets stay on the card.
   */
  private _fanStrip(v: FanMemberView) {
    const f = v.fan;
    const name = v.member.name;
    const actions: StripAction[] = [];
    if (f?.hasPower) {
      actions.push({
        icon: ICONS.power,
        stroke: 'step',
        label: t(this.hass, 'fan.aria.power', { name }),
        disabled: powerDisabled(f),
        active: f.on,
        pressed: f.on,
        run: () => this._interacting<FanWriter>(v.member.entity)?.sendNow(powerPatch(!f.on)),
      });
    }
    if (f?.hasOscillate) {
      actions.push({
        icon: ICONS.swingH,
        label: t(this.hass, 'fan.row.oscillate'),
        disabled: !f.available,
        active: f.oscillating,
        pressed: f.oscillating,
        run: () => this._interacting<FanWriter>(v.member.entity)?.sendNow({ oscillating: !f.oscillating }),
      });
    }
    const group = actions.length ? { label: t(this.hass, 'fan.row.group'), buttons: actions.map((a) => this._actionButton(a, v.colour)) } : null;
    const st = f ? fanStepState(this.hass, f) : undefined;
    const steps = st?.show
      ? this._steps({
          label: t(this.hass, 'fan.readout.speed'),
          text: st.text,
          minus: t(this.hass, st.minusKey),
          plus: t(this.hass, st.plusKey),
          minusOff: st.minusDisabled,
          plusOff: st.plusDisabled,
          step: (dir) => this._fanStep(v.member, dir),
        })
      : nothing;
    return this._stripFrame(v, group, steps);
  }

  /** A light's strip: White and Colour (open the light card in that pill mode) and the brightness steps. */
  private _strip(v: MemberView) {
    const name = v.member.name;
    const modes = v.white || v.colourMode;
    const can = v.on && !v.onOffOnly && v.pct != null;
    const group = modes ? { label: t(this.hass, 'room.modeGroup', { name }), buttons: [this._modeButton(v, 'white'), this._modeButton(v, 'colour')] } : null;
    const steps = v.onOffOnly
      ? html`<div class="steps"><span class="target" aria-live="polite" aria-atomic="true">${v.value}</span></div>`
      : this._steps({
          label: t(this.hass, 'room.brightness'),
          text: `${v.value}${v.unit}`,
          minus: t(this.hass, 'room.stepDown'),
          plus: t(this.hass, 'room.stepUp'),
          minusOff: !can || v.pct! <= 1,
          plusOff: !can || v.pct! >= 100,
          step: (dir) => this._step(v.member, dir),
        });
    return this._stripFrame(v, group, steps);
  }

  /**
   * A media player's strip (P3-CHO-24): Previous, Play or Pause (Pause tinted while playing) and Next, each only with
   * its bit and by the media card's state rules, then the volume steps (P3-CHO-17) through the shared media writer. No
   * Mute, Source or Sound mode; nothing for an off or unknown player and for an on/off-only player (no transport).
   */
  private _mediaStrip(v: MediaMemberView) {
    const m = v.media;
    const id = v.member.entity;
    const name = v.member.name;
    const st = m.state;
    const available = m.available;
    const act = (run: (w: MediaWriter) => void) => () => {
      const w = this._interacting<MediaWriter>(id);
      if (w) run(w);
    };
    const actions: StripAction[] = [];
    const offLayout = available && (st === 'off' || st === 'unknown');
    if (!offLayout && m.kind !== 'onoff') {
      // Unavailable keeps every button of its bits, disabled (CHO-11), as the media card's row.
      const live = MEDIA_LIVE.includes(st) || !available;
      if (m.can.previous && live)
        actions.push({ icon: ICONS.skipForward, mirror: true, label: t(this.hass, 'media.button.previous'), disabled: !available, active: false, run: act((w) => w.previous()) });
      if (m.can.play || m.can.pause) {
        const pausing = st === 'playing' || st === 'buffering';
        actions.push({
          icon: pausing ? ICONS.pause : ICONS.play,
          label: t(this.hass, pausing ? 'media.button.pause' : 'media.button.play'),
          // Disabled whenever the shared writer would send nothing: buffering, a missing bit, standby.
          disabled: !available || st === 'buffering' || (pausing ? !m.can.pause : !m.can.play || !MEDIA_PLAYABLE.includes(st)),
          active: st === 'playing',
          run: act((w) => w.playPause()),
        });
      }
      if (m.can.next && live) actions.push({ icon: ICONS.skipForward, label: t(this.hass, 'media.button.next'), disabled: !available, active: false, run: act((w) => w.next()) });
    }
    const group = actions.length ? { label: t(this.hass, 'media.row.group'), buttons: actions.map((a) => this._actionButton(a, v.colour)) } : null;
    const stepKind = m.kind === 'volume' || m.kind === 'step';
    const steps =
      stepKind && !MEDIA_NO_STEPS.includes(st) && !(available && m.kind === 'volume' && m.volume == null)
        ? this._steps({
            label: t(this.hass, 'media.readout.volume'),
            text: m.kind === 'step' ? (available ? null : '--') : available && m.volume != null ? t(this.hass, 'core.percent', { value: m.volume }) : '--',
            minus: t(this.hass, 'media.aria.stepDown', { name }),
            plus: t(this.hass, 'media.aria.stepUp', { name }),
            minusOff: !m.can.stepDown,
            plusOff: !m.can.stepUp,
            step: (dir) => this._interacting<MediaWriter>(id)?.step(dir),
          })
        : nothing;
    return this._stripFrame(v, group, steps);
  }

  private _stripFor(v: RoomView) {
    if (v.domain === 'cover') return this._coverStrip(v);
    if (v.domain === 'fan') return this._fanStrip(v);
    if (v.domain === 'media_player') return this._mediaStrip(v);
    return this._strip(v);
  }

  protected override render(): TemplateResult {
    const cfg = this._config;
    if (!cfg || !this.hass) return html`<section class="cluster g-dark"></section>`;
    const glass = resolveGlass(cfg.look?.glass ?? 'theme', this.hass, this);
    const title = roomTitle(this.hass, cfg);
    const views = this._views(cfg, glass);
    // Pin the selection: the first light at first, and the first light again when the selected one left.
    const selected = views.find((v) => v.member.entity === this._selected) ?? views[0];
    this._selected = selected?.member.entity;
    const lights = views.filter((v): v is MemberView => v.domain === 'light');
    const power = powerState(this.hass, lights, cfg.power_entity);
    // P2-CHO-17: the header power switches lights only, so it shows only in a room with lights (or a power entity).
    const showPower = (cfg.domains ?? DEFAULT_DOMAINS).includes('light') && (lights.length > 0 || !!cfg.power_entity);
    const lightsOnly = (cfg.domains ?? DEFAULT_DOMAINS).every((d) => d === 'light');
    const powerName = (cfg.power_entity && this.hass.states[cfg.power_entity]?.attributes.friendly_name) || title;
    const neutral = neutralColour(glass);
    const w = selected ? this._leases.get(selected.member.entity)?.current : undefined;
    // Emptied while a new attempt is in flight, so the alert speaks again when that one fails too.
    // A media writer's discrete calls bypass its queue (H1 notes): its error is spoken without the sending check.
    const sending = selected?.domain !== 'media_player' && !!w && 'sending' in w && w.sending;
    const announce = w?.error && !sending ? `${selected!.member.name}: ${w.error}` : this._powerError;
    const setup = needsSetup(cfg);

    return html`
      <section class="cluster rim g-${glass} m-${cfg.look?.motion ?? 'rich'}" style=${styleMap({ '--_blur': `${cfg.look?.blur ?? defaultLook.blur}px` })} aria-label=${title}>
        <header>
          <div class="title">
            <h2>${title}</h2>
            ${views.length ? html`<span class="sum">${roomSummary(this.hass, views)}</span>` : nothing}
          </div>
          ${showPower
            ? html`<button
                class="press step power"
                aria-label=${t(this.hass, 'room.power', { name: powerName })}
                aria-pressed=${power.on ? 'true' : 'false'}
                ?disabled=${power.disabled}
                style=${styleMap({ background: power.on ? rgba(neutral, TINT.power) : undefined })}
                @click=${() => this._power(lights)}
              >
                ${this._icon(ICONS.power, CLUSTER_ICON.step)}
              </button>`
            : nothing}
        </header>
        ${views.length ? html`<div class="rooms">${views.map((v) => this._roomTile(v, v === selected))}</div>` : nothing}
        ${views.length ? nothing : html`<p class="empty">${t(this.hass, setup ? 'room.chooseArea' : lightsOnly ? 'room.empty' : 'room.emptyAny')}</p>`}
        ${selected ? this._stripFor(selected) : nothing}
      </section>
      <span class="sr" role="alert">${announce}</span>
    `;
  }

  static override styles = [glassTokens, focusRing, clusterChrome, roomStyles];
}

if (!customElements.get(TAGS.room)) customElements.define(TAGS.room, LiquidHomeRoom);

declare global {
  interface HTMLElementTagNameMap {
    'liquid-home-room': LiquidHomeRoom;
  }
}

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
import { closeLightSheet, lightSheet, openLightSheet, reconfigureLightSheet, type LightSheetOptions } from '../sheet/open';
import { normalizeConfig, roomEntries, type RoomConfig } from './config';
import { firstAreaWithLights, isLight, needsSetup, roomMembers, roomTitle, type RoomMember } from './members';
import { memberView, powerState, roomSummary, type MemberView } from './model';
import { roomStyles } from './styles';
import { brightnessPatch, groupMembers, LIGHT_ERROR_KEY, lightWriters, neutralColour, stepLevel, type LightWriter } from '../../lights';

type Glass = 'dark' | 'light';


/**
 * The room card (CHO-12): the Liquid Climate cluster card with lights as room tiles, the strip for the selected light and
 * a header power button for the room. One glass surface (the section); room tiles and buttons draw no glass of their own.
 */
export class LiquidHomeRoom extends LitElement {
  @property({ attribute: false }) hass!: HomeAssistant;
  @state() private _config?: RoomConfig;
  @state() private _tick = 0;
  /** The light the strip controls. Pinned during render (not a reactive state, so that is allowed). */
  private _selected?: string;
  /** One lease per member: the product-wide writer of that light (src/lights), shared with tiles and the sheet. */
  private _leases = new Map<string, WriterLease<LightWriter>>();
  private _watched: string[] = [];
  /** A failed header power call, spoken through the alert span. Emptied when the next press starts. */
  @state() private _powerError = '';

  // ---- Lovelace API ----------------------------------------------------

  setConfig(raw: Record<string, unknown>): void {
    if (!raw || typeof raw !== 'object') throw new Error('Liquid Home: invalid room card config');
    const next = normalizeConfig(raw);
    const bad = roomEntries(next).find((e) => !isLight(e.entity));
    if (bad) throw new Error(`Liquid Home: "${bad.entity}" in entities is not a light`);
    if (next.power_entity && !isLight(next.power_entity)) throw new Error(`Liquid Home: power_entity "${next.power_entity}" is not a light`);
    this._config = next;
    this._watched = [];
    // The light card this room opened follows the new config (its name override and look), or closes when the room
    // no longer holds that light (a list source without it, or it is excluded now).
    const open = lightSheet()?.owner === this ? lightSheet()!.entity : undefined;
    if (open && this._stillMember(open)) reconfigureLightSheet(this, this.lightConfig(open));
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

  private _writer(entity: string): LightWriter | undefined {
    // Detached: no new leases (disconnectedCallback would not release them); read what exists.
    if (!this.isConnected) return this._leases.get(entity)?.current;
    let lease = this._leases.get(entity);
    if (!lease) {
      lease = new WriterLease(lightWriters, () => this._tick++);
      this._leases.set(entity, lease);
    }
    const w = lease.get(entity);
    if (this.hass && !w.hass) w.hass = this.hass;
    return w;
  }

  /** Member views in display order. Releases the writers of lights that left the room. */
  private _views(cfg: RoomConfig, glass: Glass): MemberView[] {
    const members = roomMembers(this.hass, cfg);
    const views = members.map((m) => memberView(this.hass, m, glass, this._writer(m.entity)?.local));
    const ids = new Set(members.map((m) => m.entity));
    for (const [id, lease] of this._leases) {
      if (ids.has(id)) continue;
      lease.release();
      this._leases.delete(id);
    }
    const groupMembers = views.flatMap((v) => (v.group ? (v.stateObj!.attributes.entity_id as string[]) : []));
    this._watched = [...ids, ...groupMembers, ...(cfg.power_entity ? [cfg.power_entity] : [])];
    return views;
  }

  // ---- Interaction -----------------------------------------------------

  private _select(id: string) {
    if (this._selected === id) return;
    this._selected = id;
    this.requestUpdate();
  }

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
    for (const v of views) this._leases.get(v.member.entity)?.current?.discard();
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

  /** Whether `entity` is still one of this room's lights under the current config (and hass, for an area source). */
  private _stillMember(entity: string): boolean {
    const cfg = this._config;
    if (!cfg) return false;
    if (this.hass) return roomMembers(this.hass, cfg).some((m) => m.entity === entity);
    return roomEntries(cfg).some((e) => e.entity === entity) && !(cfg.exclude ?? []).includes(entity);
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

  /** The strip's name opens the light card; White and Colour open it in that pill mode (as the prototype). */
  private _open(member: RoomMember, opts?: LightSheetOptions) {
    openLightSheet(this, this.lightConfig(member.entity), opts);
  }

  // ---- Rendering -------------------------------------------------------

  private _icon(path: string, { size, stroke }: { size: number; stroke: number }) {
    return svg`<svg class="i" width=${size} height=${size} viewBox="0 0 24 24" stroke-width=${stroke} aria-hidden="true"><path d=${path}></path></svg>`;
  }

  /**
   * The room tile's name: the light, its big value and its status, in the order the tile shows them, so it holds every
   * word the tile shows (WCAG 2.5.3, "Kitchen Lights, 10%, On"). An unavailable light's "--" is left out.
   */
  private _tileLabel(v: MemberView): string {
    return [v.member.name, ...(v.available ? [`${v.value}${v.unit}`] : []), v.status].join(', ');
  }

  private _roomTile(v: MemberView, selected: boolean) {
    return html`<button
      class="room press ${selected ? 'sel' : ''} ${v.available ? '' : 'unavail'}"
      aria-pressed=${selected ? 'true' : 'false'}
      aria-label=${this._tileLabel(v)}
      @click=${() => this._select(v.member.entity)}
    >
      <span class="rhead">
        <span class="rname">${v.member.name}</span>
        <span class="ricon" style=${styleMap({ color: v.on ? v.colour : 'var(--lc-fg3)' })}>${this._icon(ICONS.bulb, CLUSTER_ICON.room)}</span>
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

  private _strip(v: MemberView) {
    const name = v.member.name;
    const err = this._leases.get(v.member.entity)?.current?.error;
    const verb = err ?? v.status;
    const modes = v.white || v.colourMode;
    const can = v.on && !v.onOffOnly && v.pct != null;
    return html`<div class="strip ${modes ? '' : 'nomodes'}" role="group" aria-label=${t(this.hass, 'room.controls', { name })}>
      <button class="who" aria-haspopup="dialog" aria-label=${t(this.hass, 'room.open', { name, state: verb })} @click=${() => this._open(v.member)}>
        <span class="wtext">
          <span class="sname">${name}</span>
          <span class="sverb ${err ? 'warn' : ''}">${verb}</span>
        </span>
        <span class="chev">${this._icon(CHEVRON, CLUSTER_ICON.chevron)}</span>
      </button>
      ${modes
        ? html`<div class="modes" role="group" aria-label=${t(this.hass, 'room.modeGroup', { name })}>
            ${this._modeButton(v, 'white')}${this._modeButton(v, 'colour')}
          </div>`
        : nothing}
      <div class="steps">
        ${v.onOffOnly
          ? html`<span class="target" aria-live="polite" aria-atomic="true">${v.value}</span>`
          : html`<button
                class="press step"
                aria-label=${t(this.hass, 'room.stepDown')}
                aria-disabled=${!can || v.pct! <= 1 ? 'true' : 'false'}
                @click=${() => this._step(v.member, -1)}
              >
                ${this._icon(ICONS.minus, CLUSTER_ICON.step)}
              </button>
              <span class="target" aria-live="polite" aria-atomic="true"
                ><span class="sr">${t(this.hass, 'room.brightness')} </span>${v.value}${v.unit}</span
              >
              <button
                class="press step"
                aria-label=${t(this.hass, 'room.stepUp')}
                aria-disabled=${!can || v.pct! >= 100 ? 'true' : 'false'}
                @click=${() => this._step(v.member, 1)}
              >
                ${this._icon(ICONS.plus, CLUSTER_ICON.step)}
              </button>`}
      </div>
    </div>`;
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
    const power = powerState(this.hass, views, cfg.power_entity);
    const powerName = (cfg.power_entity && this.hass.states[cfg.power_entity]?.attributes.friendly_name) || title;
    const neutral = neutralColour(glass);
    const w = selected ? this._leases.get(selected.member.entity)?.current : undefined;
    // Emptied while a new attempt is in flight, so the alert speaks again when that one fails too.
    const announce = w?.error && !w.sending ? `${selected!.member.name}: ${w.error}` : this._powerError;
    const setup = needsSetup(cfg);

    return html`
      <section class="cluster rim g-${glass} m-${cfg.look?.motion ?? 'rich'}" style=${styleMap({ '--_blur': `${cfg.look?.blur ?? defaultLook.blur}px` })} aria-label=${title}>
        <header>
          <div class="title">
            <h2>${title}</h2>
            ${views.length ? html`<span class="sum">${roomSummary(this.hass, views)}</span>` : nothing}
          </div>
          ${views.length || cfg.power_entity
            ? html`<button
                class="press step power"
                aria-label=${t(this.hass, 'room.power', { name: powerName })}
                aria-pressed=${power.on ? 'true' : 'false'}
                ?disabled=${power.disabled}
                style=${styleMap({ background: power.on ? rgba(neutral, TINT.power) : undefined })}
                @click=${() => this._power(views)}
              >
                ${this._icon(ICONS.power, CLUSTER_ICON.step)}
              </button>`
            : nothing}
        </header>
        ${views.length ? html`<div class="rooms">${views.map((v) => this._roomTile(v, v === selected))}</div>` : nothing}
        ${views.length ? nothing : html`<p class="empty">${t(this.hass, setup ? 'room.chooseArea' : 'room.empty')}</p>`}
        ${selected ? this._strip(selected) : nothing}
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

import { LitElement, html, nothing, svg, type PropertyValues, type TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import { ICONS, TINT, WriterLease, focusRing, glassTokens, hassNeedsRender, resolveGlass, rgba, tileChrome, type HomeAssistant } from '@decibel95/liquid-core';
import { TAGS } from '../../const';
import { t } from '../../i18n';
import { openLightSheet, reconfigureLightSheet } from '../sheet/open';
import { normalizeConfig, sheetConfig, type NormalizedTileConfig } from './config';
import { brightnessPatch, colourOf, groupMembers, isLightEntity, lightView, lightWriters, powerPatch, stepLevel, type LightView, type LightWriter } from '../../lights';
import { ENTITY_ERROR, percentText, statusText } from './text';

/**
 * Glass tile for a light (generic over domains; 0.1 implements lights). Power button with the entity colour tint at
 * the TINT levels, name and status, brightness step buttons (hidden for on/off-only lights, CHO-10). A tap on the
 * name opens the light card as a sheet. Sizes, radius, fonts and spacing are the Liquid Climate tile's.
 */
export class LiquidHomeTile extends LitElement {
  @property({ attribute: false }) hass!: HomeAssistant;
  @state() private _config?: NormalizedTileConfig;

  /** The product-wide light writer of this entity, shared with the light card, the room card and the sheet. */
  private _lease = new WriterLease<LightWriter>(lightWriters, () => this.requestUpdate());
  private _watched: string[] = [];

  /**
   * The shared writer of this tile's light. A disconnected tile never acquires: an update queued while it is off the
   * page would otherwise take the writer again after disconnectedCallback released it, and hold it for good.
   */
  private _writer(): LightWriter | undefined {
    const cfg = this._config;
    if (!cfg?.entity || !this.isConnected) return this._lease.current;
    const w = this._lease.get(cfg.entity);
    if (this.hass && !w.hass) w.hass = this.hass;
    return w;
  }

  /** The writer for an interaction, with this tile's hold time (the card that interacts sets it, as Liquid Climate). */
  private _interacting(): LightWriter | undefined {
    const w = this._writer();
    if (w && this._config) w.hold = this._config.write_hold;
    return w;
  }

  // ---- Lovelace API ----------------------------------------------------

  setConfig(raw: Record<string, unknown>): void {
    if (!raw || !isLightEntity(raw.entity)) throw new Error(ENTITY_ERROR);
    const next = normalizeConfig(raw);
    // Pending writes belong to the old entity: releasing its writer sends them.
    if (this._config && this._config.entity !== next.entity) {
      this._lease.release();
      this._watched = [];
    }
    this._config = next;
    reconfigureLightSheet(this, sheetConfig(next));
  }

  getGridOptions() {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  getCardSize(): number {
    return 2;
  }

  static async getConfigElement(): Promise<HTMLElement> {
    return document.createElement(TAGS.tileEditor);
  }

  static getStubConfig(hass: HomeAssistant): Record<string, unknown> {
    const entity = Object.keys(hass?.states ?? {}).find((id) => id.startsWith('light.')) ?? 'light.example';
    return { type: `custom:${TAGS.tile}`, entity, config_version: 1 };
  }

  override connectedCallback(): void {
    super.connectedCallback();
    // Re-attached (a dashboard edit, a view switch): render again, so the lease released on disconnect comes back.
    this.requestUpdate();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    // Do not lose a change the user already made: releasing the writer sends it.
    this._lease.release();
    // An open sheet closes itself when this tile leaves the page (core openFor), and stays on a synchronous move.
  }

  protected override shouldUpdate(changed: PropertyValues): boolean {
    if (changed.has('hass') && this._config && this.hass) this._writer()?.observe(this.hass);
    if (!changed.has('hass') || changed.size > 1 || !this._config) return true;
    const ids = this._watched.length ? this._watched : [this._config.entity];
    return hassNeedsRender(changed.get('hass') as HomeAssistant | undefined, this.hass, ids);
  }

  // ---- Interaction -----------------------------------------------------

  /** The light as shown now: the state with the shared writer's held and pending values on top. */
  private _view(): LightView | undefined {
    const cfg = this._config;
    const s = cfg ? this.hass?.states[cfg.entity] : undefined;
    return s ? lightView(s, this._writer()?.local) : undefined;
  }

  /** A power tap is a discrete action: sent at once, deduped and serialised with any step in flight. */
  private _power() {
    const v = this._view();
    if (v?.available) this._interacting()?.sendNow(powerPatch(!v.on));
  }

  /** Step buttons write through the shared throttle: the first tap at once, then at most one write per 300 ms. */
  private _step(dir: 1 | -1) {
    const v = this._view();
    const next = v && stepLevel(v, dir);
    if (next) this._interacting()?.set(brightnessPatch(next));
  }

  private _tap(e: Event) {
    const cfg = this._config;
    if (!cfg) return;
    if (cfg.tap_action === 'sheet') {
      // Focus the name first (Safari does not focus a clicked button), so focus returns to it on close.
      (e.currentTarget as HTMLElement | null)?.focus();
      openLightSheet(this, sheetConfig(cfg));
    } else if (cfg.tap_action === 'more-info') {
      this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId: cfg.entity }, bubbles: true, composed: true }));
    }
  }

  // ---- Rendering -------------------------------------------------------

  private _icon(path: string, size: number, sw: number) {
    return svg`<svg class="i" width=${size} height=${size} viewBox="0 0 24 24" stroke-width=${sw} aria-hidden="true"><path d=${path}></path></svg>`;
  }

  protected override render(): TemplateResult {
    const cfg = this._config;
    if (!cfg || !this.hass) return html`<article class="tile g-dark"><span class="sub">${t(this.hass, 'tile.loading')}</span></article>`;
    const stateObj = this.hass.states[cfg.entity];
    this._watched = [cfg.entity, ...groupMembers(stateObj)];
    const name = cfg.name || stateObj?.attributes.friendly_name || cfg.entity;
    const glassKind = resolveGlass(cfg.look?.glass ?? 'theme', this.hass, this);
    const v = this._view();
    const err = this._writer()?.error;
    const sub = statusText(this.hass, stateObj, v, cfg.entity);
    // COL-1: the lamp colour while on, no tint while off or unavailable.
    const tint = v?.on ? colourOf(v, glassKind) : null;
    const tap = cfg.tap_action;
    const level = v?.on ? v.level : null;

    const titles = html`<span class="name">${name}</span><span class="sub ${err ? 'err' : ''}">${err ?? sub}</span>`;
    const announce = err ? `${name}: ${err}` : '';

    return html`
      <article
        class="tile rim g-${glassKind}"
        style=${styleMap({ '--_blur': `${cfg.look.blur}px` })}
        aria-label=${t(this.hass, 'tile.ariaTile', { name })}
      >
        <button
          class="press power"
          aria-label=${t(this.hass, 'tile.power', { name })}
          aria-pressed=${v?.on ? 'true' : 'false'}
          ?disabled=${!v?.available}
          style=${styleMap({
            background: tint ? rgba(tint, TINT.tile) : undefined,
            borderColor: tint ? rgba(tint, TINT.tileEdge) : undefined,
            color: tint ? 'var(--lc-bright)' : 'var(--lc-fg2)',
          })}
          @click=${this._power}
        >
          ${this._icon(ICONS.bulb, 22, 1.9)}
        </button>
        ${tap === 'none'
          ? html`<div class="body">${titles}</div>`
          : html`<button class="body" aria-haspopup=${tap === 'sheet' ? 'dialog' : nothing} @click=${this._tap}>${titles}</button>`}
        ${v?.onoff
          ? nothing
          : html`<div class="steps">
              <button class="press step" aria-label=${t(this.hass, 'tile.stepDown')} ?disabled=${level === null || level <= 1} @click=${() => this._step(-1)}>
                ${this._icon(ICONS.minus, 16, 2.2)}
              </button>
              <span class="target" aria-live="polite">${level !== null ? percentText(this.hass, level) : html`<span aria-hidden="true">--</span>`}</span>
              <button class="press step" aria-label=${t(this.hass, 'tile.stepUp')} ?disabled=${level === null || level >= 100} @click=${() => this._step(1)}>
                ${this._icon(ICONS.plus, 16, 2.2)}
              </button>
            </div>`}
      </article>
      <span class="sr" aria-live="polite">${announce}</span>
    `;
  }

  static override styles = [glassTokens, focusRing, tileChrome];
}

declare global {
  interface HTMLElementTagNameMap {
    'liquid-home-tile': LiquidHomeTile;
  }
}

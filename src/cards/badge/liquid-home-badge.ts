import { LitElement, html, nothing, svg, type PropertyValues, type TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import { ICONS, TINT, badgeChrome, focusRing, glassTokens, hassNeedsRender, resolveGlass, rgba, type HassEntity, type HomeAssistant } from '@decibel95/liquid-core';
import { TAGS } from '../../const';
import { t } from '../../i18n';
import { openLightSheet, reconfigureLightSheet } from '../sheet/open';
import { colourOf, isLightEntity, lightView, offColour, type Glass } from '../../lights';
import { ENTITY_ERROR, valueText } from '../tile/text';
import { normalizeConfig, sheetConfig, type NormalizedBadgeConfig } from './config';

export type BadgeKind = 'unavailable' | 'off' | 'on';

export interface BadgeState {
  kind: BadgeKind;
  value: string;
  /** The status colour as drawn on the glass: the light's colour while on, status off grey otherwise. */
  color: string;
}

/**
 * What the badge shows for a light: the brightness while on ("On" for an on/off-only light), Off, or Unavailable.
 * Off and unavailable draw status off grey (CHO-11, as the climate badge); on draws the light's colour per COL-1
 * (entity colour for a colour light, the neutral for colour temperature, brightness-only, on/off-only and groups).
 */
export function badgeState(hass: HomeAssistant, s: HassEntity | undefined, glass: Glass): BadgeState {
  const v = s && lightView(s);
  if (!v?.available) return { kind: 'unavailable', value: t(hass, 'core.unavailable'), color: offColour(glass) };
  if (!v.on) return { kind: 'off', value: t(hass, 'core.off'), color: offColour(glass) };
  return { kind: 'on', value: valueText(hass, v), color: colourOf(v, glass) };
}

/** Glass status pill for a light, usable as a view badge and as a card (round when icon_only). */
export class LiquidHomeBadge extends LitElement {
  @property({ attribute: false }) hass!: HomeAssistant;
  /** Set by HA while the badge is shown in the badge editor. */
  @property({ type: Boolean }) preview = false;
  @state() private _config?: NormalizedBadgeConfig;

  setConfig(raw: Record<string, unknown>): void {
    if (!raw || !isLightEntity(raw.entity)) throw new Error(ENTITY_ERROR);
    this._config = normalizeConfig(raw);
    reconfigureLightSheet(this, sheetConfig(this._config));
  }

  getGridOptions() {
    return { columns: 4, rows: 1, min_columns: 2 };
  }

  getCardSize(): number {
    return 1;
  }

  static async getConfigElement(): Promise<HTMLElement> {
    return document.createElement(TAGS.badgeEditor);
  }

  static getStubConfig(hass: HomeAssistant): Record<string, unknown> {
    const entity = Object.keys(hass?.states ?? {}).find((id) => id.startsWith('light.')) ?? 'light.example';
    return { type: `custom:${TAGS.badge}`, entity, config_version: 1 };
  }

  protected override shouldUpdate(changed: PropertyValues): boolean {
    if (!changed.has('hass') || changed.size > 1 || !this._config) return true;
    return hassNeedsRender(changed.get('hass') as HomeAssistant | undefined, this.hass, [this._config.entity]);
  }

  private _tap(e: Event) {
    const cfg = this._config;
    if (!cfg) return;
    if (cfg.tap_action === 'sheet') {
      // Focus the badge first (Safari does not focus a clicked button), so focus returns to it on close.
      (e.currentTarget as HTMLElement | null)?.focus();
      openLightSheet(this, sheetConfig(cfg));
    } else if (cfg.tap_action === 'more-info') {
      this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId: cfg.entity }, bubbles: true, composed: true }));
    }
  }

  protected override render(): TemplateResult {
    const cfg = this._config;
    if (!cfg || !this.hass) return html``;
    const s = this.hass.states[cfg.entity];
    const name = cfg.name || s?.attributes.friendly_name || cfg.entity;
    const glassKind = resolveGlass(cfg.look?.glass ?? 'theme', this.hass, this);
    const st = badgeState(this.hass, s, glassKind);
    const tint = rgba(st.color, TINT.badge);
    const label = t(this.hass, 'badge.label', { name, value: st.value });
    const cls = `badge rim g-${glassKind} ${cfg.icon_only ? 'round' : 'pill'} k-${st.kind}`;
    const style = styleMap({
      '--_blur': `${cfg.look.blur}px`,
      // Icon only: the whole circle carries the status colour, layered over the glass base.
      backgroundImage: cfg.icon_only ? `linear-gradient(${tint}, ${tint})` : undefined,
    });

    const icon = html`<span class="ic" style=${styleMap({ backgroundColor: cfg.icon_only ? undefined : tint })}
      >${svg`<svg class="i" viewBox="0 0 24 24" stroke-width="2" aria-hidden="true"><path d=${ICONS.bulb}></path></svg>`}</span
    >`;
    // The space between name and value is a text node in a flex column: not drawn, but the visible text reads
    // "Kitchen Lights 71%", which the accessible name "Kitchen Lights: 71%" contains (WCAG 2.5.3).
    const extra = cfg.icon_only ? nothing : html`<span class="txt" aria-hidden="true"><span class="n">${name}</span> <span class="v">${st.value}</span></span>`;

    // The wrapper (display: contents) keeps every part inside an element, never at the template's top level.
    return html`<div class="wrap"
      >${cfg.tap_action === 'none'
        ? html`<div class=${cls} style=${style} role="img" aria-label=${label}>${icon}${extra}</div>`
        : html`<button class=${cls} style=${style} aria-label=${label} aria-haspopup=${cfg.tap_action === 'sheet' ? 'dialog' : nothing} @click=${this._tap}>${icon}${extra}</button>`}</div
    >`;
  }

  static override styles = [glassTokens, focusRing, badgeChrome];
}

declare global {
  interface HTMLElementTagNameMap {
    'liquid-home-badge': LiquidHomeBadge;
  }
}

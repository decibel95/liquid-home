import { LitElement, css, html, nothing, svg, type PropertyValues, type TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import { ICONS, PALETTE, TINT, badgeChrome, focusRing, glassTokens, hassNeedsRender, resolveGlass, rgba, tone, type HassEntity, type HomeAssistant } from '@decibel95/liquid-core';
import { TAGS } from '../../const';
import { t } from '../../i18n';
import { openEntitySheet, reconfigureLightSheet } from '../sheet/open';
import type { LightCardConfig } from '../light/config';
import { colourOf, lightView, offColour, type Glass } from '../../lights';
import { coverBadge, coverColour, coverGlyph, isCoverActive, isCoverUnavailable } from '../../covers';
import { fanBadge, fanColour, fanView } from '../../fans';
import { isMediaLit, mediaStateWord, mediaView } from '../../media';
import { ENTITY_ERROR, tileDomain, valueText } from '../tile/text';
import { normalizeConfig, sheetConfig, type NormalizedBadgeConfig } from './config';

export type BadgeKind = 'unavailable' | 'off' | 'on';

export interface BadgeState {
  kind: BadgeKind;
  value: string;
  /** The status colour as drawn on the glass: the entity's colour while on or open, status off grey otherwise. */
  color: string;
  /** The device glyph (an ICONS path): bulb, blinds or door (P2-CHO-7), fan, speaker. */
  glyph: string;
  /**
   * The round (icon only) badge carries the colour. Lights always (0.2); covers, fans and media players only while
   * open, moving, on or playing: closed, off, paused, idle and unavailable round badges are plain glass (P2-CHO-21
   * option B, P3-CHO-21).
   */
  roundTint: boolean;
}

/**
 * What the badge shows (P2-CHO-10). A light: the brightness while on ("On" for an on/off-only light), Off, or
 * Unavailable; on draws the light's colour per COL-1 (entity colour for a colour light, the neutral for colour
 * temperature, brightness-only, on/off-only and groups). A cover: 70%, Closed, Opening, Closing, Open (a toggle cover),
 * Unavailable. A fan: 67%, the preset (Auto), On, Off, Unavailable. A media player: its state word (P3-CHO-20 option
 * A). Covers and fans draw the fan_only neutral while open, moving or on (P2-COL-1), media players while playing or
 * buffering (P3-COL-1, P3-CHO-21). Off, closed, paused, idle and unavailable draw status off grey (CHO-11, P2-COL-2).
 */
export function badgeState(hass: HomeAssistant, s: HassEntity | undefined, glass: Glass, entity: string | undefined = s?.entity_id): BadgeState {
  // The domain comes from the configured entity id (as the tile), so a missing cover or fan keeps its own glyph.
  const domain = tileDomain(entity);
  if (domain === 'cover') {
    const on = isCoverActive(s);
    const kind: BadgeKind = isCoverUnavailable(s) ? 'unavailable' : on ? 'on' : 'off';
    return { kind, value: coverBadge(hass, s), color: on ? coverColour(glass) : offColour(glass), glyph: ICONS[coverGlyph(s)], roundTint: on };
  }
  if (domain === 'media') {
    // The state HA reports (a badge holds no writer); a missing player reads as unavailable.
    const v = mediaView(s, { entityId: entity });
    const on = isMediaLit(v);
    const kind: BadgeKind = !v.available ? 'unavailable' : on ? 'on' : 'off';
    return { kind, value: mediaStateWord(hass, v), color: on ? tone(PALETTE.neutral, glass) : offColour(glass), glyph: ICONS.speaker, roundTint: on };
  }
  if (domain === 'fan') {
    if (!s) return { kind: 'unavailable', value: t(hass, 'core.unavailable'), color: offColour(glass), glyph: ICONS.fan, roundTint: false };
    const v = fanView(s);
    const kind: BadgeKind = !v.available ? 'unavailable' : v.on ? 'on' : 'off';
    return { kind, value: fanBadge(hass, v), color: v.on ? fanColour(glass) : offColour(glass), glyph: ICONS.fan, roundTint: v.on };
  }
  const v = s && lightView(s);
  if (!v?.available) return { kind: 'unavailable', value: t(hass, 'core.unavailable'), color: offColour(glass), glyph: ICONS.bulb, roundTint: true };
  if (!v.on) return { kind: 'off', value: t(hass, 'core.off'), color: offColour(glass), glyph: ICONS.bulb, roundTint: true };
  return { kind: 'on', value: valueText(hass, v), color: colourOf(v, glass), glyph: ICONS.bulb, roundTint: true };
}

/**
 * Glass status pill for a light, a cover, a fan or a media player, usable as a view badge and as a card (round when
 * icon_only). A tap opens HA's more-info (default) or the entity's card as a sheet with History (Q9 a); it never
 * switches the device and never calls a media service, so it stays enabled while buffering (D-13). No artwork.
 */
export class LiquidHomeBadge extends LitElement {
  @property({ attribute: false }) hass!: HomeAssistant;
  /** Set by HA while the badge is shown in the badge editor. */
  @property({ type: Boolean }) preview = false;
  @state() private _config?: NormalizedBadgeConfig;

  setConfig(raw: Record<string, unknown>): void {
    if (!raw || !tileDomain(raw.entity)) throw new Error(ENTITY_ERROR);
    this._config = normalizeConfig(raw);
    reconfigureLightSheet(this, sheetConfig(this._config) as unknown as LightCardConfig);
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
      // The card of the entity's domain, with History for the entity (plan 2.9).
      openEntitySheet(this, sheetConfig(cfg));
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
    const st = badgeState(this.hass, s, glassKind, cfg.entity);
    const tint = rgba(st.color, TINT.badge);
    const label = t(this.hass, 'badge.label', { name, value: st.value });
    const cls = `badge rim g-${glassKind} ${cfg.icon_only ? 'round' : 'pill'} k-${st.kind}`;
    const style = styleMap({
      '--_blur': `${cfg.look.blur}px`,
      // Icon only: the whole circle carries the status colour, layered over the glass base (plain under option B).
      backgroundImage: cfg.icon_only && st.roundTint ? `linear-gradient(${tint}, ${tint})` : undefined,
    });

    const icon = html`<span class="ic" style=${styleMap({ backgroundColor: cfg.icon_only ? undefined : tint })}
      >${svg`<svg class="i" viewBox="0 0 24 24" stroke-width="2" aria-hidden="true"><path d=${st.glyph}></path></svg>`}</span
    >`;
    // The space between name and value is a text node in a flex column: not drawn, but the visible text reads
    // "Kitchen Lights 71%", which the accessible name "Kitchen Lights: 71%" contains (WCAG 2.5.3).
    const extra = cfg.icon_only ? nothing : html`<span class="txt" aria-hidden="true"><span class="n">${name}</span> <span class="v">${st.value}</span></span>`;

    // The wrapper (display: contents) keeps every part inside an element, never at the template's top level.
    return html`<div class="wrap"
      >${cfg.tap_action === 'none'
        ? html`<div class=${cls} style=${style} role="img" aria-label=${label}>${icon}${extra}</div>`
        : html`<button class=${cls} style=${style} aria-label=${label} aria-haspopup="dialog" @click=${this._tap}>${icon}${extra}</button>`}</div
    >`;
  }

  /**
   * Gate 3 fix: the pill lays out icon and text as a grid whose text column may shrink to 0 but never grows past the
   * text (keywords only, no new value). Its min-content is then the icon alone, so in HA's badge row
   * (`.badges>*{min-width:fit-content}`) a long name is capped at the row width and ellipsizes with the core `.n`
   * rule; a short name keeps its width.
   */
  static override styles = [
    glassTokens,
    focusRing,
    badgeChrome,
    css`
      .pill {
        display: grid;
        grid-template-columns: auto minmax(0, max-content);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'liquid-home-badge': LiquidHomeBadge;
  }
}

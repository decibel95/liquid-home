import { LitElement, css, html, nothing, svg, type PropertyValues, type TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import {
  ArtworkController,
  DISABLED_OPACITY,
  ICONS,
  PALETTE,
  TINT,
  UNAVAILABLE_POWER_OPACITY,
  WriterLease,
  artworkStyles,
  focusRing,
  glassTokens,
  hassNeedsRender,
  resolveGlass,
  renderArtwork,
  rgba,
  tileChrome,
  tone,
  type HassEntity,
  type HomeAssistant,
} from '@decibel95/liquid-core';
import { TAGS } from '../../const';
import { t } from '../../i18n';
import { openEntitySheet, reconfigureLightSheet } from '../sheet/open';
import type { LightCardConfig } from '../light/config';
import { normalizeConfig, sheetConfig, type NormalizedTileConfig } from './config';
import { brightnessPatch, colourOf, groupMembers, lightView, lightWriters, powerPatch, stepLevel, type LightWriter } from '../../lights';
import { coverColour, coverGlyph, coverTileSub, coverWriters, iconAction, isCoverActive, isCoverUnavailable, stepState as coverStepState, type CoverWriter } from '../../covers';
import { fanColour, fanIconAction, fanSub, fanView, fanWriters, powerPatch as fanPowerPatch, stepFan, stepState as fanStepState, type FanWriter } from '../../fans';
import { isMediaLit, mediaTileSub, mediaView, mediaWriters, type MediaState, type MediaView, type MediaWriter } from '../../media';
import { ENTITY_ERROR, percentText, statusText, tileDomain, type TileDomain } from './text';

type Glass = 'dark' | 'light';
type AnyWriter = LightWriter | CoverWriter | FanWriter | MediaWriter;

/** Media states where power sends turn_on (H1 writer): the icon taps power there, drawn not pressed (RH1 L6). */
const MEDIA_POWER_OFF: readonly MediaState[] = ['off', 'standby', 'unknown'];

/** What the media tile's icon does (P3-CHO-14): play or pause, power, or nothing (disabled, still a button, D-15). */
export interface MediaIconAction {
  action: 'play' | 'pause' | 'power';
  /** The media card string of the label: "Play, <name>", "Pause, <name>", "Switch <name>". */
  label: 'media.aria.play' | 'media.aria.pause' | 'media.aria.power';
  /** Power only: pressed while the player is on. */
  pressed?: boolean;
  disabled: boolean;
}

/**
 * The media tile icon (P3-CHO-14, GD4): play or pause by state (the label follows the action, no aria-pressed);
 * disabled while buffering. Without PLAY and PAUSE but with TURN_ON or TURN_OFF it is the power ("Switch <name>",
 * aria-pressed); an off, standby or unknown player with TURN_ON taps turn on. Neither bit: disabled. Unavailable:
 * disabled, the label of what it would do. An off, standby or unknown player with transport or power bits but no
 * TURN_ON gets a disabled Power ("Switch <name>"), not a disabled Play.
 */
export function mediaIconAction(v: MediaView): MediaIconAction {
  const transport = v.can.play || v.can.pause;
  const power = v.can.turnOn || v.can.turnOff;
  const pausing = v.state === 'playing' || v.state === 'buffering';
  const playPause = (disabled: boolean): MediaIconAction =>
    pausing ? { action: 'pause', label: 'media.aria.pause', disabled } : { action: 'play', label: 'media.aria.play', disabled };
  const powerAct = (disabled: boolean, pressed: boolean): MediaIconAction => ({ action: 'power', label: 'media.aria.power', pressed, disabled });
  if (!v.available) return transport || !power ? playPause(true) : powerAct(true, false);
  if (MEDIA_POWER_OFF.includes(v.state)) {
    if (v.can.turnOn) return powerAct(false, false);
    return transport || power ? powerAct(true, false) : playPause(true);
  }
  if (transport) return playPause(v.state === 'buffering' || (pausing ? !v.can.pause : !v.can.play));
  if (power) return powerAct(!v.can.turnOff, true);
  return playPause(true);
}

/** One step button: its aria label and whether it is disabled (drawn at 0.3 by the core tile chrome). */
interface StepPart {
  label: string;
  disabled: boolean;
}

/** What the tile draws for its entity, whatever the domain. */
interface TileParts {
  /** The device glyph (an ICONS path). */
  glyph: string;
  /** The tint colour while on, open, opening or closing; null draws the plain button (closed, off, unavailable). */
  tint: string | null;
  /** The icon: a button (power, toggle, toggle tilt or Stop) or, for a fan without TURN_ON and TURN_OFF, a plain icon. */
  icon: { button: boolean; label: string; pressed?: boolean; disabled: boolean };
  /** The entity is unavailable (or missing): the icon is drawn at the unavailable power opacity. */
  unavailable: boolean;
  sub: string;
  /** The steps, or null where they are hidden (on/off-only lights, toggle covers, toggle fans, media without volume). */
  steps: {
    value: string | null;
    /** The readout between the steps: drawn (default), drawn in fg2 (a muted media player, P3-CHO-19), or none (media step-only, P3-CHO-17). */
    readout?: 'plain' | 'muted' | 'none';
    minus: StepPart;
    plus: StepPart;
  } | null;
}

/** The tile's aria label per domain ("Kitchen Lights light", "Hall Window cover", "Living Room Fan fan"). */
const ARIA: Record<TileDomain, string> = { light: 'tile.ariaTile', cover: 'tile.ariaCover', fan: 'tile.ariaFan', media: 'tile.ariaMedia' };

/**
 * Glass tile for a light, a cover, a fan or a media player (plan 2.6; the tag stays generic). Icon button with the
 * entity colour tint at the TINT levels, name and status, step buttons (hidden on on/off-only lights, toggle covers,
 * toggle fans and media players without volume). The icon is the light's power, the cover's toggle, toggle tilt or Stop
 * (P2-CHO-8, D-15), the fan's power and the media player's play or pause (P3-CHO-14). A media tile draws the core
 * artwork-backdrop at the tile radius (P3-CHO-16). A tap on the name opens the card of the entity as a sheet, with
 * History. Sizes, radius, fonts and spacing are the Liquid Climate tile's.
 */
export class LiquidHomeTile extends LitElement {
  @property({ attribute: false }) hass!: HomeAssistant;
  @state() private _config?: NormalizedTileConfig;

  private _domain: TileDomain = 'light';
  /**
   * The product-wide writer of this entity, shared with the domain's card, the room card and the sheet: the light,
   * cover or fan registry by the entity's domain (a new lease when a config changes the domain).
   */
  private _lease: WriterLease<AnyWriter> = this._leaseFor('light');
  private _watched: string[] = [];
  /** The artwork-backdrop of a media tile (P3-CHO-16, GD5), created when a config first names a media player. */
  private _art?: ArtworkController;
  /** The media view of this update, computed once in willUpdate and read by render. */
  private _view?: MediaView;

  private _leaseFor(domain: TileDomain): WriterLease<AnyWriter> {
    const onChange = () => this.requestUpdate();
    if (domain === 'media') return new WriterLease<MediaWriter>(mediaWriters, onChange) as unknown as WriterLease<AnyWriter>;
    if (domain === 'cover') return new WriterLease<CoverWriter>(coverWriters, onChange) as unknown as WriterLease<AnyWriter>;
    if (domain === 'fan') return new WriterLease<FanWriter>(fanWriters, onChange) as unknown as WriterLease<AnyWriter>;
    return new WriterLease<LightWriter>(lightWriters, onChange) as unknown as WriterLease<AnyWriter>;
  }

  /**
   * The shared writer of this tile's entity. A disconnected tile never acquires: an update queued while it is off the
   * page would otherwise take the writer again after disconnectedCallback released it, and hold it for good.
   */
  private _writer(): AnyWriter | undefined {
    const cfg = this._config;
    if (!cfg?.entity || !this.isConnected) return this._lease.current;
    const w = this._lease.get(cfg.entity);
    if (this.hass && !w.hass) w.hass = this.hass;
    return w;
  }

  /** The writer for an interaction, with this tile's hold time (the card that interacts sets it, as Liquid Climate). */
  private _interacting(): AnyWriter | undefined {
    const w = this._writer();
    if (w && this._config) w.hold = this._config.write_hold;
    // A media call reads the writer's hass (H1 writer notes): always the latest.
    if (w && this._domain === 'media' && this.hass) w.hass = this.hass;
    return w;
  }

  // ---- Lovelace API ----------------------------------------------------

  setConfig(raw: Record<string, unknown>): void {
    const domain = raw ? tileDomain(raw.entity) : undefined;
    if (!domain) throw new Error(ENTITY_ERROR);
    const next = normalizeConfig(raw);
    // Pending writes belong to the old entity: releasing its writer sends them.
    if (this._config && this._config.entity !== next.entity) {
      this._lease.release();
      this._watched = [];
    }
    if (domain !== this._domain) {
      this._lease.release();
      this._lease = this._leaseFor(domain);
      this._domain = domain;
    }
    if (domain === 'media') this._art ??= new ArtworkController(this);
    else if (this._art) {
      this._art.set(undefined);
      if (this.isConnected) this._art.hostDisconnected();
      this.removeController(this._art);
      this._art = undefined;
    }
    this._config = next;
    reconfigureLightSheet(this, sheetConfig(next) as unknown as LightCardConfig);
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

  private _entity(): HassEntity | undefined {
    const cfg = this._config;
    return cfg ? this.hass?.states[cfg.entity] : undefined;
  }

  /** The media view with the shared writer's pending values (read fresh, H1 writer notes). */
  private _mediaView(s: HassEntity | undefined): MediaView {
    const w = this._writer() as MediaWriter | undefined;
    return mediaView(s, { entityId: this._config?.entity, hass: this.hass as { hassUrl?: (path?: string) => string }, pending: w?.pending });
  }

  /** GD5: the art layer follows the view's URL (playing, paused or buffering with a picture); none for other domains. */
  protected override willUpdate(): void {
    const cfg = this._config;
    this._view = this._domain === 'media' && cfg && this.hass ? this._mediaView(this.hass.states[cfg.entity]) : undefined;
    this._art?.set(this._view?.artwork ?? undefined);
  }

  /**
   * The icon tap is a discrete action, sent at once: light and fan power (deduped and serialised with a step in
   * flight), and the cover's toggle, toggle tilt or Stop (which ends every hold and pending step of the cover).
   */
  private _icon() {
    const s = this._entity();
    if (!s) return;
    if (this._domain === 'media') {
      const a = mediaIconAction(this._mediaView(s));
      if (a.disabled) return;
      const w = this._interacting() as MediaWriter | undefined;
      if (a.action === 'power') w?.power();
      else w?.playPause();
    } else if (this._domain === 'cover') {
      const a = iconAction(s);
      if (a.action) (this._interacting() as CoverWriter | undefined)?.act(a.action);
    } else if (this._domain === 'fan') {
      const w = this._writer() as FanWriter | undefined;
      const a = fanIconAction(fanView(s, w?.local));
      if (a.button && !a.disabled) (this._interacting() as FanWriter | undefined)?.sendNow(fanPowerPatch(a.next));
    } else {
      const v = lightView(s, (this._writer() as LightWriter | undefined)?.local);
      if (v.available) (this._interacting() as LightWriter | undefined)?.sendNow(powerPatch(!v.on));
    }
  }

  /**
   * Step buttons through the shared writer of the entity: lights and fans throttle (the first tap at once, then at
   * most one write per 300 ms, Q7 b `set_percentage` for a fan); covers coalesce into one write 500 ms after the last
   * tap (Q2 a), 10 % from the baseline.
   */
  private _step(dir: 1 | -1) {
    const s = this._entity();
    if (!s) return;
    if (this._domain === 'media') {
      // P3-CHO-17, GD2: through the shared throttle writer (VOLUME_SET) or volume_up/volume_down at once (VOLUME_STEP).
      (this._interacting() as MediaWriter | undefined)?.step(dir);
    } else if (this._domain === 'cover') {
      (this._interacting() as CoverWriter | undefined)?.step(dir);
    } else if (this._domain === 'fan') {
      const w = this._interacting() as FanWriter | undefined;
      if (w) stepFan(w, fanView(s, w.local), dir);
    } else {
      const v = lightView(s, (this._writer() as LightWriter | undefined)?.local);
      const next = stepLevel(v, dir);
      if (next) (this._interacting() as LightWriter | undefined)?.set(brightnessPatch(next));
    }
  }

  private _tap(e: Event) {
    const cfg = this._config;
    if (!cfg) return;
    if (cfg.tap_action === 'sheet') {
      // Focus the name first (Safari does not focus a clicked button), so focus returns to it on close.
      (e.currentTarget as HTMLElement | null)?.focus();
      // The card of the entity's domain, with History for the entity (plan 2.9).
      openEntitySheet(this, sheetConfig(cfg));
    } else if (cfg.tap_action === 'more-info') {
      this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId: cfg.entity }, bubbles: true, composed: true }));
    }
  }

  // ---- Domain parts ----------------------------------------------------

  private _lightParts(hass: HomeAssistant, s: HassEntity | undefined, name: string, glass: Glass): TileParts {
    const cfg = this._config!;
    const v = s ? lightView(s, (this._writer() as LightWriter | undefined)?.local) : undefined;
    this._watched = [cfg.entity, ...groupMembers(s)];
    const level = v?.on ? v.level : null;
    return {
      glyph: ICONS.bulb,
      // COL-1: the lamp colour while on, no tint while off or unavailable.
      tint: v?.on ? colourOf(v, glass) : null,
      icon: { button: true, label: t(hass, 'tile.power', { name }), pressed: !!v?.on, disabled: !v?.available },
      unavailable: !v?.available,
      sub: statusText(hass, s, v, cfg.entity),
      steps: v?.onoff
        ? null
        : {
            value: level !== null ? percentText(hass, level) : null,
            minus: { label: t(hass, 'tile.stepDown'), disabled: level === null || level <= 1 },
            plus: { label: t(hass, 'tile.stepUp'), disabled: level === null || level >= 100 },
          },
    };
  }

  private _coverParts(hass: HomeAssistant, s: HassEntity | undefined, name: string, glass: Glass): TileParts {
    const w = this._writer() as CoverWriter | undefined;
    const icon = iconAction(s);
    const st = coverStepState(s, w?.queue.pending);
    return {
      glyph: ICONS[coverGlyph(s)],
      // P2-COL-1 and P2-CHO-10: open, opening and closing in the fan_only neutral; closed plain.
      tint: isCoverActive(s) ? coverColour(glass) : null,
      // P2-CHO-8 and D-15: always a button (toggle, toggle tilt or Stop), no aria-pressed.
      icon: { button: true, label: t(hass, icon.label, { name }), disabled: icon.disabled },
      unavailable: isCoverUnavailable(s),
      sub: s ? coverTileSub(hass, s) : t(hass, 'tile.entityNotFound', { entity: this._config!.entity }),
      steps: st.show
        ? {
            value: st.value !== null && !isCoverUnavailable(s) ? percentText(hass, st.value) : null,
            minus: { label: t(hass, st.minusLabel), disabled: st.minusDisabled },
            plus: { label: t(hass, st.plusLabel), disabled: st.plusDisabled },
          }
        : null,
    };
  }

  private _fanParts(hass: HomeAssistant, s: HassEntity | undefined, name: string, glass: Glass): TileParts {
    const w = this._writer() as FanWriter | undefined;
    if (!s) {
      return {
        glyph: ICONS.fan,
        tint: null,
        icon: { button: true, label: t(hass, 'fan.aria.power', { name }), pressed: false, disabled: true },
        unavailable: true,
        sub: t(hass, 'tile.entityNotFound', { entity: this._config!.entity }),
        steps: null,
      };
    }
    const v = fanView(s, w?.local);
    const icon = fanIconAction(v);
    const st = fanStepState(hass, v);
    const shown = v.available && v.on && v.percentage != null;
    return {
      glyph: ICONS.fan,
      // P2-COL-1 and P2-CHO-10: on in the fan_only neutral; off plain.
      tint: v.on ? fanColour(glass) : null,
      // P2-CHO-8: the fan's power ("Switch <name>", aria-pressed); without TURN_ON and TURN_OFF a plain icon.
      icon: { button: icon.button, label: t(hass, 'fan.aria.power', { name }), pressed: icon.pressed, disabled: icon.disabled },
      unavailable: !v.available,
      sub: fanSub(hass, v),
      steps: st.show
        ? {
            value: shown ? st.text : null,
            minus: { label: t(hass, st.minusKey), disabled: st.minusDisabled },
            plus: { label: t(hass, st.plusKey), disabled: st.plusDisabled },
          }
        : null,
    };
  }

  /**
   * A media player (P3-CHO-14 to P3-CHO-19): speaker glyph, tinted in the fan_only neutral while playing or buffering
   * (P3-COL-1, P3-CHO-15), play/pause icon, volume steps with the percent readout (none for step-only), hidden without
   * volume, while off, standby or unknown and while a volume player reports no level; unavailable "--" with disabled
   * steps; muted readout in fg2. An on/off-only player in on is tinted too (isMediaLit).
   */
  private _mediaParts(hass: HomeAssistant, s: HassEntity | undefined, name: string, glass: Glass): TileParts {
    const v = this._view ?? this._mediaView(s);
    const icon = mediaIconAction(v);
    const hasVolume = v.kind === 'volume' || v.kind === 'step';
    // Hidden too while a volume player is available but reports no level (nothing to step from, no "--").
    const shown = hasVolume && (!v.available || !MEDIA_POWER_OFF.includes(v.state)) && !(v.available && v.kind === 'volume' && v.volume == null);
    return {
      glyph: ICONS.speaker,
      tint: isMediaLit(v) ? tone(PALETTE.neutral, glass) : null,
      icon: { button: true, label: t(hass, icon.label, { name }), pressed: icon.pressed, disabled: icon.disabled },
      unavailable: !v.available,
      sub: s ? mediaTileSub(hass, v) : t(hass, 'tile.entityNotFound', { entity: this._config!.entity }),
      steps: shown
        ? {
            value: v.available && v.kind === 'volume' && v.volume != null ? percentText(hass, v.volume) : null,
            readout: v.kind === 'step' ? 'none' : v.available && v.muted ? 'muted' : 'plain',
            minus: { label: t(hass, 'media.aria.stepDown', { name }), disabled: !v.can.stepDown },
            plus: { label: t(hass, 'media.aria.stepUp', { name }), disabled: !v.can.stepUp },
          }
        : null,
    };
  }

  // ---- Rendering -------------------------------------------------------

  private _svg(path: string, size: number, sw: number) {
    return svg`<svg class="i" width=${size} height=${size} viewBox="0 0 24 24" stroke-width=${sw} aria-hidden="true"><path d=${path}></path></svg>`;
  }

  protected override render(): TemplateResult {
    const cfg = this._config;
    if (!cfg || !this.hass) return html`<article class="tile g-dark"><span class="sub">${t(this.hass, 'tile.loading')}</span></article>`;
    const hass = this.hass;
    const s = hass.states[cfg.entity];
    const name = cfg.name || s?.attributes.friendly_name || cfg.entity;
    const glassKind = resolveGlass(cfg.look?.glass ?? 'theme', hass, this);
    if (this._domain !== 'light') this._watched = [cfg.entity];
    const p =
      this._domain === 'media'
        ? this._mediaParts(hass, s, name, glassKind)
        : this._domain === 'cover'
          ? this._coverParts(hass, s, name, glassKind)
          : this._domain === 'fan'
            ? this._fanParts(hass, s, name, glassKind)
            : this._lightParts(hass, s, name, glassKind);
    const err = this._writer()?.error;
    const tap = cfg.tap_action;

    const titles = html`<span class="name">${name}</span><span class="sub ${err ? 'err' : ''}">${err ?? p.sub}</span>`;
    const announce = err ? `${name}: ${err}` : '';
    const iconStyle = styleMap({
      background: p.tint ? rgba(p.tint, TINT.tile) : undefined,
      borderColor: p.tint ? rgba(p.tint, TINT.tileEdge) : undefined,
      color: p.tint ? 'var(--lc-bright)' : 'var(--lc-fg2)',
      // Disabled while available (a cover's Stop while still, a fan's power without its TURN bit): DISABLED_OPACITY.
      // Unavailable: the core .power:disabled rule (UNAVAILABLE_POWER_OPACITY); the plain icon gets the same value.
      opacity: p.unavailable ? (p.icon.button ? undefined : String(UNAVAILABLE_POWER_OPACITY)) : p.icon.disabled && p.icon.button ? String(DISABLED_OPACITY) : undefined,
    });
    const glyph = this._svg(p.glyph, 22, 1.9);

    return html`
      <article class="tile rim g-${glassKind}" style=${styleMap({ '--_blur': `${cfg.look.blur}px` })} aria-label=${t(hass, ARIA[this._domain], { name })}>
        ${this._art && this._domain === 'media' ? renderArtwork(this._art, { motion: cfg.look.motion }) : nothing}
        ${p.icon.button
          ? html`<button
              class="press power"
              aria-label=${p.icon.label}
              aria-pressed=${p.icon.pressed === undefined ? nothing : String(p.icon.pressed)}
              ?disabled=${p.icon.disabled}
              style=${iconStyle}
              @click=${this._icon}
            >
              ${glyph}
            </button>`
          : html`<span class="power static" aria-hidden="true" style=${iconStyle}>${glyph}</span>`}
        ${tap === 'none'
          ? html`<div class="body">${titles}</div>`
          : html`<button class="body" aria-haspopup=${tap === 'sheet' ? 'dialog' : nothing} @click=${this._tap}>${titles}</button>`}
        ${p.steps
          ? html`<div class="steps">
              <button class="press step" aria-label=${p.steps.minus.label} ?disabled=${p.steps.minus.disabled} @click=${() => this._step(-1)}>
                ${this._svg(ICONS.minus, 16, 2.2)}
              </button>
              ${p.steps.readout === 'none'
                ? nothing
                : html`<span class="target ${p.steps.readout === 'muted' ? 'muted' : ''}" aria-live="polite"
                    >${p.steps.readout === 'muted' && p.steps.value !== null
                      ? html`<span class="sr">${t(hass, 'media.aria.volumeMuted', { value: p.steps.value })}</span><span aria-hidden="true">${p.steps.value}</span>`
                      : (p.steps.value ?? html`<span aria-hidden="true">--</span>`)}</span
                  >`}
              <button class="press step" aria-label=${p.steps.plus.label} ?disabled=${p.steps.plus.disabled} @click=${() => this._step(1)}>
                ${this._svg(ICONS.plus, 16, 2.2)}
              </button>
            </div>`
          : nothing}
      </article>
      <span class="sr" aria-live="polite">${announce}</span>
    `;
  }

  /**
   * The plain icon of a fan without TURN_ON and TURN_OFF (P2-CHO-8): a span, so it takes the tile button's own border
   * and background (core tileChrome `button`) and the `.power` size. A muted media player's readout is drawn in fg2
   * (P3-CHO-19). The core art layer styles (P3-CHO-16) only act on a tile that renders the layer.
   */
  static override styles = [
    glassTokens,
    focusRing,
    tileChrome,
    artworkStyles,
    css`
      span.power {
        box-sizing: border-box;
        border: 1px solid var(--lc-btn-edge);
        background: var(--lc-btn);
      }
      .target.muted {
        color: var(--lc-fg2);
      }
      /*
       * The readout grows past the core tileChrome .target width (64px, reused here, not a new visual value) when
       * "100%" or "100 %" is wider than it, so it never touches or overlaps a step; a narrower readout keeps the 64px
       * box and the steps stay where they are. Naming it a core token (TILE.target) is a follow-up for the next
       * liquid-core release (0.5.0 is already out).
       */
      .target {
        width: auto;
        min-width: 64px;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    'liquid-home-tile': LiquidHomeTile;
  }
}

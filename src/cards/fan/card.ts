import { html, LitElement, nothing, svg, type PropertyValues, type TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import {
  dialChrome,
  DISABLED_OPACITY,
  focusRing,
  glassTokens,
  hassNeedsRender,
  ICONS,
  PILL_MODES,
  renderSlider,
  resolveGlass,
  rgba,
  SliderController,
  sliderStyles,
  TINT,
  UNAVAILABLE_POWER_OPACITY,
  WriterLease,
  type HassEntity,
  type HomeAssistant,
  type SliderView,
} from '@decibel95/liquid-core';
import { CARD_TYPES, TAGS } from '../../const';
import { defaultLook } from '../../config';
import { t } from '../../i18n';
import { headerIconStyles, renderHeaderIcon, type HeaderIconState } from '../shared/header-icon';
import { lightCardStyles } from '../light/styles';
import {
  FAN_FEATURE,
  fanColour,
  fanReadout,
  fanSub,
  fanView,
  fanWriters,
  isFanEntity,
  pillKeyStep,
  nextPreset,
  percentPatch,
  powerDisabled,
  powerPatch,
  presetDisabled,
  presetLabel,
  presetPatch,
  snapTo,
  type FanPatch,
  type FanView,
  type FanWriter,
} from '../../fans';
import { normalizeConfig, type NormalizedFanConfig } from './config';
import { fanCardStyles } from './styles';

/** One button of the Oscillate and Reverse row. */
interface RowButton {
  key: 'oscillate' | 'reverse';
  icon: string;
  on: boolean;
  patch: FanPatch;
}

/** setConfig error: stays English (no hass yet when HA validates a config). */
const ENTITY_ERROR = 'Liquid Home fan card: set `entity` to a fan entity (fan.*).';

/**
 * The Liquid Home fan card (plan 2.5): the light card's header with the fan device icon and power (P2-CHO-1), the
 * readout beside the speed pill (snapped to HA's steps, Q4 a variant A) or the toggle pill (P2-CHO-16), the Oscillate
 * and Reverse row (P2-CHO-12) and the preset chip (P2-CHO-14, Q5 a). Writes go through the shared fan writer (throttle
 * 300 ms plus final, hold of sent values); power, oscillate, direction and presets go out at once.
 */
export class LiquidHomeFanCard extends LitElement {
  static override styles = [glassTokens, focusRing, sliderStyles, dialChrome, headerIconStyles, lightCardStyles, fanCardStyles];

  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private _config?: NormalizedFanConfig;

  private readonly _lease = new WriterLease<FanWriter>(fanWriters, () => this.requestUpdate());

  /** The pill: the card holds the writer queue for the gesture and sets each previewed value, snapped (Q4, Q8). */
  readonly slider = new SliderController(this, {
    onStart: () => {
      this._interacting();
      this._lease.hold();
    },
    onPreview: (value) => {
      const v = this._view();
      if (v?.speed) this._interacting()?.set(percentPatch(snapTo(v.count, value)));
    },
    onEnd: () => this._lease.endHold(),
    onToggle: (next) => this._interacting()?.sendNow(powerPatch(next)),
  });

  // ---- Lovelace API ----------------------------------------------------

  setConfig(raw: Record<string, unknown>): void {
    if (!raw || !isFanEntity(raw.entity)) throw new Error(ENTITY_ERROR);
    const next = normalizeConfig(raw);
    // Pending writes belong to the old entity: releasing its writer sends them.
    if (this._config && this._config.entity !== next.entity) this._lease.release();
    this._config = next;
  }

  getCardSize(): number {
    return 8;
  }

  getGridOptions() {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  /** The visual editor (`liquid-home-fan-card-editor`, src/editor/fan.ts). */
  static async getConfigElement(): Promise<HTMLElement> {
    return document.createElement(TAGS.fanEditor);
  }

  /** A fan with a speed, else any fan. */
  static getStubConfig(hass: HomeAssistant): Record<string, unknown> {
    const fans = Object.values(hass?.states ?? {}).filter((s) => isFanEntity(s.entity_id));
    const pick = fans.find((s) => (Number(s.attributes.supported_features) & FAN_FEATURE.SET_SPEED) !== 0) ?? fans[0];
    return { type: CARD_TYPES.fan, entity: pick?.entity_id ?? 'fan.example', config_version: 1 };
  }

  override connectedCallback(): void {
    super.connectedCallback();
    // The lease was released on disconnect; the next render acquires it again.
    this.requestUpdate();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    // Do not lose a change the user already made: releasing sends it.
    this._lease.release();
  }

  protected override shouldUpdate(changed: PropertyValues): boolean {
    const cfg = this._config;
    if (changed.has('hass') && cfg && this.hass) this._writer()?.observe(this.hass);
    if (!changed.has('hass') || changed.size > 1 || !cfg || !this.hass) return true;
    return hassNeedsRender(changed.get('hass') as HomeAssistant | undefined, this.hass, [cfg.entity]);
  }

  /** P2-CHO-6: a readout that does not fit at 18cqw steps down to the 44px cluster value, then ellipsizes (CSS). */
  protected override updated(): void {
    const big = this.renderRoot.querySelector<HTMLElement>('.big');
    if (!big) return;
    big.classList.remove('fit');
    if (big.scrollWidth > big.clientWidth + 1) big.classList.add('fit');
  }

  // ---- State -----------------------------------------------------------

  private _writer(): FanWriter | undefined {
    const cfg = this._config;
    // A disconnected card never acquires (as the light card): it would hold the writer for good.
    if (!cfg?.entity || !this.isConnected) return undefined;
    const w = this._lease.get(cfg.entity);
    if (this.hass && !w.hass) w.hass = this.hass;
    return w;
  }

  /** The writer, with this card's hold time: the card that interacts sets it. */
  private _interacting(): FanWriter | undefined {
    const w = this._writer();
    if (!w) return undefined;
    w.hold = this._config!.write_hold;
    if (this.hass) w.hass = this.hass;
    return w;
  }

  private _view(): FanView | undefined {
    const s = this._config && this.hass?.states[this._config.entity];
    return s ? fanView(s, this._writer()?.local) : undefined;
  }

  // ---- Render ----------------------------------------------------------

  protected override render(): TemplateResult {
    const cfg = this._config;
    if (!cfg || !this.hass) {
      return html`<div class="lc g-dark unavailable" style=${styleMap({ '--_blur': `${cfg?.look.blur ?? defaultLook.blur}px` })}>${t(this.hass, 'fan.card.loading')}</div>`;
    }
    const hass = this.hass;
    const glass = resolveGlass(cfg.look.glass, hass, this);
    const vars = { '--_blur': `${cfg.look.blur}px` };
    const s = hass.states[cfg.entity];
    if (!s) {
      const name = cfg.name || cfg.entity;
      return html`<section class="lc rim g-${glass}" style=${styleMap(vars)} aria-label=${name}>
        <h2>${name}</h2>
        <div class="unavailable">${t(hass, 'fan.card.entityNotFound', { entity: cfg.entity })}</div>
      </section>`;
    }
    const writer = this._writer();
    const v = fanView(s, writer?.local);
    const name = cfg.name || v.name;
    const colour = fanColour(glass);
    return html`<section class="lc rim g-${glass} m-${cfg.look.motion}" style=${styleMap(vars)} aria-label=${name}>
      ${this._renderHeader(v, name, colour, glass)}
      <div class="body">
        <div class="bodyrow">${this._renderReadout(v)}<div class="slwrap">${renderSlider(this.slider, this._sliderView(v, s, name, colour))}</div></div>
      </div>
      ${this._renderRow(v, colour)} ${this._renderChip(v, s)}
      ${writer?.error ? html`<div class="alert" role="alert">${writer.error}</div>` : nothing}
    </section>`;
  }

  private _icon(path: string, size: number, sw = 1.8) {
    return svg`<svg class="i" width=${size} height=${size} viewBox="0 0 24 24" stroke-width=${sw} aria-hidden="true"><path d=${path}></path></svg>`;
  }

  private _renderHeader(v: FanView, name: string, colour: string, glass: 'dark' | 'light') {
    const hass = this.hass;
    const iconState: HeaderIconState = !v.available ? 'unavailable' : v.on ? 'active' : 'inactive';
    return html`<header>
      ${renderHeaderIcon('fan', iconState, fanColour(glass))}
      <div class="titles">
        <h2>${name}</h2>
        <span class="sub">${fanSub(hass, v)}</span>
      </div>
      <div class="actions">
        ${v.hasPower
          ? html`<button
              class="press power"
              aria-label=${t(hass, 'fan.aria.power', { name })}
              aria-pressed=${v.on ? 'true' : 'false'}
              ?disabled=${powerDisabled(v)}
              style=${styleMap({
                background: v.on ? rgba(colour, TINT.power) : undefined,
                opacity: !v.available ? String(UNAVAILABLE_POWER_OPACITY) : powerDisabled(v) ? String(DISABLED_OPACITY) : undefined,
              })}
              @click=${() => !powerDisabled(v) && this._interacting()?.sendNow(powerPatch(!v.on))}
            >
              ${this._icon(ICONS.power, 18, 2)}
            </button>`
          : nothing}
        <slot name="header-action"></slot>
      </div>
    </header>`;
  }

  /** P2-CHO-13, 14, 16: the percentage, Off, "--" or the preset; while dragging the snapped step (Q8 a). */
  private _renderReadout(v: FanView) {
    const r = fanReadout(this.hass, v);
    return html`<span class="ro">
      <span class="ro-v"><span class="big">${r.big}</span><span class="unit">${r.unit}</span></span>
      <span class="sub">${r.label}</span>
    </span>`;
  }

  private _sliderView(v: FanView, s: HassEntity, name: string, colour: string): SliderView {
    const hass = this.hass;
    const base = { available: v.available, color: colour, motion: this._config!.look.motion, hass, i18n: { t } };
    if (!v.speed) {
      // P2-CHO-16: the toggle pill, gated as the power button.
      return { ...base, kind: 'toggle', value: v.on ? 100 : 0, on: v.on, available: v.available && !powerDisabled(v), label: name };
    }
    // A gesture with a previewed value. A key held under a preset that changes nothing (Down) previews none, so aria
    // keeps the preset; a drag previewing 0 is live and reads "Off".
    const live = this.slider.dragging && this.slider.preview !== undefined;
    const preset = v.preset ? presetLabel(hass, v.preset, s) : null;
    return {
      ...base,
      kind: 'level',
      // Under a preset the pill shows HA's percentage, empty when null (P2-CHO-14).
      value: v.percentage ?? 0,
      on: v.on,
      label: t(hass, 'fan.aria.speed', { name }),
      // Q4 keys; under a preset they count from 0 and Down does nothing (pillKeyStep).
      keyStep: pillKeyStep(v),
      // Q8 a: while a gesture runs aria reads the snapped step ("Off" at 0); the fill follows the finger.
      snap: live ? (x: number) => snapTo(v.count, x) : undefined,
      valueText: (n: number) =>
        !live && preset ? preset : !live && v.percentage == null ? t(hass, 'fan.readout.on') : t(hass, 'core.percent', { value: n }),
    };
  }

  /** P2-CHO-12: Oscillate (swingH) and Reverse (rotateCw), each with its bit, both aria-pressed; hidden with neither. */
  private _renderRow(v: FanView, colour: string) {
    const hass = this.hass;
    const buttons: RowButton[] = [];
    if (v.hasOscillate) buttons.push({ key: 'oscillate', icon: ICONS.swingH, on: v.oscillating, patch: { oscillating: !v.oscillating } });
    if (v.hasDirection) buttons.push({ key: 'reverse', icon: ICONS.rotateCw, on: v.reverse, patch: { direction: v.reverse ? 'forward' : 'reverse' } });
    if (!buttons.length) return nothing;
    return html`<div class="modes" role="group" aria-label=${t(hass, 'fan.row.group')} style=${styleMap({ gridTemplateColumns: `repeat(${buttons.length}, minmax(0, 1fr))` })}>
      ${buttons.map((b) => {
        const sel = b.on && v.available;
        return html`<button
          class="press mode"
          data-action=${b.key}
          aria-pressed=${b.on ? 'true' : 'false'}
          ?disabled=${!v.available}
          style=${styleMap({
            background: sel ? rgba(colour, PILL_MODES.tint.fill) : undefined,
            borderColor: sel ? rgba(colour, PILL_MODES.tint.edge) : undefined,
            color: sel ? 'var(--lc-fg)' : 'var(--lc-fg2)',
            opacity: v.available ? undefined : String(DISABLED_OPACITY),
          })}
          @click=${() => v.available && this._interacting()?.sendNow(b.patch)}
        >
          ${this._icon(b.icon, 19)}
          <span>${t(hass, `fan.row.${b.key}`)}</span>
        </button>`;
      })}
    </div>`;
  }

  /** P2-CHO-14: the preset chip (the effect chip, --lc-btn-on while a preset runs); it cycles and wraps (Q5 a). */
  private _renderChip(v: FanView, s: HassEntity) {
    if (!this._config!.controls.presets || !v.hasPresets) return nothing;
    const hass = this.hass;
    const active = v.on && !!v.preset;
    const label = active ? presetLabel(hass, v.preset!, s) : t(hass, 'fan.preset.none');
    const disabled = presetDisabled(v);
    return html`<div class="chips" style=${styleMap({ gridTemplateColumns: 'repeat(1, minmax(0, 1fr))' })}>
      <button
        class="press chip"
        aria-label=${t(hass, 'fan.aria.preset', { value: label })}
        ?disabled=${disabled}
        style=${styleMap({
          background: active ? 'var(--lc-btn-on)' : undefined,
          borderColor: active ? 'var(--lc-btn-on-edge)' : undefined,
          opacity: disabled ? String(DISABLED_OPACITY) : undefined,
        })}
        @click=${() => this._cyclePreset(v)}
      >
        ${this._icon(ICONS.none, 17, 2)}
        <span class="txt"><span class="k">${t(hass, 'fan.preset.label')}</span> <span class="v">${label}</span></span>
      </button>
    </div>`;
  }

  /** While on: set_preset_mode; while off: turn_on with the preset (needs TURN_ON). Sent at once. */
  private _cyclePreset(v: FanView) {
    const next = nextPreset(v);
    if (!next || presetDisabled(v)) return;
    this._interacting()?.sendNow(presetPatch(next));
  }
}

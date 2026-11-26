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
  num,
  PILL_MODES,
  renderSlider,
  resolveGlass,
  rgba,
  SliderController,
  sliderStyles,
  WriterLease,
  type HassEntity,
  type HomeAssistant,
  type SliderView,
} from '@decibel95/liquid-core';
import { CARD_TYPES, TAGS } from '../../const';
import { defaultLook } from '../../config';
import { t } from '../../i18n';
import { headerIconStyles, renderHeaderIcon } from '../shared/header-icon';
import {
  coverColour,
  coverGlyph,
  coverIconState,
  coverMode,
  coverStateKey,
  coverStateOf,
  coverSub,
  coverWriters,
  hasModeButtons,
  hasPositionBit,
  isCoverActive,
  isCoverEntity,
  isCoverUnavailable,
  isToggleCover,
  keyOf,
  pillSettable,
  rowActions,
  rowHidden,
  togglePillUsable,
  type CoverAction,
  type CoverKey,
  type CoverMode,
  type CoverPatch,
  type CoverWriter,
} from '../../covers';
import { normalizeConfig, type NormalizedCoverConfig } from './config';
import { coverCardStyles } from './styles';

const ENTITY_ERROR = 'Liquid Home cover card: set `entity` to a cover entity (cover.*).';

const MODES: { mode: CoverMode; icon: string }[] = [
  { mode: 'position', icon: ICONS.swingV },
  { mode: 'tilt', icon: ICONS.moveDiagonal },
];
const ROW_ICONS = { open: ICONS.chevronUp, stop: ICONS.stop, close: ICONS.chevronDown };

/**
 * The Liquid Home cover card (plan 2.4, gate 2 prototype buildCover and updCover): header with the device icon, name
 * and state (no power button, P2-CHO-1), the readout beside the big pill (liquid-core slider: `position` kind, or
 * `toggle` on a cover without position, P2-CHO-4), the Position and Tilt mode buttons on a cover with both (P2-CHO-2),
 * and the Open, Stop, Close row (P2-CHO-5, Q1 b, Q3 b). Writes go through the shared cover writer: one call at the end
 * of a drag or key gesture (Q2 a), discrete actions at once, the movement-aware hold (Q6 a).
 */
export class LiquidHomeCoverCard extends LitElement {
  static override styles = [glassTokens, focusRing, sliderStyles, dialChrome, headerIconStyles, coverCardStyles];

  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private _config?: NormalizedCoverConfig;
  /** The pill mode the user picked (per card, not stored); only used where the mode buttons show. */
  @state() private _mode: CoverMode = 'position';

  private readonly _lease = new WriterLease<CoverWriter>(coverWriters, () => this.requestUpdate());
  /** P2-CHO-6 fit: the readout element and word last checked, and the observer that re-checks on resize. */
  private _fitEl?: HTMLElement;
  private _fitText?: string;
  private _fitObserver?: ResizeObserver;
  private _observed?: Element;

  /**
   * The pill: the card holds the writer queue for the gesture and sets each previewed value; nothing is sent while
   * held (debounce). The gesture end (pointer up, key up, blur) ends the hold and sends what is pending at once: one
   * call per drag or key gesture (Q2 a), dropped by the writer when equal to the baseline.
   */
  readonly slider = new SliderController(this, {
    onStart: () => {
      this._interacting();
      this._lease.hold();
    },
    onPreview: (value) => this._setPill(value),
    onEnd: (value) => {
      // A discard() by another card during the drag dropped the pending value: set it again (RV0 note 2).
      if (value !== null) this._setPill(value);
      this._lease.endHold();
      this._lease.current?.sendPending();
    },
    // The toggle pill (P2-CHO-4): cover.toggle opens, closes, or stops while moving.
    onToggle: () => this._act('toggle'),
  });

  // ---- Lovelace API ----------------------------------------------------

  setConfig(raw: Record<string, unknown>): void {
    if (!raw || !isCoverEntity(raw.entity)) throw new Error(ENTITY_ERROR);
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

  /** The visual editor (`liquid-home-cover-card-editor`, src/editor/cover.ts). */
  static async getConfigElement(): Promise<HTMLElement> {
    return document.createElement(TAGS.coverEditor);
  }

  /** A cover that sets its position, else any cover. */
  static getStubConfig(hass: HomeAssistant): Record<string, unknown> {
    const covers = Object.values(hass?.states ?? {}).filter((s) => s.entity_id.startsWith('cover.'));
    const pick = covers.find(hasPositionBit) ?? covers[0];
    return { type: CARD_TYPES.cover, entity: pick?.entity_id ?? 'cover.example', config_version: 1 };
  }

  /** Show the pill in `mode` (per card, not stored), as the light card's setPillMode. */
  setPillMode(mode: CoverMode): void {
    this._mode = mode;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.requestUpdate();
    // A word measured before the card font loaded is checked again once it has.
    void document.fonts?.ready.then(() => this._fit(true));
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._fitObserver?.disconnect();
    this._observed = undefined;
    // Do not lose a change the user already made: releasing sends it.
    this._lease.release();
  }

  protected override shouldUpdate(changed: PropertyValues): boolean {
    const cfg = this._config;
    if (changed.has('hass') && cfg && this.hass) this._writer()?.observe(this.hass);
    if (!changed.has('hass') || changed.size > 1 || !cfg || !this.hass) return true;
    return hassNeedsRender(changed.get('hass') as HomeAssistant | undefined, this.hass, [cfg.entity]);
  }

  protected override updated(): void {
    // Re-check the fit when the card body changes size (a dashboard column, the sheet, a phone rotating).
    const body = this.renderRoot.querySelector('.body') ?? undefined;
    if (body !== this._observed) {
      this._fitObserver?.disconnect();
      this._observed = body;
      if (body && typeof ResizeObserver === 'function') {
        this._fitObserver ??= new ResizeObserver(() => this._fit(true));
        this._fitObserver.observe(body);
      }
    }
    this._fit(false);
  }

  /**
   * P2-CHO-6: a word readout (Open, Closed, Opening, Closing) that does not fit at 18cqw steps down to the 44px
   * cluster value, then ellipsizes (CSS). Only words are measured, and only when the word changed or `force` (resize,
   * font load), so a percent readout or a drag never forces layout.
   */
  private _fit(force: boolean): void {
    if (!this.isConnected) return;
    const big = this.renderRoot?.querySelector<HTMLElement>('.big');
    if (!big) return;
    if (big.dataset.word === undefined) {
      big.classList.remove('c44');
      this._fitText = undefined;
      return;
    }
    const text = big.textContent ?? '';
    if (!force && big === this._fitEl && text === this._fitText) return;
    this._fitEl = big;
    this._fitText = text;
    big.classList.remove('c44');
    if (big.scrollWidth > big.clientWidth + 1) big.classList.add('c44');
  }

  // ---- State -----------------------------------------------------------

  private _writer(): CoverWriter | undefined {
    const cfg = this._config;
    // A disconnected card never acquires (see the light card).
    if (!cfg?.entity || !this.isConnected) return undefined;
    const w = this._lease.get(cfg.entity);
    if (this.hass && !w.hass) w.hass = this.hass;
    return w;
  }

  /** The writer, with this card's hold time: the card that interacts sets it. */
  private _interacting(): CoverWriter | undefined {
    const w = this._writer();
    if (!w) return undefined;
    w.hold = this._config!.write_hold;
    if (this.hass) w.hass = this.hass;
    return w;
  }

  private _entity(): HassEntity | undefined {
    return this._config && this.hass?.states[this._config.entity];
  }

  /** The writer key the pill sets now, or undefined on a toggle cover. */
  private _key(s = this._entity()): CoverKey | undefined {
    return s && !isToggleCover(s) ? keyOf(coverMode(s, this._mode)) : undefined;
  }

  private _setPill(value: number): void {
    const key = this._key();
    if (key) this._interacting()?.set({ [key]: Math.round(value) } as CoverPatch);
  }

  private _act(action: CoverAction): void {
    this._interacting()?.act(action);
  }

  private _glass(): 'dark' | 'light' {
    return resolveGlass(this._config!.look.glass, this.hass ?? {}, this);
  }

  // ---- Render ----------------------------------------------------------

  protected override render(): TemplateResult {
    const cfg = this._config;
    if (!cfg || !this.hass) {
      return html`<div class="lc g-dark unavailable" style=${styleMap({ '--_blur': `${cfg?.look.blur ?? defaultLook.blur}px` })}>${t(this.hass, 'cover.card.loading')}</div>`;
    }
    const hass = this.hass;
    const glass = this._glass();
    const vars = { '--_blur': `${cfg.look.blur}px` };
    const s = hass.states[cfg.entity];
    if (!s) {
      const name = cfg.name || cfg.entity;
      return html`<section class="lc rim g-${glass}" style=${styleMap(vars)} aria-label=${name}>
        <h2>${name}</h2>
        <div class="unavailable">${t(hass, 'cover.card.entityNotFound', { entity: cfg.entity })}</div>
      </section>`;
    }
    const writer = this._writer();
    const name = cfg.name || (typeof s.attributes.friendly_name === 'string' && s.attributes.friendly_name) || s.entity_id;
    const colour = coverColour(glass);
    const mode = coverMode(s, this._mode);

    return html`<section class="lc rim g-${glass} m-${cfg.look.motion}" style=${styleMap(vars)} aria-label=${name}>
      <header>
        ${renderHeaderIcon(coverGlyph(s), coverIconState(s), colour)}
        <div class="titles">
          <h2>${name}</h2>
          <span class="sub">${coverSub(hass, s)}</span>
        </div>
        <div class="actions"><slot name="header-action"></slot></div>
      </header>
      <div class="body">
        <div class="bodyrow">${this._renderReadout(s, mode)}<div class="slwrap">${renderSlider(this.slider, this._sliderView(s, mode, name, colour, writer))}</div></div>
      </div>
      ${this._renderModes(s, mode, colour)} ${this._renderRow(s, mode, colour)}
      ${writer?.error ? html`<div class="alert" role="alert">${writer.error}</div>` : nothing}
    </section>`;
  }

  private _icon(path: string, size: number, sw = 1.8) {
    return svg`<svg class="i" width=${size} height=${size} viewBox="0 0 24 24" stroke-width=${sw} aria-hidden="true"><path d=${path}></path></svg>`;
  }

  /** The readout follows HA (or the finger while dragging); only the fill shows the hold (Q6 a). */
  private _renderReadout(s: HassEntity, mode: CoverMode) {
    const hass = this.hass;
    const un = isCoverUnavailable(s);
    let big: string;
    let unit = '';
    let what: string;
    const word = isToggleCover(s) && !un;
    if (isToggleCover(s)) {
      big = un ? '--' : t(hass, coverStateKey(s));
      what = t(hass, 'cover.readout.tap');
    } else {
      what = t(hass, mode === 'tilt' ? 'cover.readout.tilt' : 'cover.readout.position');
      if (un) big = '--';
      else {
        const actual = coverStateOf(s, keyOf(mode));
        const v = this.slider.preview ?? (typeof actual === 'number' ? actual : 0);
        big = num(hass, Math.round(v), 0);
        unit = '%';
      }
    }
    return html`<span class="ro">
      <span class="ro-v"><span class="big" data-word=${word ? '' : nothing}>${big}</span><span class="unit">${unit}</span></span>
      <span class="sub">${what}</span>
    </span>`;
  }

  private _sliderView(s: HassEntity, mode: CoverMode, name: string, colour: string, writer: CoverWriter | undefined): SliderView {
    const hass = this.hass;
    const base = { color: colour, motion: this._config!.look.motion, hass, i18n: { t } };
    if (isToggleCover(s)) {
      // P2-CHO-4: full while open, opening or closing.
      return { ...base, kind: 'toggle', value: 0, on: isCoverActive(s), available: togglePillUsable(s), label: name };
    }
    const key = keyOf(mode);
    const actual = coverStateOf(s, key);
    const now = typeof actual === 'number' ? actual : null;
    const local = writer?.local[key];
    const held = writer?.held(key);
    return {
      ...base,
      kind: 'position',
      // The fill shows the pending or held value, else HA's.
      value: typeof local === 'number' ? local : (now ?? 0),
      on: true,
      available: pillSettable(s, mode),
      label: t(hass, mode === 'tilt' ? 'cover.aria.tilt' : 'cover.aria.position', { name }),
      valueText: (v) => {
        const pct = t(hass, 'core.percent', { value: v });
        // While held and different: "<held>%, now <actual>%".
        return held !== undefined && this.slider.preview === undefined && now !== null && Math.round(held) !== Math.round(now)
          ? t(hass, 'cover.aria.held', { value: pct, now: t(hass, 'core.percent', { value: Math.round(now) }) })
          : pct;
      },
    };
  }

  /** P2-CHO-2: Position and Tilt, selected at the TOK-22 tint of the neutral, aria-pressed. */
  private _renderModes(s: HassEntity, mode: CoverMode, colour: string) {
    if (!hasModeButtons(s)) return nothing;
    const hass = this.hass;
    const un = isCoverUnavailable(s);
    return html`<div class="modes" role="group" aria-label=${t(hass, 'cover.mode.group')} style=${styleMap({ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' })}>
      ${MODES.map(({ mode: m, icon }) => {
        const sel = m === mode;
        return html`<button
          class="press mode"
          data-mode=${m}
          aria-pressed=${sel ? 'true' : 'false'}
          ?disabled=${un}
          style=${styleMap({
            background: sel && !un ? rgba(colour, PILL_MODES.tint.fill) : undefined,
            borderColor: sel && !un ? rgba(colour, PILL_MODES.tint.edge) : undefined,
            color: sel ? 'var(--lc-fg)' : 'var(--lc-fg2)',
            opacity: un ? String(DISABLED_OPACITY) : undefined,
          })}
          @click=${() => {
            this._mode = m;
          }}
        >
          ${this._icon(icon, 19, 1.9)}
          <span>${t(hass, `cover.mode.${m}`)}</span>
        </button>`;
      })}
    </div>`;
  }

  /** P2-CHO-5: Open, Stop, Close, each with its bit; disabled at 0.3 per canOpen and canClose; Stop tinted while moving. */
  private _renderRow(s: HassEntity, mode: CoverMode, colour: string) {
    if (rowHidden(s, mode)) return nothing;
    const hass = this.hass;
    const buttons = rowActions(s, mode).filter((a) => a.visible);
    return html`<div class="modes row" role="group" aria-label=${t(hass, 'cover.action.group')} style=${styleMap({ gridTemplateColumns: `repeat(${buttons.length}, minmax(0, 1fr))` })}>
      ${buttons.map((a) => {
        const label = t(hass, a.label);
        return html`<button
          class="press mode"
          data-action=${a.button}
          aria-label=${label}
          ?disabled=${a.disabled}
          style=${styleMap({
            background: a.active ? rgba(colour, PILL_MODES.tint.fill) : undefined,
            borderColor: a.active ? rgba(colour, PILL_MODES.tint.edge) : undefined,
            color: a.active ? 'var(--lc-fg)' : 'var(--lc-fg2)',
            opacity: a.disabled ? String(DISABLED_OPACITY) : undefined,
          })}
          @click=${() => !a.disabled && this._act(a.action)}
        >
          ${this._icon(ROW_ICONS[a.button], 19, 1.9)}
          <span>${label}</span>
        </button>`;
      })}
    </div>`;
  }
}

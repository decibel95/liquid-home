import { html, LitElement, nothing, svg, type PropertyValues, type TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import {
  dialChrome,
  DISABLED_OPACITY,
  focusRing,
  glassTokens,
  hassNeedsRender,
  humanize,
  ICONS,
  num,
  PILL_MODES,
  renderSlider,
  resolveGlass,
  rgba,
  SliderController,
  sliderStyles,
  SPECTRUM,
  TINT,
  translated,
  UNAVAILABLE_POWER_OPACITY,
  WriterLease,
  type HassEntity,
  type HomeAssistant,
  type SliderView,
} from '@decibel95/liquid-core';
import { CARD_TYPES, TAGS } from '../../const';
import { defaultLook } from '../../config';
import { t } from '../../i18n';
import { openLightSheet } from '../sheet/open';
import { colourOf, hueAt, isLightEntity, kelvinAt, lightView, lightWriters, membersOn, modesFor, patchFor, positionOf, powerPatch, type LightView, type LightWriter } from '../../lights';
import { normalizeConfig, type LightMode, type NormalizedLightConfig } from './config';
import { lightCardStyles } from './styles';

/** Effects that mean "no effect running": the chip then rests, as the dial's inactive presets. */
const NO_EFFECT = ['off', 'none'];
/** Member chips per row on a group card. */
const MEMBER_COLUMNS = 3;
const MODE_ICONS: Record<LightMode, string> = Object.fromEntries(PILL_MODES.modes.map((m) => [m.key, ICONS[m.icon]])) as Record<LightMode, string>;

const ENTITY_ERROR = 'Liquid Home light card: set `entity` to a light entity (light.*).';

/**
 * The Liquid Home light card (V1, gate 2): header with name, state and power, the readout (TOK-20) beside the big
 * vertical pill (liquid-core slider), the Brightness / White / Colour mode buttons (TOK-22) and the effect chip
 * (CHO-15) or, on a group, one chip per member (CHO-4). Writes go through the shared light writer (300 ms throttle,
 * hold of sent values).
 */
export class LiquidHomeLightCard extends LitElement {
  static override styles = [glassTokens, focusRing, sliderStyles, dialChrome, lightCardStyles];

  @property({ attribute: false }) hass?: HomeAssistant;
  @state() private _config?: NormalizedLightConfig;
  /** The pill mode the user picked (per card, not stored). */
  @state() private _mode: LightMode = 'brightness';

  private readonly _lease = new WriterLease<LightWriter>(lightWriters, () => this.requestUpdate());

  /** The pill (liquid-core slider): the card holds its writer queue for the gesture and sets each previewed value. */
  readonly slider = new SliderController(this, {
    onStart: () => {
      this._interacting();
      this._lease.hold();
    },
    onPreview: (value) => {
      const v = this._view();
      const mode = v && this._pillMode(v);
      if (v && mode && mode !== 'toggle') this._interacting()?.set(patchFor(v, mode, value));
    },
    onEnd: () => this._lease.endHold(),
    // A toggle tap is a discrete action: sent at once (an off still waits for the release, sendOnRelease).
    onToggle: (next) => this._interacting()?.sendNow(powerPatch(next)),
  });

  // ---- Lovelace API ----------------------------------------------------

  setConfig(raw: Record<string, unknown>): void {
    if (!raw || !isLightEntity(raw.entity)) throw new Error(ENTITY_ERROR);
    const next = normalizeConfig(raw);
    // Pending writes belong to the old entity: releasing its writer sends them.
    if (this._config && this._config.entity !== next.entity) this._lease.release();
    this._config = next;
  }

  getCardSize(): number {
    return 8;
  }

  /**
   * Show the pill in `mode` (as the prototype sets pillMode before opening a sheet from the room's White and Colour
   * buttons). Per card and not stored; a mode the light does not offer falls back to the first one it does.
   */
  setPillMode(mode: LightMode): void {
    this._mode = mode;
  }

  getGridOptions() {
    return { columns: 12, rows: 'auto', min_columns: 6 };
  }

  /** The visual editor is P15's (`liquid-home-light-card-editor`). */
  static async getConfigElement(): Promise<HTMLElement> {
    return document.createElement(TAGS.lightEditor);
  }

  /** A light that can dim, else any light. */
  static getStubConfig(hass: HomeAssistant): Record<string, unknown> {
    const lights = Object.values(hass?.states ?? {}).filter((s) => s.entity_id.startsWith('light.'));
    const dims = (s: HassEntity) => Array.isArray(s.attributes.supported_color_modes) && s.attributes.supported_color_modes.some((m: string) => m !== 'onoff');
    const pick = lights.find((s) => s.state === 'on' && dims(s)) ?? lights.find(dims) ?? lights[0];
    return { type: CARD_TYPES.light, entity: pick?.entity_id ?? 'light.example', config_version: 1 };
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
    const s = this.hass.states[cfg.entity];
    const members = s && Array.isArray(s.attributes.entity_id) ? (s.attributes.entity_id as string[]) : [];
    return hassNeedsRender(changed.get('hass') as HomeAssistant | undefined, this.hass, [cfg.entity, ...members]);
  }

  // ---- State -----------------------------------------------------------

  private _writer(): LightWriter | undefined {
    const cfg = this._config;
    // A disconnected card never acquires: an update queued during disconnect (the slider ends its gesture there)
    // would otherwise take the writer again after disconnectedCallback released it, and hold it for good.
    if (!cfg?.entity || !this.isConnected) return undefined;
    const w = this._lease.get(cfg.entity);
    if (this.hass && !w.hass) w.hass = this.hass;
    return w;
  }

  /** The writer, with this card's hold time: the card that interacts sets it (as Liquid Climate). */
  private _interacting(): LightWriter | undefined {
    const w = this._writer();
    if (!w) return undefined;
    w.hold = this._config!.write_hold;
    if (this.hass) w.hass = this.hass;
    return w;
  }

  private _view(): LightView | undefined {
    const s = this._config && this.hass?.states[this._config.entity];
    return s ? lightView(s, this._writer()?.local) : undefined;
  }

  private _pillMode(v: LightView): LightMode | 'toggle' {
    if (v.onoff) return 'toggle';
    const modes = modesFor(v, this._config?.controls.modes);
    return modes.includes(this._mode) ? this._mode : modes[0];
  }

  private _glass(): 'dark' | 'light' {
    return resolveGlass(this._config!.look.glass, this.hass ?? {}, this);
  }

  // ---- Render ----------------------------------------------------------

  protected override render(): TemplateResult {
    const cfg = this._config;
    if (!cfg || !this.hass) {
      return html`<div class="lc g-dark unavailable" style=${styleMap({ '--_blur': `${cfg?.look.blur ?? defaultLook.blur}px` })}>${t(this.hass, 'light.card.loading')}</div>`;
    }
    const hass = this.hass;
    const glass = this._glass();
    const vars = { '--_blur': `${cfg.look.blur}px` };
    const s = hass.states[cfg.entity];
    if (!s) {
      const name = cfg.name || cfg.entity;
      return html`<section class="lc rim g-${glass}" style=${styleMap(vars)} aria-label=${name}>
        <h2>${name}</h2>
        <div class="unavailable">${t(hass, 'light.card.entityNotFound', { entity: cfg.entity })}</div>
      </section>`;
    }
    const writer = this._writer();
    const v = lightView(s, writer?.local);
    const name = cfg.name || v.name;
    const colour = colourOf(v, glass);
    const mode = this._pillMode(v);

    return html`<section class="lc rim g-${glass} m-${cfg.look.motion}" style=${styleMap(vars)} aria-label=${name}>
      ${this._renderHeader(v, name, colour)}
      <div class="body">
        <div class="bodyrow">${this._renderReadout(v, mode)}<div class="slwrap">${renderSlider(this.slider, this._sliderView(v, mode, name, colour, glass))}</div></div>
      </div>
      ${this._renderModes(v, mode, colour)} ${this._renderChips(v, s, glass)}
      ${writer?.error
        ? html`<div class="alert" role="alert">${writer.error}</div>`
        : nothing}
    </section>`;
  }

  private _icon(path: string, size: number, sw = 1.8) {
    return svg`<svg class="i" width=${size} height=${size} viewBox="0 0 24 24" stroke-width=${sw} aria-hidden="true"><path d=${path}></path></svg>`;
  }

  private _sub(v: LightView): string {
    const hass = this.hass;
    if (!v.available) return t(hass, 'core.unavailable');
    if (v.group) {
      return t(hass, 'light.sub.group', { on: membersOn(hass?.states ?? {}, v), total: v.members.length });
    }
    if (!v.on) return t(hass, 'core.off');
    return v.kelvin !== null ? t(hass, 'light.sub.onKelvin', { kelvin: num(hass, v.kelvin, 0) }) : t(hass, 'light.sub.on');
  }

  private _renderHeader(v: LightView, name: string, colour: string) {
    const hass = this.hass;
    return html`<header>
      <div class="titles">
        <h2>${name}</h2>
        <span class="sub">${this._sub(v)}</span>
      </div>
      <div class="actions">
        <button
          class="press power"
          aria-label=${t(hass, 'light.aria.power', { name })}
          aria-pressed=${v.on ? 'true' : 'false'}
          ?disabled=${!v.available}
          style=${styleMap({ background: v.on ? rgba(colour, TINT.power) : undefined, opacity: v.available ? undefined : String(UNAVAILABLE_POWER_OPACITY) })}
          @click=${() => v.available && this._interacting()?.sendNow(powerPatch(!v.on))}
        >
          ${this._icon(ICONS.power, 18, 2)}
        </button>
        <slot name="header-action"></slot>
      </div>
    </header>`;
  }

  /** TOK-20 readout; Q5: White mode on a light not in colour temperature shows the brightness, labelled Brightness. */
  private _renderReadout(v: LightView, mode: LightMode | 'toggle') {
    const hass = this.hass;
    let big: string;
    let unit = '';
    let what: string;
    const pct = () => num(hass, v.level ?? 1, 0);
    if (mode === 'toggle') {
      big = !v.available ? '--' : v.on ? t(hass, 'light.readout.on') : t(hass, 'core.off');
      what = t(hass, 'light.readout.tap');
    } else if (!v.available) {
      big = '--';
      what = t(hass, mode === 'white' ? 'light.readout.warmth' : 'light.readout.brightness');
    } else if (mode === 'white') {
      what = t(hass, 'light.readout.warmth');
      if (!v.on) big = t(hass, 'core.off');
      else if (v.kelvin !== null) {
        big = num(hass, v.kelvin, 0);
        unit = t(hass, 'light.readout.kelvinUnit');
      } else {
        big = pct();
        unit = '%';
        what = t(hass, 'light.readout.brightness');
      }
    } else {
      what = t(hass, v.group ? 'light.readout.average' : 'light.readout.brightness');
      if (!v.on) big = t(hass, 'core.off');
      else {
        big = pct();
        unit = '%';
      }
    }
    return html`<span class="ro">
      <span class="ro-v"><span class="big">${big}</span><span class="unit">${unit}</span></span>
      <span class="sub">${what}</span>
    </span>`;
  }

  private _sliderView(v: LightView, mode: LightMode | 'toggle', name: string, colour: string, glass: 'dark' | 'light'): SliderView {
    const hass = this.hass;
    const base = { on: v.on, available: v.available, color: colour, motion: this._config!.look.motion, hass, i18n: { t } };
    if (mode === 'toggle') return { ...base, kind: 'toggle', value: v.on ? 100 : 0, label: name };
    if (mode === 'brightness') return { ...base, kind: 'level', value: v.pct, label: t(hass, 'light.aria.brightness', { name }) };
    // While a gesture runs the text follows the unrounded preview, so kelvin is exact rather than in 1 % steps.
    const at = () => this.slider.preview ?? positionOf(v, mode);
    if (mode === 'white') {
      return {
        ...base,
        kind: 'position',
        value: positionOf(v, 'white'),
        stops: SPECTRUM.toned[glass].kelvin,
        label: t(hass, 'light.aria.warmth', { name }),
        valueText: () =>
          this.slider.preview === undefined && v.kelvin === null
            ? t(hass, 'light.aria.notWhite')
            : t(hass, 'light.aria.kelvin', { value: num(hass, this.slider.preview === undefined ? v.kelvin! : kelvinAt(v, at()), 0) }),
      };
    }
    return {
      ...base,
      kind: 'position',
      value: positionOf(v, 'colour'),
      stops: SPECTRUM.toned[glass].hue,
      label: t(hass, 'light.aria.colour', { name }),
      valueText: () => t(hass, 'light.aria.hue', { value: hueAt(at()) }),
    };
  }

  /** TOK-22: the mode buttons; CHO-7: selected at the dial's 0.20 fill and 0.45 edge of the light's colour. */
  private _renderModes(v: LightView, mode: LightMode | 'toggle', colour: string) {
    const modes = modesFor(v, this._config?.controls.modes);
    if (modes.length < 2) return nothing;
    const hass = this.hass;
    return html`<div class="modes" role="group" aria-label=${t(hass, 'light.mode.group')} style=${styleMap({ gridTemplateColumns: `repeat(${modes.length}, minmax(0, 1fr))` })}>
      ${modes.map((m) => {
        const sel = v.on && m === mode;
        return html`<button
          class="press mode"
          data-mode=${m}
          aria-pressed=${sel ? 'true' : 'false'}
          ?disabled=${!v.available}
          style=${styleMap({
            background: sel ? rgba(colour, PILL_MODES.tint.fill) : undefined,
            borderColor: sel ? rgba(colour, PILL_MODES.tint.edge) : undefined,
            color: sel ? 'var(--lc-fg)' : 'var(--lc-fg2)',
            opacity: v.available ? undefined : String(DISABLED_OPACITY),
          })}
          @click=${() => {
            this._mode = m;
          }}
        >
          ${this._icon(MODE_ICONS[m], 19)}
          <span>${t(hass, `light.mode.${m}`)}</span>
        </button>`;
      })}
    </div>`;
  }

  private _effectLabel(s: HassEntity, effect: string | null): string {
    const hass = this.hass;
    if (!effect || NO_EFFECT.includes(effect)) return t(hass, 'light.effect.none');
    const text = hass?.formatEntityAttributeValue?.(s, 'effect', effect);
    return translated(text, effect) ? text : humanize(effect);
  }

  /** CHO-15: the effect chip (the dial's Preset chip, ICONS.none), or one chip per member of a group (CHO-4). */
  private _renderChips(v: LightView, s: HassEntity, glass: 'dark' | 'light') {
    const hass = this.hass;
    if (v.group) {
      const members = v.members.map((id) => hass?.states[id]).filter((m): m is HassEntity => !!m);
      if (!members.length) return nothing;
      return html`<div class="chips" style=${styleMap({ gridTemplateColumns: `repeat(${Math.min(members.length, MEMBER_COLUMNS)}, minmax(0, 1fr))` })}>
        ${members.map((m) => {
          const mv = lightView(m);
          const value = !mv.available ? '--' : !mv.on ? t(hass, 'core.off') : mv.onoff ? t(hass, 'light.readout.on') : t(hass, 'core.percent', { value: mv.level ?? 1 });
          return html`<button
            class="press chip"
            aria-label=${t(hass, 'light.aria.member', { name: mv.name, value: mv.available ? value : t(hass, 'core.unavailable') })}
            style=${styleMap({ opacity: mv.available ? undefined : String(UNAVAILABLE_POWER_OPACITY) })}
            @click=${() => this._openMember(m.entity_id)}
          >
            <span style=${styleMap({ display: 'flex', flex: 'none', color: mv.on ? colourOf(mv, glass) : 'var(--lc-fg2)' })}>${this._icon(ICONS.bulb, 17, 2)}</span>
            <span class="txt"><span class="k">${mv.name}</span> <span class="v">${value}</span></span>
          </button>`;
        })}
      </div>`;
    }
    if (!this._config!.controls.effects || !v.effectList.length) return nothing;
    const label = this._effectLabel(s, v.effect);
    const active = !!v.on && !!v.effect && !NO_EFFECT.includes(v.effect);
    return html`<div class="chips" style=${styleMap({ gridTemplateColumns: 'repeat(1, minmax(0, 1fr))' })}>
      <button
        class="press chip"
        aria-label=${t(hass, 'light.aria.effect', { value: label })}
        ?disabled=${!v.available}
        style=${styleMap({
          background: active ? 'var(--lc-btn-on)' : undefined,
          borderColor: active ? 'var(--lc-btn-on-edge)' : undefined,
          opacity: v.available ? undefined : String(DISABLED_OPACITY),
        })}
        @click=${() => this._cycleEffect(v)}
      >
        ${this._icon(ICONS.none, 17, 2)}
        <span class="txt"><span class="k">${t(hass, 'light.effect.label')}</span> <span class="v">${label}</span></span>
      </button>
    </div>`;
  }

  /**
   * The dial's preset chip cycles; so does the effect chip (light.turn_on with the next effect).
   * Decision (P11x): the chip also works while the light is off. The call carries the next effect and `on: true`, so
   * the light turns on with that effect; HA turns a light on for any turn_on with an effect anyway.
   */
  private _cycleEffect(v: LightView) {
    if (!v.available || !v.effectList.length) return;
    const i = v.effect ? v.effectList.indexOf(v.effect) : -1;
    this._interacting()?.set({ on: true, effect: v.effectList[(i + 1) % v.effectList.length] });
  }

  private _openMember(entity: string) {
    openLightSheet(this, { type: CARD_TYPES.light, entity, look: this._config!.look });
  }
}

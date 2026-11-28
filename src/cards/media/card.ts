import { html, LitElement, nothing, svg, type PropertyValues, type TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';
import {
  ArtworkController,
  artworkStyles,
  dialChrome,
  DISABLED_OPACITY,
  focusRing,
  glassTokens,
  hassNeedsRender,
  ICONS,
  MENU_CHECK,
  menuStyles,
  openHistory,
  PALETTE,
  PILL_MODES,
  renderArtwork,
  renderSlider,
  resolveGlass,
  rgba,
  SliderController,
  sliderStyles,
  tone,
  UNAVAILABLE_POWER_OPACITY,
  WriterLease,
  type HomeAssistant,
  type SliderView,
} from '@decibel95/liquid-core';
import { CARD_TYPES, TAGS } from '../../const';
import { defaultLook } from '../../config';
import { t } from '../../i18n';
import { isMediaEntity, isMediaLit, MediaClock, mediaStateWord, mediaView, mediaWriters, type MediaState, type MediaView, type MediaWriter } from '../../media';
import { headerIconStyles, renderHeaderIcon, type HeaderIconState } from '../shared/header-icon';
import { lightCardStyles } from '../light/styles';
import { normalizeConfig, type NormalizedMediaConfig } from './config';
import { mediaCardStyles } from './styles';

/** setConfig error: stays English (no hass yet when HA validates a config). */
const ENTITY_ERROR = 'Liquid Home media card: set `entity` to a media player entity (media_player.*).';

/** States with a track: artwork, Previous and Next, the seek line (plan 2.4, P3-CHO-6). */
const LIVE: readonly MediaState[] = ['playing', 'paused', 'buffering'];
/** Power sends turn_on from these (H1 writer): Power is not pressed there (RH1 L6). */
const POWER_OFF: readonly MediaState[] = ['off', 'standby', 'unknown'];

type ChipKey = 'source' | 'soundMode';

/** One button of the playback row (P3-CHO-6). */
interface RowButton {
  key: 'previous' | 'play' | 'next' | 'mute' | 'power';
  icon: string;
  label: string;
  aria?: string;
  pressed?: boolean;
  mirror?: boolean;
  disabled: boolean;
  /** Opacity when disabled: 0.3, or 0.5 for Power of an unavailable player (CHO-11). */
  dim?: number;
  run: (w: MediaWriter) => void;
}

/** HA formatMediaTime: m:ss, h:mm:ss from one hour (plan 2.5, GD3). */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const two = (n: number) => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`;
}

/** The volume pill keys (GD2): arrows 2 %, PageUp/PageDown 10 %, Home 0, End 100. Core clamps the result. */
export function volumeKeyStep(cur: number, key: string): number | undefined {
  const delta: Record<string, number> = {
    ArrowUp: 2,
    ArrowRight: 2,
    ArrowDown: -2,
    ArrowLeft: -2,
    PageUp: 10,
    PageDown: -10,
  };
  if (key === 'Home') return 0;
  if (key === 'End') return 100;
  return key in delta ? cur + delta[key] : undefined;
}

/** The seek keys (GD3): arrows 5 s, PageUp/PageDown 10 % of the duration, Home 0, End the duration (seconds). */
export function seekKeyStep(cur: number, key: string, duration: number): number | undefined {
  const page = duration / 10;
  const delta: Record<string, number> = {
    ArrowUp: 5,
    ArrowRight: 5,
    ArrowDown: -5,
    ArrowLeft: -5,
    PageUp: page,
    PageDown: -page,
  };
  if (key === 'Home') return 0;
  if (key === 'End') return duration;
  return key in delta ? Math.round(cur + delta[key]) : undefined;
}

/**
 * The Liquid Home media card, layout A (plan 2.5, P3-CHO-1 to 13). The cover and fan card frame: the art layer (core
 * artwork-backdrop) under the single glass surface, the header with the speaker device icon and History, the now
 * playing block above the seek line (core horizontal slider) with the volume readout, the volume pill (core vertical
 * slider, kind `position`, D-5), the playback row and the Source and Sound mode chips with an inline menu (D-14).
 * Every write goes through the shared media writer (src/media, plan 2.4); the position ticks with MediaClock (GD3).
 */
export class LiquidHomeMediaCard extends LitElement {
  static override styles = [glassTokens, focusRing, sliderStyles, dialChrome, artworkStyles, menuStyles, headerIconStyles, lightCardStyles, mediaCardStyles];

  @property({ attribute: false }) hass?: HomeAssistant;
  /** Set by the sheet that hosts this card (H3): the sheet supplies History and Close, so the card hides its own. */
  @property({ type: Boolean, attribute: false }) inSheet = false;
  @state() private _config?: NormalizedMediaConfig;
  /** The chip whose menu is open (P3-CHO-11, D-14). */
  @state() private _menu: ChipKey | null = null;

  private readonly _lease = new WriterLease<MediaWriter>(mediaWriters, () => this.requestUpdate());
  /** The view of this render, built in willUpdate (the clock, the artwork and the slider callbacks read it). */
  private _view?: MediaView;
  /** Focus the current menu row after the next render (the menu just opened). */
  private _focusMenu = false;
  /** The readout fit (P2-CHO-6): the measured element and word, and the observer of the body's size. */
  private _fitEl?: HTMLElement;
  private _fitText?: string;
  private _fitObserver?: ResizeObserver;
  private _observed?: Element;

  /** GD5: one artwork layer per card, fed with the view's URL. */
  private readonly _art = new ArtworkController(this);

  /** GD3: ticks only while playing with a seek line, visible, on screen and not seeking (key gestures count). */
  private readonly _clock = new MediaClock(this, () => ({
    playing: this._view?.state === 'playing',
    seekBar: !!this._view && this._seekShown(this._view),
    dragging: this.seek.dragging,
  }));

  /** The volume pill (GD1, GD2): the card holds the writer's queue for the gesture; each previewed percent is sent throttled. */
  readonly volume = new SliderController(this, {
    onStart: () => {
      this._interacting();
      this._lease.hold();
    },
    onPreview: (value) => this._interacting()?.setVolume(Math.round(value)),
    onEnd: () => this._lease.endHold(),
    // The on/off-only toggle pill (P3-CHO-8).
    onToggle: () => this._interacting()?.power(),
  });

  /**
   * True when the running seek gesture was ended by pointercancel: the browser took the touch over for scrolling. Set by
   * the capture listener on the seek wrapper, which runs before core's own handler ends the gesture.
   */
  private _seekCancelled = false;

  /**
   * The seek line (GD3): nothing is sent while dragging, one media_seek at release or keyup. A gesture the browser cancels
   * (a mostly vertical scroll that starts on the bar, touch-action pan-y) sends nothing and restores the shown position.
   * Core follow-up: a horizontal slider's pointercancel should end with no value in the next core release; this flag
   * can go then.
   */
  readonly seek = new SliderController(this, {
    onStart: () => {
      this._seekCancelled = false;
      this._interacting();
    },
    onPreview: (value) => this._interacting()?.seekPreview(Math.round(value)),
    onEnd: (value) => {
      const w = this._interacting();
      const cancelled = this._seekCancelled;
      this._seekCancelled = false;
      if (value == null || cancelled) w?.seekCancel();
      else w?.seekCommit();
    },
  });

  /** Capture phase on the seek wrapper: marks the cancel before core's pointercancel handler on the slider runs. */
  private readonly _onSeekPointerCancel = { handleEvent: () => void (this._seekCancelled = true), capture: true };

  // ---- Lovelace API ----------------------------------------------------

  setConfig(raw: Record<string, unknown>): void {
    if (!raw || !isMediaEntity(raw.entity)) throw new Error(ENTITY_ERROR);
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

  /** The visual editor (`liquid-home-media-card-editor`, src/editor/media.ts, H6). */
  static async getConfigElement(): Promise<HTMLElement> {
    return document.createElement(TAGS.mediaEditor);
  }

  /** The first media player, else a placeholder id. */
  static getStubConfig(hass: HomeAssistant): Record<string, unknown> {
    const pick = Object.values(hass?.states ?? {}).find((s) => isMediaEntity(s.entity_id));
    return {
      type: CARD_TYPES.media,
      entity: pick?.entity_id ?? 'media_player.example',
      config_version: 1,
    };
  }

  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener('pointerdown', this._outside, true);
    // A word measured before the card font loaded is checked again once it has.
    void document.fonts?.ready.then(() => this._fit(true));
    // The lease was released on disconnect; the next render acquires it again.
    this.requestUpdate();
  }

  override disconnectedCallback(): void {
    // A seek drag cut off by leaving the page: drop its target from the shared writer. This runs before super, whose
    // controllers end the gesture, because a disconnected card no longer reaches its writer through _writer().
    if (this.seek.dragging) this._lease.current?.seekCancel();
    super.disconnectedCallback();
    this._fitObserver?.disconnect();
    this._observed = undefined;
    document.removeEventListener('pointerdown', this._outside, true);
    this._menu = null;
    // Do not lose a change the user already made: releasing sends it.
    this._lease.release();
  }

  protected override shouldUpdate(changed: PropertyValues): boolean {
    const cfg = this._config;
    // Before the render filter, so held values end at the echo (H1 writer notes).
    if (changed.has('hass') && cfg && this.hass) this._writer()?.observe(this.hass);
    if (!changed.has('hass') || changed.size > 1 || !cfg || !this.hass) return true;
    return hassNeedsRender(changed.get('hass') as HomeAssistant | undefined, this.hass, [cfg.entity]);
  }

  protected override willUpdate(): void {
    const cfg = this._config;
    const s = cfg && this.hass?.states[cfg.entity];
    if (!cfg || !this.hass || !s) {
      this._view = undefined;
      this._art.set(undefined);
      return;
    }
    const view = () =>
      mediaView(s, {
        entityId: cfg.entity,
        now: this._clock.now,
        hass: this.hass as { hassUrl?: (path?: string) => string },
        pending: this._writer()?.pending,
      });
    const lead = this._clock.now - Date.now();
    this._view = view();
    // The ticker inputs follow this view (state, seek line, drag). Evaluated here and not in updated(), so starting or
    // stopping the clock lands in this render; when that moves the clock's lead, the view is built again with it.
    this._clock.update();
    if (Math.abs(this._clock.now - Date.now() - lead) > 500) this._view = view();
    const v = this._view;
    this._art.set(v.artwork ?? undefined);
    if (this._menu && !this._chips(v).some((c) => c.key === this._menu)) this._menu = null;
  }

  /** The readout fit (re-checked when the body changes size), and focus into a menu that just opened. */
  protected override updated(): void {
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
    if (this._focusMenu) {
      this._focusMenu = false;
      const rows = [...this.renderRoot.querySelectorAll<HTMLElement>('.mitem')];
      (rows.find((r) => r.getAttribute('aria-checked') === 'true') ?? rows[0])?.focus();
    }
  }

  /**
   * P2-CHO-6 (as the cover card): a word readout (On, Off of an on/off-only player) that does not fit at 18cqw steps
   * down to the 44 px cluster value, then ellipsizes (CSS). Only words are measured, and only when the word changed or
   * `force` (resize, font load), so the volume percent and the 1 s ticker never force layout.
   */
  private _fit(force: boolean): void {
    if (!this.isConnected) return;
    const big = this.renderRoot?.querySelector<HTMLElement>('.big');
    if (!big) return;
    if (big.dataset.word === undefined) {
      big.classList.remove('fit');
      this._fitText = undefined;
      return;
    }
    const text = big.textContent ?? '';
    if (!force && big === this._fitEl && text === this._fitText) return;
    this._fitEl = big;
    this._fitText = text;
    big.classList.remove('fit');
    if (big.scrollWidth > big.clientWidth + 1) big.classList.add('fit');
  }

  // ---- State -----------------------------------------------------------

  private _writer(): MediaWriter | undefined {
    const cfg = this._config;
    // A disconnected card never acquires (as the fan card): it would hold the writer for good.
    if (!cfg?.entity || !this.isConnected) return undefined;
    const w = this._lease.get(cfg.entity);
    if (this.hass && !w.hass) w.hass = this.hass;
    return w;
  }

  /** The writer, with this card's hold time: the card that interacts sets it. */
  private _interacting(): MediaWriter | undefined {
    const w = this._writer();
    if (!w) return undefined;
    w.hold = this._config!.write_hold;
    if (this.hass) w.hass = this.hass;
    return w;
  }

  /** Off and unknown draw only Power (P3-CHO-4, D-9); an on/off-only player keeps its toggle pill (P3-CHO-8). */
  private _offLayout(v: MediaView): boolean {
    return v.available && (v.state === 'off' || v.state === 'unknown') && v.kind !== 'onoff';
  }

  private _seekShown(v: MediaView): boolean {
    return !!v.position && LIVE.includes(v.state) && v.kind !== 'onoff';
  }

  /** The seek position at the real time: the clock leads by 1 s while ticking (H1 notes, RH1 L5). */
  private _exactSeconds(): number | undefined {
    const cfg = this._config;
    const s = cfg && this.hass?.states[cfg.entity];
    return s
      ? (mediaView(s, {
          entityId: cfg.entity,
          now: Date.now(),
          pending: this._writer()?.pending,
        }).position?.seconds ?? undefined)
      : undefined;
  }

  private _chips(v: MediaView): { key: ChipKey; label: string; value: string | null; list: string[] }[] {
    const cfg = this._config!;
    const hass = this.hass;
    const out: {
      key: ChipKey;
      label: string;
      value: string | null;
      list: string[];
    }[] = [];
    if (this._offLayout(v)) return out;
    if (cfg.controls.sources && v.can.source && v.sources.length)
      out.push({
        key: 'source',
        label: t(hass, 'media.chip.source'),
        value: v.source,
        list: v.sources,
      });
    if (cfg.controls.sound_modes && v.can.soundMode && v.soundModes.length)
      out.push({
        key: 'soundMode',
        label: t(hass, 'media.chip.soundMode'),
        value: v.soundMode,
        list: v.soundModes,
      });
    return out;
  }

  // ---- Render ----------------------------------------------------------

  protected override render(): TemplateResult {
    const cfg = this._config;
    if (!cfg || !this.hass) {
      return html`<div class="lc g-dark unavailable" style=${styleMap({ '--_blur': `${cfg?.look.blur ?? defaultLook.blur}px` })}>
        ${t(this.hass, 'media.card.loading')}
      </div>`;
    }
    const hass = this.hass;
    const glass = resolveGlass(cfg.look.glass, hass, this);
    const vars = { '--_blur': `${cfg.look.blur}px` };
    const v = this._view;
    if (!v) {
      const name = cfg.name || cfg.entity;
      return html`<section class="lc rim g-${glass}" style=${styleMap(vars)} aria-label=${name}>
        <h2>${name}</h2>
        <div class="unavailable">${t(hass, 'media.card.entityNotFound', { entity: cfg.entity })}</div>
      </section>`;
    }
    const name = cfg.name || v.name;
    const colour = tone(PALETTE.neutral, glass);
    const error = (this._lease.current as (MediaWriter & { error?: string | null }) | undefined)?.error;
    const off = this._offLayout(v);
    return html`<section class="lc rim g-${glass} m-${cfg.look.motion}" style=${styleMap(vars)} aria-label=${name}>
      ${renderArtwork(this._art, { motion: cfg.look.motion })} ${this._renderHeader(v, name, colour)} ${off ? nothing : this._renderBody(v, name, colour)}
      ${this._renderRow(v, colour)} ${this._renderChips(v, name)} ${error ? html`<div class="alert" role="alert">${error}</div>` : nothing}
    </section>`;
  }

  private _icon(path: string, size: number, sw = 1.8, cls = '') {
    return svg`<svg class="i ${cls}" width=${size} height=${size} viewBox="0 0 24 24" stroke-width=${sw} aria-hidden="true"><path d=${path}></path></svg>`;
  }

  /** The state word of the subline (plan 2.4), with the grouped form (P3-CHO-10). */
  private _stateWord(v: MediaView): string {
    const hass = this.hass;
    const word = mediaStateWord(hass!, v);
    return v.available && v.groupedWith > 0 ? t(hass, 'media.sub.grouped', { state: word, n: v.groupedWith }) : word;
  }

  /** P2-CHO-22, P3-CHO-23: the speaker in the neutral while playing or buffering, fg3 otherwise, 0.5 unavailable. */
  private _renderHeader(v: MediaView, name: string, colour: string) {
    const hass = this.hass;
    const iconState: HeaderIconState = !v.available
      ? 'unavailable'
      : isMediaLit(v)
        ? 'active'
        : 'inactive';
    return html`<header>
      ${renderHeaderIcon('speaker', iconState, colour)}
      <div class="titles">
        <h2>${name}</h2>
        <span class="sub">${this._stateWord(v)}</span>
      </div>
      <div class="actions">
        ${
          this.inSheet
            ? nothing
            : html`<button class="press power history" aria-label=${t(hass, 'core.history')} @click=${() => openHistory(this, v.entityId)}>
                ${this._icon(ICONS.history, 18, 2)}
              </button>`
        }
        <slot name="header-action"></slot>
      </div>
    </header>`;
  }

  /** Layout A (P3-CHO-1, 4, 5, 7, 8, 9): now playing, readout and seek line left; volume pill or steps right. */
  private _renderBody(v: MediaView, name: string, colour: string) {
    const hass = this.hass;
    if (v.kind === 'onoff') {
      const on = v.available && !POWER_OFF.includes(v.state);
      const big = !v.available ? '--' : on ? t(hass, 'media.readout.on') : t(hass, 'core.off');
      const view: SliderView = {
        kind: 'toggle',
        value: on ? 100 : 0,
        on,
        available: v.available && (on ? v.can.turnOff : v.can.turnOn),
        color: colour,
        label: t(hass, 'media.aria.power', { name }),
        motion: this._config!.look.motion,
        hass,
        i18n: { t },
      };
      return html`<div class="body">
        <div class="bodyrow">
          <span class="ro"
            ><span class="ro-v"><span class="big" data-word>${big}</span></span
            ><span class="sub">${t(hass, 'media.readout.tap')}</span></span
          >
          <div class="slwrap">${renderSlider(this.volume, view)}</div>
        </div>
      </div>`;
    }
    const standby = v.state === 'standby';
    const pill = v.kind === 'volume' && !standby;
    const steps = v.kind === 'step' && !standby;
    return html`<div class="body">
      <div class="bodyrow ${pill || steps ? '' : 'short'}">
        <div class="np">
          ${this._renderNow(v)}
          <div class="npb">${pill ? this._renderReadout(v) : nothing} ${this._seekShown(v) ? this._renderSeek(v, name, colour) : nothing}</div>
        </div>
        ${pill ? html`<div class="slwrap">${renderSlider(this.volume, this._volumeView(v, name, colour))}</div>` : nothing}
        ${steps ? this._renderSteps(v, name) : nothing}
      </div>
    </div>`;
  }

  /** P3-CHO-5: title 16/600 (two lines), second line 13 fg2, third line 11 fg3; idle and standby "Nothing playing". */
  private _renderNow(v: MediaView) {
    const hass = this.hass;
    const n = v.now;
    const nothingPlaying = v.available && !n.title && (v.state === 'idle' || v.state === 'standby' || v.state === 'on');
    const second = n.episode
      ? t(hass, 'media.now.episode', {
          series: n.episode.series,
          season: n.episode.season,
          episode: n.episode.episode,
        })
      : n.secondary;
    return html`<div class="npt">
      ${nothingPlaying ? html`<span class="np-title none">${t(hass, 'media.now.nothing')}</span>` : n.title ? html`<span class="np-title" dir="auto">${n.title}</span>` : nothing}
      ${second ? html`<span class="np-l2" dir="auto">${second}</span>` : nothing}
      ${n.tertiary ? html`<span class="np-l3" dir="auto">${n.tertiary}</span>` : nothing}
    </div>`;
  }

  /** P3-CHO-4: the volume percent (the finger while dragging), caption Volume or Muted; "--" unavailable. */
  private _renderReadout(v: MediaView) {
    const hass = this.hass;
    const value = this.volume.dragging && this.volume.preview !== undefined ? Math.round(this.volume.preview) : v.volume;
    const known = v.available && value != null;
    return html`<span class="ro">
      <span class="ro-v"><span class="big">${known ? value : '--'}</span><span class="unit">${known ? '%' : ''}</span></span>
      <span class="sub">${t(hass, v.muted && v.available ? 'media.readout.muted' : 'media.readout.volume')}</span>
    </span>`;
  }

  /** D-5: kind `position`, so 0 % reads "0 %" and never "Off"; GD2 keys. */
  private _volumeView(v: MediaView, name: string, colour: string): SliderView {
    const hass = this.hass;
    return {
      kind: 'position',
      value: v.volume ?? 0,
      on: true,
      available: v.available,
      color: colour,
      label: t(hass, 'media.aria.volume', { name }),
      // The percent is the core text in every language ("35%", "35 %"), also inside the muted form.
      valueText: (n) => (v.muted ? t(hass, 'media.aria.volumeMuted', { value: t(hass, 'core.percent', { value: n }) }) : t(hass, 'core.percent', { value: n })),
      keyStep: volumeKeyStep,
      motion: this._config!.look.motion,
      hass,
      i18n: { t },
    };
  }

  /** P3-CHO-7: two 44 px round steps, plus above minus, no readout. */
  private _renderSteps(v: MediaView, name: string) {
    const hass = this.hass;
    const step = (dir: 1 | -1, can: boolean, icon: string, key: string) =>
      html`<button
        class="press step"
        data-step=${dir > 0 ? 'up' : 'down'}
        aria-label=${t(hass, key, { name })}
        ?disabled=${!can}
        style=${styleMap({ opacity: can ? undefined : String(DISABLED_OPACITY) })}
        @click=${() => can && this._interacting()?.step(dir)}
      >
        ${this._icon(icon, 18, 2)}
      </button>`;
    return html`<div class="slwrap steps">
      ${step(1, v.can.stepUp, ICONS.plus, 'media.aria.stepUp')} ${step(-1, v.can.stepDown, ICONS.minus, 'media.aria.stepDown')}
    </div>`;
  }

  /** P3-TOK-5, P3-CHO-2 option 1, P3-CHO-3, GD3: the horizontal core slider, ticking; read-only without SEEK or while buffering. */
  private _renderSeek(v: MediaView, name: string, colour: string) {
    const hass = this.hass;
    const pos = v.position!;
    const dur = pos.duration;
    const dragging = this.seek.dragging && this.seek.preview !== undefined;
    const readOnly = !(v.can.seek && (v.state === 'playing' || v.state === 'paused'));
    // The fill leads by 1 s while ticking (it transitions into the next second); the labels and the value text read the
    // real time (H1 notes, RH1 L5), or the target while dragging.
    const elapsed = dragging ? this.seek.preview! : (this._exactSeconds() ?? pos.seconds);
    const view: SliderView = {
      kind: 'position',
      orientation: 'horizontal',
      max: dur,
      value: pos.seconds,
      on: true,
      available: v.available,
      readOnly,
      ticker: true,
      color: colour,
      label: t(hass, 'media.aria.position', { name }),
      valueText: (n) =>
        t(hass, 'media.aria.time', {
          elapsed: formatTime(this.seek.dragging ? n : elapsed),
          total: formatTime(dur),
        }),
      // Keys count from the real position (RH1 L5), then from the previewed target.
      keyStep: (cur, key) => seekKeyStep(this.seek.preview !== undefined ? cur : (this._exactSeconds() ?? cur), key, dur),
      motion: this._config!.look.motion,
      hass,
      i18n: { t },
    };
    return html`<div class="seek" @pointercancel=${this._onSeekPointerCancel}>
      ${renderSlider(this.seek, view)}
      <span class="times" aria-hidden="true"
        ><span dir="ltr">${dragging ? t(hass, 'media.aria.time', { elapsed: formatTime(elapsed), total: formatTime(dur) }) : formatTime(elapsed)}</span
        ><span dir="ltr">-${formatTime(dur - elapsed)}</span></span
      >
    </div>`;
  }

  /** P3-CHO-6, 9, 12: Previous, Play or Pause, Next, Mute, Power, each only with its bit; off draws Power alone. */
  private _buttons(v: MediaView): RowButton[] {
    const hass = this.hass;
    const name = this._config!.name || v.name;
    const on = v.available;
    const st = v.state;
    const powerOff = POWER_OFF.includes(st);
    const power: RowButton | null =
      v.can.turnOn || v.can.turnOff
        ? {
            key: 'power',
            icon: ICONS.power,
            label: t(hass, 'media.button.power'),
            pressed: on && !powerOff,
            disabled: !on || (powerOff ? !v.can.turnOn : !v.can.turnOff),
            dim: on ? DISABLED_OPACITY : UNAVAILABLE_POWER_OPACITY,
            run: (w) => w.power(),
          }
        : null;
    if (this._offLayout(v)) return power ? [power] : [];
    if (v.kind === 'onoff') return [];
    const out: RowButton[] = [];
    // Unavailable keeps every button of its bits, disabled (CHO-11, canvas board 12).
    const live = LIVE.includes(st) || !on;
    if (v.can.previous && live)
      out.push({
        key: 'previous',
        icon: ICONS.skipForward,
        mirror: true,
        label: t(hass, 'media.button.previous'),
        disabled: !on,
        run: (w) => w.previous(),
      });
    if (v.can.play || v.can.pause) {
      const pausing = st === 'playing' || st === 'buffering';
      out.push({
        key: 'play',
        icon: pausing ? ICONS.pause : ICONS.play,
        label: t(hass, pausing ? 'media.button.pause' : 'media.button.play'),
        aria: t(hass, pausing ? 'media.aria.pause' : 'media.aria.play', {
          name,
        }),
        disabled: !on || st === 'buffering' || st === 'standby' || (pausing ? !v.can.pause : !v.can.play),
        run: (w) => w.playPause(),
      });
    }
    if (v.can.next && live)
      out.push({
        key: 'next',
        icon: ICONS.skipForward,
        label: t(hass, 'media.button.next'),
        disabled: !on,
        run: (w) => w.next(),
      });
    // Standby reports no volume: no Mute (P3-CHO-9).
    if (v.can.mute && st !== 'standby')
      out.push({
        key: 'mute',
        icon: ICONS.volumeX,
        label: t(hass, 'media.button.mute'),
        pressed: on && v.muted,
        disabled: !on,
        run: (w) => w.mute(),
      });
    if (power) out.push(power);
    return out;
  }

  private _renderRow(v: MediaView, colour: string) {
    const buttons = this._buttons(v);
    if (!buttons.length) return nothing;
    return html`<div
      class="modes"
      role="group"
      aria-label=${t(this.hass, 'media.row.group')}
      style=${styleMap({ gridTemplateColumns: `repeat(${buttons.length}, minmax(0, 1fr))` })}
    >
      ${buttons.map((b) => {
        const sel = !!b.pressed && !b.disabled;
        return html`<button
          class="press mode"
          data-action=${b.key}
          aria-label=${b.aria ?? nothing}
          aria-pressed=${b.pressed === undefined ? nothing : b.pressed ? 'true' : 'false'}
          ?disabled=${b.disabled}
          style=${styleMap({
            background: sel ? rgba(colour, PILL_MODES.tint.fill) : undefined,
            borderColor: sel ? rgba(colour, PILL_MODES.tint.edge) : undefined,
            color: sel ? 'var(--lc-fg)' : 'var(--lc-fg2)',
            opacity: b.disabled ? String(b.dim ?? DISABLED_OPACITY) : undefined,
          })}
          @click=${() => {
            if (b.disabled) return;
            const w = this._interacting();
            if (w) b.run(w);
          }}
        >
          ${this._icon(b.icon, 19, 1.8, b.mirror ? 'mirror' : '')}
          <span>${b.label}</span>
        </button>`;
      })}
    </div>`;
  }

  // ---- Chips and the inline menu (P3-CHO-11, GD6, D-14) ----------------

  private _renderChips(v: MediaView, name: string) {
    const chips = this._chips(v);
    if (!chips.length) return nothing;
    const hass = this.hass;
    const open = chips.find((c) => c.key === this._menu);
    // Two siblings returned as a list: happy-dom 15 drops a part placed after a closing tag at a template's top level.
    const row = html`<div class="chips" style=${styleMap({ gridTemplateColumns: `repeat(${chips.length}, minmax(0, 1fr))` })}>
      ${chips.map((c) => {
        const expanded = c.key === this._menu;
        return html`<button
          class="press chip"
          data-chip=${c.key}
          aria-haspopup="menu"
          aria-expanded=${expanded ? 'true' : 'false'}
          aria-controls=${expanded ? `menu-${c.key}` : nothing}
          ?disabled=${!v.available}
          style=${styleMap({
            background: expanded ? 'var(--lc-btn-on)' : undefined,
            borderColor: expanded ? 'var(--lc-btn-on-edge)' : undefined,
            opacity: v.available ? undefined : String(DISABLED_OPACITY),
          })}
          @click=${() => this._toggleMenu(c.key)}
        >
          ${this._icon(ICONS.none, 17, 2)}
          <span class="txt"><span class="k">${c.label}</span> <span class="v" dir="auto">${c.value ?? '--'}</span></span>
        </button>`;
      })}
    </div>`;
    // Always a list, so closing the menu keeps the chip element (and its focus).
    return [
      row,
      !open
        ? nothing
        : html`<div class="mpanel">
            <span class="mhead" aria-hidden="true">${open.label}</span>
            <div
              class="mgroup"
              role="menu"
              id=${`menu-${open.key}`}
              aria-label=${t(hass, 'media.aria.menu', { label: open.label, name })}
              @keydown=${(e: KeyboardEvent) => this._menuKey(e, open.key)}
            >
              ${open.list.map(
                (item) =>
                  html`<button
                    class="mitem"
                    role="menuitemradio"
                    tabindex="-1"
                    aria-checked=${item === open.value ? 'true' : 'false'}
                    data-value=${item}
                    @click=${() => this._select(open.key, item)}
                  >
                    <span class="mlabel" dir="auto">${item}</span
                    >${svg`<svg class="mcheck" viewBox="0 0 24 24" aria-hidden="true"><path d=${MENU_CHECK}></path></svg>`}
                  </button>`,
              )}
            </div>
          </div>`,
    ];
  }

  private _chipEl(key: ChipKey): HTMLElement | null {
    return this.renderRoot.querySelector<HTMLElement>(`.chip[data-chip='${key}']`);
  }

  private _toggleMenu(key: ChipKey): void {
    if (!this._view?.available) return;
    if (this._menu === key) {
      this._menu = null;
      return;
    }
    this._menu = key;
    this._focusMenu = true;
  }

  /** Closes the menu; focus goes back to its chip (Escape, a selection, Tab). */
  private _closeMenu(): void {
    const key = this._menu;
    this._menu = null;
    if (key) this._chipEl(key)?.focus();
  }

  /** One call per selection, none when the value is already shown; the menu closes and focus returns to the chip. */
  private _select(key: ChipKey, value: string): void {
    const v = this._view;
    const w = this._interacting();
    if (v && w && v.available && value !== (key === 'source' ? v.source : v.soundMode)) {
      if (key === 'source') w.selectSource(value);
      else w.selectSoundMode(value);
    }
    this._closeMenu();
  }

  /** D-14, plan 2.11: arrows (wrapping) and Home/End move focus only; Enter or Space selects; Escape and Tab close. */
  private _menuKey(e: KeyboardEvent, key: ChipKey): void {
    const rows = [...this.renderRoot.querySelectorAll<HTMLElement>('.mitem')];
    if (!rows.length) return;
    const at = rows.indexOf((this.shadowRoot?.activeElement ?? null) as HTMLElement);
    const move = (to: number) => {
      e.preventDefault();
      rows[(to + rows.length) % rows.length].focus();
    };
    switch (e.key) {
      case 'ArrowDown':
        return move(at + 1);
      case 'ArrowUp':
        return move(at < 0 ? rows.length - 1 : at - 1);
      case 'Home':
        return move(0);
      case 'End':
        return move(rows.length - 1);
      case 'Escape':
        e.preventDefault();
        return this._closeMenu();
      case 'Tab':
        // Focus goes to the chip first, so the browser's own Tab moves on from there (the menu rows are removed).
        return this._closeMenu();
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (at >= 0) this._select(key, rows[at].dataset.value ?? '');
        return;
    }
  }

  /** A press outside the open menu and its chip closes the menu (plan 2.11). */
  private readonly _outside = (e: Event): void => {
    if (!this._menu) return;
    const path = e.composedPath();
    const panel = this.renderRoot.querySelector('.mpanel');
    const chip = this._chipEl(this._menu);
    if ((panel && path.includes(panel)) || (chip && path.includes(chip))) return;
    this._menu = null;
  };
}

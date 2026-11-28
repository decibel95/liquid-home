import { html, nothing, svg, type PropertyValues } from 'lit';
import { ICONS, LiquidSheetBase, WriterLease, type HomeAssistant, type SheetConfig, type SheetOwner, type Vars } from '@decibel95/liquid-core';
import { TAGS } from '../../const';
import { t } from '../../i18n';
import { defaultLook } from '../../config';
import type { LightCardConfig, LightMode } from '../light/config';
import { MEDIA_FEATURE, mediaView, mediaWriters, type MediaViewOptions, type MediaWriter } from '../../media';

/** What the light card must offer the sheet: Lovelace's setConfig, a hass property and the pill mode to open in. */
type LightCardElement = HTMLElement & {
  setConfig?: (config: Record<string, unknown>) => void;
  hass?: HomeAssistant;
  setPillMode?: (mode: LightMode) => void;
  /** Cards that have a card-face History button hide it while hosted here (the sheet's own History is in the header). */
  inSheet?: boolean;
};

/** The card a sheet hosts for an entity: the cover, fan and media cards by domain, the light card otherwise (plan 2.9, 2.8). */
export function sheetCardTag(entity: string): string {
  const domain = entity.split('.')[0];
  return domain === 'cover' ? TAGS.cover : domain === 'fan' ? TAGS.fan : domain === 'media_player' ? TAGS.media : TAGS.light;
}

const isMedia = (entity: string | undefined): boolean => !!entity && entity.startsWith('media_player.');

/** HA's own hass, for an owner that has none (opened from the page itself). */
export const pageHass = (): HomeAssistant | undefined => (document.querySelector('home-assistant') as SheetOwner | null)?.hass;

/** The core sheet reads `look` (light card configs carry it optionally until normalized) and `historyEntityId` (the history button). */
const asSheetConfig = (config: LightCardConfig): LightCardConfig & SheetConfig => ({
  ...config,
  look: { ...defaultLook, ...(config.look ?? {}) },
  historyEntityId: config.entity,
});

/**
 * The light card in a modal sheet (core LiquidSheetBase): a native <dialog> in the top layer with the card's own
 * glass, the backdrop, the open animation (none under reduced motion or look.motion minimal) and Close in the
 * card's header (slot "header-action"). Opened with core openFor(): the card follows its owner's hass, takes the
 * owner's --lc-radius and --lc-blur, and the sheet closes when the owner leaves the page (a synchronous move keeps it).
 * The cover and fan cards are hosted the same way (by the entity's domain). The card is created by tag name, so this module never imports it. One sheet serves the document (open.ts).
 */
export class LiquidHomeSheet extends LiquidSheetBase<LightCardConfig & SheetConfig> {
  private _owner?: SheetOwner;
  private _entity?: string;
  /** The tag of the card being created, picked from the entity's domain in openFor. */
  private _tag: string = TAGS.light;
  /** The pill mode for the card being created (the room's White and Colour buttons); not stored anywhere. */
  private _mode?: LightMode;
  /** Where focus returns on close, kept so a cross-domain reconfigure can reopen with it. */
  private _focusBack?: HTMLElement | null;
  /** The shared media writer behind Shuffle and Repeat (acquired while a media sheet is open, released on close). */
  private readonly _lease = new WriterLease<MediaWriter>(mediaWriters, () => this.requestActions());

  protected override createContent(): HTMLElement {
    const card = document.createElement(this._tag) as LightCardElement;
    if (this._mode) card.setPillMode?.(this._mode);
    return card;
  }

  protected override applyConfig(content: HTMLElement, config: LightCardConfig & SheetConfig): void {
    // Every hosted card is told it is in the sheet (harmless for cards without the property): the media card hides its History button.
    (content as LightCardElement).inSheet = true;
    (content as LightCardElement).setConfig?.(config as unknown as Record<string, unknown>);
  }

  /** Media players: Shuffle and Repeat, before History and Close (plan 2.8). Other domains: none. */
  protected override headerActions(config: LightCardConfig & SheetConfig): unknown {
    if (!isMedia(config.entity)) {
      this._lease.release();
      return nothing;
    }
    const entityId = config.entity;
    // Idempotent: the lease keeps the writer it has for this entity, so acquiring while rendering is intended.
    const writer = this._lease.get(entityId);
    const view = mediaView(this.hass?.states?.[entityId], { entityId, hass: this.hass as unknown as MediaViewOptions['hass'], pending: writer.pending });
    if (view.state === 'off' || view.state === 'unavailable' || view.state === 'unknown') return nothing;
    const icon = (path: string) =>
      svg`<svg class="i" width="18" height="18" viewBox="0 0 24 24" stroke-width="2" aria-hidden="true"><path d=${path}></path></svg>`;
    const shuffle = view.features & MEDIA_FEATURE.SHUFFLE_SET
      ? html`<button class="act shuffle" slot="header-action" aria-label=${this.tr('media.sheet.shuffle')} aria-pressed=${view.shuffle ? 'true' : 'false'} @click=${() => this._write(entityId, (w) => w.toggleShuffle())}>${icon(ICONS.shuffle)}</button>`
      : nothing;
    const label = view.repeat === 'one' ? 'repeatOne' : view.repeat === 'all' ? 'repeatAll' : 'repeatOff';
    const repeat = view.features & MEDIA_FEATURE.REPEAT_SET
      ? html`<button class="act repeat" slot="header-action" aria-label=${this.tr(`media.sheet.${label}`)} aria-pressed=${view.repeat === 'off' ? 'false' : 'true'} @click=${() => this._write(entityId, (w) => w.cycleRepeat())}>${icon(view.repeat === 'one' ? ICONS.repeat1 : ICONS.repeat)}</button>`
      : nothing;
    return [shuffle, repeat];
  }

  private _write(entityId: string, call: (w: MediaWriter) => void): void {
    const w = this._lease.get(entityId);
    if (this.hass) {
      w.hass = this.hass;
      w.observe(this.hass);
    }
    call(w);
  }

  /** The writer sees every hass, so held values end when HA reports them (core redraws the actions on a hass change; the lease redraws them on a pending change). */
  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    const entity = this._entity;
    if (isMedia(entity) && changed.has('hass') && this.hass && this.isOpen) this._lease.get(entity!).observe(this.hass);
  }

  /** The sheet closed by any path (also a native-only dialog close): release the media writer. */
  protected override onClosed(): void {
    this._lease.release();
  }

  /** Product strings (core, product and card layers), so Close is in the user's language like the cards. */
  protected override tr(key: string, vars?: Vars): string {
    return t(this.hass, key, vars);
  }

  /**
   * Open the light card for `config` on behalf of `owner` (core openFor); focus returns to `returnTo` on close.
   * `mode` opens the card in that pill mode. An owner without hass (the page itself) uses HA's page hass.
   */
  override async openFor(owner: SheetOwner, config: LightCardConfig, returnTo?: HTMLElement | null, mode?: LightMode): Promise<void> {
    if (this.isOpen) return;
    if (!owner.hass) {
      const hass = pageHass();
      if (hass) this.hass = hass;
    }
    this._owner = owner;
    this._entity = config.entity;
    this._tag = sheetCardTag(config.entity);
    this._mode = mode;
    this._focusBack = returnTo ?? owner;
    // open() creates the content before its first await, so the mode is only read for this card.
    const opening = super.openFor(owner, asSheetConfig(config), returnTo ?? owner);
    this._mode = undefined;
    await opening;
  }

  /** Core follows the owner's hass once per frame; an owner without one follows HA's page hass instead. */
  override pushHass(hass: HomeAssistant | undefined): void {
    super.pushHass(hass ?? (this._owner && !this._owner.hass ? pageHass() : undefined));
  }

  override close(): void {
    super.close();
    this._owner = undefined;
    this._lease.release();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._owner = undefined;
    this._lease.release();
  }

  /** The owner's config changed while open: the card follows it. Other owners are ignored. */
  reconfigureFor(owner: HTMLElement, config: LightCardConfig): void {
    if (this.owner !== owner) return;
    // Another domain needs another hosted card: close and reopen for the same owner (focus return kept, V9 follow-up 8).
    if (sheetCardTag(config.entity) !== this._tag) {
      const returnTo = this._focusBack;
      this.close();
      if (!owner.isConnected) return;
      this.openFor(owner as SheetOwner, config, returnTo).catch(() => undefined);
      return;
    }
    this._entity = config.entity;
    this.reconfigure(asSheetConfig(config));
  }

  /** Close when `owner` opened the sheet. */
  closeFor(owner: HTMLElement): void {
    if (this.owner === owner) this.close();
  }

  /** The card that opened the sheet, while it is open. */
  get owner(): HTMLElement | undefined {
    return this.isOpen ? this._owner : undefined;
  }

  /** The light shown, while the sheet is open. */
  get entity(): string | undefined {
    return this.isOpen ? this._entity : undefined;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'liquid-home-sheet': LiquidHomeSheet;
  }
}

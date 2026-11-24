import { LiquidSheetBase, type HomeAssistant, type SheetConfig, type SheetOwner, type Vars } from '@decibel95/liquid-core';
import { TAGS } from '../../const';
import { t } from '../../i18n';
import { defaultLook } from '../../config';
import type { LightCardConfig, LightMode } from '../light/config';

/** What the light card must offer the sheet: Lovelace's setConfig, a hass property and the pill mode to open in. */
type LightCardElement = HTMLElement & {
  setConfig?: (config: Record<string, unknown>) => void;
  hass?: HomeAssistant;
  setPillMode?: (mode: LightMode) => void;
};

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
 * The light card is created by tag name, so this module never imports it. One sheet serves the document (open.ts).
 */
export class LiquidHomeSheet extends LiquidSheetBase<LightCardConfig & SheetConfig> {
  private _owner?: SheetOwner;
  private _entity?: string;
  /** The pill mode for the card being created (the room's White and Colour buttons); not stored anywhere. */
  private _mode?: LightMode;

  protected override createContent(): HTMLElement {
    const card = document.createElement(TAGS.light) as LightCardElement;
    if (this._mode) card.setPillMode?.(this._mode);
    return card;
  }

  protected override applyConfig(content: HTMLElement, config: LightCardConfig & SheetConfig): void {
    (content as LightCardElement).setConfig?.(config as unknown as Record<string, unknown>);
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
    this._mode = mode;
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
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._owner = undefined;
  }

  /** The owner's config changed while open: the card follows it. Other owners are ignored. */
  reconfigureFor(owner: HTMLElement, config: LightCardConfig): void {
    if (this.owner !== owner) return;
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

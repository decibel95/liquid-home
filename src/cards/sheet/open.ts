import { TAGS } from '../../const';
import type { HomeAssistant } from '@decibel95/liquid-core';
import type { LightCardConfig, LightMode } from '../light/config';
import { LiquidHomeSheet } from './liquid-home-sheet';

/** Register `liquid-home-sheet` once, whichever module asks first (a second bundle copy never redefines it). */
export function defineSheet(): void {
  if (!customElements.get(TAGS.sheet)) customElements.define(TAGS.sheet, LiquidHomeSheet);
}

let shared: LiquidHomeSheet | undefined;

/** The one sheet of this document, created on first use and put back if something removed it. */
function sheet(): LiquidHomeSheet {
  defineSheet();
  if (!shared) shared = document.createElement(TAGS.sheet) as LiquidHomeSheet;
  if (!shared.isConnected) document.body.append(shared);
  return shared;
}

/** The focused element, through open shadow roots: the control that was tapped, so focus returns there on close. */
function deepActive(): HTMLElement | null {
  let el = document.activeElement as HTMLElement | null;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement as HTMLElement;
  return el && el !== document.body ? el : null;
}

/** Options of openLightSheet. */
export interface LightSheetOptions {
  /** Open the light card in this pill mode (the room's White and Colour buttons, as the prototype); not stored. */
  mode?: LightMode;
}

/**
 * Opens the light card as a sheet over `host` (a tile, a badge, a room card or the page), through core openFor().
 * One sheet serves the document. While it is open the card follows `host.hass` (HA's page hass when `host` has
 * none), takes the host's --lc-radius and --lc-blur, and the sheet closes when `host` leaves the page (a synchronous
 * move, such as an HA relayout, keeps it open); focus returns to the control that opened it. A call while the sheet
 * is open does nothing.
 */
export function openLightSheet(host: HTMLElement, config: LightCardConfig, opts: LightSheetOptions = {}): void {
  const returnTo = deepActive() ?? host;
  void sheet().openFor(host as HTMLElement & { hass?: HomeAssistant }, config, returnTo, opts.mode);
}

/** The open sheet follows a new config of the card that opened it (a no-op for any other host). */
export function reconfigureLightSheet(host: HTMLElement, config: LightCardConfig): void {
  shared?.reconfigureFor(host, config);
}

/** Close the sheet when `host` opened it. Cards do not need this on disconnect: the sheet closes itself when its owner leaves. */
export function closeLightSheet(host: HTMLElement): void {
  shared?.closeFor(host);
}

/** The shared sheet, for tests and the dev harness. */
export const lightSheet = (): LiquidHomeSheet | undefined => shared;

/** What openEntitySheet takes: a card config of any domain (cover and fan cards, plan 2.9). */
export interface EntitySheetConfig {
  type: string;
  entity: string;
  [option: string]: unknown;
}

/**
 * Opens the card of the entity's domain (light, cover or fan card) as a sheet over `host`, the same sheet as
 * openLightSheet: History for the entity, Close, focus return, following the host's hass. A call while the sheet is
 * open does nothing.
 */
export function openEntitySheet(host: HTMLElement, config: EntitySheetConfig): void {
  // Safe: the sheet only reads `entity` and `look` and hands the rest to the hosted card's own setConfig.
  openLightSheet(host, config as unknown as LightCardConfig);
}

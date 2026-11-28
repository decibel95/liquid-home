import { html, nothing, type TemplateResult } from 'lit';
import { state } from 'lit/decorators.js';
import type { LookConfig, RawConfig } from '../config';
import type { RoomDomain } from '../cards/room/config';
import { LiquidHomeEditor } from './base';

type Tab = 'setup' | 'controls' | 'look';
const TABS: [Tab, string, string][] = [
  ['setup', 'editor.tabSetup', 'entity'],
  ['controls', 'editor.tabControls', 'controls'],
  ['look', 'editor.tabLook', 'look'],
];

/** What the big card editors read from their card's normalized config. */
type BigConfig = RawConfig & { entity: string; name?: string; look?: LookConfig };

/**
 * The editor of a big card (light, cover, fan and media card), as the Liquid Climate dial editor: Setup (entity of the card's
 * domain, name), Controls (the card's own) and Look tabs, each tab with its docs link.
 */
export abstract class LiquidHomeBigCardEditor<C extends BigConfig> extends LiquidHomeEditor<C> {
  @state() private _tab: Tab = 'setup';
  /** The entity domain the card takes. */
  protected abstract readonly _domain: RoomDomain;
  /** The Controls tab. */
  protected abstract _controls(cfg: C): TemplateResult;

  protected override render(): TemplateResult {
    const cfg = this._config;
    if (!cfg || !this.hass) return html``;
    const tab = TABS.find(([id]) => id === this._tab)!;
    return html`
      <div class="tabrow">
        <div class="tabs" role="tablist" aria-label=${this._t('editor.sections')}>
          ${TABS.map(
            ([id, key]) =>
              html`<button
                role="tab"
                aria-selected=${this._tab === id ? 'true' : 'false'}
                class=${this._tab === id ? 'on' : ''}
                @click=${() => (this._tab = id)}
              >
                ${this._t(key)}
              </button>`,
          )}
        </div>
        ${this._help(tab[2], tab[1])}
      </div>
      <div class="body">
        ${this._tab === 'setup' ? [this._entity(cfg.entity, [this._domain]), this._name(cfg.name, cfg.entity)] : nothing}
        ${this._tab === 'controls' ? this._controls(cfg) : nothing} ${this._tab === 'look' ? this._look(cfg.look) : nothing}
      </div>
    `;
  }
}

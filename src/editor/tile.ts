import { html, type TemplateResult } from 'lit';
import type { CardKey } from '../const';
import type { RawConfig } from '../config';
import { normalizeConfig, pruneConfig, type NormalizedTileConfig } from '../cards/tile/config';
import { ROOM_DOMAINS } from '../cards/room/config';
import { LiquidHomeEditor } from './base';

/** Tile editor: entity and name, what a tap does, the write hold and the look, as the Liquid Climate tile editor. */
export class LiquidHomeTileEditor extends LiquidHomeEditor<NormalizedTileConfig> {
  protected readonly _card: CardKey = 'tile';

  protected _normalize(raw: RawConfig) {
    return normalizeConfig(raw);
  }

  protected _prune(c: NormalizedTileConfig) {
    return pruneConfig(c);
  }

  protected override render(): TemplateResult {
    const cfg = this._config;
    if (!cfg || !this.hass) return html``;
    return html`<div class="body">
      ${this._head('entity', 'editor.tabSetup')} ${this._entity(cfg.entity, ROOM_DOMAINS)} ${this._name(cfg.name, cfg.entity)}
      ${this._tap('editor.tapOnName', ['sheet', 'more-info', 'none'], cfg.tap_action)} ${this._hold(cfg.write_hold)} ${this._head('look', 'editor.tabLook')}
      ${this._look(cfg.look)}
      <span class="hint">${this._t('editor.tileHint')}</span>
    </div>`;
  }
}

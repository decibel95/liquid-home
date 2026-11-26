import { html, type TemplateResult } from 'lit';
import type { CardKey } from '../const';
import type { RawConfig } from '../config';
import { normalizeConfig, pruneConfig, type NormalizedBadgeConfig } from '../cards/badge/config';
import { ROOM_DOMAINS } from '../cards/room/config';
import { LiquidHomeEditor } from './base';

/** Badge editor: entity and name, icon only, what a tap does and the look, as the Liquid Climate badge editor. */
export class LiquidHomeBadgeEditor extends LiquidHomeEditor<NormalizedBadgeConfig> {
  protected readonly _card: CardKey = 'badge';

  protected _normalize(raw: RawConfig) {
    return normalizeConfig(raw);
  }

  protected _prune(c: NormalizedBadgeConfig) {
    return pruneConfig(c);
  }

  protected override render(): TemplateResult {
    const cfg = this._config;
    if (!cfg || !this.hass) return html``;
    return html`<div class="body">
      ${this._head('entity', 'editor.tabSetup')} ${this._entity(cfg.entity, ROOM_DOMAINS)} ${this._name(cfg.name, cfg.entity)}
      ${this._switch(this._t('editor.iconOnly'), cfg.icon_only === true, () => this._fire((c) => ({ ...c, icon_only: !c.icon_only })))}
      ${this._tap('editor.tap', ['more-info', 'sheet', 'none'], cfg.tap_action)} ${this._head('look', 'editor.tabLook')} ${this._look(cfg.look)}
    </div>`;
  }
}

import { html, type TemplateResult } from 'lit';
import type { CardKey } from '../const';
import type { RawConfig } from '../config';
import { normalizeConfig, pruneConfig, type NormalizedCoverConfig } from '../cards/cover/config';
import { LiquidHomeBigCardEditor } from './big';

/** Cover card editor: Setup (entity, name), Controls (write hold) and Look tabs, as the light card editor. */
export class LiquidHomeCoverCardEditor extends LiquidHomeBigCardEditor<NormalizedCoverConfig> {
  protected readonly _card: CardKey = 'cover';
  protected readonly _domain = 'cover';

  protected _normalize(raw: RawConfig) {
    return normalizeConfig(raw);
  }

  protected _prune(c: NormalizedCoverConfig) {
    return pruneConfig(c);
  }

  /** How long the sent position stays shown after the cover stops (Q6 a). */
  protected _controls(cfg: NormalizedCoverConfig): TemplateResult {
    // One display: contents wrapper (core's .look) keeps the body's spacing, as the light card's Controls tab.
    return html`<div class="look">${this._hold(cfg.write_hold)}</div>`;
  }
}

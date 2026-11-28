import { html, type TemplateResult } from 'lit';
import type { CardKey } from '../const';
import type { RawConfig } from '../config';
import { mediaView } from '../media';
import { normalizeConfig, pruneConfig, type NormalizedMediaConfig } from '../cards/media/config';
import { LiquidHomeBigCardEditor } from './big';

/**
 * Media card editor (plan 2.9.2): Setup (media player, name), Controls (Source and Sound mode chips, write hold) and
 * Look tabs, as the fan card editor. The look is the core look section: the artwork blur stays fixed (art.blur,
 * TOK-15), whatever look.blur says.
 */
export class LiquidHomeMediaCardEditor extends LiquidHomeBigCardEditor<NormalizedMediaConfig> {
  protected readonly _card: CardKey = 'media';
  protected readonly _domain = 'media_player';

  protected _normalize(raw: RawConfig) {
    return normalizeConfig(raw);
  }

  protected _prune(c: NormalizedMediaConfig) {
    return pruneConfig(c);
  }

  /** The Source and Sound mode chip switches (as the fan card's presets) and the write hold. */
  protected _controls(cfg: NormalizedMediaConfig): TemplateResult {
    const s = this.hass!.states[cfg.entity];
    const v = s ? mediaView(s, { entityId: cfg.entity }) : undefined;
    // -1: no state to read (an entity not chosen yet), so nothing is said; 0: the player lacks the bit or the list.
    const sources = v ? (v.can.source ? v.sources.length : 0) : -1;
    const modes = v ? (v.can.soundMode ? v.soundModes.length : 0) : -1;
    return html`<div class="look">
      ${this._chip('sources', this._t('editor.sources'), cfg.controls.sources, sources, 'editor.sourceCount')}
      ${this._chip('sound_modes', this._t('editor.soundModes'), cfg.controls.sound_modes, modes, 'editor.soundModeCount')}
      ${this._hold(cfg.write_hold)}
    </div>`;
  }

  /** One chip switch: off and disabled with "Not supported by this media player" when the player has none (count 0). */
  private _chip(key: 'sources' | 'sound_modes', label: string, on: boolean, count: number, countKey: string): TemplateResult {
    return this._switch(
      label,
      on && count !== 0,
      () => this._fire((c) => ({ ...c, controls: { ...c.controls, [key]: !c.controls[key] } })),
      count === 0 ? this._t('editor.notSupportedPlayer') : count > 0 ? this._t(countKey, { n: count }) : undefined,
      count === 0,
    );
  }
}

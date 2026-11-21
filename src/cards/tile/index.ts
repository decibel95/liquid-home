import { TAGS } from '../../const';
import { LiquidHomeTile } from './liquid-home-tile';

if (!customElements.get(TAGS.tile)) customElements.define(TAGS.tile, LiquidHomeTile);

export { LiquidHomeTile } from './liquid-home-tile';
export { STEP_PCT } from '../../lights';
export { defaultConfig, normalizeConfig, pruneConfig, sheetConfig, type TileConfig, type TapAction } from './config';

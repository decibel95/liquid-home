import { TAGS } from '../../const';
import { LiquidHomeFanCard } from './card';

export { defaultConfig, normalizeConfig, pruneConfig, type FanCardConfig } from './config';
export { LiquidHomeFanCard } from './card';

// Guarded: a second copy of the bundle on the page must not throw. The picker entry is in src/register.ts (H6).
if (!customElements.get(TAGS.fan)) customElements.define(TAGS.fan, LiquidHomeFanCard);

import { TAGS } from '../../const';
import { LiquidHomeLightCard } from './card';

export { defaultConfig, normalizeConfig } from './config';
export { LiquidHomeLightCard } from './card';
export { lightWriters, type LightPatch, type LightWriter } from '../../lights';

// Guarded: a second copy of the bundle on the page must not throw (plan 2.3). The picker entry is in src/register.ts.
if (!customElements.get(TAGS.light)) customElements.define(TAGS.light, LiquidHomeLightCard);

import { TAGS } from '../../const';
import { LiquidHomeCoverCard } from './card';

export { defaultConfig, normalizeConfig, pruneConfig, type CoverCardConfig } from './config';
export { LiquidHomeCoverCard } from './card';

// Guarded: a second copy of the bundle on the page must not throw. The picker entry is in src/register.ts (H6).
if (!customElements.get(TAGS.cover)) customElements.define(TAGS.cover, LiquidHomeCoverCard);

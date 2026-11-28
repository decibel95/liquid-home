import { TAGS } from '../../const';
import { LiquidHomeMediaCard } from './card';

export { defaultConfig, normalizeConfig, pruneConfig, type MediaCardConfig } from './config';
export { LiquidHomeMediaCard } from './card';

// Guarded: a second copy of the bundle on the page must not throw. The picker entry is in src/register.ts (H6).
if (!customElements.get(TAGS.media)) customElements.define(TAGS.media, LiquidHomeMediaCard);

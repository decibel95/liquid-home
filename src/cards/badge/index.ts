import { TAGS } from '../../const';
import { LiquidHomeBadge } from './liquid-home-badge';

if (!customElements.get(TAGS.badge)) customElements.define(TAGS.badge, LiquidHomeBadge);

export { LiquidHomeBadge, badgeState, type BadgeKind, type BadgeState } from './liquid-home-badge';
export { defaultConfig, normalizeConfig, pruneConfig, sheetConfig, type BadgeConfig } from './config';

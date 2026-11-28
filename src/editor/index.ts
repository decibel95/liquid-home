import { TAGS } from '../const';
import { LiquidHomeLightCardEditor } from './light';
import { LiquidHomeTileEditor } from './tile';
import { LiquidHomeBadgeEditor } from './badge';
import { LiquidHomeRoomEditor } from './room';
import { LiquidHomeCoverCardEditor } from './cover';
import { LiquidHomeFanCardEditor } from './fan';
import { LiquidHomeMediaCardEditor } from './media';

// Guarded: a second copy of the bundle on the page must not throw (plan 2.3).
const define = (tag: string, cls: CustomElementConstructor) => customElements.get(tag) || customElements.define(tag, cls);
define(TAGS.lightEditor, LiquidHomeLightCardEditor);
define(TAGS.tileEditor, LiquidHomeTileEditor);
define(TAGS.badgeEditor, LiquidHomeBadgeEditor);
define(TAGS.roomEditor, LiquidHomeRoomEditor);
define(TAGS.coverEditor, LiquidHomeCoverCardEditor);
define(TAGS.fanEditor, LiquidHomeFanCardEditor);
define(TAGS.mediaEditor, LiquidHomeMediaCardEditor);

export { LiquidHomeLightCardEditor, LiquidHomeTileEditor, LiquidHomeBadgeEditor, LiquidHomeRoomEditor, LiquidHomeCoverCardEditor, LiquidHomeFanCardEditor, LiquidHomeMediaCardEditor };

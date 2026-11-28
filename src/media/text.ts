import type { HomeAssistant } from '@decibel95/liquid-core';
import { t } from '../i18n';
import type { MediaView } from './types';

/** The narrow hass the shared media texts need, so tile, badge, room and card can all call them. */
type TextHass = Pick<HomeAssistant, 'states'> & { language?: string; locale?: { language?: string } };

/**
 * A media player drawn as active (tile tint P3-CHO-15, badge tint P3-CHO-21, card header icon, room glyph and "N of M
 * active"): playing and buffering, and an on/off-only player that is on (canvas MediaTiles row 15).
 */
export const isMediaLit = (v: MediaView): boolean => v.available && (v.state === 'playing' || v.state === 'buffering' || (v.kind === 'onoff' && v.state === 'on'));

/** The state word of a media player (plan 2.4): the media card's words, core "Off" and "Unavailable". */
export function mediaStateWord(hass: TextHass, v: MediaView): string {
  if (!v.available) return t(hass, 'core.unavailable');
  return v.state === 'off' ? t(hass, 'core.off') : t(hass, `media.state.${v.state}`);
}

/**
 * The media tile subline (P3-CHO-18): while playing "Artist, Title" (the second line of the now playing block, so a
 * series player reads "Series, Title"), else the title, else "Playing"; every other state its state word.
 */
export function mediaTileSub(hass: TextHass, v: MediaView): string {
  if (v.available && v.state === 'playing') {
    const { title, secondary } = v.now;
    if (title) return secondary ? `${secondary}, ${title}` : title;
  }
  return mediaStateWord(hass, v);
}

import { css } from 'lit';
import { BADGE, CLUSTER, DIAL, SLIDER, TILE } from '@decibel95/liquid-core';

/**
 * What the media card adds to the dial chrome, the artwork styles and the light card body (liquid-core `dialChrome`,
 * `artworkStyles`, `lightCardStyles`). Layout A of the gate 1 canvas boards MediaCardDark and MediaCardLight and the
 * gate 2 prototype `Card`: the now playing block and the seek line left of the volume pill, the steps, the 320 px
 * row and the readout fit (P2-CHO-6). The inline menu of the chips is core `menuStyles` (P3-CHO-11).
 * Every size is a liquid-core token; small layout gaps are the canvas values.
 */
export const mediaCardStyles = css`
  /*
   * V9 F1: the 1 s seek ticker repaints the card layer every frame, and without a layer of its own the blurred, scaled
   * cover is re-decoded and re-rasterized each time. will-change is a compositing hint, not a visual value. Core
   * follow-up: artworkStyles should promote the art layer itself in the next liquid-core release.
   */
  .art {
    will-change: transform;
  }

  /* The playback row shrinks to the 50 px tile power size on a narrow card (P3-CHO-6: five buttons at 320 px). */
  .lc {
    container-type: inline-size;
  }

  /* Layout A: the left column fills the pill's height, now playing on top, readout and seek line at the bottom. */
  .bodyrow {
    align-items: stretch;
  }
  .bodyrow.short {
    height: auto;
  }
  .np {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: ${CLUSTER.gap.narrow}px;
    min-width: 0;
    flex: 1 1 auto;
  }
  .npt {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .npb {
    display: flex;
    flex-direction: column;
    gap: ${CLUSTER.gap.narrow}px;
    min-width: 0;
  }
  .npb:empty {
    display: none;
  }
  /* P3-CHO-5: title 16/600 in two lines, then 13 fg2 and 11 fg3 in one line each. */
  .np-title {
    font-size: ${TILE.name.size}px;
    font-weight: ${TILE.name.weight};
    line-height: 1.25;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  .np-title.none {
    color: var(--lc-fg2);
  }
  .np-l2,
  .np-l3 {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .np-l2 {
    font-size: ${DIAL.sub}px;
    color: var(--lc-fg2);
  }
  .np-l3 {
    font-size: ${DIAL.chip.key}px;
    color: var(--lc-fg3);
  }

  /* P2-CHO-6: a word that does not fit at 18cqw steps down to the 44 px cluster value, then ellipsizes. */
  .ro-v {
    min-width: 0;
  }
  .big {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .big.fit {
    font-size: ${CLUSTER.value.wide}px;
  }
  .bodyrow > .ro {
    flex: 1 1 auto;
    align-self: center;
  }

  /* The seek line and its times: 12 px fg2 (P3-CON-4), elapsed left, remaining right. */
  .seek {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .times {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: ${BADGE.value}px;
    color: var(--lc-fg2);
    white-space: nowrap;
  }

  /* P3-CHO-7: the two existing 44 px round steps in the pill's place, plus above minus. */
  .steps {
    width: ${SLIDER.width}px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: ${SLIDER.row.gap}px;
  }
  .step {
    width: ${CLUSTER.control}px;
    height: ${CLUSTER.control}px;
    border-radius: 50%;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--lc-fg2);
  }

  /* ICO-8: Previous is skip-forward mirrored, in RTL too (transport icons keep their direction). */
  svg.mirror {
    transform: scaleX(-1);
  }
  @container (max-width: ${SLIDER.row.narrowMax}px) {
    .mode {
      height: ${TILE.power.size}px;
    }
  }

  /*
   * Core menuStyles sets text-align: left on .mitem, so in an RTL page the row labels sit at the left. This follows
   * core in the cascade (the card lists mediaCardStyles after menuStyles). Core follow-up: menuStyles should use start,
   * then this rule can go.
   */
  .mitem {
    text-align: start;
  }
`;

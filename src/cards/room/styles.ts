import { css, unsafeCSS } from 'lit';
import { DISABLED_OPACITY, UNAVAILABLE_POWER_OPACITY } from '@decibel95/liquid-core';

/**
 * What the room card adds to the cluster chrome (liquid-core `clusterChrome`, which also carries the room value block
 * `.room .rv` of the gate 2 prototype, CHO-12), from the gate 2 prototype's room card (lh-proto index.html,
 * `buildRoom`). No sizes of its own: type, radius and spacing come from the cluster.
 */
export const roomStyles = css`
  /*
   * Prototype header: title and summary on the left, the power button on the right, on one line. The cluster header
   * wraps its summary under the title on a baseline; the room header keeps one row (the cluster's gaps).
   */
  header {
    align-items: center;
    flex-wrap: nowrap;
  }
  h2 {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sum {
    white-space: nowrap;
  }
  /* The header power button is the cluster's round 44px step button. */
  .power {
    flex: none;
    color: var(--lc-fg);
  }
  /* CHO-11: an unavailable light's tile at the power opacity, its controls at the disabled opacity. */
  .room.unavail,
  .power:disabled {
    opacity: ${unsafeCSS(UNAVAILABLE_POWER_OPACITY)};
  }
  .mode:disabled {
    opacity: ${unsafeCSS(DISABLED_OPACITY)};
  }
  .mode[hidden] {
    display: none;
  }
  /* ICO-8: Previous is skip-forward mirrored, in RTL too (transport icons keep their direction), as the media card. */
  svg.mirror {
    transform: scaleX(-1);
  }
  /*
   * A cover or fan tile can show a word as its value (Closed, Opening, a preset). It never grows the tile: the
   * cluster value size, then an ellipsis (P2-CHO-6); the footer and the tile name still carry the whole word. Only the
   * x axis clips: the core value has line-height 1, so a y clip would cut the tails of p, g and y.
   */
  .room .big {
    min-width: 0;
    overflow-x: clip;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

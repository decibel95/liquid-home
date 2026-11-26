import { css } from 'lit';
import { CLUSTER } from '@decibel95/liquid-core';

/**
 * What the fan card adds to the light card's body styles (the same header, readout, pill row, buttons and chip): the
 * readout fit of P2-CHO-6. A word or preset that does not fit at 18cqw steps down to the 44px cluster value
 * (CLUSTER.value.wide), then ends in an ellipsis.
 */
export const fanCardStyles = css`
  .ro {
    flex: 1 1 auto;
  }
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
`;

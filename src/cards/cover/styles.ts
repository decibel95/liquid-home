import { css, unsafeCSS } from 'lit';
import { CLUSTER, DIAL, READOUT, SLIDER } from '@decibel95/liquid-core';

/**
 * What the cover card adds to the dial chrome (liquid-core `dialChrome`: glass card, header, mode buttons, alert,
 * unavailable text). The body is the light card's (readout left, pill right, SLIDER.row) plus P2-CHO-6: a word that
 * does not fit at the TOK-20 readout size steps down to the 44px cluster value (CLUSTER.value.wide, class `c44`),
 * then ends in an ellipsis. Every size is a liquid-core token.
 */
export const coverCardStyles = css`
  /* A long name ends in an ellipsis beside the header icon (the light card header). */
  h2 {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .body {
    container-type: inline-size;
    width: 100%;
  }
  .bodyrow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: ${SLIDER.row.gap}px;
    height: ${SLIDER.height}px;
  }
  .ro {
    display: flex;
    flex-direction: column;
    gap: ${SLIDER.row.readoutGap}px;
    min-width: 0;
  }
  .ro .sub {
    font-size: ${DIAL.sub}px;
    color: var(--lc-fg2);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ro-v {
    display: flex;
    align-items: flex-start;
    white-space: nowrap;
    min-width: 0;
  }
  /* TOK-20 readout; P2-CHO-6: no wrap, an ellipsis when even the cluster value does not fit (gate 2 prototype .big). */
  .big {
    font-size: ${unsafeCSS(READOUT.value.size)};
    font-weight: ${READOUT.value.weight};
    letter-spacing: ${unsafeCSS(READOUT.value.letterSpacing)};
    line-height: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    /* Keeps descenders (g, p) inside the clipped box, as the prototype. */
    padding-bottom: 0.12em;
    margin-bottom: -0.12em;
  }
  .big.c44 {
    font-size: ${CLUSTER.value.wide}px;
  }
  .unit {
    font-size: ${unsafeCSS(READOUT.unit.size)};
    font-weight: ${READOUT.unit.weight};
    letter-spacing: ${unsafeCSS(READOUT.unit.letterSpacing)};
    line-height: 1;
    margin-top: 1.5cqw;
    color: var(--lc-fg2);
  }
  .slwrap {
    position: relative;
    flex: none;
    margin-right: ${SLIDER.row.pillInset}px;
  }
  @container (max-width: ${SLIDER.row.narrowMax}px) {
    .slwrap {
      margin-right: 0;
    }
  }
`;

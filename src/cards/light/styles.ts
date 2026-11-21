import { css, unsafeCSS } from 'lit';
import { DIAL, READOUT, SLIDER } from '@decibel95/liquid-core';

/**
 * What the light card adds to the dial chrome (liquid-core `dialChrome`: the glass card, header, power button, press
 * feedback, mode buttons, chips, alert and the unavailable text, the Liquid Climate 0.11.1 dial value for value).
 * Here only the body of the gate 2 prototype (readout and pill row, SLIDER.row) and two product rules; every size is
 * a liquid-core token.
 */
export const lightCardStyles = css`
  /* A long name ends in an ellipsis instead of pushing the power button out (the gate 2 prototype header). */
  h2 {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Body: readout left, pill right (gate 2 prototype .body, .bodyrow, .ro, .slwrap; SLIDER.row). */
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
  /* The label under the readout is set as the header subline (DIAL.sub). */
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
  }
  /* TOK-20: the dial readout, sized to the card's content box. */
  .big {
    font-size: ${unsafeCSS(READOUT.value.size)};
    font-weight: ${READOUT.value.weight};
    letter-spacing: ${unsafeCSS(READOUT.value.letterSpacing)};
    line-height: 1;
  }
  .unit {
    font-size: ${unsafeCSS(READOUT.unit.size)};
    font-weight: ${READOUT.unit.weight};
    letter-spacing: ${unsafeCSS(READOUT.unit.letterSpacing)};
    line-height: 1;
    /* Gate 2 prototype .unit: the unit sits a little below the value's cap height. */
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

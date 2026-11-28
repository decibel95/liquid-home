import { describe, expect, it } from 'vitest';
import { mediaCardStyles } from '../../src/cards/media/styles';

/** V9 F1: the art layer is its own compositor layer, so the seek ticker does not repaint the blurred cover. */
const ART_LAYER = /\.art\s*\{\s*will-change:\s*transform;\s*\}/;

describe('art layer compositing hint', () => {
  it('is in the media card styles', () => {
    expect(mediaCardStyles.cssText).toMatch(ART_LAYER);
  });
});

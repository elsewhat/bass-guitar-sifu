import { describe, expect, it } from 'vitest';
import { fitScale, STAGE_H, STAGE_W } from './layout';

describe('fitScale', () => {
  it('is 1 at the reference size', () => {
    expect(fitScale(STAGE_W, STAGE_H)).toBe(1);
  });

  it('is limited by width at 1280 × 800 (16:10)', () => {
    expect(fitScale(1280, 800)).toBeCloseTo(1280 / 1440);
  });

  it('is limited by height on a 16:9 screen', () => {
    expect(fitScale(1920, 1080)).toBeCloseTo(1080 / 900);
  });

  it('falls back to 1 for an empty viewport', () => {
    expect(fitScale(0, 0)).toBe(1);
  });
});

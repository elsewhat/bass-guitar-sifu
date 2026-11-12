import { describe, expect, it } from 'vitest';
import { fingeringWidth, fitScale, STAGE_H, STAGE_W, stageWidth, videoWidth } from './layout';

describe('stageWidth', () => {
  it('is the design width up to 16:10', () => {
    expect(stageWidth(1440, 900)).toBe(1440);
    expect(stageWidth(1280, 800)).toBe(1440);
    expect(stageWidth(1024, 768)).toBe(1440);
  });

  it('follows the window between 16:10 and 16:9', () => {
    expect(stageWidth(1500, 900)).toBe(1500);
    expect(stageWidth(1920, 1080)).toBe(1600);
    expect(stageWidth(3840, 2160)).toBe(1600);
  });

  it('keeps 16:9 on a wider screen', () => {
    expect(stageWidth(2560, 1080)).toBe(1600);
    expect(fitScale(2560, 1080)).toBeCloseTo(1080 / 900);
  });
});

describe('videoWidth and fingeringWidth', () => {
  it('are the design widths at 1440', () => {
    expect([videoWidth(1440, true), fingeringWidth(1440, true)]).toEqual([619, 505]);
    expect([videoWidth(1440, false), fingeringWidth(1440, false)]).toEqual([711, 617]);
  });

  it('widen the video to 16:9 first, then the fingering column', () => {
    expect([videoWidth(1600, true), fingeringWidth(1600, true)]).toEqual([711, 573]);
    expect([videoWidth(1600, false), fingeringWidth(1600, false)]).toEqual([711, 777]);
  });
});

describe('fitScale', () => {
  it('is 1 at the reference size', () => {
    expect(fitScale(STAGE_W, STAGE_H)).toBe(1);
  });

  it('is limited by width at 1280 × 800 (16:10)', () => {
    expect(fitScale(1280, 800)).toBeCloseTo(1280 / 1440);
  });

  it('fills a 16:9 screen', () => {
    expect(fitScale(1920, 1080)).toBeCloseTo(1080 / 900);
    expect(stageWidth(1920, 1080) * fitScale(1920, 1080)).toBeCloseTo(1920);
  });

  it('falls back to 1 for an empty viewport', () => {
    expect(fitScale(0, 0)).toBe(1);
  });
});

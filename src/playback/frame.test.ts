import { beforeEach, describe, expect, it } from 'vitest';
import { frameTick, resetFrameTick } from './frame';

// 60 fps and 160 bpm: 2.56 ticks per ms.
const FRAME = 1000 / 60;
const SPEED = 2.56;

/** A deterministic stand-in for noise, in [-1, 1]. */
const noise = (i: number) => Math.sin(i * 12.9898) * Math.cos(i * 78.233);

describe('frame tick (ADR-0034)', () => {
  beforeEach(resetFrameTick);

  it('evens out the corrections of the clock and the frame callback delay', () => {
    const shown: number[] = [];
    const raw: number[] = [];
    for (let i = 0; i < 600; i++) {
      const now = i * FRAME + 0.2 * noise(i + 1000); // frame times vary a little
      const at = now + 0.5 + 0.4 * noise(i + 2000); // the callback runs a varying moment later
      const tick = SPEED * at + 3 * noise(i); // the clock, with its corrections
      raw.push(tick);
      shown.push(frameTick(tick, at, now));
    }
    const unevenness = (ticks: number[]) => {
      let worst = 0;
      for (let i = 302; i < ticks.length; i++) worst = Math.max(worst, Math.abs(ticks[i]! - 2 * ticks[i - 1]! + ticks[i - 2]!));
      return worst;
    };
    expect(unevenness(raw)).toBeGreaterThan(5);
    expect(unevenness(shown)).toBeLessThan(unevenness(raw) / 5);
    // No lag: the shown tick stays within a few ms of playing time of the clock.
    for (let i = 300; i < 600; i++) expect(Math.abs(shown[i]! - raw[i]!)).toBeLessThan(SPEED * 4);
  });

  it("is the clock's tick while it stands still, and when it jumps", () => {
    let i = 0;
    const play = (frames: number, from: number) => {
      let tick = from;
      let out = from;
      for (let k = 0; k < frames; k++, i++) {
        tick = from + SPEED * FRAME * k;
        out = frameTick(tick, i * FRAME + 0.5, i * FRAME);
      }
      return { tick, out };
    };
    expect(frameTick(1000, 0.5, 0)).toBe(1000);
    i = 1;
    expect(frameTick(1000, i * FRAME + 0.5, i++ * FRAME)).toBe(1000); // paused
    const first = play(120, 1000);
    expect(first.out).toBeCloseTo(first.tick - SPEED * 0.5, 1); // the tick at the frame's time
    // Loop wrap: back to the start, at once.
    expect(frameTick(1000, i * FRAME + 0.5, i++ * FRAME)).toBe(1000);
    const second = play(120, 1000 + SPEED * FRAME);
    expect(second.out).toBeCloseTo(second.tick - SPEED * 0.5, 1);
    // Paused: exactly the clock's tick, also on the following frames.
    expect(frameTick(second.tick, i * FRAME + 0.5, i++ * FRAME)).toBe(second.tick);
    expect(frameTick(second.tick, i * FRAME + 0.5, i++ * FRAME)).toBe(second.tick);
  });

  it('follows a tempo change within half a second, without a step back', () => {
    let tick = 0;
    let last = -1;
    let out = 0;
    for (let i = 0; i < 240; i++) {
      tick += (i < 120 ? SPEED : SPEED * 0.7) * FRAME;
      out = frameTick(tick, i * FRAME, i * FRAME);
      expect(out).toBeGreaterThan(last);
      last = out;
      if (i > 150) expect(Math.abs(out - tick)).toBeLessThan(SPEED * 10);
    }
    expect(out).toBeCloseTo(tick, 0);
  });
});

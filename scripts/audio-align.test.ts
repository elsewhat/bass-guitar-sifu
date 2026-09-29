import { describe, expect, it } from 'vitest';
import { alignOnsets, firstSoundSec, HOP_SECONDS, measureOffset, OnsetEnvelope } from './lib/audio-align';

/** An envelope with a spike at each onset shifted by `lag`, plus some unrelated spikes. */
function envelopeFor(onsets: number[], lag: number, seconds: number): number[] {
  const env = new Array<number>(Math.round(seconds / HOP_SECONDS)).fill(0.01);
  for (const t of onsets) env[Math.round((t + lag) / HOP_SECONDS)] = 1;
  for (let i = 7; i < env.length; i += 53) env[i] = 0.6; // noise not on the grid
  return env;
}

describe('alignOnsets', () => {
  const onsets = Array.from({ length: 80 }, (_, i) => i * 0.5 + (i % 3) * 0.125); // uneven rhythm

  it('finds the lead-in of the audio', () => {
    const a = alignOnsets(envelopeFor(onsets, 2.37, 60), onsets, -0.5, 8);
    expect(a.lagSec).toBeCloseTo(2.37, 2);
    expect(a.confidence).toBeGreaterThan(3);
  });

  it('finds a negative lag (audio starts after the score)', () => {
    const a = alignOnsets(envelopeFor(onsets, -0.2, 60), onsets.slice(2), -0.5, 8);
    expect(a.lagSec).toBeCloseTo(-0.2, 2);
  });

  it('has low confidence on an envelope without the rhythm', () => {
    const env = Array.from({ length: 6000 }, (_, i) => ((i * 7919) % 97) / 97);
    expect(alignOnsets(env, onsets, -0.5, 8).confidence).toBeLessThan(1.5);
  });
});

describe('measureOffset', () => {
  const onsets = Array.from({ length: 400 }, (_, i) => 0.25 + i * 0.5 + (i % 3) * 0.125);

  it('estimates from the first sound, refines near it and reports no drift', () => {
    const envelope = envelopeFor(onsets, 0.03, 220);
    const levels = envelope.map((_, i) => (i < Math.round(0.27 / HOP_SECONDS) ? -90 : -12));
    const r = measureOffset({ durationSec: 220, levels, envelope }, onsets);
    expect(r.estimateSec).toBeCloseTo(0.02, 2);
    expect(r.head.lagSec).toBeCloseTo(0.03, 2);
    expect(r.tail.lagSec).toBeCloseTo(0.03, 2);
  });

  it('shows drift when the audio runs faster than the tempo map', () => {
    const envelope = new Array<number>(22000).fill(0.01);
    for (const t of onsets) envelope[Math.round((t * 0.999) / HOP_SECONDS)] = 1;
    const levels = envelope.map((_, i) => (i < 25 ? -90 : -12));
    const r = measureOffset({ durationSec: 220, levels, envelope }, onsets);
    expect(r.tail.lagSec - r.head.lagSec).toBeLessThan(-0.1);
  });

  it('finds the first hop within 45 dB of the loudest', () => {
    expect(firstSoundSec([-100, -80, -49, -10, -5])).toBeCloseTo(0.02);
  });
});

describe('OnsetEnvelope', () => {
  it('rises where the level rises', () => {
    const rate = 1000; // 10 samples per hop
    const env = new OnsetEnvelope(rate);
    const quiet = new Float32Array(50).fill(0.001);
    const loud = new Float32Array(50).fill(0.5);
    env.push([quiet], 50);
    env.push([loud], 50);
    expect(env.values).toHaveLength(10);
    const peak = env.values.indexOf(Math.max(...env.values));
    expect(peak).toBe(5);
  });
});

import { describe, expect, it } from 'vitest';
import {
  activeQuickMix,
  applyQuickMix,
  DEFAULT_MIX,
  defaultTracks,
  effectiveGain,
  trackGain,
  trackLabel,
  trackSilenced,
  volumeText,
  type TrackChannel,
} from './mixer';

const on = (volume: number) => ({ volume, muted: false });
const off = (volume: number) => ({ volume, muted: true });
const track = (volume: number, extra: Partial<TrackChannel> = {}): TrackChannel => ({ volume, muted: false, solo: false, ...extra });

describe('mixer (ADR-0020)', () => {
  it('has the ADR defaults', () => {
    expect(DEFAULT_MIX).toEqual({ master: on(80), video: on(100), music: on(100), click: on(70), voice: on(100) });
    expect(defaultTracks(3, 1)).toEqual([track(80), track(80, { solo: true }), track(80)]);
  });

  it('multiplies master and channel into the effective gain', () => {
    expect(effectiveGain(on(80), on(70))).toBeCloseTo(0.56);
    expect(effectiveGain(on(100), on(0))).toBe(0);
  });

  it('gives 0 when the channel or the master is muted, and keeps the slider value', () => {
    expect(effectiveGain(on(80), off(70))).toBe(0);
    expect(effectiveGain(off(80), on(70))).toBe(0);
    expect(volumeText(off(70))).toBe('Muted');
    expect(volumeText(on(70))).toBe('70%');
  });

  it('silences every track but the soloed ones; mute wins over solo', () => {
    const tracks = [track(80), track(60, { solo: true }), track(50, { solo: true, muted: true })];
    expect(tracks.map((_, i) => trackSilenced(tracks, i))).toEqual([true, false, true]);
    expect(tracks.map((_, i) => trackGain(tracks, i))).toEqual([0, 0.6, 0]);
    expect(volumeText(tracks[0]!, trackSilenced(tracks, 0))).toBe('Off');
    expect(volumeText(tracks[2]!, trackSilenced(tracks, 2))).toBe('Muted');
  });

  it('plays every unmuted track when nothing is soloed', () => {
    const tracks = [track(80), track(40, { muted: true }), track(100)];
    expect(tracks.map((_, i) => trackGain(tracks, i))).toEqual([0.8, 0, 1]);
  });

  it('Quick mix presets set solo and mute, keep volumes, and are recognised', () => {
    const tracks = [track(30, { muted: true }), track(90, { solo: true }), track(50)];
    const bass = applyQuickMix(tracks, 'bass', 1);
    expect(bass).toEqual([track(30), track(90, { solo: true }), track(50)]);
    expect(activeQuickMix(bass, 1)).toBe('bass');

    const band = applyQuickMix(tracks, 'band', 1);
    expect(band).toEqual([track(30), track(90), track(50)]);
    expect(activeQuickMix(band, 1)).toBe('band');

    const backing = applyQuickMix(tracks, 'backing', 1);
    expect(backing).toEqual([track(30), track(90, { muted: true }), track(50)]);
    expect(activeQuickMix(backing, 1)).toBe('backing');
    expect(backing.map((_, i) => trackGain(backing, i))).toEqual([0.3, 0, 0.5]);

    expect(activeQuickMix(tracks, 1)).toBeNull(); // a manual mix
    expect(activeQuickMix([], 0)).toBeNull();
  });

  it('names tracks from "Artist | Instrument | Role"', () => {
    expect(trackLabel('Tim Commerford | Music Man Stingray | Bass')).toEqual({
      title: 'Bass',
      description: 'Bass · Tim Commerford · Music Man Stingray',
    });
    expect(trackLabel('Distortion Guitar')).toEqual({ title: 'Distortion Guitar', description: 'Guitar' });
    expect(trackLabel('Jonny Greenwood | Piano (LH)')).toEqual({ title: 'Piano (LH)', description: 'Keys · Jonny Greenwood' });
  });
});

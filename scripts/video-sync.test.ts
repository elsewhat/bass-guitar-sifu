import { describe, expect, it } from 'vitest';
import { parseSidecar } from './lib/sidecar';
import { alignPoints, clock, replaceYoutube, youtubeYaml } from './lib/video-sync';

/** Bar starts in seconds for bars of the given lengths, plus the end of the last bar. */
const starts = (lengths: number[]) => lengths.reduce((acc, d) => [...acc, acc[acc.length - 1]! + d], [0]);
/** Points for bars of the given lengths in the recording, from `offset`. */
const points = (lengths: number[], offset: number) => starts(lengths).slice(0, -1).map((s) => Math.round((s + offset) * 100) / 100);

describe('alignPoints', () => {
  it('gives every bar its point when the counts match, also where the recording slows down', () => {
    const score = starts([2, 2, 2, 2, 2, 2]);
    const a = alignPoints(score, [0.5, 2.5, 4.5, 6.5, 9.5, 13]); // a ritardando at the end
    expect(a.anchors).toEqual([
      { bar: 1, ms: 500 },
      { bar: 2, ms: 2500 },
      { bar: 3, ms: 4500 },
      { bar: 4, ms: 6500 },
      { bar: 5, ms: 9500 },
      { bar: 6, ms: 13_000 },
    ]);
    expect(a.notes).toEqual(['bar lengths far from the score: 4 (×1.50), 5 (×1.75)']);
    expect(a.ratio).toBeCloseTo(1);
    expect(a.drift).toEqual({ seconds: 2.5, bar: 6 });
  });

  it('leaves the last bars without a point when the list stops early', () => {
    const a = alignPoints(starts(Array<number>(10).fill(2)), points(Array<number>(8).fill(2), 0.14));
    expect(a.anchors).toHaveLength(8);
    expect(a.anchors.at(-1)).toEqual({ bar: 8, ms: 14_140 });
    expect(a.notes).toEqual(['8 points for 10 bars: matched by bar durations', "bars 9–10: no point, continued at the score's tempo"]);
  });

  it('ignores a point at the end of the last bar', () => {
    const a = alignPoints(starts(Array<number>(6).fill(2)), points(Array<number>(7).fill(2), 0));
    expect(a.anchors.map((x) => x.bar)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(a.notes).toEqual(['7 points for 6 bars: matched by bar durations']);
  });

  it('merges two points that split one bar (Come As You Are, bar 107)', () => {
    const score = starts([2, 2, 2, 2, 2, 2]);
    const a = alignPoints(score, [0, 2, 4, 5, 6, 8, 10]); // bar 3 has a point halfway
    expect(a.anchors).toEqual([
      { bar: 1, ms: 0 },
      { bar: 2, ms: 2000 },
      { bar: 3, ms: 4000 },
      { bar: 4, ms: 6000 },
      { bar: 5, ms: 8000 },
      { bar: 6, ms: 10_000 },
    ]);
    expect(a.notes[1]).toBe('bar 3: 2 points merged (the recording has 2.00 s, the score 2.00 s)');
  });

  it('interpolates a bar whose point is missing, found by a bar of another length', () => {
    const lengths = [2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2]; // bar 7 is a 2/4 bar
    const all = points(lengths, 0.3);
    const a = alignPoints(starts(lengths), [...all.slice(0, 4), ...all.slice(5)]); // no point for bar 5
    expect(a.anchors.map((x) => x.bar)).toEqual([1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12]);
    expect(a.anchors[4]).toEqual({ bar: 6, ms: 10_300 });
    expect(a.notes).toContain('bar 5: no point, interpolated');
  });

  it('follows a recording that is faster than the score', () => {
    const a = alignPoints(starts(Array<number>(8).fill(2)), points(Array<number>(8).fill(1.9), 1));
    expect(a.ratio).toBeCloseTo(0.95);
    expect(a.drift.seconds).toBeCloseTo(-0.7);
    expect(a.notes).toEqual([]);
  });

  it('drops points before 0:00 and points that do not move forward', () => {
    const a = alignPoints(starts([2, 2, 2, 2]), [-0.29, 1.7, 1.7, 5.7]);
    expect(a.anchors).toEqual([
      { bar: 2, ms: 1700 },
      { bar: 4, ms: 5700 },
    ]);
    expect(a.notes.some((n) => n.startsWith('2 points before 0:00'))).toBe(true);
  });
});

describe('song.yaml output', () => {
  const sidecar = [
    'title: T',
    'artist: A',
    'source: { file: f.gp }',
    'bassTrack: 0',
    'media:',
    '  youtube: { videoId: XFkzRNyygfk, sync: [] }',
    '  music: { source: "a.mp3", offsetMs: 0 }',
    'chunks:',
    '  - { name: A, bars: [1, 2] }',
    '',
  ].join('\n');
  const anchors = Array.from({ length: 7 }, (_, i) => ({ bar: i + 1, ms: 140 + i * 2500 }));

  it('writes five anchors per line and quotes ids that do not start with a letter', () => {
    const yaml = youtubeYaml('-QlIs-fT8Mc', { songId: 16273, revisionId: 8360573 }, anchors);
    expect(yaml).toEqual([
      '  youtube:',
      '    videoId: "-QlIs-fT8Mc"',
      '    songsterr: { songId: 16273, revisionId: 8360573 }',
      '    sync: [',
      '      { bar: 1, ms: 140 }, { bar: 2, ms: 2640 }, { bar: 3, ms: 5140 }, { bar: 4, ms: 7640 }, { bar: 5, ms: 10140 },',
      '      { bar: 6, ms: 12640 }, { bar: 7, ms: 15140 },',
      '      ]',
    ]);
    expect(youtubeYaml('XFkzRNyygfk', null, [])).toEqual(['  youtube:', '    videoId: XFkzRNyygfk', '    sync: []']);
  });

  it('replaces the youtube entry and the result is a valid sidecar, also when run twice', () => {
    const once = replaceYoutube(sidecar, youtubeYaml('3mbBbFH9fAg', { songId: 227, revisionId: 9085891 }, anchors));
    const parsed = parseSidecar(once, 'test');
    expect(parsed.media?.youtube).toEqual({ videoId: '3mbBbFH9fAg', songsterr: { songId: 227, revisionId: 9085891 }, sync: anchors });
    expect(parsed.media?.music).toEqual({ source: 'a.mp3', offsetMs: 0 });
    expect(parsed.chunks).toHaveLength(1);

    const twice = replaceYoutube(once, youtubeYaml('XFkzRNyygfk', null, anchors.slice(0, 2)));
    expect(parseSidecar(twice, 'test').media?.youtube).toEqual({ videoId: 'XFkzRNyygfk', sync: anchors.slice(0, 2) });
    expect(twice.split('\n').filter((l) => l.includes('youtube:'))).toHaveLength(1);
  });

  it('adds the entry when media has none and keeps Windows line ends', () => {
    const without = sidecar.replace('  youtube: { videoId: XFkzRNyygfk, sync: [] }\n', '').replace(/\n/g, '\r\n');
    const out = replaceYoutube(without, youtubeYaml('XFkzRNyygfk', null, []));
    expect(out).toContain('media:\r\n  youtube:\r\n    videoId: XFkzRNyygfk\r\n    sync: []\r\n  music:');
    expect(() => replaceYoutube('title: T\n', [])).toThrow(/media/);
  });

  it('formats video times', () => {
    expect(clock(7810)).toBe('0:07.81');
    expect(clock(230_740)).toBe('3:50.74');
    expect(clock(-3730)).toBe('-0:03.73');
  });
});

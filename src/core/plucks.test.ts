import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { interpolate, playheadX, smoothedX } from '../strip/scroll';
import type { BeatEvent, SongData } from './model';
import { buildPlucks, firstPluckIn, nextDifferentNote, pluckAt } from './plucks';

const vortex = JSON.parse(readFileSync('public/data/songs/vortex-surfer.json', 'utf8')) as SongData;

function note(id: number, start: number, dur: number, string: number, fret: number, extra: Partial<BeatEvent['notes'][0]> = {}): BeatEvent {
  const finger = fret === 0 ? 0 : 1;
  return {
    id,
    bar: 1,
    tick: start,
    start,
    dur,
    kind: 'note',
    notes: [{ string, fret, pitch: 0, tieFromPrev: false, dead: false, finger, position: fret === 0 ? null : fret, ...extra }],
  };
}

describe('buildPlucks', () => {
  it('merges tie continuations into the plucked note', () => {
    const plucks = buildPlucks([note(0, 0, 960, 1, 5), note(1, 960, 960, 1, 5, { tieFromPrev: true }), note(2, 1920, 480, 1, 7)]);
    expect(plucks.map((p) => [p.start, p.dur, p.fret])).toEqual([
      [0, 1920, 5],
      [1920, 480, 7],
    ]);
  });

  it('gives open strings the next fretted position, else the previous one', () => {
    const plucks = buildPlucks([note(0, 0, 480, 0, 0), note(1, 480, 480, 1, 3), note(2, 960, 480, 0, 0)]);
    expect(plucks.map((p) => p.position)).toEqual([3, 3, 3]);
  });

  it('skips rests and leaves gaps between plucks', () => {
    const rest: BeatEvent = { id: 1, bar: 1, tick: 480, start: 480, dur: 480, kind: 'rest', notes: [] };
    const plucks = buildPlucks([note(0, 0, 480, 0, 3), rest, note(2, 960, 480, 0, 5)]);
    expect(pluckAt(plucks, 200)?.fret).toBe(3);
    expect(pluckAt(plucks, 600)).toBeNull();
    expect(pluckAt(plucks, 960)?.fret).toBe(5);
  });

  it('counts Vortex Surfer plucks like the catalogue (tie continuations excluded)', () => {
    expect(buildPlucks(vortex.events)).toHaveLength(vortex.stats.noteCount);
  });

  it('holds the Outro tied D as one long pluck', () => {
    const plucks = buildPlucks(vortex.events);
    const held = pluckAt(plucks, vortex.bars[237]!.startTick)!; // bar 238
    expect(held.bar).toBe(234);
    expect(held.start + held.dur).toBe(vortex.bars[240]!.startTick); // to the end of bar 240
  });
});

/** A chord: [string, fret, finger, pitch] per note, lowest string first as the importer sorts them. */
function chord(id: number, start: number, dur: number, notes: [number, number, number | null, number][], position: number | null, dead = false): BeatEvent {
  return {
    id,
    bar: 1,
    tick: start,
    start,
    dur,
    kind: 'note',
    notes: notes.map(([string, fret, finger, pitch]) => ({
      string,
      fret,
      pitch,
      tieFromPrev: false,
      dead,
      finger: dead ? null : finger,
      position: dead || fret === 0 ? null : position,
    })),
  };
}

// Killing in the Name bar 1 in drop D: D5 with the open D, fingers 1, 4, 4 in position 5.
const d5 = (id: number, start: number) =>
  chord(id, start, 3840, [
    [0, 0, 0, 26],
    [1, 5, 1, 38],
    [2, 7, 4, 45],
    [3, 7, 4, 50],
  ], 5);

describe('buildPlucks with chords', () => {
  it('keeps every note, highest string first, and names power chords', () => {
    const [p] = buildPlucks([d5(0, 0)]);
    expect(p!.notes.map((n) => [n.string, n.fret, n.finger])).toEqual([
      [3, 7, 4],
      [2, 7, 4],
      [1, 5, 1],
      [0, 0, 0],
    ]);
    expect(p!.chord).toBe('D5');
    expect([p!.string, p!.fret]).toEqual([0, 0]); // the primary note is still the lowest string
  });

  it('puts the hand where the chord is fretted, even when its lowest note is open', () => {
    const plucks = buildPlucks([d5(0, 0), note(1, 3840, 960, 1, 6, { position: 6 })]);
    expect(plucks.map((p) => p.position)).toEqual([5, 6]);
  });

  it('borrows the hand position for an all-dead chord and gives it no name', () => {
    const muted = chord(0, 0, 480, [[0, 2, null, 30], [1, 7, null, 40]], null, true);
    const plucks = buildPlucks([muted, note(1, 480, 480, 1, 3)]);
    expect(plucks[0]).toMatchObject({ position: 3, chord: null });
    expect(plucks[0]!.notes.every((n) => n.dead)).toBe(true);
  });

  it('sees a change on an upper string as the next different note', () => {
    const upper = chord(1, 3840, 3840, [[0, 0, 0, 26], [1, 5, 1, 38], [2, 7, 4, 45], [3, 6, 2, 49]], 5);
    const plucks = buildPlucks([d5(0, 0), upper, d5(2, 7680)]);
    const next = nextDifferentNote(plucks, 0, { start: 0, end: 11520 }, null)!;
    expect(next.when).toBe('in 1'); // the chord at 3840 differs only on the G string
    expect(next.pluck.notes[0]).toMatchObject({ string: 3, fret: 6 });
  });
});

describe('nextDifferentNote', () => {
  const plucks = buildPlucks(vortex.events);
  const riffA = { start: vortex.bars[129]!.startTick, end: vortex.bars[133]!.startTick }; // bars 130–133
  const riffA2 = { start: vortex.bars[133]!.startTick, end: vortex.bars[141]!.startTick };

  it('counts plucks until the note changes (Riff A: 8 × B♭ then G)', () => {
    const next = nextDifferentNote(plucks, riffA.start, riffA, null)!;
    expect(next.when).toBe('in 8');
    expect([next.pluck.string, next.pluck.fret]).toEqual([0, 3]);
  });

  it('wraps to the loop start, or the next chunk when advancing', () => {
    const lastTick = riffA.end - 10;
    expect(nextDifferentNote(plucks, lastTick, riffA, null)).toMatchObject({ when: 'loop', pluck: firstPluckIn(plucks, riffA)! });
    expect(nextDifferentNote(plucks, lastTick, riffA, riffA2)).toMatchObject({ when: 'next chunk', pluck: firstPluckIn(plucks, riffA2)! });
  });
});

describe('strip scroll mapping', () => {
  const anchors = [
    { tick: 0, x: 0 },
    { tick: 960, x: 100 },
    { tick: 1920, x: 150 },
  ];

  it('interpolates between beat onsets and extends past the ends', () => {
    expect(interpolate(anchors, 480)).toBe(50);
    expect(interpolate(anchors, 1440)).toBe(125);
    expect(interpolate(anchors, 2880)).toBe(200);
  });

  it('keeps every onset within the bound of the band centre, without speed jumps', () => {
    // Two bars of eight eighths, 31 px apart, with a 40 px barline gap (alphaTab-like spacing).
    const a: { tick: number; x: number }[] = [];
    for (let bar = 0; bar < 2; bar++) for (let i = 0; i < 8; i++) a.push({ tick: bar * 3840 + i * 480, x: bar * (7 * 31 + 71) + i * 31 });
    a.push({ tick: 7680, x: 2 * (7 * 31 + 71) });
    const worstSmoothed = Math.max(...a.map((p) => Math.abs(smoothedX(a, p.tick) - p.x)));
    const worst = Math.max(...a.map((p) => Math.abs(playheadX(a, p.tick, 10) - p.x)));
    expect(worstSmoothed).toBeGreaterThan(10);
    expect(worst).toBeLessThanOrEqual(10);
    // Moves forward all the time, and no step is far from the average step.
    const steps = Array.from({ length: 760 }, (_, i) => playheadX(a, (i + 1) * 10, 10) - playheadX(a, i * 10, 10));
    expect(Math.min(...steps)).toBeGreaterThan(0);
    expect(Math.max(...steps) / Math.min(...steps)).toBeLessThan(4);
  });

  it('smooths the speed change around an onset', () => {
    const x = smoothedX(anchors, 960);
    expect(x).toBeGreaterThan(75);
    expect(x).toBeLessThan(100);
    expect(smoothedX([{ tick: 0, x: 0 }, { tick: 960, x: 100 }], 480)).toBeCloseTo(50);
  });
});

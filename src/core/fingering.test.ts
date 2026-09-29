import { describe, expect, it } from 'vitest';
import { boxFinger, solveFingering, type FingeringOverride } from './fingering';
import type { BeatEvent } from './model';

const E_STANDARD = [28, 33, 38, 43];
const DROP_D = [26, 33, 38, 43];
const E = 0;
const A = 1;
const D = 2;
const G = 3;

type Spec = [string: number, fret: number] | [string: number, fret: number][] | 'rest';

/** One event per spec, eighth notes, 8 per bar. A spec is a note, a double stop or a rest. */
function events(specs: Spec[], tuning = E_STANDARD): BeatEvent[] {
  return specs.map((spec, id) => {
    const start = id * 480;
    const base = { id, bar: 1 + Math.floor(id / 8), tick: start % 3840, start, dur: 480 };
    if (spec === 'rest') return { ...base, kind: 'rest', notes: [] };
    const notes = (typeof spec[0] === 'number' ? [spec as [number, number]] : (spec as [number, number][])).map(([string, fret]) => ({
      string,
      fret,
      pitch: tuning[string]! + fret,
      tieFromPrev: false,
      dead: false,
      finger: null,
      position: null,
    }));
    return { ...base, kind: 'note', notes };
  });
}

function solve(specs: Spec[], opts: { tuning?: number[]; overrides?: FingeringOverride[] } = {}) {
  const tuning = opts.tuning ?? E_STANDARD;
  return solveFingering(events(specs, tuning), { tuning, maxFret: 14, overrides: opts.overrides }).filter((e) => e.kind === 'note');
}

/** `string/fret finger p position` for every note, in order. */
function show(evts: BeatEvent[]) {
  return evts.flatMap((e) => e.notes.map((n) => `${'EADG'[n.string]}${n.fret} f${n.finger} p${n.position ?? '-'}`));
}

describe('boxFinger', () => {
  it('uses 1-2-4 in low positions and one finger per fret higher up', () => {
    expect([2, 3, 4, 5].map((f) => boxFinger(f, 2))).toEqual([1, 2, 4, null]);
    expect([7, 8, 9, 10, 11].map((f) => boxFinger(f, 7))).toEqual([1, 2, 3, 4, null]);
    expect(boxFinger(4, 5)).toBeNull();
  });
});

describe('solveFingering', () => {
  it('plays a dense low phrase 1-2-4 in one position', () => {
    expect(show(solve([[A, 2], [A, 3], [A, 4], [A, 3], [A, 2], [A, 3], [A, 4], [A, 2]]).slice(0, 3))).toEqual(['A2 f1 p2', 'A3 f2 p2', 'A4 f4 p2']);
  });

  it('plays a dense high phrase one finger per fret', () => {
    expect(show(solve([[A, 7], [A, 8], [A, 9], [A, 10], [A, 9], [A, 8], [A, 7], [A, 10]]).slice(0, 4))).toEqual(['A7 f1 p7', 'A8 f2 p7', 'A9 f3 p7', 'A10 f4 p7']);
  });

  it('leads with the index and micro-shifts in rests when the passage is sparse', () => {
    expect(show(solve([[A, 5], 'rest', [A, 7], 'rest', [A, 5], 'rest', [A, 7]]))).toEqual(['A5 f1 p5', 'A7 f1 p7', 'A5 f1 p5', 'A7 f1 p7']);
  });

  it('reaches up with the little finger when there is no break', () => {
    expect(show(solve([[E, 3], [E, 3], [E, 5], [E, 5]]))).toEqual(['E3 f1 p3', 'E3 f1 p3', 'E5 f4 p3', 'E5 f4 p3']);
  });

  it('plays the upper note with the little finger before a descent without a break', () => {
    expect(show(solve([[E, 5], [E, 5], [E, 3], [E, 3]]))).toEqual(['E5 f4 p3', 'E5 f4 p3', 'E3 f1 p3', 'E3 f1 p3']);
  });

  it('does not roll a finger between the E and A strings at the same fret', () => {
    const notes = solve([[E, 7], [E, 8], [E, 10], [A, 10], [E, 7], [E, 8], [E, 10], [A, 10]]).flatMap((e) => e.notes);
    for (let i = 1; i < notes.length; i++) {
      const [x, y] = [notes[i - 1]!, notes[i]!];
      if (x.fret === y.fret && x.string !== y.string) expect(x.finger).not.toBe(y.finger);
    }
  });

  it('allows the little finger to roll between D and G', () => {
    expect(show(solve([[D, 6], [D, 7], [D, 9], [G, 9], [D, 6], [D, 7], [D, 9], [G, 9]]).slice(0, 4))).toEqual(['D6 f1 p6', 'D7 f2 p6', 'D9 f4 p6', 'G9 f4 p6']);
  });

  it('keeps a one-finger barre for a same-fret double stop', () => {
    const chord: Spec = [
      [E, 3],
      [A, 3],
      [D, 3],
    ];
    const [first] = solve([chord, chord, 'rest', chord], { tuning: DROP_D });
    expect(first!.notes.map((n) => [n.fret, n.finger])).toEqual([
      [3, 1],
      [3, 1],
      [3, 1],
    ]);
  });

  it('plans around an override and slides the pinned finger to the next note', () => {
    const out = solve([[E, 3], [E, 3], [E, 5], [E, 5]], { overrides: [{ bar: 1, tick: 0, finger: 2 }] });
    // Guide finger: the pinned middle finger slides up the E string.
    expect(show(out)).toEqual(['E3 f2 p2', 'E3 f2 p2', 'E5 f2 p4', 'E5 f2 p4']);
  });
});

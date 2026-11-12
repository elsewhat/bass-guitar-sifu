import { describe, expect, it } from 'vitest';
import { fretboardHtml, type FretboardModel } from './fretboard';

const base: Omit<FretboardModel, 'current' | 'next'> = { frets: 9, letters: ['D', 'A', 'D', 'G'], position: 5 };

/** Finger capsules are the boxes labelled 1–4; active ones have the white border. */
function activeFingers(html: string): string[] {
  return [...html.matchAll(/border:2px solid #ffffff[^"]*">([1-4])</g)].map((m) => m[1]!);
}
const count = (html: string, s: string) => html.split(s).length - 1;

describe('fretboardHtml', () => {
  it('lights one finger for a single note', () => {
    const html = fretboardHtml({ ...base, current: [{ string: 1, fret: 5, finger: 1 }], next: [] });
    expect(activeFingers(html)).toEqual(['1']);
  });

  it('lights index and little finger for a power chord', () => {
    const html = fretboardHtml({
      ...base,
      current: [
        { string: 2, fret: 7, finger: 4 },
        { string: 1, fret: 5, finger: 1 },
      ],
      next: [],
    });
    expect(activeFingers(html)).toEqual(['1', '4']);
  });

  it('draws the D5 barre: the little finger reaches G and holds D, the open D sits at the nut', () => {
    const html = fretboardHtml({
      ...base,
      current: [
        { string: 3, fret: 7, finger: 4 },
        { string: 2, fret: 7, finger: 4 },
        { string: 1, fret: 5, finger: 1 },
        { string: 0, fret: 0, finger: 0 },
      ],
      next: [],
    });
    expect(activeFingers(html)).toEqual(['1', '4']);
    expect(html).toContain('background:var(--string-4);border:2px solid #ffffff'); // capsule tip on G
    expect(count(html, 'width:16px;height:16px')).toBe(1); // barre dot on D
    expect(count(html, '">0</div>')).toBe(1); // open D
  });

  // Left edge of the lit capsule of a finger, and of the dashed "Next" rings.
  const capsuleLeft = (html: string, finger: number) => Number(new RegExp(`left:([\\d.]+)px;[^"]*border:2px solid #ffffff[^"]*">${finger}<`).exec(html)![1]);
  const ringLefts = (html: string) => [...html.matchAll(/left:([\d.]+)px;[^"]*border:2px dashed #ffffff/g)].map((m) => Number(m[1]));

  it('lights the little finger on the fret its note is on: two frets from the index in the 1-2-4 box', () => {
    // Position 3, little finger on fret 5 (ADR-0007). The ring for the same fret is 3 px wider on each side.
    const next = fretboardHtml({ ...base, position: 3, current: [], next: [{ string: 1, fret: 5 }] });
    const now = fretboardHtml({ ...base, position: 3, current: [{ string: 1, fret: 5, finger: 4 }], next: [] });
    expect(capsuleLeft(now, 4) - ringLefts(next)[0]!).toBeCloseTo(3);
    expect(activeFingers(now)).toEqual(['4']);
  });

  it('lights the little finger three frets from the index above position 5', () => {
    const next = fretboardHtml({ ...base, frets: 12, position: 7, current: [], next: [{ string: 1, fret: 10 }] });
    const now = fretboardHtml({ ...base, frets: 12, position: 7, current: [{ string: 1, fret: 10, finger: 4 }], next: [] });
    expect(capsuleLeft(now, 4) - ringLefts(next)[0]!).toBeCloseTo(3);
  });

  it('rings every next note that is not already held, with one "Next" label', () => {
    const html = fretboardHtml({
      ...base,
      current: [{ string: 1, fret: 5, finger: 1 }],
      next: [
        { string: 1, fret: 5 },
        { string: 2, fret: 7 },
        { string: 3, fret: 7 },
      ],
    });
    expect(count(html, 'border:2px dashed #ffffff')).toBe(2);
    expect(count(html, '>Next<')).toBe(1);
  });
});

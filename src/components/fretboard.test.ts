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

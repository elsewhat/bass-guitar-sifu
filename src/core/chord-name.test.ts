import { describe, expect, it } from 'vitest';
import { chordName } from './chord-name';

describe('chordName', () => {
  it('names power chords from the lowest note', () => {
    expect(chordName([26, 38, 45, 50])).toBe('D5'); // Killing in the Name bar 1, drop D
    expect(chordName([33, 40])).toBe('A5');
    expect(chordName([46, 53])).toBe('B♭5');
  });

  it('names octaves by their note', () => {
    expect(chordName([28, 40])).toBe('E');
  });

  it('gives no name to other intervals, single notes and unisons', () => {
    expect(chordName([56, 62])).toBeNull(); // tritone
    expect(chordName([33, 37])).toBeNull(); // third
    expect(chordName([38])).toBeNull();
    expect(chordName([38, 38])).toBeNull();
    expect(chordName([])).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { lineSwitchTicks, lyricChunks, lyricsCursor, LINE_LEAD, parseLyricsText, syncedLyrics, type Syllable } from './lyrics';
import { PPQ } from './model';

// Made-up words only: the real lyrics live in the song files (ADR-0024).

/** Syllables one eighth apart (480 ticks), each lasting an eighth; `null` is an eighth rest. */
function sing(parts: (string | null)[], from = 0): Syllable[] {
  const out: Syllable[] = [];
  parts.forEach((text, i) => {
    if (text !== null) out.push({ text, start: from + i * 480, end: from + (i + 1) * 480, index: out.length });
  });
  return out;
}

describe('lyricChunks', () => {
  it('cuts syllables at spaces, line breaks and dashes, and keeps the line', () => {
    expect(lyricChunks('Blue ca-ble\nrun-ning  low')).toEqual([
      { text: 'Blue', line: 0 },
      { text: 'ca-', line: 0 },
      { text: 'ble', line: 0 },
      { text: 'run-', line: 1 },
      { text: 'ning', line: 1 },
      { text: 'low', line: 1 },
    ]);
  });

  it('turns every extra dash into a held syllable', () => {
    expect(lyricChunks('oh-- yes').map((c) => c.text)).toEqual(['oh-', '-', 'yes']);
  });

  it('skips [comments] and counts their lines', () => {
    expect(lyricChunks('[Verse 1]\nhello there\n\n[Chorus]\nagain')).toEqual([
      { text: 'hello', line: 1 },
      { text: 'there', line: 1 },
      { text: 'again', line: 4 },
    ]);
  });
});

describe('parseLyricsText', () => {
  it('keeps text lines, sections and stanza breaks', () => {
    expect(parseLyricsText('[Verse]\r\nFirst  line\nsecond line\n\n\nthird line\n[Chorus]\nfourth\n')).toEqual([
      { text: 'First line', section: 'Verse', gap: false, words: [] },
      { text: 'second line', section: null, gap: false, words: [] },
      { text: 'third line', section: null, gap: true, words: [] },
      { text: 'fourth', section: 'Chorus', gap: true, words: [] },
    ]);
  });
});

describe('syncedLyrics', () => {
  it('joins syllables into words and holds a syllable over "-"', () => {
    const { lines } = syncedLyrics(sing(['Blue', 'ca-', 'ble', 'oh-', '-', 'yes']), null);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.words).toEqual([
      { text: 'Blue', start: 0, end: 480 },
      { text: 'cable', start: 480, end: 1440 },
      { text: 'ohyes', start: 1440, end: 2880 },
    ]);
    expect(lines[0]!.text).toBe('Blue cable ohyes');
  });

  it('splits "+" into words on one beat and drops the "_" extender', () => {
    const { lines } = syncedLyrics(sing(['the+sun_', 'rose']), null);
    expect(lines[0]!.words.map((w) => [w.text, w.start])).toEqual([
      ['the', 0],
      ['sun', 0],
      ['rose', 480],
    ]);
  });

  it('takes lines, sections and stanza breaks from the text when the syllables match', () => {
    const text = '[Verse]\nBlue ca-ble\nrun-ning low\n\nstill here';
    const { lines, fromText } = syncedLyrics(sing(['Blue', 'ca-', 'ble', 'run-', 'ning', 'low', 'still', 'here']), text);
    expect(fromText).toBe(true);
    expect(lines.map((l) => [l.text, l.section, l.gap])).toEqual([
      ['Blue cable', 'Verse', false],
      ['running low', null, false],
      ['still here', null, true],
    ]);
  });

  it('falls back to rests and punctuation when the text does not match or has one line', () => {
    const parts = ['one', 'two', 'three', 'four', null, null, 'five', 'six.', 'seven', 'eight', 'nine', 'ten', 'eleven'];
    // A quarter rest ends the first line; "six." ends a sentence while the line is still short.
    const expected = ['one two three four', 'five six. seven eight nine ten eleven'];
    const noText = syncedLyrics(sing(parts), null);
    expect(noText.fromText).toBe(false);
    expect(noText.lines.map((l) => l.text)).toEqual(expected);
    const oneLine = syncedLyrics(sing(parts), 'one two three four five six. seven eight nine ten eleven');
    expect(oneLine.fromText).toBe(false);
    expect(oneLine.lines.map((l) => l.text)).toEqual(expected);
    const mismatch = syncedLyrics(sing(parts), 'one two\nthree');
    expect(mismatch.fromText).toBe(false);
    expect(mismatch.lines.map((l) => l.text)).toEqual(expected);
  });

  it('cuts before a capitalised word but not before "I"', () => {
    const { lines } = syncedLyrics(sing(['we', 'go', 'on', 'I', 'know', 'Then', 'we', 'stop']), null);
    expect(lines.map((l) => l.text)).toEqual(['we go on I know', 'Then we stop']);
  });

  it('cuts at a sentence end once a line has four words, and after twelve words', () => {
    const { lines } = syncedLyrics(sing(['a', 'b.', 'c', 'd', 'e.', ...'fghijklmnopqrs'.split('')]), null);
    expect(lines.map((l) => l.words.length)).toEqual([5, 12, 2]);
  });

  it('starts a new line after a long rest, but never inside a word', () => {
    const long = 4 * PPQ;
    const syl: Syllable[] = [
      { text: 'far', start: 0, end: 480, index: 0 },
      { text: 'a-', start: 480 + long, end: 960 + long, index: 1 },
      { text: 'way', start: 960 + 2 * long, end: 1440 + 2 * long, index: 2 },
    ];
    expect(syncedLyrics(syl, null).lines.map((l) => l.text)).toEqual(['far', 'away']);
  });

  it('starts a new line when a repeat plays the same syllables again', () => {
    const syl = sing(['la', 'la']);
    const again = syl.map((s) => ({ ...s, start: s.start + 960, end: s.end + 960 }));
    expect(syncedLyrics([...syl, ...again], 'la la').lines.map((l) => l.text)).toEqual(['la la', 'la la']);
  });
});

describe('lyricsCursor', () => {
  const { lines } = syncedLyrics(
    [
      { text: 'one', start: 0, end: 480, index: 0 },
      { text: 'two', start: 960, end: 1440, index: 1 },
      { text: 'Three', start: 8000, end: 8480, index: 2 },
      { text: 'four', start: 8480, end: 9000, index: 3 },
    ],
    'one two\nThree four',
  );
  const switches = lineSwitchTicks(lines);

  it('switches to the next line at most LINE_LEAD before its first word', () => {
    expect(switches).toEqual([-Infinity, 8000 - LINE_LEAD]);
  });

  it('shows the first line from the start, with nothing sung yet', () => {
    expect(lyricsCursor(lines, switches, -500)).toEqual({ line: 0, sung: 0, active: false });
  });

  it('marks the word being sung and the words already sung', () => {
    expect(lyricsCursor(lines, switches, 100)).toEqual({ line: 0, sung: 1, active: true });
    expect(lyricsCursor(lines, switches, 600)).toEqual({ line: 0, sung: 1, active: false });
    expect(lyricsCursor(lines, switches, 1000)).toEqual({ line: 0, sung: 2, active: true });
    expect(lyricsCursor(lines, switches, 3000)).toEqual({ line: 0, sung: 2, active: false });
  });

  it('moves to the next line before it is sung, and back after a loop wrap', () => {
    expect(lyricsCursor(lines, switches, 8000 - LINE_LEAD)).toEqual({ line: 1, sung: 0, active: false });
    expect(lyricsCursor(lines, switches, 8500)).toEqual({ line: 1, sung: 2, active: true });
    expect(lyricsCursor(lines, switches, 0)).toEqual({ line: 0, sung: 1, active: true });
  });
});

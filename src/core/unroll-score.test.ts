import * as alphaTab from '@coderline/alphatab';
import { describe, expect, it } from 'vitest';
import { orderSegments, playedOrder, unrollScore } from './unroll-score';

const settings = new alphaTab.Settings();

/** A one-track bass score from alphaTex; each bar is four quarter notes on the G string. */
function tex(bars: string): alphaTab.model.Score {
  const importer = new alphaTab.importer.AlphaTexImporter();
  importer.initFromString(String.raw`\track "Bass" \tuning (E1 A1 D2 G2) . :4 ` + bars, settings);
  return importer.readScore();
}
const bar = (fret: number, meta = '') => `${meta} ${fret}.4 ${fret}.4 ${fret}.4 ${fret}.4`;
const midiStarts = (score: alphaTab.model.Score) => {
  const generator = new alphaTab.midi.MidiFileGenerator(score, settings, new alphaTab.midi.AlphaSynthMidiFileHandler(new alphaTab.midi.MidiFile()));
  generator.generate();
  return generator.tickLookup.masterBars.map((m) => m.start);
};
const frets = (score: alphaTab.model.Score) => score.tracks[0]!.staves[0]!.bars.map((b) => b.voices[0]!.beats[0]!.notes[0]!.fret);

const simple = () => tex([bar(1), bar(3, String.raw`\ro`), bar(5, String.raw`\rc 3`), bar(0)].join(' | '));
const endings = () => tex([bar(1), bar(3, String.raw`\ro`), bar(5, String.raw`\ae 1 \rc 2`), bar(7, String.raw`\ae 2`), bar(0)].join(' | '));
const daCapo = () => tex([bar(1), bar(3, String.raw`\jump Fine`), bar(5), bar(7, String.raw`\jump DaCapoAlFine`)].join(' | '));

describe('playedOrder', () => {
  it('follows repeats, alternate endings and D.C. al Fine like alphaTab playback', () => {
    expect(playedOrder(alphaTab, simple(), settings)).toEqual([0, 1, 2, 1, 2, 1, 2, 3]);
    expect(playedOrder(alphaTab, endings(), settings)).toEqual([0, 1, 2, 1, 3, 4]);
    expect(playedOrder(alphaTab, daCapo(), settings)).toEqual([0, 1, 2, 3, 0, 1]);
  });
});

describe('unrollScore', () => {
  it('lays the bars out in played order, with start ticks equal to the MIDI ticks', () => {
    for (const make of [simple, endings, daCapo]) {
      const written = make();
      const order = playedOrder(alphaTab, written, settings);
      const played = unrollScore(alphaTab, written, order, settings);
      expect(played.masterBars).toHaveLength(order.length);
      expect(frets(played)).toEqual(order.map((i) => frets(written)[i]));
      expect(played.masterBars.map((mb) => mb.start)).toEqual(midiStarts(written));
      // Nothing is left to replay: the unrolled score plays straight through.
      expect(playedOrder(alphaTab, played, settings)).toEqual(order.map((_, i) => i));
    }
  });

  it('gives the copies their own beat and note ids', () => {
    const played = unrollScore(alphaTab, simple(), playedOrder(alphaTab, simple(), settings), settings);
    const beats = played.tracks[0]!.staves[0]!.bars.flatMap((b) => b.voices[0]!.beats);
    expect(new Set(beats.map((b) => b.id)).size).toBe(beats.length);
    const notes = beats.flatMap((b) => b.notes);
    expect(new Set(notes.map((n) => n.id)).size).toBe(notes.length);
  });

  it('returns a score without repeats unchanged', () => {
    const plain = tex([bar(1), bar(3)].join(' | '));
    expect(unrollScore(alphaTab, plain, [0, 1], settings)).toBe(plain);
  });
});

describe('orderSegments', () => {
  it('folds a repeated bar (Freedom: written bar 98 played six times)', () => {
    const order = [...Array.from({ length: 98 }, (_, i) => i), 97, 97, 97, 97, 97, ...Array.from({ length: 7 }, (_, i) => 98 + i)];
    expect(orderSegments(order)).toEqual([
      { played: [1, 97], written: [1, 97], times: 1 },
      { played: [98, 103], written: [98, 98], times: 6 },
      { played: [104, 110], written: [99, 105], times: 1 },
    ]);
  });

  it('folds a repeated range and keeps endings apart', () => {
    expect(orderSegments([0, 1, 2, 1, 2, 1, 2, 3])).toEqual([
      { played: [1, 1], written: [1, 1], times: 1 },
      { played: [2, 7], written: [2, 3], times: 3 },
      { played: [8, 8], written: [4, 4], times: 1 },
    ]);
    expect(orderSegments([0, 1, 2, 1, 3, 4])).toEqual([
      { played: [1, 1], written: [1, 1], times: 1 },
      { played: [2, 2], written: [2, 2], times: 1 },
      { played: [3, 3], written: [3, 3], times: 1 },
      { played: [4, 4], written: [2, 2], times: 1 },
      { played: [5, 6], written: [4, 5], times: 1 },
    ]);
  });
});

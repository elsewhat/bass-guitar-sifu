// Write a Guitar Pro 7 file with one bass track from a list of quantised notes.
//   npx tsx scripts/transcribe/write-score.ts <notes.json> <out.gp>
// notes.json:
//   { title, artist, album, notices, trackName, tuning: [low..high MIDI], bpm,
//     bars: [{ ts: [num, den], div: slots per quarter (4 = sixteenths, 3 = eighth triplets), bpm?, section?,
//              notes: [{ s: start slot, d: slots, string: 1..4 (1 = lowest), fret, tie?: continues the note before }] }] }
// Notes must not overlap and must end inside their bar; a note over a bar line is two notes, the second with tie.
import { readFileSync, writeFileSync } from 'node:fs';
import * as alphaTab from '@coderline/alphatab';

interface NoteIn { s: number; d: number; string: number; fret: number; tie?: boolean }
interface BarIn { ts: [number, number]; div?: number; bpm?: number; section?: string; notes: NoteIn[] }
interface Input {
  title: string; artist: string; album?: string; notices?: string; trackName: string;
  tuning: number[]; bpm: number; bars: BarIn[];
}

const [inPath, outPath] = process.argv.slice(2);
const input = JSON.parse(readFileSync(inPath!, 'utf8')) as Input;
const m = alphaTab.model;

/** A value a beat can have: its length in slots, the note value and the dots. */
interface Value { len: number; duration: number; dots: number; tuplet?: [number, number] }

/**
 * Cut [start, start + len) into note values, so every piece lies on the beat structure.
 * Sixteenth grid (div 4): 16 slots is a whole note. Triplet grid (div 3): a beat is three slots.
 */
function pieces(start: number, len: number, div: number): Value[] {
  const out: Value[] = [];
  let p = start;
  let left = len;
  if (div === 4) {
    while (left > 0) {
      const inBeat = p % 4;
      let v: Value;
      if (inBeat === 0 && p % 16 === 0 && left >= 16) v = { len: 16, duration: 1, dots: 0 };
      else if (inBeat === 0 && p % 8 === 0 && left >= 12) v = { len: 12, duration: 2, dots: 1 };
      else if (inBeat === 0 && p % 8 === 0 && left >= 8) v = { len: 8, duration: 2, dots: 0 };
      else if (inBeat === 0 && left >= 6 && left !== 7) v = { len: 6, duration: 4, dots: 1 };
      else if (inBeat === 0 && left >= 4) v = { len: 4, duration: 4, dots: 0 };
      else if (inBeat === 2 && left === 4) v = { len: 4, duration: 4, dots: 0 }; // quarter on the "and"
      else if (inBeat <= 1 && left >= 3 && inBeat + 3 <= 4) v = { len: 3, duration: 8, dots: 1 };
      else if (inBeat !== 3 && left >= 2 && inBeat + 2 <= 4) v = { len: 2, duration: 8, dots: 0 };
      else v = { len: 1, duration: 16, dots: 0 };
      out.push(v);
      p += v.len;
      left -= v.len;
    }
    return out;
  }
  if (div === 3) {
    while (left > 0) {
      const inBeat = p % 3;
      let v: Value;
      if (inBeat === 0 && p % 12 === 0 && left >= 12) v = { len: 12, duration: 1, dots: 0 };
      else if (inBeat === 0 && p % 6 === 0 && left >= 9) v = { len: 9, duration: 2, dots: 1 };
      else if (inBeat === 0 && p % 6 === 0 && left >= 6) v = { len: 6, duration: 2, dots: 0 };
      else if (inBeat === 0 && left >= 3) v = { len: 3, duration: 4, dots: 0 };
      else if (inBeat <= 1 && left >= 2 && inBeat + 2 <= 3) v = { len: 2, duration: 4, dots: 0, tuplet: [3, 2] };
      else v = { len: 1, duration: 8, dots: 0, tuplet: [3, 2] };
      out.push(v);
      p += v.len;
      left -= v.len;
    }
    return out;
  }
  throw new Error(`div ${div} is not supported`);
}

const score = new m.Score();
score.title = input.title;
score.artist = input.artist;
score.album = input.album ?? '';
score.notices = input.notices ?? '';

const track = new m.Track();
track.name = input.trackName;
track.shortName = 'Bass';
track.playbackInfo.program = 33;
track.playbackInfo.primaryChannel = 0;
track.playbackInfo.secondaryChannel = 1;
const staff = new m.Staff();
staff.stringTuning = new m.Tuning('', [...input.tuning].reverse(), false);
staff.displayTranspositionPitch = -12;
staff.showTablature = true;
staff.showStandardNotation = true;
track.addStaff(staff);
score.addTrack(track);

let bpm = input.bpm;
let notesWritten = 0;
input.bars.forEach((barIn, index) => {
  const div = barIn.div ?? 4;
  const [num, den] = barIn.ts;
  const slots = (num * div * 4) / den;
  if (!Number.isInteger(slots)) throw new Error(`Bar ${index + 1}: ${num}/${den} does not fit the grid`);

  const mb = new m.MasterBar();
  mb.timeSignatureNumerator = num;
  mb.timeSignatureDenominator = den;
  if (index === 0 || (barIn.bpm !== undefined && barIn.bpm !== bpm)) {
    bpm = barIn.bpm ?? bpm;
    mb.tempoAutomations.push(m.Automation.buildTempoAutomation(false, 0, bpm, 2));
  }
  if (barIn.section) {
    mb.section = new m.Section();
    mb.section.text = barIn.section;
  }
  score.addMasterBar(mb);

  const bar = new m.Bar();
  bar.clef = m.Clef.F4;
  staff.addBar(bar);
  const voice = new m.Voice();
  bar.addVoice(voice);

  const addBeat = (v: Value, note: NoteIn | null, tie: boolean) => {
    const beat = new m.Beat();
    beat.duration = v.duration as alphaTab.model.Duration;
    beat.dots = v.dots;
    if (v.tuplet) {
      beat.tupletNumerator = v.tuplet[0];
      beat.tupletDenominator = v.tuplet[1];
    }
    if (note) {
      const n = new m.Note();
      n.string = note.string;
      n.fret = note.fret;
      n.isTieDestination = tie;
      beat.addNote(n);
      if (!tie) notesWritten++;
    }
    voice.addBeat(beat);
  };
  const addRest = (from: number, to: number) => {
    for (const v of pieces(from, to - from, div)) addBeat(v, null, false);
  };

  let pos = 0;
  const notes = [...barIn.notes].sort((a, b) => a.s - b.s);
  for (const note of notes) {
    if (note.s < pos) throw new Error(`Bar ${index + 1}: notes overlap at slot ${note.s}`);
    if (note.s + note.d > slots || note.d <= 0) throw new Error(`Bar ${index + 1}: note at slot ${note.s} does not fit`);
    if (note.string < 1 || note.string > input.tuning.length || note.fret < 0) throw new Error(`Bar ${index + 1}: bad string or fret`);
    if (note.s > pos) addRest(pos, note.s);
    pieces(note.s, note.d, div).forEach((v, i) => addBeat(v, note, i > 0 || !!note.tie));
    pos = note.s + note.d;
  }
  if (pos < slots) {
    if (pos === 0) {
      // An empty bar: one whole rest, as Guitar Pro writes it.
      const beat = new m.Beat();
      beat.duration = m.Duration.Whole;
      voice.addBeat(beat);
    } else addRest(pos, slots);
  }
});

const settings = new alphaTab.Settings();
score.finish(settings);
const bytes = new alphaTab.exporter.Gp7Exporter().export(score, settings);
writeFileSync(outPath!, bytes);
console.log(`${outPath}: ${input.bars.length} bars, ${notesWritten} notes, ${bytes.length} bytes`);

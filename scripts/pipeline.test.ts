import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as alphaTab from '@coderline/alphatab';
import { describe, expect, it } from 'vitest';
import { draftChunks, findTacet } from '../src/core/chunks';
import { solveFingering } from '../src/core/fingering';
import { scoreDurationSeconds } from '../src/core/timing';
import { stringNames, tuningName } from '../src/core/tuning';
import { buildSong, loadLyrics } from './lib/build';
import { importBassTrack, loadScore, pickBassTrack, unrollRepeats } from './lib/gp-import';
import { locateGp } from './lib/locate';
import { parseSidecar } from './lib/sidecar';
import { stableJson } from './lib/stable-json';

function importFile(name: string) {
  const score = loadScore(locateGp(name));
  return importBassTrack(score, pickBassTrack(score));
}

// System description §11: values extracted from the six design-time files.
const CATALOGUE = [
  { file: 'Motorpsycho-Vortex Surfer-10-13-2025.gp', bpm: 110, tuning: 'E A D G', length: '8:50', bars: 243, notes: 692, maxFret: 7, sections: 0, firstBar: 130 },
  { file: 'Motorpsycho-The Wheel-12-05-2025.gp', bpm: 122, tuning: 'C♯ F♯ B E', length: '18:55', bars: 577, notes: 3263, maxFret: 16, sections: 0, firstBar: 1 },
  { file: "Motorpsycho-Un Chien d'Espace-09-22-2025.gp", bpm: 98, tuning: 'E A D G', length: '14:26', bars: 357, notes: 763, maxFret: 8, sections: 2, firstBar: 32 },
  { file: 'Motorpsycho-wearing yr smell-04-07-2025.gp', bpm: 137, tuning: 'E A D G', length: '3:30', bars: 120, notes: 747, maxFret: 17, sections: 0, firstBar: 2 },
  { file: 'Radiohead-Creep-09-24-2026.gp', bpm: 92, tuning: 'E A D G', length: '3:57', bars: 91, notes: 429, maxFret: 12, sections: 8, firstBar: 1 },
  { file: 'Soundgarden-Black Hole Sun-09-14-2026.gp', bpm: 53, tuning: 'D A D G', length: '5:23', bars: 79, notes: 434, maxFret: 8, sections: 11, firstBar: 5 },
];

describe('Guitar Pro import matches the design-time catalogue (§11)', () => {
  it.each(CATALOGUE)('$file', (row) => {
    const { song, warnings } = importFile(row.file);
    const plucks = song.events.flatMap((e) => e.notes.filter((n) => !n.tieFromPrev));
    const [m, s] = row.length.split(':').map(Number) as [number, number];
    expect(warnings).toEqual([]);
    expect(song.tempoMap[0]!.bpm).toBe(row.bpm);
    expect(stringNames(song.tuning).join(' ')).toBe(row.tuning);
    expect(Math.abs(scoreDurationSeconds(song.tempoMap, song.bars) - (m * 60 + s))).toBeLessThanOrEqual(1);
    expect(song.bars.length).toBe(row.bars);
    expect(plucks.length).toBe(row.notes);
    expect(Math.max(...plucks.map((n) => n.fret))).toBe(row.maxFret);
    expect(song.bars.filter((b) => b.section).length).toBe(row.sections);
    expect(song.events.find((e) => e.kind === 'note')!.bar).toBe(row.firstBar);
  });
});

describe('Vortex Surfer acceptance fixture (reference/vortex-surfer-chunks.json)', () => {
  const fixture = JSON.parse(readFileSync('reference/vortex-surfer-chunks.json', 'utf8')) as {
    tacet: [number, number][];
    chunks: { name: string; bars: [number, number] }[];
    fingering: { bar: number; string: string; fret: number; finger: number; position: number | null; plucks: number; retabFrom: { string: string; fret: number } | null }[];
  };
  const { song } = importFile('Motorpsycho-Vortex Surfer-10-13-2025.gp');
  const names = stringNames(song.tuning);

  it('finds the tacet ranges', () => {
    expect(findTacet(song.bars, song.events)).toEqual(fixture.tacet);
  });

  it('reproduces the hand-made fingering for bars 130–176', () => {
    const events = solveFingering(song.events, { tuning: song.tuning, maxFret: 9 });
    const actual = fixture.fingering.map(({ bar }) => {
      const notes = events.filter((e) => e.bar === bar).flatMap((e) => e.notes.filter((n) => !n.tieFromPrev));
      const n = notes[0]!;
      return {
        bar,
        string: names[n.string],
        fret: n.fret,
        finger: n.finger,
        position: n.position,
        plucks: notes.length,
        retabFrom: n.retabFrom ? { string: names[n.retabFrom.string], fret: n.retabFrom.fret } : null,
      };
    });
    const expected = fixture.fingering.map(({ bar, string, fret, finger, position, plucks, retabFrom }) => ({ bar, string, fret, finger, position, plucks, retabFrom }));
    expect(actual).toEqual(expected);
  });

  it('drafts the first two chunks as agreed in the design', () => {
    expect(draftChunks(song.bars, song.events).slice(0, 2)).toMatchObject([
      { name: 'Riff A', bars: [130, 133] },
      { name: 'Riff A ×2', bars: [134, 141] },
    ]);
  });

  it('builds with the fixture chunks and reports their hand positions', () => {
    const sidecar = parseSidecar(
      [
        'title: Vortex Surfer',
        'artist: Motorpsycho',
        'source: { file: "Motorpsycho-Vortex Surfer-10-13-2025.gp", date: 2025-10-13 }',
        'bassTrack: "Electric Bass (finger)"',
        'chunks:',
        ...fixture.chunks.map((c) => `  - { name: "${c.name}", bars: [${c.bars.join(', ')}] }`),
      ].join('\n'),
      'test',
    );
    const { song: built, warnings } = buildSong('vortex-surfer', song, sidecar);
    expect(warnings).toEqual([]);
    expect(built.chunks.map((c) => c.name)).toEqual(fixture.chunks.map((c) => c.name));
    // Riff A: A1 (position 1), E3 (3), then A5 for two bars (4); the 1-2-4 box cannot hold E3–A5–E6 (ADR-0007).
    expect(built.chunks[0]).toMatchObject({ bars: [130, 133], position: 4, shifts: 2 });
    // maxFret is what the player plays after re-tabbing: the tab's E7 at bar 169 becomes A2.
    expect(built.stats).toMatchObject({ noteCount: 692, maxFret: 6, firstBar: 130 });
  });
});

describe('importer edge cases', () => {
  it('picks the 4-string bass over a 6-string "bass" track (Killing in the Name)', () => {
    const score = loadScore(locateGp('Rage Against the Machine-Killing in the Name-09-24-2026 (1).gp'));
    const track = pickBassTrack(score);
    expect(track.name).toBe('Tim Commerford | Music Man Stingray | Bass');
    const { song } = importBassTrack(score, track);
    expect(tuningName(song.tuning)).toBe('Drop D');
    expect(song.tempoMap.length).toBeGreaterThan(30);
  });

  it('unrolls repeat signs into played bars (Freedom: written bar 98 ×6, ADR-0023)', () => {
    const file = locateGp('Rage Against the Machine-Freedom-09-23-2026.gp');
    const settings = new alphaTab.Settings();
    const written = alphaTab.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(readFileSync(file)), settings);
    const generator = new alphaTab.midi.MidiFileGenerator(written, settings, new alphaTab.midi.AlphaSynthMidiFileHandler(new alphaTab.midi.MidiFile()));
    generator.generate();
    const midiStarts = generator.tickLookup.masterBars.map((m) => m.start);

    const { song, warnings } = importFile('Rage Against the Machine-Freedom-09-23-2026.gp');
    expect(warnings).toEqual([]);
    expect(written.masterBars).toHaveLength(105);
    expect(song.bars).toHaveLength(110);
    expect(song.bars.map((b) => b.startTick)).toEqual(midiStarts); // the Synth's and the MP3's timeline
    expect(song.playOrder!.slice(96, 105)).toEqual([96, 97, 97, 97, 97, 97, 97, 98, 99]);
    expect(song.tempoMap.at(-1)).toEqual({ bar: 106, tick: 0, bpm: 40 }); // written bar 101
    const content = (bar: number) => song.events.filter((e) => e.bar === bar).map((e) => [e.tick, e.notes.map((n) => n.fret)]);
    for (let bar = 99; bar <= 103; bar++) expect(content(bar)).toEqual(content(98));
    expect(song.bars.filter((b) => b.section).map((b) => b.n)).toEqual([1, 9, 13, 21, 32, 45, 54, 58, 71, 89]);
  });

  it('refuses a score with repeats that was not unrolled', () => {
    const written = alphaTab.importer.ScoreLoader.loadScoreFromBytes(
      new Uint8Array(readFileSync(locateGp('Rage Against the Machine-Freedom-09-23-2026.gp'))),
      new alphaTab.Settings(),
    );
    expect(() => importBassTrack(written, pickBassTrack(written))).toThrow(/unrollRepeats/);
    const played = unrollRepeats(written);
    expect(importBassTrack(played, pickBassTrack(played)).song.bars).toHaveLength(110);
  });

  it('names common tunings', () => {
    expect(tuningName([28, 33, 38, 43])).toBe('Standard');
    expect(tuningName([26, 33, 38, 43])).toBe('Drop D');
    expect(tuningName([27, 32, 37, 42])).toBe('E♭ standard');
    expect(tuningName([25, 30, 35, 40])).toBe('C♯ standard');
  });
});

describe('lyrics (ADR-0024)', () => {
  // Counts and positions only: the lyrics text stays in the song files.
  const sidecarOf = (extra: string[] = []) =>
    parseSidecar(['title: T', 'artist: A', 'source: { file: a.gp }', 'bassTrack: 1', 'chunks:', '  - { name: X, bars: [1, 4] }', ...extra].join('\n'), 'test');
  const lyricsOf = (slug: string, extra: string[] = []) => {
    const warnings: string[] = [];
    const file = join('songs', slug, 'score.gp');
    const lyrics = loadLyrics(file, loadScore(file), sidecarOf(extra), warnings);
    return { lyrics, warnings };
  };
  const words = (lines: { words: { start: number; end: number; text: string }[] }[]) => lines.flatMap((l) => l.words);

  it('reads synced lyrics from the lead vocal track, with the lines and sections of its text (Creep)', () => {
    const { lyrics, warnings } = lyricsOf('creep');
    expect(warnings).toEqual([]);
    expect(lyrics).toMatchObject({ synced: true, source: 'Thom Yorke | Vocals' });
    expect(lyrics!.lines).toHaveLength(44);
    expect(lyrics!.lines.filter((l) => l.section).length).toBe(7);
    const all = words(lyrics!.lines);
    expect(all).toHaveLength(167);
    expect(all.every((w, i) => w.end > w.start && (i === 0 || w.start >= all[i - 1]!.start))).toBe(true);
    expect(all.some((w) => /[-+_]$/.test(w.text))).toBe(false); // syllables are joined into words
    expect(all[0]!.start).toBe(7 * 4 * 960 + 1920); // bar 8, beat 3
  });

  it('cuts lines at rests and sentence ends when the text has no line breaks (Killing in the Name)', () => {
    const { lyrics, warnings } = lyricsOf('killing-in-the-name');
    expect(warnings).toEqual([expect.stringMatching(/no line breaks/)]);
    expect(lyrics!.source).toBe('Zack de la Rocha | Lead Vocals'); // not the backing vocals
    expect(Math.max(...lyrics!.lines.map((l) => l.words.length))).toBeLessThanOrEqual(12);
  });

  it('reads lyrics.text from song.yaml when the score has none, and follows lyrics.source', () => {
    // Placeholder words; a YAML block scalar as the owner writes it.
    const text = ['lyrics:', '  text: |', '    [Intro]', '    first line', '', '    second line'];
    expect(lyricsOf('bombtrack').lyrics).toBeNull();
    expect(lyricsOf('bombtrack', text).lyrics).toEqual({
      synced: false,
      source: 'song.yaml',
      lines: [
        { text: 'first line', section: 'Intro', gap: false, words: [] },
        { text: 'second line', section: null, gap: true, words: [] },
      ],
    });
    expect(lyricsOf('bombtrack', [...text, '  source: none']).lyrics).toBeNull();
    expect(lyricsOf('bombtrack', [...text, '  source: score'])).toEqual({ lyrics: null, warnings: ['Lyrics: the score has no lyrics'] });
    // A score with synced lyrics wins over lyrics.text unless the sidecar says otherwise.
    const creep = lyricsOf('creep', text);
    expect(creep.lyrics!.synced).toBe(true);
    expect(creep.warnings).toEqual([expect.stringMatching(/lyrics.text is ignored/)]);
    expect(lyricsOf('creep', [...text, '  source: text']).lyrics!.synced).toBe(false);
  });

  it('takes the vocal track from the sidecar', () => {
    const { lyrics } = lyricsOf('killing-in-the-name', ['lyrics: { track: 1 }']);
    expect(lyrics!.source).toBe('Tim Commerford | Backing Vocals');
    expect(() => lyricsOf('creep', ['lyrics: { track: Nobody }'])).toThrow(/not found/);
  });
});

describe('song.yaml validation', () => {
  const valid = ['title: T', 'artist: A', 'source: { file: a.gp }', 'bassTrack: 1', 'chunks:', '  - { name: X, bars: [1, 4] }'];

  it('accepts a minimal sidecar', () => {
    expect(parseSidecar(valid.join('\n'), 'test').chunks).toHaveLength(1);
  });

  it('rejects missing chunks and unknown fields', () => {
    expect(() => parseSidecar(valid.slice(0, 4).join('\n'), 'test')).toThrow(/chunks/);
    expect(() => parseSidecar([...valid, 'spotify: x'].join('\n'), 'test')).toThrow(/additional/);
  });

  it('rejects a malformed YouTube id', () => {
    expect(() => parseSidecar([...valid, 'media: { youtube: { videoId: nope } }'].join('\n'), 'test')).toThrow(/pattern/);
  });

  it('accepts lyrics.source and lyrics.track, and rejects other sources', () => {
    expect(parseSidecar([...valid, 'lyrics: { source: text, track: Vocals }'].join('\n'), 'test').lyrics).toEqual({ source: 'text', track: 'Vocals' });
    expect(() => parseSidecar([...valid, 'lyrics: { source: web }'].join('\n'), 'test')).toThrow(/allowed values/);
  });

  it('accepts media.music with an offset and requires both fields', () => {
    const music = parseSidecar([...valid, 'media: { music: { source: a.mp3, offsetMs: 12.5 } }'].join('\n'), 'test');
    expect(music.media?.music).toEqual({ source: 'a.mp3', offsetMs: 12.5 });
    expect(() => parseSidecar([...valid, 'media: { music: { source: a.mp3 } }'].join('\n'), 'test')).toThrow(/offsetMs/);
  });
});

describe('stableJson', () => {
  it('writes arrays of objects one element per line', () => {
    expect(stableJson({ a: 1, list: [{ x: 1 }, { x: 2 }], nums: [1, 2] })).toBe('{\n  "a": 1,\n  "list": [\n    {"x":1},\n    {"x":2}\n  ],\n  "nums": [1,2]\n}\n');
  });
});

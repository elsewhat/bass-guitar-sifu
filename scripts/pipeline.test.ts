import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { draftChunks, findTacet } from '../src/core/chunks';
import { solveFingering } from '../src/core/fingering';
import { scoreDurationSeconds } from '../src/core/timing';
import { stringNames, tuningName } from '../src/core/tuning';
import { buildSong } from './lib/build';
import { importBassTrack, loadScore, pickBassTrack } from './lib/gp-import';
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

  it('names common tunings', () => {
    expect(tuningName([28, 33, 38, 43])).toBe('Standard');
    expect(tuningName([26, 33, 38, 43])).toBe('Drop D');
    expect(tuningName([27, 32, 37, 42])).toBe('E♭ standard');
    expect(tuningName([25, 30, 35, 40])).toBe('C♯ standard');
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

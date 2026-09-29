import { describe, expect, it } from 'vitest';
import type { CatalogEntry } from '../core/model';
import { artistChips, cardMeta, cardProgress, cardTuning, countText, filterSongs } from './library';

const song = (title: string, artist: string, extra: Partial<CatalogEntry> = {}): CatalogEntry => ({
  slug: title.toLowerCase().replace(/\W+/g, '-'),
  title,
  artist,
  bpm: 110,
  durationSec: 530.2,
  tuning: [28, 33, 38, 43],
  tuningName: 'Standard',
  maxFret: 7,
  bars: 243,
  chunks: 9,
  music: false,
  ...extra,
});

const catalog = [
  song('Un Chien d’Espace', 'Motorpsycho'),
  song('The Wheel', 'Motorpsycho'),
  song('Vortex Surfer', 'Motorpsycho'),
  song('Creep', 'Radiohead'),
  song('Black Hole Sun', 'Soundgarden'),
  song('Zombie', 'The Cranberries'),
  song('Bombtrack', 'Rage Against the Machine'),
  song('Bulls on Parade', 'Rage Against the Machine'),
];

describe('song library (system description §4)', () => {
  it('offers the three artists with the most songs, ties by name', () => {
    expect(artistChips(catalog).map((c) => c.label)).toEqual(['Motorpsycho (3)', 'Rage Against the Machine (2)', 'Radiohead (1)']);
    expect(artistChips([])).toEqual([]);
  });

  it('filters by artist and by a query in title or artist', () => {
    expect(filterSongs(catalog, '', 'Motorpsycho')).toHaveLength(3);
    expect(filterSongs(catalog, '  WHEEL ', null).map((c) => c.title)).toEqual(['The Wheel']);
    expect(filterSongs(catalog, 'rage', null)).toHaveLength(2);
    expect(filterSongs(catalog, 'creep', 'Motorpsycho')).toEqual([]);
    expect(filterSongs(catalog, '', null)).toHaveLength(catalog.length);
  });

  it('counts the visible songs', () => {
    expect(countText(6, 6)).toBe('6 songs');
    expect(countText(2, 6)).toBe('2 of 6 songs');
    expect(countText(1, 1)).toBe('1 song');
  });

  it('writes the card meta line and tuning', () => {
    expect(cardMeta(song('Un Chien d’Espace', 'Motorpsycho', { bpm: 98, durationSec: 866.9, maxFret: 8 }))).toBe('98 BPM · 14:26 · frets 0–8');
    expect(cardTuning(catalog[0]!)).toEqual({ name: 'Standard', strings: 'E A D G', alt: false });
    expect(cardTuning(song('The Wheel', 'Motorpsycho', { tuning: [25, 30, 35, 40], tuningName: 'C♯ standard' }))).toEqual({
      name: 'C♯ standard',
      strings: 'C♯ F♯ B E',
      alt: true,
    });
  });

  it('shows progress: not started, the chunk reached, and the playing song', () => {
    expect(cardProgress(9, null, false)).toEqual({ text: 'Not started', pct: 0, started: false });
    expect(cardProgress(9, { chunkIndex: 2, done: 3 }, false)).toEqual({ text: 'Chunk 3 of 9', pct: 33, started: true });
    expect(cardProgress(9, { chunkIndex: 0, done: 0 }, true)).toEqual({ text: 'Playing · Chunk 1 of 9', pct: 0, started: true });
    expect(cardProgress(9, { chunkIndex: 20, done: 12 }, false)).toEqual({ text: 'Chunk 9 of 9', pct: 100, started: true });
  });
});

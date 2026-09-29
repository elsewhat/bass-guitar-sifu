// Song library overlay (system description §4, design/artboards/SelectorOverlay.dc.html): artist
// chips, search and card text, kept pure for tests.
import type { CatalogEntry } from '../core/model';
import { stringNames } from '../core/tuning';
import { formatTime } from './view-model';

export interface ArtistChip {
  artist: string;
  label: string; // "Motorpsycho (4)"
}

/** The three artists with the most songs; ties by name. */
export function artistChips(catalog: CatalogEntry[], max = 3): ArtistChip[] {
  const counts = new Map<string, number>();
  for (const c of catalog) counts.set(c.artist, (counts.get(c.artist) ?? 0) + 1);
  return [...counts]
    .sort(([a, n], [b, m]) => m - n || a.localeCompare(b))
    .slice(0, max)
    .map(([artist, n]) => ({ artist, label: `${artist} (${n})` }));
}

/** Songs by one artist (or all), matching the query in title or artist, case-insensitively. */
export function filterSongs(catalog: CatalogEntry[], query: string, artist: string | null): CatalogEntry[] {
  const q = query.trim().toLowerCase();
  return catalog.filter((c) => (!artist || c.artist === artist) && (!q || `${c.title} ${c.artist}`.toLowerCase().includes(q)));
}

/** "6 songs", or "2 of 6 songs" while filtered. */
export function countText(visible: number, total: number): string {
  const songs = `${total} song${total === 1 ? '' : 's'}`;
  return visible === total ? songs : `${visible} of ${songs}`;
}

/** "98 BPM · 14:26 · frets 0–8" */
export function cardMeta(c: CatalogEntry): string {
  return `${c.bpm} BPM · ${formatTime(c.durationSec)} · frets 0–${c.maxFret}`;
}

/** Tuning badge and string names; other tunings than standard are marked (orange in the card). */
export function cardTuning(c: CatalogEntry): { name: string; strings: string; alt: boolean } {
  return { name: c.tuningName, strings: stringNames(c.tuning).join(' '), alt: c.tuningName !== 'Standard' };
}

/** What the library knows of a song's practice (ADR-0010). */
export interface SongProgress {
  chunkIndex: number;
  done: number; // chunks completed
}

/** Progress text and bar: "Chunk 3 of 9" or "Not started"; the current song reads "Playing · …". */
export function cardProgress(chunks: number, progress: SongProgress | null, current: boolean): { text: string; pct: number; started: boolean } {
  const started = !!progress || current;
  const chunk = Math.min(progress?.chunkIndex ?? 0, chunks - 1) + 1;
  const text = started ? `Chunk ${chunk} of ${chunks}` : 'Not started';
  const pct = progress && chunks > 0 ? Math.round((100 * Math.min(progress.done, chunks)) / chunks) : 0;
  return { text: current ? `Playing · ${text}` : text, pct, started };
}

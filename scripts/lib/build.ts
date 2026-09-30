// songs/<slug>/{score.gp,song.yaml} → SongData + CatalogEntry (system description §6).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { findTacet } from '../../src/core/chunks';
import { chunkPositions, solveFingering } from '../../src/core/fingering';
import { parseLyricsText, syncedLyrics } from '../../src/core/lyrics';
import type { BeatEvent, CatalogEntry, Chunk, ImportedSong, SongData, SongLyrics, SongStats } from '../../src/core/model';
import { scoreDurationSeconds } from '../../src/core/timing';
import { tuningName } from '../../src/core/tuning';
import { importBassTrack, loadScore, pickBassTrack, type Score } from './gp-import';
import { gpLyricsTexts, lyricSyllables, pickLyricsTrack } from './gp-lyrics';
import { loadSidecar, type Sidecar } from './sidecar';

export interface BuiltSong {
  song: SongData;
  catalog: CatalogEntry;
  warnings: string[];
}

export function buildSongFromDir(dir: string, slug: string): BuiltSong {
  const sidecar = loadSidecar(join(dir, 'song.yaml'));
  const score = loadScore(join(dir, 'score.gp'));
  const { song: imported, warnings } = importBassTrack(score, pickBassTrack(score, sidecar.bassTrack));
  const hasAudio = existsSync(join(dir, 'audio.mp3'));
  if (sidecar.media?.music && !hasAudio) throw new Error('media.music is set but audio.mp3 is missing');
  if (hasAudio && !sidecar.media?.music) warnings.push('audio.mp3 exists but media.music is not set; the Music source stays off');
  const lyrics = loadLyrics(join(dir, 'score.gp'), score, sidecar, warnings);
  return buildSong(slug, imported, sidecar, warnings, lyrics);
}

/**
 * Lyrics (ADR-0024): synced from the vocal track of score.gp, else unsynced from `lyrics.text` in
 * song.yaml. `lyrics.source` limits this to one of them, or turns lyrics off.
 */
export function loadLyrics(scoreFile: string, score: Score, sidecar: Sidecar, warnings: string[]): SongLyrics | null {
  const source = sidecar.lyrics?.source;
  if (source === 'none') return null;
  const text = sidecar.lyrics?.text ?? '';
  const hasText = text.trim() !== '';
  const track = source === 'text' ? null : pickLyricsTrack(score, sidecar.lyrics?.track);
  if (track) {
    const syllables = lyricSyllables(score, track.index);
    if (syllables.length > 0) {
      const { lines, fromText } = syncedLyrics(syllables, gpLyricsTexts(scoreFile)[track.index] || null);
      if (!fromText) warnings.push(`Lyrics: the lyrics text of "${track.name}" gives no line breaks; lines are cut at rests, sentence ends and capitals`);
      if (hasText) warnings.push('Lyrics: lyrics.text is ignored, the score has synced lyrics (set lyrics.source: text to use it)');
      return { synced: true, source: track.name, lines };
    }
    if (source === 'score' || sidecar.lyrics?.track !== undefined) warnings.push(`Lyrics: track "${track.name}" has no lyrics`);
  } else if (source === 'score') warnings.push('Lyrics: the score has no lyrics');
  if (source === 'score' || !hasText) return null;
  const lines = parseLyricsText(text);
  return lines.length ? { synced: false, source: 'song.yaml', lines } : null;
}

export function buildSong(slug: string, imported: ImportedSong, sidecar: Sidecar, warnings: string[] = [], lyrics: SongLyrics | null = null): BuiltSong {
  const { bars, tuning } = imported;
  const tacet = findTacet(bars, imported.events);
  validateChunks(sidecar.chunks, bars.length, tacet, warnings);

  const overrides = sidecar.fingeringOverrides ?? [];
  for (const o of overrides) {
    if (!imported.events.some((e) => e.bar === o.bar && e.tick === o.tick && e.notes.some((n) => !n.tieFromPrev && !n.dead))) {
      warnings.push(`fingeringOverride at bar ${o.bar} tick ${o.tick} does not point at a plucked note`);
    }
  }
  const sourceMaxFret = maxFret(imported.events);
  const events = solveFingering(imported.events, { tuning, maxFret: Math.min(24, sourceMaxFret + 2), overrides });

  const chunks: Chunk[] = sidecar.chunks.map((c, i) => ({
    id: i + 1,
    name: c.name,
    bars: c.bars,
    ...chunkPositions(events, c.bars),
  }));

  const stats = songStats(imported, events);
  const song: SongData = {
    slug,
    title: sidecar.title,
    artist: sidecar.artist,
    track: imported.track,
    tracks: imported.tracks,
    tuning,
    tuningName: tuningName(tuning),
    ppq: imported.ppq,
    tempoMap: imported.tempoMap,
    bars,
    events,
    tacet,
    chunks,
    stats,
    media: {
      youtube: sidecar.media?.youtube
        ? { videoId: sidecar.media.youtube.videoId ?? null, sync: sidecar.media.youtube.sync ?? [] }
        : null,
      music: sidecar.media?.music ? { url: `data/audio/${slug}.mp3`, offsetMs: sidecar.media.music.offsetMs } : null,
    },
    tempoNote: sidecar.tempo?.note ?? null,
    ...(lyrics ? { lyrics } : {}),
    ...(imported.playOrder ? { playOrder: imported.playOrder } : {}),
  };
  const catalog: CatalogEntry = {
    slug,
    title: song.title,
    artist: song.artist,
    bpm: imported.tempoMap[0]!.bpm,
    durationSec: stats.durationSec,
    tuning,
    tuningName: song.tuningName,
    maxFret: stats.maxFret,
    bars: bars.length,
    chunks: chunks.length,
    music: song.media.music !== null,
  };
  return { song, catalog, warnings };
}

function validateChunks(chunks: Sidecar['chunks'], barCount: number, tacet: [number, number][], warnings: string[]) {
  let prevEnd = 0;
  for (const c of chunks) {
    const [a, b] = c.bars;
    if (a > b) throw new Error(`Chunk "${c.name}": first bar ${a} is after last bar ${b}`);
    if (b > barCount) throw new Error(`Chunk "${c.name}": bar ${b} is beyond the last bar (${barCount})`);
    if (a <= prevEnd) throw new Error(`Chunk "${c.name}" (${a}–${b}) overlaps or precedes the previous chunk (ends ${prevEnd})`);
    prevEnd = b;
    const silent = tacet.filter(([ta, tb]) => ta <= b && tb >= a);
    if (silent.some(([ta, tb]) => ta <= a && tb >= b)) throw new Error(`Chunk "${c.name}" (${a}–${b}) lies entirely in a tacet range`);
    for (const [ta, tb] of silent) if (tb - ta >= 1) warnings.push(`Chunk "${c.name}" (${a}–${b}) contains tacet bars ${ta}–${tb}`);
  }
}

function maxFret(events: BeatEvent[]): number {
  return Math.max(0, ...events.flatMap((e) => e.notes.filter((n) => !n.dead).map((n) => n.fret)));
}

function songStats(imported: ImportedSong, events: BeatEvent[]): SongStats {
  const plucked = events.flatMap((e) => e.notes.filter((n) => !n.tieFromPrev));
  const firstNote = events.find((e) => e.kind === 'note');
  return {
    durationSec: Math.round(scoreDurationSeconds(imported.tempoMap, imported.bars) * 10) / 10,
    noteCount: plucked.length,
    maxFret: maxFret(events),
    strings: [...new Set(plucked.filter((n) => !n.dead).map((n) => n.string))].sort((a, b) => a - b),
    firstBar: firstNote?.bar ?? 1,
  };
}

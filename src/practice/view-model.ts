// Text and row models for the practice view (system description §3), kept pure for tests.
import type { Chunk, SongData } from '../core/model';
import { chunkRange, loopRange, placeBars, restPlaces, type LoopPlace, type RestPlace } from '../playback/loop';
import type { SyncMap } from '../core/sync';
import type { TempoLookup } from '../core/timing';
import { stringNames } from '../core/tuning';

/** "110 BPM · 4/4 · Standard E A D G · 243 bars" */
export function headMeta(song: SongData): string {
  const meters = new Set(song.bars.map((b) => b.time.join('/')));
  const meter = meters.size === 1 ? [...meters][0]! : 'mixed meter';
  const bpm = song.tempoMap[0]?.bpm ?? 120;
  return `${bpm} BPM · ${meter} · ${song.tuningName} ${stringNames(song.tuning).join(' ')} · ${song.bars.length} bars`;
}

export type PlanRow = { kind: 'rest'; label: string; bar: number; place: RestPlace } | { kind: 'chunk'; index: number; chunk: Chunk; bar: number };

/**
 * Chunks in order, with the bars between them as separator rows ("Bars 1–129 · bass rests"). The
 * rows are the bars outside every chunk, which playback runs through (ADR-0031).
 */
export function planRows(song: SongData): PlanRow[] {
  const rows: PlanRow[] = [
    ...song.chunks.map((chunk, index) => ({ kind: 'chunk' as const, index, chunk, bar: chunk.bars[0] })),
    ...restPlaces(song.chunks, song.bars.length).map((place) => ({ kind: 'rest' as const, label: `${barsLabel(place.bars)} · bass rests`, bar: place.bars[0], place })),
  ];
  return rows.sort((a, b) => a.bar - b.bar);
}

/** "Bars 130–133", or "Bar 7" for one bar. */
export function barsLabel([a, b]: [number, number]): string {
  return a === b ? `Bar ${a}` : `Bars ${a}–${b}`;
}

export function barRange([a, b]: [number, number]): string {
  return a === b ? String(a) : `${a}–${b}`;
}

export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * "Loop 4:30–4:39 · score time", or "… · video time" with the YouTube video's sync map (ADR-0028).
 * A rest is not looped: "Rest 0:00–4:41 · score time".
 */
export function loopTimeLabel(song: SongData, place: LoopPlace, tempo: TempoLookup, video: SyncMap | null = null): string {
  const range = loopRange(place, song.chunks, song.bars);
  const at = (tick: number) => formatTime(video ? Math.max(0, video.secondsAt(tick)) : tempo.secondsAt(tick));
  return `${place.rest ? 'Rest' : 'Loop'} ${at(range.start)}–${at(range.end)} · ${video ? 'video' : 'score'} time`;
}

/** "Bass rests · bars 1–129" while a rest is played, else null. */
export function restChip(song: SongData, place: LoopPlace): string | null {
  return place.rest ? `Bass rests · bars ${barRange(placeBars(place, song.chunks, song.bars.length))}` : null;
}

/** Effective BPM at the start of a chunk for a tempo percentage. */
export function effectiveBpm(song: SongData, chunkIndex: number, tempo: TempoLookup, pct: number): number {
  const chunk = song.chunks[chunkIndex];
  const bpm = chunk ? tempo.bpmAt(chunkRange(chunk, song.bars).start) : (song.tempoMap[0]?.bpm ?? 120);
  return Math.round((bpm * pct) / 100);
}

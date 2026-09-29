// Text and row models for the practice view (system description §3), kept pure for tests.
import type { Chunk, SongData } from '../core/model';
import { chunkRange } from '../playback/loop';
import type { TempoLookup } from '../core/timing';
import { stringNames } from '../core/tuning';

/** "110 BPM · 4/4 · Standard E A D G · 243 bars" */
export function headMeta(song: SongData): string {
  const meters = new Set(song.bars.map((b) => b.time.join('/')));
  const meter = meters.size === 1 ? [...meters][0]! : 'mixed meter';
  const bpm = song.tempoMap[0]?.bpm ?? 120;
  return `${bpm} BPM · ${meter} · ${song.tuningName} ${stringNames(song.tuning).join(' ')} · ${song.bars.length} bars`;
}

export type PlanRow = { kind: 'rest'; label: string; bar: number } | { kind: 'chunk'; index: number; chunk: Chunk; bar: number };

/** Chunks in order, with the tacet ranges as separator rows ("Bars 1–129 · bass rests"). */
export function planRows(song: SongData): PlanRow[] {
  const rows: PlanRow[] = [
    ...song.chunks.map((chunk, index) => ({ kind: 'chunk' as const, index, chunk, bar: chunk.bars[0] })),
    ...song.tacet.map(([a, b]) => ({ kind: 'rest' as const, label: `${barsLabel([a, b])} · bass rests`, bar: a })),
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

/** "Loop 4:30–4:39 · score time" */
export function loopTimeLabel(song: SongData, chunkIndex: number, tempo: TempoLookup): string {
  const range = chunkRange(song.chunks[chunkIndex]!, song.bars);
  return `Loop ${formatTime(tempo.secondsAt(range.start))}–${formatTime(tempo.secondsAt(range.end))} · score time`;
}

/** "Intro skipped · bass rests bars 1–129" when the bass enters after a leading tacet. */
export function introChip(song: SongData): string | null {
  const first = song.tacet[0];
  return first && first[0] === 1 ? `Intro skipped · bass rests bars ${barRange(first)}` : null;
}

/** Effective BPM at the start of a chunk for a tempo percentage. */
export function effectiveBpm(song: SongData, chunkIndex: number, tempo: TempoLookup, pct: number): number {
  const chunk = song.chunks[chunkIndex];
  const bpm = chunk ? tempo.bpmAt(chunkRange(chunk, song.bars).start) : (song.tempoMap[0]?.bpm ?? 120);
  return Math.round((bpm * pct) / 100);
}

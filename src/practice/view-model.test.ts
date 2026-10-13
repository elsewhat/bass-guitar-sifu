import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SongData } from '../core/model';
import { syncMap } from '../core/sync';
import { tempoLookup } from '../core/timing';
import { effectiveBpm, formatTime, headMeta, loopTimeLabel, planRows, restChip } from './view-model';

const load = (slug: string) => JSON.parse(readFileSync(`public/data/songs/${slug}.json`, 'utf8')) as SongData;
const vortex = load('vortex-surfer');
const kitn = load('killing-in-the-name');

describe('practice view text', () => {
  it('builds the header meta line', () => {
    expect(headMeta(vortex)).toBe('110 BPM · 4/4 · Standard E A D G · 243 bars');
    expect(headMeta(kitn)).toBe('109 BPM · mixed meter · Drop D D A D G · 120 bars');
  });

  it('interleaves the rests with the chunks (design practice plan)', () => {
    const rows = planRows(vortex).map((r) => (r.kind === 'rest' ? r.label : r.chunk.name));
    expect(rows.slice(0, 7)).toEqual([
      'Bars 1–129 · bass rests',
      'Riff A',
      'Riff A ×2',
      'Climb',
      'E pedal',
      'Descent',
      'Bars 177–191 · bass rests',
    ]);
    expect(planRows(kitn).every((r) => r.kind === 'chunk')).toBe(true);
    // A rest row knows where it is played: before the chunk it leads into, or after the last one (ADR-0031).
    const rests = planRows(vortex).flatMap((r) => (r.kind === 'rest' ? [r.place] : []));
    expect(rests).toEqual([
      { chunkIndex: 0, rest: 'before', bars: [1, 129] },
      { chunkIndex: 5, rest: 'before', bars: [177, 191] },
      { chunkIndex: 8, rest: 'after', bars: [241, 243] },
    ]);
  });

  it('shows the rest chip only while a rest is played', () => {
    expect(restChip(vortex, { chunkIndex: 0, rest: 'before' })).toBe('Bass rests · bars 1–129');
    expect(restChip(vortex, { chunkIndex: 8, rest: 'after' })).toBe('Bass rests · bars 241–243');
    expect(restChip(vortex, { chunkIndex: 0, rest: null })).toBeNull();
  });

  it('formats the loop time and effective BPM', () => {
    expect(formatTime(65.9)).toBe('1:05');
    const tempo = tempoLookup(vortex.tempoMap, vortex.bars);
    // Bar 130 starts after 129 bars of 4/4 at 110 BPM: 129 × 240 / 110 s = 4:41.
    expect(loopTimeLabel(vortex, { chunkIndex: 0, rest: null }, tempo)).toBe('Loop 4:41–4:50 · score time');
    expect(loopTimeLabel(vortex, { chunkIndex: 0, rest: 'before' }, tempo)).toBe('Rest 0:00–4:41 · score time');
    // With the YouTube video the loop is shown where it is in the recording (ADR-0028).
    const video = syncMap([{ bar: 1, ms: 5000 }, { bar: 130, ms: 300_000 }, { bar: 134, ms: 308_400 }], vortex.bars, tempo);
    expect(loopTimeLabel(vortex, { chunkIndex: 0, rest: null }, tempo, video)).toBe('Loop 5:00–5:08 · video time');
    expect(loopTimeLabel(vortex, { chunkIndex: 0, rest: 'before' }, tempo, video)).toBe('Rest 0:05–5:00 · video time');
    expect(effectiveBpm(vortex, 0, tempo, 75)).toBe(83);
  });
});

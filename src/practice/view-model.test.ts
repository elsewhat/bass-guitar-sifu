import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { SongData } from '../core/model';
import { tempoLookup } from '../core/timing';
import { effectiveBpm, formatTime, headMeta, introChip, loopTimeLabel, planRows } from './view-model';

const load = (slug: string) => JSON.parse(readFileSync(`public/data/songs/${slug}.json`, 'utf8')) as SongData;
const vortex = load('vortex-surfer');
const kitn = load('killing-in-the-name');

describe('practice view text', () => {
  it('builds the header meta line', () => {
    expect(headMeta(vortex)).toBe('110 BPM · 4/4 · Standard E A D G · 243 bars');
    expect(headMeta(kitn)).toBe('109 BPM · mixed meter · Drop D D A D G · 120 bars');
  });

  it('interleaves tacet separators with the chunks (design practice plan)', () => {
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
  });

  it('shows the intro chip only after a leading tacet', () => {
    expect(introChip(vortex)).toBe('Intro skipped · bass rests bars 1–129');
    expect(introChip(kitn)).toBeNull();
  });

  it('formats the loop time and effective BPM', () => {
    expect(formatTime(65.9)).toBe('1:05');
    const tempo = tempoLookup(vortex.tempoMap, vortex.bars);
    // Bar 130 starts after 129 bars of 4/4 at 110 BPM: 129 × 240 / 110 s = 4:41.
    expect(loopTimeLabel(vortex, 0, tempo)).toBe('Loop 4:41–4:50 · score time');
    expect(effectiveBpm(vortex, 0, tempo, 75)).toBe(83);
  });
});

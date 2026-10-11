// Sync anchors from Songsterr's video points (ADR-0028). Songsterr keeps, for every video of a
// tab, the video time at which each bar starts ("points"). The .gp files in this repository come
// from Songsterr, so those points are the sync map of the recording, one anchor per bar.
//
// The points do not always match the score bar for bar: the list may stop before the last bars,
// carry an extra point at the end, or split one bar in two. When the counts differ, the points are
// matched to the bars by their durations (dynamic programming), with whatever is left over placed
// at the end. Pure, so it is unit tested; scripts/fetch-video.ts does the fetching and writing.
import type { SyncAnchor } from '../../src/core/sync';

export interface Alignment {
  anchors: SyncAnchor[];
  /** Typical recording time per score time (1 = the recording is at the score's tempo). */
  ratio: number;
  /** Largest distance between the recording and the score's tempo map, in seconds, and its bar. */
  drift: { seconds: number; bar: number };
  /** What was done and what to check by ear. Empty when every bar has its own point. */
  notes: string[];
}

const SKIP_COST = 0.35; // a merged or missing point must explain this much duration mismatch
const END_COST = 0.05; // per bar or point left over at the end
const MISFIT = 0.18; // |ln(recording / score)| of one bar that is worth a look (about ±20 %)

const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1] ?? 1;

/** [bar index, point index] pairs: which point starts which bar. `starts` has one entry more than there are bars. */
function matchByDuration(starts: number[], points: number[], ratio: number): [number, number][] {
  const B = starts.length - 1;
  const N = points.length;
  const fit = (video: number, score: number) => (video > 0 && score > 0 ? Math.abs(Math.log(video / (score * ratio))) : 10);
  const cost = Array.from({ length: B + 1 }, () => new Float64Array(N).fill(Infinity));
  const from: ([number, number] | null)[][] = Array.from({ length: B + 1 }, () => new Array<[number, number] | null>(N).fill(null));
  cost[0]![0] = 0;
  for (let i = 0; i < B; i++) {
    for (let j = 0; j < N; j++) {
      const c = cost[i]![j]!;
      if (c === Infinity) continue;
      // `di` bars are covered by `dj` point intervals; anything but 1:1 costs extra.
      for (const [di, dj, extra] of [[1, 1, 0], [1, 2, SKIP_COST], [2, 1, SKIP_COST], [1, 3, 2 * SKIP_COST], [3, 1, 2 * SKIP_COST]] as const) {
        if (i + di > B || j + dj > N - 1) continue;
        const v = c + fit(points[j + dj]! - points[j]!, starts[i + di]! - starts[i]!) + extra;
        if (v < cost[i + di]![j + dj]!) {
          cost[i + di]![j + dj] = v;
          from[i + di]![j + dj] = [i, j];
        }
      }
    }
  }
  // The match ends where the bars or the points run out; the rest is left over.
  let best: { value: number; at: [number, number] } | null = null;
  for (let i = 0; i <= B; i++) {
    for (let j = 0; j < N; j++) {
      if (cost[i]![j] === Infinity || (i < B - 1 && j !== N - 1)) continue;
      const value = cost[i]![j]! + END_COST * (Math.max(0, B - 1 - i) + (N - 1 - j));
      if (!best || value < best.value) best = { value, at: [i, j] };
    }
  }
  const pairs: [number, number][] = [];
  for (let at = best?.at ?? null; at; at = from[at[0]]![at[1]]!) pairs.push(at);
  return pairs.reverse();
}

const range = (a: number, b: number) => (a === b ? `bar ${a}` : `bars ${a}–${b}`);

/**
 * Anchors for a score from a video's points.
 * @param starts score time in seconds of every bar start, plus the end of the last bar
 * @param points video time in seconds of every bar start, as Songsterr lists them
 */
export function alignPoints(starts: number[], points: number[]): Alignment {
  const B = starts.length - 1;
  const N = points.length;
  const notes: string[] = [];
  const ratios: number[] = [];
  for (let i = 0; i + 1 < Math.min(B + 1, N); i++) ratios.push((points[i + 1]! - points[i]!) / (starts[i + 1]! - starts[i]!));
  const ratio = median(ratios.filter((r) => r > 0 && Number.isFinite(r)));

  const pairs: [number, number][] = N === B ? points.map((_, i) => [i, i]) : matchByDuration(starts, points, ratio);
  if (N !== B) notes.push(`${N} points for ${B} bars: matched by bar durations`);

  // Merged and missing points, from the steps between the pairs.
  for (let k = 1; k < pairs.length; k++) {
    const [i0, j0] = pairs[k - 1]!;
    const [i1, j1] = pairs[k]!;
    if (j1 - j0 > 1) notes.push(`${range(i0 + 1, i1)}: ${j1 - j0} points merged (the recording has ${(points[j1]! - points[j0]!).toFixed(2)} s, the score ${(starts[i1]! - starts[i0]!).toFixed(2)} s)`);
    if (i1 - i0 > 1) notes.push(`${range(i0 + 2, i1)}: no point, interpolated`);
  }
  const [lastBar, lastPoint] = pairs[pairs.length - 1] ?? [0, 0];
  if (lastBar < B - 1) notes.push(`${range(lastBar + 2, B)}: no point, continued at the score's tempo`);
  if (lastPoint < N - 1) notes.push(`${N - 1 - lastPoint} extra point${N - 1 - lastPoint === 1 ? '' : 's'} at the end ignored`);

  // One anchor per matched bar; a point at the end of the last bar is not an anchor.
  const anchors: SyncAnchor[] = [];
  let dropped = 0;
  for (const [i, j] of pairs) {
    if (i >= B) continue;
    const ms = Math.round(points[j]! * 1000);
    const prev = anchors[anchors.length - 1];
    if (ms < 0 || (prev && ms <= prev.ms)) dropped++;
    else anchors.push({ bar: i + 1, ms });
  }
  if (dropped) notes.push(`${dropped} point${dropped === 1 ? '' : 's'} before 0:00 or not after the point before dropped`);

  // Bars whose length in the recording is far from the score's (ritardando, fermata, or a wrong point).
  const misfits: string[] = [];
  for (let k = 1; k < anchors.length; k++) {
    const a = anchors[k - 1]!;
    const b = anchors[k]!;
    const r = (b.ms - a.ms) / 1000 / ((starts[b.bar - 1]! - starts[a.bar - 1]!) * ratio);
    if (Math.abs(Math.log(r)) > MISFIT) misfits.push(`${a.bar} (×${r.toFixed(2)})`);
  }
  if (misfits.length) notes.push(`bar lengths far from the score: ${misfits.join(', ')}`);

  let drift = { seconds: 0, bar: 1 };
  const first = anchors[0];
  for (const a of anchors) {
    const seconds = (a.ms - first!.ms) / 1000 - (starts[a.bar - 1]! - starts[first!.bar - 1]!);
    if (Math.abs(seconds) > Math.abs(drift.seconds)) drift = { seconds, bar: a.bar };
  }
  return { anchors, ratio, drift, notes };
}

/** "0:07.81" */
export function clock(ms: number): string {
  const s = Math.abs(ms) / 1000;
  return `${ms < 0 ? '-' : ''}${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
}

/** YAML for `media.youtube` in song.yaml: the id, where the sync came from, and five anchors per line. */
export function youtubeYaml(videoId: string, songsterr: { songId: number; revisionId: number } | null, anchors: SyncAnchor[]): string[] {
  // Ids that could read as a number or start with an indicator ("-QlIs-fT8Mc") are quoted.
  const id = /^[A-Za-z]/.test(videoId) ? videoId : JSON.stringify(videoId);
  const lines = ['  youtube:', `    videoId: ${id}`];
  if (songsterr) lines.push(`    songsterr: { songId: ${songsterr.songId}, revisionId: ${songsterr.revisionId} }`);
  if (!anchors.length) return [...lines, '    sync: []'];
  lines.push('    sync: [');
  for (let i = 0; i < anchors.length; i += 5) {
    lines.push(`      ${anchors.slice(i, i + 5).map((a) => `{ bar: ${a.bar}, ${a.tick ? `tick: ${a.tick}, ` : ''}ms: ${a.ms} }`).join(', ')},`);
  }
  return [...lines, '      ]'];
}

/** Replaces the `youtube:` entry under `media:` in a song.yaml text, whatever its current layout. */
export function replaceYoutube(text: string, block: string[]): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const media = lines.findIndex((l) => /^media:\s*$/.test(l));
  if (media < 0) throw new Error('song.yaml has no block-style `media:` section to put the YouTube sync in');
  const indent = (l: string) => l.length - l.trimStart().length;
  let start = -1;
  for (let i = media + 1; i < lines.length && (lines[i]!.trim() === '' || indent(lines[i]!) > 0); i++) {
    if (/^ {2}youtube:/.test(lines[i]!)) {
      start = i;
      break;
    }
  }
  if (start < 0) return [...lines.slice(0, media + 1), ...block, ...lines.slice(media + 1)].join(eol);
  let end = start + 1;
  while (end < lines.length && lines[end]!.trim() !== '' && indent(lines[end]!) > 2) end++;
  return [...lines.slice(0, start), ...block, ...lines.slice(end)].join(eol);
}

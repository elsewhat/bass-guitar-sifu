import type { Bar, BeatEvent } from './model';

// Tacet detection and the draft chunk split (ADR-0006 as amended by ADR-0015). The final
// chunks are chosen by the preprocess-song skill and stored in song.yaml; the draft here is
// guidance printed by `npm run inspect-song`.

export type BarRange = [number, number];

/** Bars that contain no bass notes at all (rests only). A bar holding a tied note is not tacet. */
export function findTacet(bars: Bar[], events: BeatEvent[]): BarRange[] {
  const sounding = new Set(events.filter((e) => e.kind === 'note').map((e) => e.bar));
  return toRanges(bars.map((b) => b.n).filter((n) => !sounding.has(n)));
}

/** Complement of the tacet ranges within 1..barCount. */
export function playableRanges(barCount: number, tacet: BarRange[]): BarRange[] {
  const silent = new Set(tacet.flatMap(([a, b]) => range(a, b)));
  return toRanges(range(1, barCount).filter((n) => !silent.has(n)));
}

/**
 * One letter per bar ("A", "B", …); bars with identical content (string, fret, onset,
 * duration, tie and dead flags) get the same letter. Tacet bars get ".".
 */
export function barSignatures(bars: Bar[], events: BeatEvent[]): Map<number, string> {
  const byBar = new Map<number, string[]>();
  for (const e of events) {
    if (e.kind !== 'note') continue;
    const key = `${e.tick}:${e.dur}:${e.notes.map((n) => `${n.dead ? 'x' : n.pitch}${n.tieFromPrev ? 't' : ''}`).join('+')}`;
    const list = byBar.get(e.bar) ?? [];
    list.push(key);
    byBar.set(e.bar, list);
  }
  const letters = new Map<string, string>();
  const result = new Map<number, string>();
  for (const bar of bars) {
    const content = byBar.get(bar.n);
    if (!content) {
      result.set(bar.n, '.');
      continue;
    }
    const key = content.join(' ');
    if (!letters.has(key)) letters.set(key, letterName(letters.size));
    result.set(bar.n, letters.get(key)!);
  }
  return result;
}

export interface DraftChunk {
  name: string;
  bars: BarRange;
  pattern: string; // bar signature letters, e.g. "ABAB"
}

/** Draft chunks: sections × playable ranges, split into 2–8 bar phrases, repeats merged. */
export function draftChunks(bars: Bar[], events: BeatEvent[]): DraftChunk[] {
  const tacet = findTacet(bars, events);
  const sig = barSignatures(bars, events);
  const sectionOf = sectionIndex(bars);
  const result: DraftChunk[] = [];
  const riffLetters = new Map<string, string>();

  for (const [from, to] of playableRanges(bars.length, tacet)) {
    // Split the playable range at section starts.
    const segments: { name: string | null; bars: BarRange }[] = [];
    let start = from;
    for (let n = from + 1; n <= to + 1; n++) {
      if (n > to || bars[n - 1]!.section) {
        segments.push({ name: sectionOf.get(start) ?? null, bars: [start, n - 1] });
        start = n;
      }
    }

    for (const seg of segments) {
      const phrases = scanPhrases(seg.bars, sig);
      const plain = phrases.filter((q) => q.repeats === 0).length;
      const named: DraftChunk[] = [];
      let letter = 0;
      for (const p of phrases) {
        let name: string;
        if (p.repeats > 0) {
          const base = named[named.length - 1]?.name ?? 'Riff';
          name = p.repeats === 1 ? `${base} repeat` : `${base} ×${p.repeats}`;
        } else if (seg.name) {
          name = plain > 1 ? `${seg.name} ${String.fromCharCode(97 + letter++)}` : seg.name;
        } else {
          if (!riffLetters.has(p.unit)) riffLetters.set(p.unit, letterName(riffLetters.size));
          name = `Riff ${riffLetters.get(p.unit)}`;
        }
        named.push({ name, bars: p.bars, pattern: patternOf(p.bars, sig) });
      }
      result.push(...named);
    }
  }
  return result;
}

interface Phrase {
  bars: BarRange;
  unit: string; // pattern of one unit
  repeats: number; // 0 = first occurrence; n = n immediate repeats of the previous phrase merged
}

/**
 * Greedy scan: at each bar, take the longest unit (8…2 bars) that is immediately repeated;
 * emit it, then merge its following repeats (≤ 16 bars) into one phrase. Material that does
 * not repeat runs up to the next repeating unit (2–8 bars) or is cut into 4-bar phrases.
 */
function scanPhrases([from, to]: BarRange, sig: Map<number, string>): Phrase[] {
  const pat = (a: number, k: number) => (a + k - 1 <= to ? patternOf([a, a + k - 1], sig) : null);
  const repeatingUnitAt = (a: number) => {
    for (let k = 8; k >= 2; k--) {
      const u = pat(a, k);
      if (u !== null && u === pat(a + k, k)) return k;
    }
    return 0;
  };
  const phrases: Phrase[] = [];
  let i = from;
  while (i <= to) {
    const k = repeatingUnitAt(i);
    if (k > 0) {
      const unit = pat(i, k)!;
      phrases.push({ bars: [i, i + k - 1], unit, repeats: 0 });
      const j = i + k;
      let r = 0;
      while (pat(j + r * k, k) === unit && (r + 1) * k <= 16) r++;
      if (r > 0) phrases.push({ bars: [j, j + r * k - 1], unit, repeats: r });
      i = j + r * k;
      continue;
    }
    let len = 0;
    for (let j = 2; j <= 8 && i + j <= to; j++) {
      if (repeatingUnitAt(i + j) > 0) {
        len = j;
        break;
      }
    }
    if (len === 0) len = Math.min(4, to - i + 1);
    phrases.push({ bars: [i, i + len - 1], unit: pat(i, len)!, repeats: 0 });
    i += len;
  }
  // A last phrase shorter than 2 bars joins the previous one.
  const last = phrases[phrases.length - 1];
  const prev = phrases[phrases.length - 2];
  if (last && prev && last.bars[1] === last.bars[0]) {
    prev.bars[1] = last.bars[1];
    phrases.pop();
  }
  return phrases;
}

function patternOf([a, b]: BarRange, sig: Map<number, string>): string {
  return range(a, b)
    .map((n) => sig.get(n) ?? '.')
    .join('');
}

function sectionIndex(bars: Bar[]): Map<number, string> {
  const map = new Map<number, string>();
  let current: string | null = null;
  for (const bar of bars) {
    if (bar.section) current = bar.section;
    if (current) map.set(bar.n, current);
  }
  return map;
}

export function toRanges(numbers: number[]): BarRange[] {
  const ranges: BarRange[] = [];
  for (const n of [...numbers].sort((a, b) => a - b)) {
    const last = ranges[ranges.length - 1];
    if (last && last[1] === n - 1) last[1] = n;
    else ranges.push([n, n]);
  }
  return ranges;
}

function range(a: number, b: number): number[] {
  return Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
}

function letterName(i: number): string {
  // A…Z, then AA, AB, …
  return i < 26 ? String.fromCharCode(65 + i) : letterName(Math.floor(i / 26) - 1) + letterName(i % 26);
}

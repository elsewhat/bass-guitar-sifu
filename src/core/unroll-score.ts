// Repeat unrolling (ADR-0023). A score with repeat signs, alternate endings or D.S./D.C./coda is
// turned into a plain score whose bars are in the order they are played, so bar numbers, ticks,
// the strip and the Synth all count played bars. Shared by the importer (Node) and the strip
// (browser); the caller passes in the alphaTab module, so src/core does not load alphaTab.
import type * as AlphaTab from '@coderline/alphatab';

type AlphaTabModule = typeof AlphaTab;
type Score = AlphaTab.model.Score;
type Settings = AlphaTab.Settings;

/**
 * Written masterBar index (0-based) of every played bar, in playing order, as alphaTab's own MIDI
 * generator walks the score: repeats, alternate endings and jumps come out exactly as the Synth
 * plays them.
 */
export function playedOrder(at: AlphaTabModule, score: Score, settings: Settings): number[] {
  const handler = new at.midi.AlphaSynthMidiFileHandler(new at.midi.MidiFile());
  const generator = new at.midi.MidiFileGenerator(score, settings, handler);
  generator.generate();
  return generator.tickLookup.masterBars.map((m) => m.masterBar.index);
}

export function isWrittenOrder(order: readonly number[], barCount: number): boolean {
  return order.length === barCount && order.every((index, i) => index === i);
}

type Json = Map<string, unknown>;

/** Deep copy of alphaTab's JSON form; `dropIds` gives the copy's bars, voices, beats and notes new ids. */
function copy(value: unknown, dropIds: boolean): unknown {
  if (value instanceof Map) {
    const out = new Map<string, unknown>();
    for (const [k, v] of value) if (!(dropIds && k === 'id')) out.set(k, copy(v, dropIds));
    return out;
  }
  return Array.isArray(value) ? value.map((v) => copy(v, dropIds)) : value;
}

/**
 * The score with its bars in played order. Repeat signs, endings and jumps are removed from the
 * copies so alphaTab does not replay them, and a section marker stays on the first copy only.
 * Returns the same score when the order is the written one.
 */
export function unrollScore(at: AlphaTabModule, score: Score, order: readonly number[], settings: Settings): Score {
  if (isWrittenOrder(order, score.masterBars.length)) return score;
  const json = at.model.JsonConverter.scoreToJsObject(score);
  if (!json) throw new Error('Could not serialise the score for unrolling');

  const unrolled = <T>(items: T[], each: (item: T, first: boolean) => T) => {
    const seen = new Set<number>();
    return order.map((index) => {
      const item = items[index];
      if (item === undefined) throw new Error(`Played bar refers to written bar ${index + 1}, which does not exist`);
      const first = !seen.has(index);
      seen.add(index);
      return each(item, first);
    });
  };

  json.set(
    'masterbars',
    unrolled(json.get('masterbars') as Json[], (mb, first) => {
      const out = copy(mb, false) as Json;
      for (const key of ['isrepeatstart', 'repeatcount', 'alternateendings', 'directions']) out.delete(key);
      if (!first) out.delete('section');
      return out;
    }),
  );
  for (const track of json.get('tracks') as Json[]) {
    for (const staff of track.get('staves') as Json[]) {
      staff.set('bars', unrolled(staff.get('bars') as Json[], (bar, first) => copy(bar, !first) as Json));
    }
  }
  return at.model.JsonConverter.jsObjectToScore(json, settings);
}

export interface OrderSegment {
  played: [number, number]; // 1-based played bars
  written: [number, number]; // 1-based written bars
  times: number; // how often the written range is repeated here
}

/**
 * Played-to-written bar mapping for the inspect report, e.g. for Freedom: played 1–97 = written
 * 1–97, played 98–103 = written 98 ×6, played 104–110 = written 99–105. Runs of consecutive bars
 * are cut wherever any run starts or ends, then back-to-back repeats are folded into `times`.
 */
export function orderSegments(order: readonly number[]): OrderSegment[] {
  const runs: { played: [number, number]; written: [number, number] }[] = [];
  order.forEach((index, i) => {
    const last = runs[runs.length - 1];
    if (last && index === last.written[1]) {
      last.written[1] = index + 1;
      last.played[1] = i + 1;
    } else runs.push({ played: [i + 1, i + 1], written: [index + 1, index + 1] });
  });
  const cuts = new Set(runs.flatMap((r) => [r.written[0], r.written[1] + 1]));
  const pieces = runs.flatMap((r) => {
    const out: typeof runs = [];
    let from = r.written[0];
    for (let w = r.written[0] + 1; w <= r.written[1] + 1; w++) {
      if (w <= r.written[1] && !cuts.has(w)) continue;
      const played = r.played[0] + (from - r.written[0]);
      out.push({ played: [played, played + (w - 1 - from)], written: [from, w - 1] });
      from = w;
    }
    return out;
  });
  const segments: OrderSegment[] = [];
  for (const run of pieces) {
    const last = segments[segments.length - 1];
    if (last && last.written[0] === run.written[0] && last.written[1] === run.written[1] && last.played[1] + 1 === run.played[0]) {
      last.played[1] = run.played[1];
      last.times++;
    } else segments.push({ ...run, times: 1 });
  }
  return segments;
}

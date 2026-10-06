// Time math for the CountClock's look-ahead scheduler (ADR-0008), without Web Audio so it can be
// unit tested. The timeline walks the eighth-note grid of the loop range, turns ticks into
// audio-clock seconds with the tempo map and playback rate, and wraps at the range end. It also
// answers "which tick is audible at time t" for the per-frame position.
import { countLabel, EIGHTH, type CountLabel } from '../core/count';
import type { Bar } from '../core/model';
import type { TickRange } from '../core/plucks';
import { barIndexAt, type TempoLookup } from '../core/timing';

export type TimelineStep =
  | { kind: 'count'; time: number; tick: number; bar: number; label: CountLabel }
  | { kind: 'wrap'; time: number; from: TickRange; to: TickRange }
  | { kind: 'end'; time: number; from: TickRange };

interface Anchor {
  time: number;
  tick: number;
  limit: number; // the position never runs past the next grid point before its anchor exists
}

export class CountTimeline {
  private range: TickRange = { start: 0, end: 0 };
  private rate = 1;
  private cursorTick = 0; // next grid point to schedule
  private cursorTime = 0; // its audio time
  private anchors: Anchor[] = [];
  private ended = false; // onRangeEnd chose to stop; nothing more is scheduled

  constructor(
    private readonly bars: Bar[],
    private readonly tempo: TempoLookup,
    /** Called when the schedule reaches the range end; returns the range to continue with, or null to end. */
    private readonly onRangeEnd: (range: TickRange) => TickRange | null = (r) => r,
  ) {}

  /** Starts (or restarts) the schedule at `tick`, heard at audio time `time`. */
  start(tick: number, time: number, range: TickRange, rate: number) {
    this.range = range;
    this.rate = rate;
    this.ended = false;
    const clamped = tick >= range.start && tick < range.end ? tick : range.start;
    const grid = this.gridAtOrAfter(clamped);
    this.cursorTick = grid;
    this.cursorTime = time + this.seconds(clamped, grid);
    this.anchors = [{ time, tick: clamped, limit: grid }];
  }

  get currentRange(): TickRange {
    return this.range;
  }

  /** Emits every step whose time is before `horizon`. */
  fill(horizon: number): TimelineStep[] {
    const steps: TimelineStep[] = [];
    while (!this.ended && this.cursorTime < horizon) {
      if (this.cursorTick >= this.range.end) {
        const from = this.range;
        const to = this.onRangeEnd(from);
        if (!to) {
          this.ended = true;
          steps.push({ kind: 'end', time: this.cursorTime, from });
          break;
        }
        if (to.end <= to.start) break;
        this.range = to;
        this.cursorTick = to.start;
        steps.push({ kind: 'wrap', time: this.cursorTime, from, to });
        continue;
      }
      const bar = this.bars[barIndexAt(this.bars, this.cursorTick)]!;
      const eighth = Math.floor((this.cursorTick - bar.startTick) / EIGHTH);
      const next = Math.min(bar.startTick + (eighth + 1) * EIGHTH, bar.startTick + bar.durTicks, this.range.end);
      steps.push({ kind: 'count', time: this.cursorTime, tick: this.cursorTick, bar: bar.n, label: countLabel(bar.time, eighth) });
      this.anchors.push({ time: this.cursorTime, tick: this.cursorTick, limit: next });
      this.cursorTime += this.seconds(this.cursorTick, next);
      this.cursorTick = next;
    }
    return steps;
  }

  /** The tick heard at audio time `time` (extrapolated inside the current grid step). */
  positionAt(time: number): number {
    let a = this.anchors[0];
    if (!a) return this.range.start;
    for (let i = this.anchors.length - 1; i >= 0; i--) {
      if (this.anchors[i]!.time <= time) {
        a = this.anchors[i]!;
        break;
      }
    }
    if (time <= a.time) return a.tick;
    const tick = a.tick + (time - a.time) * this.ticksPerSecond(a.tick);
    return Math.min(tick, a.limit);
  }

  /** Forgets anchors older than `time` (keeps the one in effect). */
  prune(time: number) {
    let i = 0;
    while (i + 1 < this.anchors.length && this.anchors[i + 1]!.time <= time) i++;
    if (i) this.anchors.splice(0, i);
  }

  private ticksPerSecond(tick: number) {
    return (this.tempo.bpmAt(tick) / 60) * (EIGHTH * 2) * this.rate;
  }

  /** Seconds between two ticks at the current rate. */
  private seconds(from: number, to: number) {
    return (this.tempo.secondsAt(to) - this.tempo.secondsAt(from)) / this.rate;
  }

  /** First eighth-note grid point (or bar start) at or after a tick. */
  private gridAtOrAfter(tick: number) {
    const bar = this.bars[barIndexAt(this.bars, tick)]!;
    const k = Math.ceil((tick - bar.startTick) / EIGHTH);
    return Math.min(bar.startTick + k * EIGHTH, bar.startTick + bar.durTicks);
  }
}

// One clock interface for every playback source (ADR-0008, amended by ADR-0016/0017). UI code
// never knows which source is active: it reads `getTick()` once per animation frame and reacts
// to `passCompleted`. Positions are absolute score ticks (PPQ 960); the bar follows from the
// song's bar list, so the ADR's "bar + tick" is one number here.
import type { TickRange } from '../core/plucks';
import type { CountInState } from './count-in';

export interface ClockCapabilities {
  rates: number[] | 'continuous';
  video: boolean;
}

export interface PassCompleted {
  from: TickRange;
  /**
   * Where playback continued: the same range (another pass) or the next chunk's. Null when
   * `onRangeEnd` chose to stop: the clock has paused at the start of `from`.
   */
  to: TickRange | null;
}

export interface PlayOptions {
  /** One bar of metronome counts before playback starts (ADR-0025). */
  countIn?: boolean;
}

export interface PlaybackClock {
  readonly capabilities: ClockCapabilities;
  /** Starts playback; must be called from a user gesture the first time (audio unlock). */
  play(options?: PlayOptions): Promise<void>;
  pause(): void;
  isPlaying(): boolean;
  seek(tick: number): void;
  /** Playback rate (1 = score tempo). */
  setRate(rate: number): void;
  /** The loop range. Playback wraps at its end to whatever `onRangeEnd` returns. */
  setRange(range: TickRange): void;
  /**
   * Chooses the range after a pass, or null to stop at the end of this one (the song is over);
   * set by the loop controller. Called slightly ahead of time.
   */
  onRangeEnd: (range: TickRange) => TickRange | null;
  /** The audible position, extrapolated for the current animation frame. It stays at the start during a count-in. */
  getTick(): number;
  /** The count heard now while counting in, else null; read per animation frame. */
  countInState(): CountInState | null;
  /** Fires when the audible position wraps (not when the wrap is scheduled). */
  onPassCompleted(listener: (e: PassCompleted) => void): () => void;
  dispose(): void;
}

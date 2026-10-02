// Count-in for the Synth and Music sources (ADR-0025): the metronome's counts on their own audio
// context, through the Click and Voice channels. The count-in resolves when its end is due on the
// audio clock; the source then starts, so its first note follows the last count by about the
// source's own start-up time.
import { countInState, type CountInPlan, type CountInPort, type CountInState } from './count-in';
import { CountSounds, type CountGains } from './count-sounds';

const START_DELAY = 0.03; // seconds between the start and the first sound
const WATCH_MS = 5; // how often the end of the count-in is checked

export class CountInPlayer implements CountInPort {
  private readonly sounds: CountSounds;
  private current: { plan: CountInPlan; start: number; timer: ReturnType<typeof setInterval>; done: (heard: boolean) => void } | null = null;

  constructor(gains: CountGains) {
    this.sounds = new CountSounds(gains);
  }

  prepare() {
    void this.sounds.context().resume();
  }

  run(plan: CountInPlan): Promise<boolean> {
    this.cancel();
    const ctx = this.sounds.context();
    this.sounds.loadSamples(plan.beats.map((b) => b.label));
    const start = ctx.currentTime + START_DELAY;
    for (const beat of plan.beats) this.sounds.sound(beat.label, start + beat.offset);
    return new Promise((resolve) => {
      const done = (heard: boolean) => {
        clearInterval(timer);
        this.current = null;
        resolve(heard);
      };
      const timer = setInterval(() => {
        if (ctx.currentTime >= start + plan.duration) done(true);
      }, WATCH_MS);
      this.current = { plan, start, timer, done };
    });
  }

  cancel() {
    this.sounds.cancel();
    this.current?.done(false);
  }

  state(): CountInState | null {
    const c = this.current;
    if (!c) return null;
    const elapsed = this.sounds.audibleTime() - c.start;
    return elapsed < c.plan.duration ? countInState(c.plan, elapsed) : null;
  }

  /** The metronome's mixer levels (Click, Voice, master). */
  setMix(gains: CountGains) {
    this.sounds.setMix(gains);
  }

  dispose() {
    this.cancel();
    this.sounds.dispose();
  }
}

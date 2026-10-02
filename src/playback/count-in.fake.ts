// Test double for the count-in port: records calls and finishes when the test says so.
import type { CountInPlan, CountInPort, CountInState } from './count-in';

export class FakeCountIn implements CountInPort {
  calls: string[] = [];
  /** Resolves once `run` has been called. */
  readonly running: Promise<void>;
  private started!: () => void;
  private end: ((heard: boolean) => void) | null = null;
  private plan: CountInPlan | null = null;

  constructor() {
    this.running = new Promise((r) => (this.started = r));
  }

  prepare() {
    this.calls.push('prepare');
  }
  run(plan: CountInPlan) {
    this.calls.push(`run ${plan.duration}s`);
    this.plan = plan;
    this.started();
    return new Promise<boolean>((resolve) => (this.end = resolve));
  }
  cancel() {
    this.calls.push('cancel');
    this.settle(false);
  }
  state(): CountInState | null {
    return this.plan && { time: this.plan.time, cell: 0 };
  }
  dispose() {}
  finish() {
    this.settle(true);
  }
  private settle(heard: boolean) {
    this.end?.(heard);
    this.end = null;
    this.plan = null;
  }
}

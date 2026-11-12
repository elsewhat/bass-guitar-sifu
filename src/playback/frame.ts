// One requestAnimationFrame loop for everything that follows the playhead (ADR-0002, ADR-0008):
// the strip, the Now square fade, the fretboard and the count cells. Subscribers get the
// clock's tick for the frame and update the DOM directly; nothing here goes through React.
import { useEffect, useRef } from 'react';

export type FrameListener = (tick: number, now: number) => void;

const listeners = new Set<FrameListener>();
let tickSource: () => number = () => 0;
let raf = 0;

/** The practice engine points this at the active clock. */
export function setTickSource(source: () => number) {
  tickSource = source;
  resetFrameTick();
}

// The tick the frame's listeners get is the clock's tick, steadied (ADR-0034). A clock
// extrapolates from the reports of its player and corrects itself at every report, and it reads the
// time when it is asked, a varying moment after the frame's own time. Frame times vary a little
// too, although the screen shows the frames at an even pace. All of that shows as uneven movement
// of the strip. So the displayed tick runs at its own speed, one even step per frame, and both the
// tick and the speed are pulled toward the clock (a critically damped loop of about 1 Hz): it
// follows tempo and rate changes within a few tenths of a second and has no lag at a constant
// speed. Where the clock stands still or jumps (pause, range end, seek, loop wrap), the displayed
// tick is the clock's.
const LOOP = (2 * Math.PI * 1) / 1000; // rad/ms
const SNAP_MS = 60; // an error of more than this much playing time is a jump
const MAX_LATE_MS = 50;
const MAX_FRAME_MS = 100;
let shown: { raw: number; tick: number; now: number; moved: boolean } | null = null;
let speed = 0; // ticks per ms; 0 while the clock stands still
let lastSpeed = 0; // the speed before the clock last stood still or jumped
let period = 0; // ms between frames, averaged; 0 while unknown

/** For tests, and when another clock becomes the source. */
export function resetFrameTick() {
  shown = null;
  speed = lastSpeed = period = 0;
}

/** The time since the last frame: the average frame period, unless this frame was clearly early or late. */
function frameStep(dt: number): number {
  if (period === 0) period = dt;
  const even = Math.abs(dt - period) < 0.2 * period;
  period += (even ? 0.05 : 0.2) * (dt - period);
  return even ? period : dt;
}

/** The tick to show at the frame time `now`, from the clock's tick `raw` read at time `at` (ms). */
export function frameTick(raw: number, at: number, now: number): number {
  const prev = shown;
  const dt = prev ? now - prev.now : 0;
  const moved = !!prev && raw !== prev.raw;
  /** Shows the clock's own tick; the speed is found again from the next frames. */
  const follow = () => {
    if (speed > 0) lastSpeed = speed;
    speed = 0;
    shown = { raw, tick: raw, now, moved };
    return raw;
  };
  if (!prev || dt <= 0 || dt > MAX_FRAME_MS) {
    period = 0;
    return follow();
  }
  const step = frameStep(dt);
  if (!moved) return follow();
  if (speed === 0) {
    // Moving again. The first step may be a part of a frame, so the speed is taken from the
    // second: the speed from before if the clock's is about that (two readings give a rough speed).
    const seen = (raw - prev.raw) / dt;
    follow();
    if (prev.moved && seen > 0) speed = Math.abs(seen - lastSpeed) < 0.3 * lastSpeed ? lastSpeed : seen;
    return raw;
  }
  const late = Math.min(MAX_LATE_MS, Math.max(0, at - now));
  const predicted = prev.tick + speed * step;
  const error = raw - speed * late - predicted;
  if (Math.abs(error) > speed * SNAP_MS) return follow(); // a jump, or the speed was far off
  const tick = predicted + 2 * LOOP * step * error;
  speed = Math.max(speed / 2, speed + LOOP * LOOP * step * error);
  shown = { raw, tick, now, moved };
  return tick;
}

function frame(now: number) {
  const tick = frameTick(tickSource(), performance.now(), now);
  for (const l of listeners) l(tick, now);
  raf = listeners.size ? requestAnimationFrame(frame) : 0;
}

export function onFrame(listener: FrameListener): () => void {
  listeners.add(listener);
  if (!raf) raf = requestAnimationFrame(frame);
  return () => void listeners.delete(listener);
}

/** Subscribes a component to the frame loop; the latest callback is always used. */
export function useFrame(listener: FrameListener) {
  const ref = useRef(listener);
  ref.current = listener;
  useEffect(() => onFrame((tick, now) => ref.current(tick, now)), []);
}

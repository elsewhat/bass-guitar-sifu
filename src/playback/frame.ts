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
}

function frame(now: number) {
  const tick = tickSource();
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

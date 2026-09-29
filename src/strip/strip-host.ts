// The strip that TabStrip.tsx created, for the practice engine: the Synth source plays through the
// strip's alphaTab instance (ADR-0019). Type-only import, so this module does not pull in alphaTab.
import type { Strip } from './strip';

let active: Strip | null = null;
let waiting: ((strip: Strip) => void)[] = [];

export function setActiveStrip(strip: Strip | null) {
  active = strip;
  if (!strip) return;
  for (const resolve of waiting) resolve(strip);
  waiting = [];
}

/** The active strip, once TabStrip has loaded alphaTab and created it. */
export function whenStrip(): Promise<Strip> {
  return active ? Promise.resolve(active) : new Promise((resolve) => waiting.push(resolve));
}

// The element in the video cell that the YouTube player is put into (ADR-0028), for the practice
// engine: VideoCell.tsx mounts it when YouTube is the source, after the engine has asked for it.

let active: HTMLElement | null = null;
let waiting: ((host: HTMLElement) => void)[] = [];

export function setVideoHost(host: HTMLElement | null) {
  active = host;
  if (!host) return;
  for (const resolve of waiting) resolve(host);
  waiting = [];
}

/** The host element, once the video cell has rendered it. */
export function whenVideoHost(): Promise<HTMLElement> {
  return active ? Promise.resolve(active) : new Promise((resolve) => waiting.push(resolve));
}

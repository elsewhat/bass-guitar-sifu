// Keyboard shortcuts of the practice view (system description §3.4). Pure mapping from a key
// event to a transport action; the listener in components/useTransportKeys.ts decides when to
// listen at all. Matched on `key`, not `code`, so "+" works on layouts where it is unshifted.

export type KeyAction = 'toggle' | 'prev' | 'next' | 'faster' | 'slower' | 'lyricsUp' | 'lyricsDown';

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  repeat: boolean;
}

const KEYS: Record<string, KeyAction> = {
  ' ': 'toggle',
  ArrowLeft: 'prev',
  ArrowRight: 'next',
  ArrowUp: 'lyricsUp', // unsynced lyrics only (ADR-0024)
  ArrowDown: 'lyricsDown',
  '+': 'faster',
  '=': 'faster',
  '-': 'slower',
  _: 'slower',
};

export function keyAction(e: KeyLike): KeyAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const action = KEYS[e.key] ?? null;
  // Holding Space would toggle play on every key repeat.
  return action === 'toggle' && e.repeat ? null : action;
}

import { useEffect } from 'react';
import { goNextChunk, goPrevChunk, scrollLyrics, stepTempo, togglePlay } from '../practice/engine';
import { keyAction, type KeyAction } from '../practice/keys';
import { useSession } from '../state/session';

// Global transport shortcuts: Space play/pause, ← → chunks, + − tempo, ↑ ↓ unsynced lyrics
// (system description §3.4).
// Off while a dialog is open or a form field has focus (library search, mixer sliders).

const RUN: Record<KeyAction, () => void> = {
  toggle: togglePlay,
  prev: goPrevChunk,
  next: goNextChunk,
  faster: () => stepTempo(1),
  slower: () => stepTempo(-1),
  lyricsUp: () => scrollLyrics(-1),
  lyricsDown: () => scrollLyrics(1),
};

function isField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function useTransportKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { mixerOpen, libraryOpen } = useSession.getState();
      if (e.defaultPrevented || mixerOpen || libraryOpen || isField(e.target)) return;
      const action = keyAction(e);
      if (!action) return;
      // Also stops a focused button from clicking on Space, and the page from scrolling.
      e.preventDefault();
      RUN[action]();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

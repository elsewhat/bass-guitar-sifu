// Keeps the screen awake while playing (ADR-0027): the player's hands are on the bass, so the
// screen must not dim or lock during a long pass or a silent Metronome stretch. The Screen Wake
// Lock is held while the session plays (count-in included) and released on pause or at the end
// of the song. The browser releases it whenever the page is hidden, so it is requested again when
// the page becomes visible and is still playing. Browsers without the API simply keep their
// sleep settings.

export interface WakeLockHandle {
  readonly released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

export interface WakeLockApi {
  request(type: 'screen'): Promise<WakeLockHandle>;
}

export interface VisibilitySource {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
}

/**
 * Holds the screen wake lock whenever `isPlaying()` and the page is visible. `subscribe` calls
 * its listener when the playing state may have changed.
 */
export function keepAwakeWhilePlaying(
  isPlaying: () => boolean,
  subscribe: (listener: () => void) => void,
  api: WakeLockApi | undefined = typeof navigator === 'undefined' ? undefined : navigator.wakeLock,
  page: VisibilitySource | undefined = typeof document === 'undefined' ? undefined : document,
): void {
  if (!api || !page) return;
  let lock: WakeLockHandle | null = null;
  let requesting = false;

  const wanted = () => isPlaying() && page.visibilityState === 'visible';

  const sync = () => {
    if (wanted()) {
      if (lock || requesting) return;
      requesting = true;
      api.request('screen').then(
        (l) => {
          requesting = false;
          if (!wanted()) {
            void l.release().catch(() => undefined);
            return;
          }
          lock = l;
          l.addEventListener('release', () => {
            if (lock === l) lock = null;
          });
        },
        () => {
          requesting = false; // refused (e.g. power saving); playback goes on without it
        },
      );
    } else if (lock) {
      const l = lock;
      lock = null;
      void l.release().catch(() => undefined);
    }
  };

  subscribe(sync);
  page.addEventListener('visibilitychange', sync);
  sync();
}

// The YouTube source's player (ADR-0028): the IFrame Player API behind the clock's `VideoPlayer`
// port. The video stays an embed (ADR-0011); nothing is downloaded. What the API needs help with:
//   - A video that has never played cannot be paused at a place. Its place is only remembered, and
//     `prepare` runs it muted for a moment, so it sits buffered and paused there when the count-in
//     ends. It is never cued at the place: a cue that is still in flight cancels the load after it.
//   - Its states are mapped to the port's five, and what happens during that preparation is kept
//     from the clock.
//   - A click on the video moves the keyboard focus into the frame; it is handed back, so Space
//     and the arrow keys keep working.
// The player's own controls are off (`controls=0`): the transport bar drives the video. A click on
// the video still plays and pauses it, and the clock follows.
import type { VideoPlayer, VideoState } from './youtube-clock';

export interface YouTubePlayerHandle extends VideoPlayer {
  /** 0–1: master × Video channel gain (ADR-0020). */
  setGain(gain: number): void;
  /** The video cannot be played: removed, embedding switched off, or blocked in this country. */
  onError(listener: (message: string) => void): () => void;
}

// The part of the IFrame API that is used (https://developers.google.com/youtube/iframe_api_reference).
interface YtPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  loadVideoById(video: { videoId: string; startSeconds?: number }): void;
  stopVideo(): void;
  getCurrentTime(): number | undefined;
  getPlayerState(): number | undefined;
  setPlaybackRate(rate: number): void;
  setVolume(volume: number): void;
  mute(): void;
  unMute(): void;
  getIframe(): HTMLIFrameElement;
  destroy(): void;
}

interface YtApi {
  Player: new (
    element: HTMLElement,
    options: {
      width: string;
      height: string;
      videoId: string;
      host?: string;
      playerVars: Record<string, string | number>;
      events: {
        onReady(): void;
        onStateChange(event: { data: number }): void;
        onError(event: { data: number }): void;
        onPlaybackRateChange(event: { data: number }): void;
      };
    },
  ) => YtPlayer;
}

declare global {
  interface Window {
    YT?: YtApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const API_URL = 'https://www.youtube.com/iframe_api';
const API_TIMEOUT_MS = 15_000;
const PREPARE_TIMEOUT_MS = 8000; // a video that has not started by then is cued again
const NEAR = 0.05; // seconds: a paused video this close to the wanted place is not moved
const PLAYING = 1;

let api: Promise<YtApi> | null = null;

/** Loads the IFrame API script once; a failed load can be tried again. */
function loadApi(): Promise<YtApi> {
  api ??= new Promise<YtApi>((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    const fail = (message: string) => {
      api = null;
      script.remove();
      reject(new Error(message));
    };
    const timer = setTimeout(() => fail('YouTube did not answer'), API_TIMEOUT_MS);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      clearTimeout(timer);
      resolve(window.YT!);
    };
    const script = document.createElement('script');
    script.src = API_URL;
    script.async = true;
    script.onerror = () => {
      clearTimeout(timer);
      fail('YouTube could not be reached');
    };
    document.head.append(script);
  });
  return api;
}

function errorText(code: number): string {
  if (code === 100) return 'the video has been removed or is private';
  if (code === 101 || code === 150) return 'the video may not be played here (embedding is off, or it is blocked in this country)';
  if (code === 2) return 'the video id is not valid';
  return `player error ${code}`;
}

export function createYouTubePlayer(host: HTMLElement, videoId: string, gain: number): YouTubePlayerHandle {
  const stateListeners = new Set<(state: VideoState) => void>();
  const errorListeners = new Set<(message: string) => void>();
  // The player gets its own box, so that disposing it never touches a newer player in the same host.
  const box = document.createElement('div');
  box.style.cssText = 'position:absolute;inset:0';
  let player: YtPlayer | null = null;
  let disposed = false;
  let started = false; // the video has played at least once: it can be paused and moved
  let wantPlay = false;
  let preparing: ReturnType<typeof setTimeout> | null = null; // running muted until it has started
  let position = 0; // where the video was last put (seconds)
  let loading = Number.NaN; // where the never-started video is being loaded
  let level = gain;
  let rate = 1;

  const applyVolume = () => {
    if (!player) return;
    if (level <= 0 || preparing !== null) player.mute();
    else player.unMute();
    player.setVolume(Math.round(level * 100));
  };

  const map = (code: number | undefined): VideoState => {
    if (code === PLAYING) return 'playing';
    if (code === 2) return 'paused';
    if (code === 0) return 'ended';
    return code === 3 || started || wantPlay ? 'buffering' : 'idle'; // -1 unstarted, 5 cued
  };

  const endPreparing = () => {
    if (preparing !== null) clearTimeout(preparing);
    preparing = null;
    applyVolume();
  };

  /** Loads the never-started video and plays it from `position`. */
  const load = () => {
    loading = position;
    player!.loadVideoById({ videoId, startSeconds: position });
  };

  const onStateChange = (code: number) => {
    const first = code === PLAYING && !started;
    if (code === PLAYING) started = true;
    if (preparing !== null) {
      if (code !== PLAYING) return;
      // It runs: pause it at the place and give the sound back. The clock never sees this.
      player!.pauseVideo();
      player!.seekTo(position, true);
      endPreparing();
      return;
    }
    // Started by a click on the video before it had ever played: it began at 0:00, not at the place.
    if (first && !wantPlay && Math.abs((player!.getCurrentTime() ?? position) - position) > NEAR) player!.seekTo(position, true);
    for (const l of stateListeners) l(map(code));
  };

  // A click on the video takes the keyboard focus into the frame; the transport keys need it back.
  const onBlur = () => {
    const frame = player?.getIframe();
    if (frame && document.activeElement === frame) {
      setTimeout(() => {
        frame.blur();
        window.focus();
      }, 0);
    }
  };

  const ready = loadApi().then(
    (YT) =>
      new Promise<void>((resolve, reject) => {
        if (disposed) return reject(new Error('disposed'));
        const mount = document.createElement('div');
        box.append(mount);
        host.append(box);
        const created = new YT.Player(mount, {
          width: '100%',
          height: '100%',
          videoId,
          host: 'https://www.youtube-nocookie.com',
          playerVars: { controls: 0, disablekb: 1, fs: 0, rel: 0, iv_load_policy: 3, playsinline: 1, origin: location.origin },
          events: {
            onReady: () => {
              if (disposed) return;
              player = created;
              const frame = created.getIframe();
              frame.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0';
              frame.tabIndex = -1;
              window.addEventListener('blur', onBlur);
              applyVolume();
              resolve();
            },
            onStateChange: (e) => !disposed && onStateChange(e.data),
            onError: (e) => {
              const message = errorText(e.data);
              reject(new Error(message));
              for (const l of errorListeners) l(message);
            },
            onPlaybackRateChange: (e) => (rate = e.data),
          },
        });
      }),
  );
  ready.catch(() => undefined); // surfaces through the clock and the engine

  return {
    ready,
    seek(seconds) {
      position = seconds;
      // A never-started video only remembers the place; a preparation ends at `position`.
      if (player && started && preparing === null) player.seekTo(seconds, true);
    },
    prepare(seconds) {
      position = seconds;
      if (!player || preparing !== null) return;
      if (started) {
        if (Math.abs((player.getCurrentTime() ?? seconds) - seconds) > NEAR) player.seekTo(seconds, true);
        return;
      }
      preparing = setTimeout(() => {
        // It never started (blocked or no network): give up, so it cannot start late and unasked.
        endPreparing();
        if (!wantPlay && !started) player?.stopVideo();
      }, PREPARE_TIMEOUT_MS);
      applyVolume();
      load();
    },
    play() {
      wantPlay = true;
      if (!player) return;
      if (preparing !== null) {
        // The count-in was shorter than the preparation: let the load play on, with sound.
        endPreparing();
        if (loading !== position) load();
      } else if (!started) load();
      else player.playVideo();
    },
    pause() {
      wantPlay = false;
      // While preparing, the video pauses itself once it has started; pausing the load would stop it.
      if (preparing === null) player?.pauseVideo();
    },
    time: () => player?.getCurrentTime() ?? position,
    state: () => (!player ? 'idle' : preparing !== null ? 'buffering' : map(player.getPlayerState())),
    setRate(r) {
      rate = r; // until the player reports the rate it took
      player?.setPlaybackRate(r);
    },
    rate: () => rate,
    onState(listener) {
      stateListeners.add(listener);
      return () => void stateListeners.delete(listener);
    },
    setGain(g) {
      level = g;
      applyVolume();
    },
    onError(listener) {
      errorListeners.add(listener);
      return () => void errorListeners.delete(listener);
    },
    dispose() {
      disposed = true;
      if (preparing !== null) clearTimeout(preparing);
      window.removeEventListener('blur', onBlur);
      stateListeners.clear();
      errorListeners.clear();
      try {
        player?.destroy();
      } catch {
        // The frame is already gone.
      }
      player = null;
      box.remove();
    },
  };
}

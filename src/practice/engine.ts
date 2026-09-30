// Practice engine: owns the active PlaybackClock, applies the loop controller's transitions to it
// and mirrors the discrete results (chunk, pass, playing, tempo) into the session store. UI
// components call these functions; per-frame consumers read the clock through src/playback/frame.
import type { CatalogEntry, SongData } from '../core/model';
import type { PlaybackClock } from '../playback/clock';
import { CountClock, countSamplesAvailable, type CountGains } from '../playback/count-clock';
import { setTickSource } from '../playback/frame';
import { chunkRange, completePass, initialLoop, nextChunk, nextRepeatMode, prevChunk, rangeAfterPass, selectChunk, setRepeatMode, willAdvance } from '../playback/loop';
import { applyQuickMix, channelGain, clampVolume, effectiveGain, type Channel, type GlobalChannelId, type QuickMix, type TrackChannel } from '../playback/mixer';
import { MusicClock } from '../playback/music-clock';
import type { MusicPlayerHandle } from '../playback/music-player';
import { SynthClock } from '../playback/synth-clock';
import { effectiveTempo, sourceAvailable, TEMPO, tempoLocked, useSession, type SourceId, type SourceStatus } from '../state/session';
import { loadProgress, loadSynthTracks, saveProgress, saveSettings, saveSynthTracks } from '../state/storage';
import { whenStrip } from '../strip/strip-host';
import type { SynthLevels, SynthPlayerHandle } from '../strip/synth-player';

const base = import.meta.env.BASE_URL;
let clock: PlaybackClock | null = null;
let synthPlayer: SynthPlayerHandle | null = null; // the Synth clock's player, for the mixer
let musicPlayer: MusicPlayerHandle | null = null; // the Music clock's player, for the mixer
let loadToken = 0;

setTickSource(() => clock?.getTick() ?? 0);

const state = () => useSession.getState();

// Progress is saved whenever the chunk, the done chunks or the tempo change within a song
// (ADR-0010); loading a song restores them without counting as practice.
useSession.subscribe((s, prev) => {
  if (!s.song || s.song !== prev.song) return;
  if (s.chunkIndex === prev.chunkIndex && s.done === prev.done && s.tempoPct === prev.tempoPct) return;
  saveProgress(s.song.slug, { chunkIndex: s.chunkIndex, done: s.done, tempoPct: s.tempoPct, lastPractised: new Date().toISOString() });
});

const clampTempo = (pct: number) => Math.max(TEMPO.min, Math.min(TEMPO.max, Math.round(pct / TEMPO.step) * TEMPO.step));

function currentRange(song: SongData) {
  return chunkRange(song.chunks[state().chunkIndex]!, song.bars);
}

/** The next chunk's range when the current pass is the last before advancing, else null. */
export function advanceRange(): { start: number; end: number } | null {
  const { song, ...loop } = state();
  if (!song || !willAdvance(loop, song.chunks.length)) return null;
  return chunkRange(song.chunks[loop.chunkIndex + 1]!, song.bars);
}

const setStatus = (sourceStatus: SourceStatus) => useSession.setState({ sourceStatus });

function onLoadProgress(progress: number) {
  if (state().sourceStatus.state === 'loading') setStatus({ state: 'loading', progress });
}

/**
 * The Synth plays through the strip's alphaTab instance (ADR-0019): alphaTab and the strip load
 * lazily, the player and soundfont only when the Synth is first chosen.
 */
function createSynthClock(song: SongData): SynthClock {
  setStatus({ state: 'loading', progress: 0 });
  const player = Promise.all([import('../strip/synth-player'), whenStrip()]).then(([{ createSynthPlayer }, strip]) => {
    strip.enableSynth(onLoadProgress);
    const p = createSynthPlayer(strip, song, synthLevels());
    if (clock === c) synthPlayer = p;
    return p;
  });
  const c = new SynthClock(song, player);
  player
    .then((p) => p.ready)
    .then(
      () => clock === c && setStatus({ state: 'ready' }),
      (e: unknown) => clock === c && setStatus({ state: 'error', error: `Synth unavailable: ${String(e)}` }),
    );
  return c;
}

/** The Music source (ADR-0022): the song's MP3 streamed from data/audio/, loaded when chosen. */
function createMusicClock(song: SongData, music: NonNullable<SongData['media']['music']>): MusicClock {
  setStatus({ state: 'loading', progress: 0 });
  const player = import('../playback/music-player').then(({ createMusicPlayer }) => {
    const p = createMusicPlayer(`${base}${music.url}`, musicGain(), onLoadProgress);
    if (clock === c) musicPlayer = p;
    return p;
  });
  const c = new MusicClock(song, music.offsetMs, player);
  player
    .then((p) => p.ready)
    .then(
      () => clock === c && setStatus({ state: 'ready' }),
      (e: unknown) => clock === c && setStatus({ state: 'error', error: `Music unavailable: ${String(e)}` }),
    );
  return c;
}

/** Creates the clock for the current source; the position is kept when it is inside the chunk. */
function attachClock(song: SongData, tick?: number) {
  clock?.dispose();
  synthPlayer = null;
  musicPlayer = null;
  if (!sourceAvailable(state().source, song)) useSession.setState({ source: 'count' });
  let c: PlaybackClock;
  const source = state().source;
  if (source === 'synth') c = createSynthClock(song);
  else if (source === 'music' && song.media.music) c = createMusicClock(song, song.media.music);
  else {
    const count = new CountClock(song);
    count.setMix(countGains());
    c = count;
    setStatus({ state: 'ready' });
  }
  clock = c;
  c.onRangeEnd = () => rangeAfterPass(state(), song.chunks, song.bars);
  c.onPassCompleted(({ to }) => {
    const s = state();
    useSession.setState(completePass(s, to, song.chunks, song.bars, effectiveTempo(s)));
  });
  c.setRate(state().tempoPct / 100);
  const range = currentRange(song);
  c.setRange(range);
  c.seek(tick !== undefined && tick >= range.start && tick < range.end ? tick : range.start);
}

// Song data is revalidated on every load (`cache: 'no-cache'`, a 304 when unchanged): Pages sends
// max-age=600, so a plain fetch could show a stale catalogue for ten minutes after a deploy.
export async function loadCatalog() {
  const res = await fetch(`${base}data/catalog.json`, { cache: 'no-cache' });
  useSession.setState({ catalog: (await res.json()) as CatalogEntry[] });
}

/** Slug from `?song=`, else the first catalogue entry. */
export function initialSlug(catalog: CatalogEntry[]): string | null {
  const wanted = new URLSearchParams(location.search).get('song');
  return catalog.find((c) => c.slug === wanted)?.slug ?? catalog[0]?.slug ?? null;
}

export async function loadSong(slug: string) {
  const token = ++loadToken;
  pause();
  try {
    const res = await fetch(`${base}data/songs/${slug}.json`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const song = (await res.json()) as SongData;
    if (token !== loadToken) return;
    const progress = loadProgress(slug, song.chunks.length);
    useSession.setState({
      song,
      loadError: null,
      ...initialLoop(state().passes, state().repeatMode),
      chunkIndex: progress?.chunkIndex ?? 0,
      done: progress?.done ?? {},
      tempoPct: clampTempo(progress?.tempoPct ?? TEMPO.start),
      synthTracks: loadSynthTracks(song),
      playing: false,
    });
    attachClock(song);
    const url = new URL(location.href);
    url.searchParams.set('song', slug);
    history.replaceState(null, '', url);
  } catch (e) {
    if (token === loadToken) useSession.setState({ loadError: `Could not load ${slug}: ${String(e)}` });
  }
}

export function togglePlay() {
  if (!clock || state().sourceStatus.state !== 'ready') return;
  if (clock.isPlaying()) pause();
  else {
    void clock.play();
    useSession.setState({ playing: true });
  }
}

export function pause() {
  clock?.pause();
  useSession.setState({ playing: false });
}

function goTo(update: (s: ReturnType<typeof state>, count: number) => ReturnType<typeof selectChunk>) {
  const song = state().song;
  if (!song || !clock) return;
  useSession.setState(update(state(), song.chunks.length));
  const range = currentRange(song);
  clock.setRange(range);
  clock.seek(range.start);
}

export function selectChunkAt(index: number) {
  goTo((s, n) => selectChunk(s, index, n));
}

export function goNextChunk() {
  goTo((s, n) => nextChunk(s, n));
}

export function goPrevChunk() {
  goTo((s, n) => prevChunk(s, n));
}

/** Back to the chunk start; the pass count stays. */
export function restartChunk() {
  const song = state().song;
  if (song && clock) clock.seek(currentRange(song).start);
}

export function stepTempo(direction: 1 | -1) {
  if (tempoLocked(state().source)) return;
  const pct = Math.max(TEMPO.min, Math.min(TEMPO.max, state().tempoPct + direction * TEMPO.step));
  useSession.setState({ tempoPct: pct });
  clock?.setRate(pct / 100);
}

/** Repeat button: advance → play through → loop (ADR-0021). Playback continues; the pass count restarts. */
export function cycleRepeatMode() {
  const repeatMode = nextRepeatMode(state().repeatMode);
  useSession.setState((s) => setRepeatMode(s, repeatMode));
  saveSettings({ repeatMode });
}

/** Switches the playback source at the current position (paused). */
export function setSource(source: SourceId) {
  if (source === state().source || !sourceAvailable(source, state().song)) return;
  pause();
  const tick = clock?.getTick();
  useSession.setState({ source });
  const song = state().song;
  if (song) attachClock(song, tick);
}

// ------------------------------------------------------------------ mixer (ADR-0020)

function countGains(): CountGains {
  const { master, click, voice } = state().mixer;
  return { master: channelGain(master), click: channelGain(click), voice: channelGain(voice) };
}

function musicGain(): number {
  const { master, music } = state().mixer;
  return effectiveGain(master, music);
}

function synthLevels(): SynthLevels {
  return { master: channelGain(state().mixer.master), tracks: state().synthTracks };
}

/** Hands the current levels to the active source; timing and the loop are never touched. */
function applyMix() {
  if (clock instanceof CountClock) clock.setMix(countGains());
  synthPlayer?.setMix(synthLevels());
  musicPlayer?.setGain(musicGain());
  // YouTube: setVolume(master × video) once the YouTube source exists (step 6).
}

export function openMixer(open: boolean) {
  useSession.setState({ mixerOpen: open });
}

// ------------------------------------------------------------------ song library (§4)

export function openLibrary(open: boolean) {
  useSession.setState(open ? { libraryOpen: true, mixerOpen: false } : { libraryOpen: false });
}

/** Loads the chosen song (unless it is the current one) and closes the library. */
export function pickSong(slug: string) {
  openLibrary(false);
  if (slug !== state().song?.slug) void loadSong(slug);
}

/** Master, Video, Music, Click or Voice. */
export function setChannel(id: GlobalChannelId, patch: Partial<Channel>) {
  const current = state().mixer[id];
  const channel = { ...current, ...patch, volume: clampVolume(patch.volume ?? current.volume) };
  const mixer = { ...state().mixer, [id]: channel };
  useSession.setState({ mixer });
  saveSettings({ mixer });
  applyMix();
}

function setTracks(synthTracks: TrackChannel[]) {
  const song = state().song;
  useSession.setState({ synthTracks });
  if (song) saveSynthTracks(song, synthTracks);
  applyMix();
}

/** One Synth track's volume, mute or solo. */
export function setTrack(index: number, patch: Partial<TrackChannel>) {
  setTracks(state().synthTracks.map((t, i) => (i === index ? { ...t, ...patch, volume: clampVolume(patch.volume ?? t.volume) } : t)));
}

/** Quick mix: Bass only, Full band or Backing. */
export function setQuickMix(mix: QuickMix) {
  const song = state().song;
  if (song) setTracks(applyQuickMix(state().synthTracks, mix, song.track.index));
}

/** Checks once whether the recorded count samples exist (the mixer's Voice row). */
export function probeCountSamples() {
  if (state().voiceSamples === null) void countSamplesAvailable().then((voiceSamples) => useSession.setState({ voiceSamples }));
}

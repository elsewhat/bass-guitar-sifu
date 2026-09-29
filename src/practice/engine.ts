// Practice engine: owns the active PlaybackClock, applies the loop controller's transitions to it
// and mirrors the discrete results (chunk, pass, playing, tempo) into the session store. UI
// components call these functions; per-frame consumers read the clock through src/playback/frame.
import type { CatalogEntry, SongData } from '../core/model';
import type { PlaybackClock } from '../playback/clock';
import { CountClock, countSamplesAvailable, type CountGains } from '../playback/count-clock';
import { setTickSource } from '../playback/frame';
import { chunkRange, completePass, initialLoop, nextChunk, nextRepeatMode, rangeAfterPass, selectChunk, setRepeatMode, willAdvance } from '../playback/loop';
import { applyQuickMix, channelGain, clampVolume, type Channel, type GlobalChannelId, type QuickMix, type TrackChannel } from '../playback/mixer';
import { SynthClock } from '../playback/synth-clock';
import { TEMPO, useSession, type SourceId, type SourceStatus } from '../state/session';
import { loadSynthTracks, saveSettings, saveSynthTracks } from '../state/storage';
import { whenStrip } from '../strip/strip-host';
import type { SynthLevels, SynthPlayerHandle } from '../strip/synth-player';

const base = import.meta.env.BASE_URL;
let clock: PlaybackClock | null = null;
let synthPlayer: SynthPlayerHandle | null = null; // the Synth clock's player, for the mixer
let loadToken = 0;

setTickSource(() => clock?.getTick() ?? 0);

const state = () => useSession.getState();

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

function onSoundFontProgress(progress: number) {
  if (state().sourceStatus.state === 'loading') setStatus({ state: 'loading', progress });
}

/**
 * The Synth plays through the strip's alphaTab instance (ADR-0019): alphaTab and the strip load
 * lazily, the player and soundfont only when the Synth is first chosen.
 */
function createSynthClock(song: SongData): SynthClock {
  setStatus({ state: 'loading', progress: 0 });
  const player = Promise.all([import('../strip/synth-player'), whenStrip()]).then(([{ createSynthPlayer }, strip]) => {
    strip.enableSynth(onSoundFontProgress);
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

/** Creates the clock for the current source; the position is kept when it is inside the chunk. */
function attachClock(song: SongData, tick?: number) {
  clock?.dispose();
  synthPlayer = null;
  let c: PlaybackClock;
  if (state().source === 'synth') c = createSynthClock(song);
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
    useSession.setState(completePass(s, to, song.chunks, song.bars, s.tempoPct));
  });
  c.setRate(state().tempoPct / 100);
  const range = currentRange(song);
  c.setRange(range);
  c.seek(tick !== undefined && tick >= range.start && tick < range.end ? tick : range.start);
}

export async function loadCatalog() {
  const res = await fetch(`${base}data/catalog.json`);
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
    const res = await fetch(`${base}data/songs/${slug}.json`);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const song = (await res.json()) as SongData;
    if (token !== loadToken) return;
    useSession.setState({
      song,
      loadError: null,
      ...initialLoop(state().passes, state().repeatMode),
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

/** Back to the chunk start; the pass count stays. */
export function restartChunk() {
  const song = state().song;
  if (song && clock) clock.seek(currentRange(song).start);
}

export function stepTempo(direction: 1 | -1) {
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
  if (source === state().source) return;
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

function synthLevels(): SynthLevels {
  return { master: channelGain(state().mixer.master), tracks: state().synthTracks };
}

/** Hands the current levels to the active source; timing and the loop are never touched. */
function applyMix() {
  if (clock instanceof CountClock) clock.setMix(countGains());
  synthPlayer?.setMix(synthLevels());
  // YouTube: setVolume(master × video) once the YouTube source exists (step 6).
}

export function openMixer(open: boolean) {
  useSession.setState({ mixerOpen: open });
}

/** Master, Video, Click or Voice. */
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

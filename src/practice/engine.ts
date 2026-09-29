// Practice engine: owns the active PlaybackClock, applies the loop controller's transitions to it
// and mirrors the discrete results (chunk, pass, playing, tempo) into the session store. UI
// components call these functions; per-frame consumers read the clock through src/playback/frame.
import type { CatalogEntry, SongData } from '../core/model';
import type { PlaybackClock } from '../playback/clock';
import { CountClock } from '../playback/count-clock';
import { setTickSource } from '../playback/frame';
import { chunkRange, completePass, initialLoop, nextChunk, rangeAfterPass, selectChunk, willAdvance } from '../playback/loop';
import { TEMPO, useSession, type SourceId } from '../state/session';

const base = import.meta.env.BASE_URL;
let clock: PlaybackClock | null = null;
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

function attachClock(song: SongData) {
  clock?.dispose();
  const c = new CountClock(song);
  c.onRangeEnd = () => rangeAfterPass(state(), song.chunks, song.bars);
  c.onPassCompleted(({ to }) => {
    const s = state();
    useSession.setState(completePass(s, to, song.chunks, song.bars, s.tempoPct));
  });
  c.setRate(state().tempoPct / 100);
  c.setRange(currentRange(song));
  c.seek(currentRange(song).start);
  clock = c;
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
    useSession.setState({ song, loadError: null, ...initialLoop(state().passes), playing: false });
    attachClock(song);
    const url = new URL(location.href);
    url.searchParams.set('song', slug);
    history.replaceState(null, '', url);
  } catch (e) {
    if (token === loadToken) useSession.setState({ loadError: `Could not load ${slug}: ${String(e)}` });
  }
}

export function togglePlay() {
  if (!clock) return;
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

export function toggleAutoAdvance() {
  useSession.setState((s) => ({ autoAdvance: !s.autoAdvance }));
}

export function setSource(source: SourceId) {
  if (source === state().source) return;
  pause();
  useSession.setState({ source });
}

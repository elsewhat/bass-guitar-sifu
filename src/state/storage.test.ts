import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MIX } from '../playback/mixer';
import { loadProgress, loadSettings, loadSynthTracks, saveProgress, saveSettings, saveSynthTracks } from './storage';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

describe('settings storage (ADR-0010)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('works without storage', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(loadSettings()).toEqual({});
    expect(() => saveSettings({ repeatMode: 'loop' })).not.toThrow();
  });

  it('stores the repeat mode and merges with other settings', () => {
    const store = memoryStorage({ 'bass-trainer:v1:settings': '{"planOpen":false}' });
    vi.stubGlobal('localStorage', store);
    saveSettings({ repeatMode: 'once' });
    expect(JSON.parse(store.data.get('bass-trainer:v1:settings')!)).toEqual({ planOpen: false, repeatMode: 'once' });
    expect(loadSettings()).toEqual({ repeatMode: 'once' });
  });

  it('ignores unknown or corrupt values', () => {
    vi.stubGlobal('localStorage', memoryStorage({ 'bass-trainer:v1:settings': '{"repeatMode":"shuffle"}' }));
    expect(loadSettings()).toEqual({});
    vi.stubGlobal('localStorage', memoryStorage({ 'bass-trainer:v1:settings': 'not json' }));
    expect(loadSettings()).toEqual({});
  });

  it('stores the mixer, filling missing or invalid channels with defaults', () => {
    const store = memoryStorage();
    vi.stubGlobal('localStorage', store);
    saveSettings({ mixer: { ...DEFAULT_MIX, click: { volume: 40, muted: true } } });
    expect(loadSettings().mixer?.click).toEqual({ volume: 40, muted: true });
    store.setItem('bass-trainer:v1:settings', JSON.stringify({ mixer: { master: { volume: 250 }, voice: 'loud' } }));
    expect(loadSettings().mixer).toEqual({ ...DEFAULT_MIX, master: { volume: 100, muted: false } });
  });
});

describe('Synth tracks per song (ADR-0020)', () => {
  const song = { slug: 'demo', tracks: ['Guitar', 'Bass', 'Drums'], track: { index: 1 } };
  afterEach(() => vi.unstubAllGlobals());

  it('defaults to "Bass only" at 80 %', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    expect(loadSynthTracks(song)).toEqual([
      { volume: 80, muted: false, solo: false },
      { volume: 80, muted: false, solo: true },
      { volume: 80, muted: false, solo: false },
    ]);
  });

  it('round-trips per song and matches tracks by index and name', () => {
    const store = memoryStorage();
    vi.stubGlobal('localStorage', store);
    const tracks = [
      { volume: 50, muted: true, solo: false },
      { volume: 90, muted: false, solo: false },
      { volume: 70, muted: false, solo: false },
    ];
    saveSynthTracks(song, tracks);
    expect(loadSynthTracks(song)).toEqual(tracks);
    // A changed file: only the unchanged tracks keep their values.
    expect(loadSynthTracks({ ...song, tracks: ['Guitar', 'Keys', 'Drums'] })).toEqual([
      tracks[0],
      { volume: 80, muted: false, solo: false },
      tracks[2],
    ]);
  });
});

describe('progress storage (ADR-0010)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is null for a song never practised or without storage', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    expect(loadProgress('creep', 9)).toBeNull();
    vi.stubGlobal('localStorage', undefined);
    expect(loadProgress('creep', 9)).toBeNull();
    expect(() => saveProgress('creep', { chunkIndex: 1, done: {}, tempoPct: 80, lastPractised: '' })).not.toThrow();
  });

  it('round-trips next to the Synth tracks', () => {
    const store = memoryStorage({ 'bass-trainer:v1:creep': '{"synthTracks":[]}' });
    vi.stubGlobal('localStorage', store);
    const progress = { chunkIndex: 3, done: { 0: 75, 1: 80, 2: 80 }, tempoPct: 85, lastPractised: '2026-09-29T20:00:00.000Z' };
    saveProgress('creep', progress);
    expect(loadProgress('creep', 9)).toEqual(progress);
    expect(JSON.parse(store.data.get('bass-trainer:v1:creep')!).synthTracks).toEqual([]);
  });

  it('drops chunks the song no longer has and invalid values', () => {
    vi.stubGlobal(
      'localStorage',
      memoryStorage({ 'bass-trainer:v1:creep': '{"progress":{"chunkIndex":12,"done":{"1":80,"4":"x","12":90},"tempoPct":"fast"}}' }),
    );
    expect(loadProgress('creep', 9)).toEqual({ chunkIndex: 0, done: { 1: 80 }, tempoPct: 100, lastPractised: '' });
  });
});

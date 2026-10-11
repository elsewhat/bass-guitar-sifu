// Songsterr's public JSON endpoints, as its own player uses them (ADR-0028). The .gp files in this
// repository are Songsterr tabs, and Songsterr plays each tab against a YouTube video with one
// "point" per bar: the video time at which the bar starts. Node only; used by fetch-video.ts.

const BASE = 'https://www.songsterr.com/api';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const PAUSE_MS = 1200; // between requests; the API answers 429 when asked faster

export interface SongsterrSong {
  songId: number;
  artist: string;
  title: string;
  tracks: { name: string }[];
}

export interface SongsterrRevision {
  revisionId: number;
  createdAt: string; // ISO date and time
  isDeleted?: boolean;
  description?: string;
}

/** A video of one tab revision. `feature` is null for the default video: the original recording. */
export interface SongsterrVideo {
  videoId: string;
  feature: null | 'alternative' | 'backing' | 'solo' | 'playthrough' | string;
  status: string;
  /** Video time in seconds of every bar start, in played order. */
  points: number[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let lastRequest = 0;

async function get<T>(path: string): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    await sleep(Math.max(0, lastRequest + PAUSE_MS - Date.now()) + attempt * 4000);
    lastRequest = Date.now();
    const res = await fetch(`${BASE}/${path}`, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' } });
    if (res.status === 429) continue;
    if (!res.ok) throw new Error(`Songsterr ${res.status} for ${path}`);
    return (await res.json()) as T;
  }
  throw new Error(`Songsterr keeps answering 429 for ${path}; try again in a minute`);
}

export function searchSongs(pattern: string): Promise<SongsterrSong[]> {
  return get(`songs?pattern=${encodeURIComponent(pattern)}&size=10`);
}

export function songMeta(songId: number): Promise<SongsterrSong> {
  return get(`meta/${songId}`);
}

/** Every revision of a tab, newest first. */
export function revisions(songId: number): Promise<SongsterrRevision[]> {
  return get(`meta/${songId}/revisions`);
}

export async function videos(songId: number, revisionId: number): Promise<SongsterrVideo[]> {
  const list = await get<SongsterrVideo[]>(`video-points/${songId}/${revisionId}/list`);
  return list.filter((v) => Array.isArray(v.points) && v.points.length > 0);
}

const words = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * The tab a .gp file most likely came from: same artist, most track names in common with the
 * file, then the same title, then Songsterr's own order. Null when no tab by the artist is found.
 */
export function pickSong(found: SongsterrSong[], artist: string, title: string, trackNames: string[]): { song: SongsterrSong; shared: number } | null {
  const ranked = found
    .filter((s) => words(s.artist) === words(artist))
    .map((song, order) => ({
      song,
      order,
      shared: song.tracks.filter((t) => trackNames.includes(t.name)).length,
      sameTitle: words(song.title) === words(title) ? 1 : 0,
    }))
    .sort((a, b) => b.shared - a.shared || b.sameTitle - a.sameTitle || a.order - b.order);
  return ranked[0] ? { song: ranked[0].song, shared: ranked[0].shared } : null;
}

/** The revision that was current on `date` (YYYY-MM-DD, the date in the .gp file name), else the newest. */
export function pickRevision(list: SongsterrRevision[], date: string | undefined): SongsterrRevision | null {
  const live = list.filter((r) => !r.isDeleted);
  if (!date) return live[0] ?? null;
  const end = Date.parse(`${date}T23:59:59Z`);
  return live.find((r) => Date.parse(r.createdAt) <= end) ?? live[live.length - 1] ?? null;
}

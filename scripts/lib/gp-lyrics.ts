// Lyrics from the Guitar Pro file (ADR-0024). Node only.
// alphaTab gives each beat its syllable but drops the track's lyrics text, which holds the line
// breaks and the [Section] comments, so that text is read from Content/score.gpif in the .gp zip.
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import type { Syllable } from '../../src/core/lyrics';
import { playOrderOf, writtenScoreOf, type Score, type Track } from './gp-import';

/** One file from a zip archive (stored or deflated), or null when it is not there. */
export function unzipEntry(zip: Buffer, name: string): Buffer | null {
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) return null;
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(p + 10);
    const size = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const offset = zip.readUInt32LE(p + 42);
    if (zip.toString('utf8', p + 46, p + 46 + nameLen) === name) {
      const start = offset + 30 + zip.readUInt16LE(offset + 26) + zip.readUInt16LE(offset + 28);
      const data = zip.subarray(start, start + size);
      return method === 0 ? data : inflateRawSync(data);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const unwrap = (text: string) => {
  const t = text.trim();
  const cdata = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(t);
  return (cdata ? cdata[1]! : t).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
};

/**
 * The first lyrics line of every track, by track index, from a Guitar Pro 7+ file; empty for older
 * formats. Guitar Pro keeps up to five lines per track (for later verses); only the first is used.
 */
export function gpLyricsTexts(file: string): string[] {
  let gpif: string;
  try {
    gpif = unzipEntry(readFileSync(file), 'Content/score.gpif')?.toString('utf8') ?? '';
  } catch {
    return [];
  }
  const texts = new Map<string, string>();
  for (const m of gpif.matchAll(/<Track id="(\d+)"[^>]*>([\s\S]*?)<\/Track>/g)) {
    const text = /<Lyrics[^>]*>\s*<Line>\s*<Text>([\s\S]*?)<\/Text>/.exec(m[2]!)?.[1];
    texts.set(m[1]!, text ? unwrap(text) : '');
  }
  // alphaTab numbers the tracks in the order of the master track's id list.
  const ids = /<MasterTrack>[\s\S]*?<Tracks>([^<]*)<\/Tracks>/.exec(gpif)?.[1]?.trim().split(/\s+/) ?? [...texts.keys()];
  return ids.map((id) => texts.get(id) ?? '');
}

const lyricOf = (beat: Score['tracks'][number]['staves'][number]['bars'][number]['voices'][number]['beats'][number]) => {
  const text = beat.lyrics?.[0]?.trim();
  return text ? text : null;
};

/** Syllables sung on a track's first voice, in written order. */
function countSyllables(track: Track): number {
  let n = 0;
  for (const bar of track.staves[0]!.bars) for (const beat of bar.voices[0]?.beats ?? []) if (lyricOf(beat)) n++;
  return n;
}

/** The vocal track: the sidecar's choice (name or index), else the track with the most sung syllables. */
export function pickLyricsTrack(score: Score, hint?: string | number): Track | null {
  const written = writtenScoreOf(score);
  if (hint !== undefined) {
    const t = typeof hint === 'number' ? written.tracks[hint] : written.tracks.find((tr) => tr.name === hint);
    if (!t) throw new Error(`lyrics.track ${JSON.stringify(hint)} not found`);
    return t;
  }
  let best: Track | null = null;
  let most = 0;
  for (const t of written.tracks) {
    const n = countSyllables(t);
    if (n > most) [best, most] = [t, n];
  }
  return best;
}

/**
 * The track's syllables in played order, with absolute ticks of the (unrolled) score. A syllable
 * lasts over its beat and every following note that has no syllable of its own (ties and slurs);
 * a rest ends it. `index` counts syllables in written order, matching `lyricChunks` of the text.
 */
export function lyricSyllables(score: Score, trackIndex: number): Syllable[] {
  const written = writtenScoreOf(score);
  const order = playOrderOf(score) ?? written.masterBars.map((_, i) => i);
  let index = 0;
  const perBar = written.tracks[trackIndex]!.staves[0]!.bars.map((bar) =>
    (bar.voices[0]?.beats ?? [])
      .filter((b) => !b.isEmpty)
      .map((b) => {
        const text = lyricOf(b);
        return { text, index: text ? index++ : -1, tick: b.playbackStart, dur: b.playbackDuration, rest: b.isRest };
      }),
  );
  const out: Syllable[] = [];
  order.forEach((w, p) => {
    const barStart = score.masterBars[p]!.start;
    for (const b of perBar[w] ?? []) {
      const start = barStart + b.tick;
      const last = out[out.length - 1];
      if (b.text) out.push({ text: b.text, start, end: start + b.dur, index: b.index });
      else if (!b.rest && last && last.end === start) last.end = start + b.dur;
    }
  });
  return out;
}

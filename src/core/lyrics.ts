// Lyrics (ADR-0024): syllables from the Guitar Pro vocal track → words and lines, plain lyrics.text
// → lines, and the playhead's place in the lyrics. Pure; shared by the build scripts and the app.
import type { LyricLine, LyricWord } from './model';
import { PPQ } from './model';

/** One sung syllable in played order, as the importer reads it from the vocal track. */
export interface Syllable {
  text: string; // the beat's lyric in Guitar Pro form: "Ki-" continues into the next syllable, "-" holds the last one
  start: number; // absolute tick
  end: number; // absolute tick, tied and slurred notes included
  index: number; // position among the track's lyric beats in written order (repeats play an index again)
}

export interface TextChunk {
  text: string;
  line: number; // 0-based line of the lyrics text
}

/**
 * The track's lyrics text cut into beat syllables, the way Guitar Pro hands them out: spaces and
 * line breaks end a syllable, a dash ends it and stays on it, every further dash is a held syllable
 * of its own ("oh--" → "oh-", "-"), and `[…]` is a comment. Same rules as alphaTab's `Lyrics`, plus
 * the line each syllable is on; empty syllables are dropped.
 */
export function lyricChunks(text: string): TextChunk[] {
  const out: TextChunk[] = [];
  const str = text.replace(/\r\n?/g, '\n');
  const add = (t: string, line: number) => t !== '' && out.push({ text: t, line });
  let state: 'between' | 'start' | 'word' | 'comment' | 'dash' = 'start';
  let skipSpace = false;
  let start = 0;
  let startLine = 0;
  let line = 0;
  let p = 0;
  while (p < str.length) {
    const c = str[p]!;
    if (state === 'between') {
      if (c === ' ' ? !skipSpace : c !== '\n' && c !== '\t') {
        skipSpace = false;
        state = 'start';
        continue;
      }
    } else if (state === 'start') {
      if (c === '[') state = 'comment';
      else {
        start = p;
        startLine = line;
        state = 'word';
        continue;
      }
    } else if (state === 'comment') {
      if (c === ']') state = 'start';
    } else if (state === 'word') {
      if (c === '-') state = 'dash';
      else if (c === ' ' || c === '\n') {
        add(str.slice(start, p), startLine);
        state = 'between';
      }
    } else if (c !== '-') {
      // After one or more dashes: the syllable keeps the first, each extra dash is a held syllable.
      const dashes = /-+$/.exec(str.slice(start, p))![0].length;
      add(str.slice(start, p - dashes + 1), startLine);
      for (let k = 1; k < dashes; k++) add('-', startLine);
      skipSpace = true;
      state = 'between';
      continue;
    }
    if (c === '\n') line++;
    p++;
  }
  if (state === 'word' || state === 'dash') add(str.slice(start, p), startLine);
  return out;
}

interface LineMeta {
  section: string | null;
  gap: boolean;
}

/**
 * Section comments and stanza breaks of a lyrics text, per line that has words: a line that is only
 * `[Verse 1]` names the next line's section, a blank line between two lines marks a stanza break.
 */
function lineMeta(text: string): Map<number, LineMeta> {
  const meta = new Map<number, LineMeta>();
  let section: string | null = null;
  let blank = false;
  let seen = false;
  text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .forEach((raw, i) => {
      const line = raw.trim();
      const comment = /^\[([^\]]*)\]$/.exec(line);
      if (comment) section = comment[1]!.trim() || section;
      else if (line.replace(/\[[^\]]*\]/g, '').trim() === '') blank = true;
      else {
        meta.set(i, { section, gap: seen && (blank || section !== null) });
        section = null;
        blank = false;
        seen = true;
      }
    });
  return meta;
}

/** Plain lyrics (`lyrics.text` in song.yaml): one line per text line, `[Chorus]` lines and blank lines as in `lineMeta`. */
export function parseLyricsText(text: string): LyricLine[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  return [...lineMeta(text)].map(([i, m]) => ({ text: lines[i]!.trim().replace(/\s+/g, ' '), ...m, words: [] }));
}

/** Rules for cutting lines when the lyrics text gives none, or gives lines longer than `maxWords`. */
export const LINE_SPLIT = {
  /** Always a new line after a rest this long. */
  longRest: 4 * PPQ,
  /** A new line after a rest this long, or after a sentence end, once the line has `minWords` words. */
  rest: PPQ,
  minWords: 4,
  /** A new line before a capitalised word (not "I", "I'm", …) once the line has this many words. */
  capitalWords: 3,
  /** A new line after a comma once the line has this many words. */
  commaWords: 6,
  /** A new line once a line has this many words. */
  maxWords: 12,
} as const;

/**
 * Words and lines of synced lyrics. Syllables join into words ("Ki-" + "lling"), a lone "-" holds
 * the previous syllable. The lines come from the lyrics text when its syllables match the beat
 * syllables one to one; otherwise, or when the text has no line breaks, they are cut at rests,
 * punctuation and capitals (`LINE_SPLIT`). A long rest ends a line in either case, and a repeat (the index
 * going back) starts a new line.
 */
export function syncedLyrics(syllables: Syllable[], text: string | null): { lines: LyricLine[]; fromText: boolean } {
  const chunks = text ? lyricChunks(text) : [];
  const fromText =
    chunks.length > 1 &&
    chunks[chunks.length - 1]!.line > chunks[0]!.line &&
    syllables.every((s) => chunks[s.index]?.text === s.text) &&
    new Set(syllables.map((s) => s.index)).size === chunks.length;
  const meta = fromText ? lineMeta(text!) : new Map<number, LineMeta>();
  const textWords = new Map<number, number>(); // words per text line
  chunks.forEach((c, i) => {
    const joined = i > 0 && chunks[i - 1]!.line === c.line && chunks[i - 1]!.text.endsWith('-');
    if (c.text !== '-' && !joined) textWords.set(c.line, (textWords.get(c.line) ?? 0) + 1);
  });

  const lines: LyricLine[] = [];
  let words: LyricWord[] = [];
  let lineMetaOf: LineMeta = { section: null, gap: false };
  let lineId = -1;
  let prevIndex = -1;
  let joinNext = false;

  const endLine = () => {
    if (words.length) lines.push({ text: words.map((w) => w.text).join(' '), ...lineMetaOf, words });
    words = [];
    joinNext = false;
  };

  for (const s of syllables) {
    const last = words[words.length - 1];
    if (s.text === '-') {
      if (last) last.end = Math.max(last.end, s.end);
      prevIndex = s.index;
      continue;
    }
    const rest = last ? s.start - last.end : 0;
    const id = fromText ? chunks[s.index]!.line : -1;
    const clean = s.text.replace(/\+/g, ' ').replace(/_+$/, '');
    // Text lines longer than `maxWords` are cut by the same rules as lyrics without line breaks.
    const byRules = !fromText || (textWords.get(id) ?? 0) > LINE_SPLIT.maxWords;
    const newLine =
      !last ||
      s.index < prevIndex ||
      (fromText && id !== lineId) ||
      (!joinNext && (rest >= LINE_SPLIT.longRest || (byRules && softBreak(words, rest, clean))));
    if (newLine) {
      endLine();
      // A text line cut by a long rest keeps its section and stanza break on the first part only.
      lineMetaOf = fromText && id !== lineId ? (meta.get(id) ?? { section: null, gap: false }) : { section: null, gap: false };
      lineId = id;
    }
    const continues = clean.endsWith('-');
    const parts = clean.replace(/-+$/, '').split(/\s+/).filter(Boolean);
    const tail = words[words.length - 1];
    parts.forEach((part, k) => {
      if (k === 0 && joinNext && tail) {
        tail.text += part;
        tail.end = Math.max(tail.end, s.end);
      } else words.push({ text: part, start: s.start, end: s.end });
    });
    joinNext = continues;
    prevIndex = s.index;
  }
  endLine();
  return { lines, fromText };
}

function softBreak(words: LyricWord[], rest: number, next: string): boolean {
  const n = words.length;
  const prev = words[n - 1]?.text ?? '';
  const capital = /^["'(]?\p{Lu}/u.test(next) && !/^I(?:'\w+)?\b/.test(next);
  return (
    n >= LINE_SPLIT.maxWords ||
    (n >= LINE_SPLIT.capitalWords && capital) ||
    (n >= LINE_SPLIT.minWords && (rest >= LINE_SPLIT.rest || /[.!?;:]["')]?$/.test(prev))) ||
    (n >= LINE_SPLIT.commaWords && /,["')]?$/.test(prev))
  );
}

/** How long before its first word a line becomes the current one, so it can be read ahead. */
export const LINE_LEAD = 2 * PPQ;

/**
 * Tick at which each line becomes the current line: when the previous line's last word has ended,
 * but at most `LINE_LEAD` before its own first word. The first line is current from the start.
 */
export function lineSwitchTicks(lines: LyricLine[]): number[] {
  return lines.map((line, i) => {
    if (i === 0) return -Infinity;
    const start = line.words[0]?.start ?? 0;
    const prevEnd = lines[i - 1]!.words.at(-1)?.end ?? start;
    return Math.min(start, Math.max(prevEnd, start - LINE_LEAD));
  });
}

export interface LyricsCursor {
  line: number; // current line
  sung: number; // words of the current line that have started
  active: boolean; // the last started word is still being sung
}

/** The current line and word at a tick (synced lyrics). `switches` is `lineSwitchTicks(lines)`. */
export function lyricsCursor(lines: LyricLine[], switches: number[], tick: number): LyricsCursor {
  let lo = 0;
  let hi = switches.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (switches[mid]! <= tick) lo = mid;
    else hi = mid - 1;
  }
  const words = lines[lo]?.words ?? [];
  let sung = 0;
  while (sung < words.length && words[sung]!.start <= tick) sung++;
  return { line: lo, sung, active: sung > 0 && tick < words[sung - 1]!.end };
}

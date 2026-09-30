// npm run inspect-song -- <file.gp | slug> [--track <name|index>] [--audio <file.mp3>]
// Analysis report for the preprocess-song skill (ADR-0015): tracks, tuning, tempo, sections,
// tacet ranges, bar patterns, a draft chunk split and the fingering solver's decisions. With
// --audio, also the lead-in offset of an MP3 rendered from the score (ADR-0022).
import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { barSignatures, draftChunks, findTacet, playableRanges } from '../src/core/chunks';
import { chunkPositions, solveFingering } from '../src/core/fingering';
import type { BeatEvent } from '../src/core/model';
import { scoreDurationSeconds, tempoLookup } from '../src/core/timing';
import { pitchName, stringNames, tuningName } from '../src/core/tuning';
import { orderSegments } from '../src/core/unroll-score';
import { analyseMp3, measureOffset, REFINE_SECONDS, scoreOnsetTicks } from './lib/audio-align';
import { syncedLyrics } from '../src/core/lyrics';
import { describeTracks, importBassTrack, loadScore, pickBassTrack, playOrderOf } from './lib/gp-import';
import { gpLyricsTexts, lyricSyllables, pickLyricsTrack } from './lib/gp-lyrics';
import { loadSidecar } from './lib/sidecar';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { track: { type: 'string' }, audio: { type: 'string' } } });
const target = positionals[0];
if (!target) {
  console.error('Usage: npm run inspect-song -- <file.gp | slug> [--track <name|index>] [--audio <file.mp3>]');
  process.exit(1);
}

const songDir = join('songs', target);
const isSlug = !target.endsWith('.gp') && existsSync(join(songDir, 'score.gp'));
const file = isSlug ? join(songDir, 'score.gp') : target;
const sidecar = isSlug && existsSync(join(songDir, 'song.yaml')) ? loadSidecar(join(songDir, 'song.yaml')) : null;
const trackHint = values.track !== undefined ? (/^\d+$/.test(values.track) ? Number(values.track) : values.track) : sidecar?.bassTrack;

const score = loadScore(file);
const out: string[] = [];
const line = (s = '') => out.push(s);
const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;

line(`# ${basename(file)}`);
line(`Title: ${score.title || '(none)'}    Artist: ${score.artist || '(none)'}    Album: ${score.album || '(none)'}`);
line();
line('## Tracks');
for (const t of describeTracks(score)) {
  line(`  [${t.index}] ${JSON.stringify(t.name)}  ${t.strings} strings  ${stringNames(t.tuning).join(' ')}  ${t.notes} notes${t.isBassCandidate ? '  ← bass candidate' : ''}`);
}

const track = pickBassTrack(score, trackHint);
const { song, warnings } = importBassTrack(score, track);
const { bars, events, tuning, tempoMap } = song;
line(`Selected: [${track.index}] ${JSON.stringify(track.name)}${trackHint === undefined ? ' (automatic)' : ''}`);
for (const w of warnings) line(`  ⚠ ${w}`);
line();

line('## Score');
line(`Tuning: ${tuningName(tuning)} (${stringNames(tuning).join(' ')}; MIDI ${tuning.join(', ')})`);
const tempos = tempoMap.map((t) => t.bpm);
line(`Tempo: ${tempos[0]} BPM${tempoMap.length > 1 ? `, ${tempoMap.length - 1} changes, range ${Math.min(...tempos)}–${Math.max(...tempos)}` : ''}`);
if (tempoMap.length > 1) line(`  map: ${tempoMap.map((t) => `${t.bar}${t.tick ? `+${t.tick}` : ''}:${t.bpm}`).join(' ')}`);
if (tempos[0]! < 70) line('  ⚠ Slow tempo: the file may be notated in half time. Compare with the recording.');
if (tempos[0]! > 200) line('  ⚠ Fast tempo: the file may be notated in double time. Compare with the recording.');
const sigs = [...new Set(bars.map((b) => b.time.join('/')))];
line(`Time signatures: ${sigs.join(', ')}${sigs.length > 1 ? `  (changes at bars ${bars.filter((b, i) => i > 0 && b.time.join('/') !== bars[i - 1]!.time.join('/')).map((b) => `${b.n}:${b.time.join('/')}`).join(' ')})` : ''}`);
line(`Bars: ${bars.length}    Duration: ${mmss(scoreDurationSeconds(tempoMap, bars))}`);
const playOrder = playOrderOf(score);
if (playOrder) {
  // ADR-0023: every bar number in this report and in song.yaml is a played bar.
  line(`Repeats unrolled: ${playOrder.length} played bars from ${new Set(playOrder).size} written. All bar numbers below are played bars.`);
  const range = ([a, b]: [number, number]) => (a === b ? `${a}` : `${a}–${b}`);
  for (const s of orderSegments(playOrder)) line(`  played ${range(s.played).padEnd(9)} = written ${range(s.written)}${s.times > 1 ? ` ×${s.times}` : ''}`);
}
const sections = bars.filter((b) => b.section);
line(`Sections: ${sections.length ? sections.map((b) => `${b.n} ${b.section}`).join(' · ') : 'none'}`);
line();

line('## Bass part');
const plucked = events.flatMap((e) => e.notes.filter((n) => !n.tieFromPrev));
const tacet = findTacet(bars, events);
line(`Plucks: ${plucked.length} (${plucked.filter((n) => n.dead).length} dead)    Double stops: ${events.filter((e) => e.notes.filter((n) => !n.tieFromPrev).length > 1).length}    Max fret: ${Math.max(0, ...plucked.map((n) => n.fret))}`);
const durations = new Map<number, number>();
for (const e of events) if (e.kind === 'note') durations.set(e.dur, (durations.get(e.dur) ?? 0) + 1);
line(`Note lengths (ticks at 960/quarter → count): ${[...durations.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([d, c]) => `${d}→${c}`).join(' ')}`);
line(`Tacet ranges: ${tacet.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(', ') || 'none'}`);
line(`Playable ranges: ${playableRanges(bars.length, tacet).map(([a, b]) => `${a}–${b}`).join(', ')}`);
line();

// ADR-0024: counts only; the lyrics themselves are not printed.
line('## Lyrics');
const vocal = pickLyricsTrack(score, sidecar?.lyrics?.track);
const syllables = vocal ? lyricSyllables(score, vocal.index) : [];
if (vocal && syllables.length) {
  const { lines, fromText } = syncedLyrics(syllables, gpLyricsTexts(file)[vocal.index] || null);
  const firstBar = bars.findLast((b) => b.startTick <= syllables[0]!.start)!.n;
  line(`Synced from [${vocal.index}] ${JSON.stringify(vocal.name)}: ${syllables.length} syllables, ${lines.length} lines from bar ${firstBar}`);
  line(`  Lines: ${fromText ? 'from the lyrics text in the file' : 'cut at rests, sentence ends and capitals (the text has no line breaks or does not match)'}`);
} else line(`No vocal track with lyrics. lyrics.text in song.yaml: ${sidecar?.lyrics?.text?.trim() ? 'present (unsynced)' : 'none'}`);
line();

line('## Bar patterns (same letter = identical bass content by pitch and rhythm, "." = tacet)');
const sig = barSignatures(bars, events);
for (let start = 1; start <= bars.length; start += 16) {
  const row = [];
  for (let n = start; n < start + 16 && n <= bars.length; n += 4) {
    row.push(
      [n, n + 1, n + 2, n + 3]
        .filter((b) => b <= bars.length)
        .map((b) => (sig.get(b) ?? '.').padEnd(2))
        .join(''),
    );
  }
  const section = bars.slice(start - 1, start + 15).find((b) => b.section);
  line(`  ${String(start).padStart(4)}  ${row.join(' | ')}${section ? `   ◂ ${section.n}: ${section.section}` : ''}`);
}
line();

line('## Draft chunks (guidance; the final list goes into song.yaml)');
const fingered = solveFingering(events, {
  tuning,
  maxFret: Math.min(24, Math.max(0, ...plucked.map((n) => n.fret)) + 2),
  overrides: sidecar?.fingeringOverrides ?? [],
});
for (const c of draftChunks(bars, events)) {
  const pos = chunkPositions(fingered, c.bars);
  line(`  ${`${c.bars[0]}–${c.bars[1]}`.padEnd(9)} ${c.name.padEnd(22)} ${c.pattern.padEnd(18)} pos ${pos.position ?? '-'}  shifts ${pos.shifts}`);
}
line();

if (sidecar) {
  line('## Chunks in song.yaml');
  for (const c of sidecar.chunks) {
    const pos = chunkPositions(fingered, c.bars);
    line(`  ${`${c.bars[0]}–${c.bars[1]}`.padEnd(9)} ${c.name.padEnd(22)} pos ${pos.position ?? '-'}  shifts ${pos.shifts}`);
  }
  line();
}

line('## Fingering');
const S = stringNames(tuning);
const retabs = fingered.flatMap((e) => e.notes.filter((n) => n.retabFrom && !n.tieFromPrev).map((n) => ({ e, n })));
line(`Re-tabs: ${retabs.length}`);
for (const { e, n } of dedupeByBar(retabs)) {
  line(`  bar ${e.bar} tick ${e.tick}: ${pitchName(n.pitch)} ${S[n.retabFrom!.string]}${n.retabFrom!.fret} → ${S[n.string]}${n.fret} (finger ${n.finger}, position ${n.position ?? 'open'})`);
}
const shifts = bigShifts(fingered);
line(`Position shifts of 3+ frets while fretting: ${shifts.length}`);
for (const s of shifts.slice(0, 40)) line(`  bar ${s.bar} tick ${s.tick}: position ${s.from} → ${s.to}`);
if (shifts.length > 40) line(`  … ${shifts.length - 40} more`);

if (values.audio) {
  line();
  line(`## Audio (${values.audio})`);
  const audio = await analyseMp3(values.audio);
  const tempo = tempoLookup(tempoMap, bars);
  const onsets = scoreOnsetTicks(score).map((t) => tempo.secondsAt(t));
  const scoreSec = scoreDurationSeconds(tempoMap, bars);
  const ms = (s: number) => Math.round(s * 1000);
  line(`Duration: audio ${mmss(audio.durationSec)}, score ${mmss(scoreSec)} (${(audio.durationSec - scoreSec).toFixed(1)} s longer)`);
  if (audio.durationSec < scoreSec - 1) line('  ⚠ The audio is shorter than the score: it may come from another version of the transcription.');
  const { estimateSec, head, tail } = measureOffset(audio, onsets);
  const weak = Math.min(head.confidence, tail.confidence) < 1.5;
  line(`First sound minus first score onset: ${ms(estimateSec)} ms`);
  line(`Best match within ±${ms(REFINE_SECONDS)} ms, first minute of notes: ${ms(head.lagSec)} ms (confidence ${head.confidence.toFixed(2)})`);
  line(`Best match within ±${ms(REFINE_SECONDS)} ms, last minute of notes:  ${ms(tail.lagSec)} ms (confidence ${tail.confidence.toFixed(2)})`);
  const drift = ms(tail.lagSec - head.lagSec);
  line(`Drift: ${weak ? 'unknown (weak match)' : `${drift} ms`}`);
  if (weak) line('  ⚠ Weak onset match (confidence < 1.5): the first-sound estimate is suggested; check it by ear in the app.');
  else if (Math.abs(drift) > 30) line('  ⚠ The audio drifts from the tempo map; check that it was rendered from this score.');
  line(`Suggested: media.music.offsetMs: ${Math.max(0, ms(weak ? estimateSec : head.lagSec))}`);
}

console.log(out.join('\n'));

function dedupeByBar<T extends { e: BeatEvent }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter(({ e, ...rest }) => {
    const key = `${e.bar}:${JSON.stringify(rest)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function bigShifts(evts: BeatEvent[]) {
  const result: { bar: number; tick: number; from: number; to: number }[] = [];
  let last: number | null = null;
  let free = false;
  for (const e of evts) {
    if (e.kind === 'rest') {
      free = true;
      continue;
    }
    const n = e.notes.find((x) => !x.tieFromPrev && x.position !== null);
    if (!n) {
      if (e.notes.some((x) => x.finger === 0)) free = true;
      continue;
    }
    if (last !== null && !free && Math.abs(n.position! - last) >= 3) result.push({ bar: e.bar, tick: e.tick, from: last, to: n.position! });
    last = n.position;
    free = false;
  }
  return result;
}

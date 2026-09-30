import { useRef } from 'react';
import { lastPluckIndex, nextDifferentNote, pluckAt, type Pluck, type PluckNote } from '../core/plucks';
import { stringNames } from '../core/tuning';
import { chunkRange } from '../playback/loop';
import { useFrame } from '../playback/frame';
import { advanceRange } from '../practice/engine';
import { songModel } from '../practice/song-model';
import { useSession } from '../state/session';
import { FRETBOARD_H, FRETBOARD_W, fretboardHtml } from './fretboard';

// Fretboard and the Now/Next squares (system description §3.5, §5.2). Everything here follows
// the playhead and is updated from the frame loop, straight into the DOM.

const FADE_TO = 0.28; // "Now" opacity at the end of the fade
const FADE_SPAN = 0.9; // fade over 90 % of the note's duration

const easeOut = (p: number) => 1 - (1 - p) * (1 - p);
const fretText = (p: { dead: boolean; fret: number }) => (p.dead ? 'x' : String(p.fret));
const isChord = (p: Pluck | null | undefined) => (p?.notes.length ?? 0) > 1;
const label = (name: string, p: Pluck | null | undefined) => (p?.chord ? `${name} · ${p.chord}` : name);
const fretted = (p: Pluck | null | undefined) => (p?.notes ?? []).filter((n) => !n.dead);

// A chord is shown as stacked tab rows, highest string on top: one band per note in its string's
// colour (system description §3.5). The font shrinks with the number of notes.
const bandFont = (count: number) => (count === 2 ? 88 : count === 3 ? 64 : 48);
const band = (style: string, content = '') => `<div style="flex:1;min-height:0;display:flex;align-items:center;justify-content:center;${style}">${content}</div>`;
const bandFills = (notes: PluckNote[]) => notes.map((n) => band(`background:var(--string-${n.string + 1})`)).join('');
const bandFrets = (notes: PluckNote[]) =>
  notes.map((n) => band(`font-size:${bandFont(notes.length)}px;color:var(--string-${n.string + 1}-text)`, fretText(n))).join('');

export function FingeringColumn() {
  const planOpen = useSession((s) => s.planOpen);
  const scale = planOpen ? 0.75 : 0.9;
  const board = useRef<HTMLDivElement>(null);
  const nowBg = useRef<HTMLDivElement>(null);
  const nowLabel = useRef<HTMLDivElement>(null);
  const nowFret = useRef<HTMLDivElement>(null);
  const nowNotes = useRef<HTMLDivElement>(null);
  const nextBox = useRef<HTMLDivElement>(null);
  const nextBands = useRef<HTMLDivElement>(null);
  const nextNotes = useRef<HTMLDivElement>(null);
  const nextLabel = useRef<HTMLDivElement>(null);
  const nextFret = useRef<HTMLDivElement>(null);
  const nextWhen = useRef<HTMLDivElement>(null);
  const shown = useRef({ board: '', next: '', now: -2 });

  useFrame((tick) => {
    const { song, chunkIndex } = useSession.getState();
    if (!song || !board.current) return;
    const { plucks } = songModel(song);
    const cur = pluckAt(plucks, tick);
    const next = nextDifferentNote(plucks, tick, chunkRange(song.chunks[chunkIndex]!, song.bars), advanceRange());

    if ((cur?.index ?? -1) !== shown.current.now) {
      shown.current.now = cur?.index ?? -1;
      const chord = isChord(cur);
      nowBg.current!.style.background = cur && !chord ? `var(--string-${cur.string + 1})` : '';
      nowBg.current!.innerHTML = chord ? bandFills(cur!.notes) : '';
      nowNotes.current!.innerHTML = chord ? bandFrets(cur!.notes) : '';
      nowFret.current!.textContent = cur && !chord ? fretText(cur) : '';
      nowLabel.current!.textContent = label('Now', cur);
    }

    // Now: full colour on the pluck, fading to 28 % over 0.9 × the note's duration, while the
    // numbers turn white. Computed in ticks, so it follows the tempo and freezes on pause.
    if (cur) {
      const fade = easeOut(Math.min(1, Math.max(0, (tick - cur.start) / (FADE_SPAN * cur.dur))));
      const fg = (s: number) => `color-mix(in srgb, var(--string-${s + 1}-text), #ffffff ${Math.round(fade * 100)}%)`;
      nowBg.current!.style.opacity = String(1 - (1 - FADE_TO) * fade);
      nowLabel.current!.style.color = fg(cur.notes[0]!.string); // the label sits on the top band
      nowFret.current!.style.color = fg(cur.string);
      cur.notes.forEach((n, i) => {
        const row = nowNotes.current!.children[i] as HTMLElement | undefined;
        if (row) row.style.color = fg(n.string);
      });
    } else {
      nowBg.current!.style.opacity = '0';
      nowLabel.current!.style.color = '';
    }

    // Next: the next different note or chord at full colour, with "in N", "loop" or "next chunk".
    const nextKey = next ? `${next.pluck.index}:${next.when}` : '';
    if (nextKey !== shown.current.next) {
      shown.current.next = nextKey;
      const p = next?.pluck;
      const chord = isChord(p);
      const s = p?.notes[0]!.string ?? 0; // the labels sit on the top band
      nextBox.current!.style.background = p && !chord ? `var(--string-${s + 1})` : '';
      nextBox.current!.style.color = p ? `var(--string-${s + 1}-text)` : '';
      nextBands.current!.innerHTML = chord ? bandFills(p!.notes) : '';
      nextNotes.current!.innerHTML = chord ? bandFrets(p!.notes) : '';
      nextFret.current!.textContent = p && !chord ? fretText(p) : '';
      nextLabel.current!.textContent = label('Next', p);
      nextWhen.current!.textContent = next?.when ?? '';
    }

    // Fretboard: hand position, active fingers and the "Next" rings.
    const hand = cur ?? plucks[lastPluckIndex(plucks, tick)] ?? next?.pluck ?? null;
    const boardKey = `${song.slug}:${cur?.index ?? 'rest'}:${hand?.index}:${next?.pluck.index}`;
    if (boardKey !== shown.current.board) {
      shown.current.board = boardKey;
      board.current.innerHTML = fretboardHtml({
        frets: Math.max(9, song.stats.maxFret),
        letters: stringNames(song.tuning),
        current: fretted(cur),
        position: hand?.position ?? song.chunks[chunkIndex]?.position ?? 1,
        next: fretted(next?.pluck),
      });
    }
  });

  return (
    <section aria-label="Visual metronome and fingering" className="row-span-2 flex min-w-0 flex-col gap-3">
      <div aria-label="Fretboard" className="bg-surface rounded-comfortable flex grow items-center justify-center overflow-hidden">
        <div style={{ width: FRETBOARD_W * scale, height: FRETBOARD_H * scale }}>
          <div
            ref={board}
            className="relative"
            style={{ width: FRETBOARD_W, height: FRETBOARD_H, transform: `scale(${scale})`, transformOrigin: '0 0' }}
          />
        </div>
      </div>
      <div className="grid h-[230px] shrink-0 grid-cols-2 gap-3">
        <div aria-label="Now" className="bg-card rounded-comfortable relative overflow-hidden">
          <div ref={nowBg} className="absolute inset-0 flex flex-col opacity-0" />
          <div ref={nowNotes} data-testid="now-notes" className="absolute inset-0 flex flex-col leading-none font-extrabold" />
          <div ref={nowLabel} className="text-subdued absolute top-2.5 left-3.5 text-sm font-bold">
            Now
          </div>
          <div ref={nowFret} data-testid="now-fret" className="absolute inset-0 flex items-center justify-center text-[128px] leading-none font-extrabold" />
        </div>
        <div ref={nextBox} aria-label="Next" className="bg-card rounded-comfortable text-subdued relative overflow-hidden">
          <div ref={nextBands} className="absolute inset-0 flex flex-col" />
          <div ref={nextNotes} className="absolute inset-0 flex flex-col leading-none font-extrabold" />
          <div ref={nextLabel} className="absolute top-2.5 left-3.5 text-sm font-bold">
            Next
          </div>
          <div ref={nextWhen} className="absolute top-2.5 right-3.5 text-sm font-bold" />
          <div ref={nextFret} className="absolute inset-0 flex items-center justify-center text-[128px] leading-none font-extrabold" />
        </div>
      </div>
    </section>
  );
}

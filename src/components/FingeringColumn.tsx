import { useRef } from 'react';
import { lastPluckIndex, nextDifferentNote, pluckAt, type Pluck } from '../core/plucks';
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
const fretText = (p: Pluck) => (p.dead ? 'x' : String(p.fret));

export function FingeringColumn() {
  const planOpen = useSession((s) => s.planOpen);
  const scale = planOpen ? 0.75 : 0.9;
  const board = useRef<HTMLDivElement>(null);
  const nowBg = useRef<HTMLDivElement>(null);
  const nowLabel = useRef<HTMLDivElement>(null);
  const nowFret = useRef<HTMLDivElement>(null);
  const nextBox = useRef<HTMLDivElement>(null);
  const nextFret = useRef<HTMLDivElement>(null);
  const nextWhen = useRef<HTMLDivElement>(null);
  const shown = useRef({ board: '', next: '', now: -2 });

  useFrame((tick) => {
    const { song, chunkIndex } = useSession.getState();
    if (!song || !board.current) return;
    const { plucks } = songModel(song);
    const cur = pluckAt(plucks, tick);
    const next = nextDifferentNote(plucks, tick, chunkRange(song.chunks[chunkIndex]!, song.bars), advanceRange());

    // Now: full colour on the pluck, fading to 28 % over 0.9 × the note's duration. Computed in
    // ticks, so it follows the tempo and freezes on pause.
    if (cur) {
      const fade = easeOut(Math.min(1, Math.max(0, (tick - cur.start) / (FADE_SPAN * cur.dur))));
      const fg = `color-mix(in srgb, var(--string-${cur.string + 1}-text), #ffffff ${Math.round(fade * 100)}%)`;
      nowBg.current!.style.background = `var(--string-${cur.string + 1})`;
      nowBg.current!.style.opacity = String(1 - (1 - FADE_TO) * fade);
      nowLabel.current!.style.color = fg;
      nowFret.current!.style.color = fg;
    } else {
      nowBg.current!.style.opacity = '0';
      nowLabel.current!.style.color = '';
    }
    if ((cur?.index ?? -1) !== shown.current.now) {
      shown.current.now = cur?.index ?? -1;
      nowFret.current!.textContent = cur ? fretText(cur) : '';
    }

    // Next: the next different note at full colour, with "in N", "loop" or "next chunk".
    const nextKey = next ? `${next.pluck.index}:${next.when}` : '';
    if (nextKey !== shown.current.next) {
      shown.current.next = nextKey;
      const s = next?.pluck.string ?? 0;
      nextBox.current!.style.background = next ? `var(--string-${s + 1})` : '';
      nextBox.current!.style.color = next ? `var(--string-${s + 1}-text)` : '';
      nextFret.current!.textContent = next ? fretText(next.pluck) : '';
      nextWhen.current!.textContent = next?.when ?? '';
    }

    // Fretboard: hand position, active finger and the "Next" ring.
    const hand = cur ?? plucks[lastPluckIndex(plucks, tick)] ?? next?.pluck ?? null;
    const boardKey = `${song.slug}:${cur?.index ?? 'rest'}:${hand?.index}:${next?.pluck.index}`;
    if (boardKey !== shown.current.board) {
      shown.current.board = boardKey;
      board.current.innerHTML = fretboardHtml({
        frets: Math.max(9, song.stats.maxFret),
        letters: stringNames(song.tuning),
        current: cur && !cur.dead ? cur : null,
        position: hand?.position ?? song.chunks[chunkIndex]?.position ?? 1,
        next: next && { string: next.pluck.string, fret: next.pluck.fret },
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
          <div ref={nowBg} className="absolute inset-0 opacity-0" />
          <div ref={nowLabel} className="text-subdued absolute top-2.5 left-3.5 text-sm font-bold">
            Now
          </div>
          <div ref={nowFret} data-testid="now-fret" className="absolute inset-0 flex items-center justify-center text-[128px] leading-none font-extrabold" />
        </div>
        <div ref={nextBox} aria-label="Next" className="bg-card rounded-comfortable text-subdued relative overflow-hidden">
          <div className="absolute top-2.5 left-3.5 text-sm font-bold">Next</div>
          <div ref={nextWhen} className="absolute top-2.5 right-3.5 text-sm font-bold" />
          <div ref={nextFret} className="absolute inset-0 flex items-center justify-center text-[128px] leading-none font-extrabold" />
        </div>
      </div>
    </section>
  );
}

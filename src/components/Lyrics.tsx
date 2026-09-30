import { useEffect, useLayoutEffect, useMemo, useRef, useState, type WheelEvent } from 'react';
import { lineSwitchTicks, lyricsCursor, type LyricsCursor } from '../core/lyrics';
import type { LyricLine, SongLyrics } from '../core/model';
import { useFrame } from '../playback/frame';
import { onLyricsScroll } from '../practice/engine';

// Lyrics view in the video cell (ADR-0024; design/artboards/LyricsView.dc.html). Synced lyrics
// follow the playhead: the current line is large with the sung word lit, and the list glides so
// the current line stays in place. Unsynced lyrics are plain lines scrolled with ↑ ↓ or the wheel.
// Line and word states are data attributes styled in styles/index.css (.lyrics-line), written per
// frame without React (ADR-0002).

/** Top of the current line in the list viewport: room for the line before it. */
const ANCHOR = 38;
/** Wheel distance (px) per line in unsynced lyrics. */
const WHEEL_STEP = 60;

export function Lyrics({ lyrics }: { lyrics: SongLyrics }) {
  return (
    <div data-testid="lyrics" data-synced={lyrics.synced} className="absolute top-[108px] right-7 bottom-[54px] left-7 flex flex-col gap-2.5">
      <div className="text-xs leading-snug font-bold text-[#7c7c7c]">
        {lyrics.synced ? 'Lyrics · synced to the vocal track' : 'Lyrics · not synced · ↑ ↓ to scroll'}
      </div>
      {lyrics.synced ? <SyncedLines lines={lyrics.lines} /> : <PlainLines lines={lyrics.lines} />}
    </div>
  );
}

const viewportStyle = {
  maskImage: 'linear-gradient(to bottom, transparent 0, #000 10px, #000 calc(100% - 28px), transparent 100%)',
};

function Rows({ lines, pos }: { lines: LyricLine[]; pos: string }) {
  return lines.map((line, i) => (
    <div key={i} className="lyrics-line" data-pos={pos} data-gap={line.gap && i > 0}>
      {line.section && <div className="section">{line.section}</div>}
      <div className="text">
        {line.words.length
          ? line.words.map((w, k) => (
              <span key={k}>
                {k > 0 && ' '}
                <span data-w="todo">{w.text}</span>
              </span>
            ))
          : line.text}
      </div>
    </div>
  ));
}

function SyncedLines({ lines }: { lines: LyricLine[] }) {
  const list = useRef<HTMLDivElement>(null);
  const switches = useMemo(() => lineSwitchTicks(lines), [lines]);
  const shown = useRef<LyricsCursor | null>(null);

  useFrame((tick) => {
    const el = list.current;
    if (!el || !lines.length) return;
    const cursor = lyricsCursor(lines, switches, tick);
    const prev = shown.current;
    if (prev && cursor.line === prev.line && cursor.sung === prev.sung && cursor.active === prev.active) return;
    const rows = el.children as HTMLCollectionOf<HTMLElement>;
    const row = rows[cursor.line];
    if (!row) return;
    if (cursor.line !== prev?.line) {
      for (let i = 0; i < rows.length; i++) rows[i]!.dataset.pos = i === cursor.line ? 'current' : i === cursor.line + 1 ? 'next' : 'far';
      // The first placement jumps; later line changes glide.
      el.style.transition = prev ? 'transform 300ms ease-out' : 'none';
      el.style.transform = `translateY(${ANCHOR - row.offsetTop}px)`;
    }
    row.querySelectorAll<HTMLElement>('[data-w]').forEach((w, i) => {
      w.dataset.w = i < cursor.sung - 1 || (i === cursor.sung - 1 && !cursor.active) ? 'sung' : i === cursor.sung - 1 ? 'now' : 'todo';
    });
    shown.current = cursor;
  });

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden" style={viewportStyle}>
      <div ref={list} className="absolute inset-x-0 top-0 will-change-transform">
        <Rows lines={lines} pos="far" />
      </div>
    </div>
  );
}

function PlainLines({ lines }: { lines: LyricLine[] }) {
  const viewport = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const wheel = useRef(0);
  const [top, setTop] = useState(0);

  /** Last line that can be at the top: the one from which the rest of the lyrics fits. */
  const maxTop = () => {
    const rows = list.current?.children as HTMLCollectionOf<HTMLElement> | undefined;
    const height = viewport.current?.clientHeight ?? 0;
    if (!rows || !list.current) return 0;
    const end = list.current.scrollHeight;
    for (let i = 0; i < rows.length; i++) if (end - rows[i]!.offsetTop <= height) return i;
    return rows.length - 1;
  };
  const step = (direction: 1 | -1) => setTop((t) => Math.max(0, Math.min(maxTop(), t + direction)));

  useEffect(() => onLyricsScroll(step), []);

  useLayoutEffect(() => {
    const row = list.current?.children[top] as HTMLElement | undefined;
    if (list.current) list.current.style.transform = `translateY(${-(row?.offsetTop ?? 0)}px)`;
  }, [top]);

  const onWheel = (e: WheelEvent) => {
    wheel.current += e.deltaY;
    while (Math.abs(wheel.current) >= WHEEL_STEP) {
      const direction = wheel.current > 0 ? 1 : -1;
      wheel.current -= direction * WHEEL_STEP;
      step(direction);
    }
  };

  return (
    <div ref={viewport} onWheel={onWheel} className="relative min-h-0 flex-1 overflow-hidden" style={viewportStyle}>
      <div ref={list} data-top={top} className="absolute inset-x-0 top-0 transition-transform duration-200 ease-out">
        <Rows lines={lines} pos="plain" />
      </div>
    </div>
  );
}

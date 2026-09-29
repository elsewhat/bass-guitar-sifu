import { useRef } from 'react';
import { countCells, EIGHTH } from '../core/count';
import { barIndexAt } from '../core/timing';
import { useFrame } from '../playback/frame';
import { setSource } from '../practice/engine';
import { songModel } from '../practice/song-model';
import { introChip, loopTimeLabel } from '../practice/view-model';
import { SOURCES, useSession } from '../state/session';
import { Icon } from './icons';

// Video cell (system description §3.3): source switch, the source's view, chips and full screen.

const overlayChip = 'bg-[rgba(18,18,18,0.85)] text-white';

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen();
}

export function VideoCell() {
  const source = useSession((s) => s.source);
  const song = useSession((s) => s.song);
  const chunkIndex = useSession((s) => s.chunkIndex);
  const intro = song && introChip(song);

  return (
    <section aria-label="Video" className="rounded-comfortable relative overflow-hidden bg-black">
      <div className="text-subdued absolute inset-0 flex flex-col items-center justify-center gap-2.5">
        {source === 'count' ? (
          <>
            <CountCells />
            <div className="text-base font-bold text-white">Audio count</div>
          </>
        ) : (
          <div className="flex size-18 items-center justify-center rounded-full bg-white/8 text-white">
            <Icon name="play" size={32} />
          </div>
        )}
      </div>
      <div className={`${overlayChip} absolute top-3 left-3 flex gap-1 rounded-full p-1`}>
        {SOURCES.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={source === s.id}
            disabled={!s.ready}
            title={s.ready ? undefined : 'Not available yet'}
            onClick={() => setSource(s.id)}
            className={`h-8 rounded-full border-0 px-3.5 text-sm leading-none font-bold ${
              source === s.id ? 'bg-white text-black' : 'bg-transparent text-white'
            } ${s.ready ? 'cursor-pointer' : 'opacity-40'}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-label="Full screen"
        onClick={toggleFullscreen}
        className={`${overlayChip} absolute top-3 right-3 flex size-10 cursor-pointer items-center justify-center rounded-full border-0`}
      >
        <Icon name="fullscreen" />
      </button>
      {intro && <div className={`${overlayChip} absolute bottom-3 left-3 rounded-full px-3 py-1.5 text-xs font-bold`}>{intro}</div>}
      {song && song.chunks[chunkIndex] && (
        <div className={`${overlayChip} absolute right-3 bottom-3 rounded-full px-3 py-1.5 text-xs font-bold`}>
          {loopTimeLabel(song, chunkIndex, songModel(song).tempo)}
        </div>
      )}
    </section>
  );
}

/** One cell per eighth of the current bar ("1 & 2 & 3 & 4 &"), the current one lit, per frame. */
function CountCells() {
  const box = useRef<HTMLDivElement>(null);
  const shown = useRef({ meter: '', cell: -1 });

  useFrame((tick) => {
    const song = useSession.getState().song;
    const el = box.current;
    if (!song || !el) return;
    const bar = song.bars[barIndexAt(song.bars, tick)]!;
    const meter = bar.time.join('/');
    if (meter !== shown.current.meter) {
      shown.current = { meter, cell: -1 };
      const cells = countCells(bar.time);
      const width = Math.min(56, Math.floor((560 - 8 * (cells.length - 1)) / cells.length));
      el.innerHTML = cells
        .map((label) => {
          const beat = label !== '&' && label !== null;
          return `<div data-beat="${beat}" style="width:${width}px;height:76px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:${beat ? 40 : 30}px;line-height:1;font-weight:800">${label ?? '·'}</div>`;
        })
        .join('');
      for (const c of el.children) paint(c as HTMLElement, false);
    }
    const cell = Math.floor((tick - bar.startTick) / EIGHTH);
    if (cell !== shown.current.cell) {
      const cells = el.children;
      if (cells[shown.current.cell]) paint(cells[shown.current.cell] as HTMLElement, false);
      if (cells[cell]) paint(cells[cell] as HTMLElement, true);
      shown.current.cell = cell;
    }
  });

  return <div ref={box} aria-hidden="true" data-testid="count-cells" className="mb-2 flex gap-2" />;
}

function paint(cell: HTMLElement, on: boolean) {
  const beat = cell.dataset.beat === 'true';
  cell.style.background = on ? '#ffffff' : 'var(--color-bg-surface)';
  cell.style.color = on ? '#000000' : beat ? '#ffffff' : '#7c7c7c';
}

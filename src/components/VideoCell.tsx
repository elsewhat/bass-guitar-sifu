import { useRef } from 'react';
import { countCells, EIGHTH } from '../core/count';
import { barIndexAt } from '../core/timing';
import { useFrame } from '../playback/frame';
import { countInState, openMixer, setSource, toggleLyrics } from '../practice/engine';
import { songModel } from '../practice/song-model';
import { introChip, loopTimeLabel } from '../practice/view-model';
import { SOURCES, sourceAvailable, useSession, type SourceId, type SourceStatus } from '../state/session';
import { Icon } from './icons';
import { Lyrics } from './Lyrics';

// Video cell (system description §3.3): source switch, the source's view, chips, the lyrics toggle and
// the mixer button. With lyrics on (ADR-0024), the lyrics take the cell and the source's view
// shrinks to one row under the source switch.

const overlayChip = 'bg-[rgba(18,18,18,0.85)] text-white';

export function VideoCell() {
  const source = useSession((s) => s.source);
  const status = useSession((s) => s.sourceStatus);
  const song = useSession((s) => s.song);
  const chunkIndex = useSession((s) => s.chunkIndex);
  const mixerOpen = useSession((s) => s.mixerOpen);
  const lyricsOn = useSession((s) => s.lyricsOn);
  const intro = song && introChip(song);
  const lyrics = lyricsOn ? song?.lyrics : undefined;

  return (
    <section aria-label="Video" data-source-status={status.state} className="rounded-comfortable relative overflow-hidden bg-black">
      {lyrics ? (
        <>
          <div className="bg-page rounded-comfortable absolute top-[60px] right-3 left-3 flex h-9 items-center gap-2.5 px-2.5 text-xs leading-none">
            <SourceRow source={source} status={status} />
          </div>
          <Lyrics key={song!.slug} lyrics={lyrics} />
        </>
      ) : (
        <div className="text-subdued absolute inset-0 flex flex-col items-center justify-center gap-2.5">
          {source === 'count' ? (
            <>
              <CountCells />
              <div className="text-base font-bold text-white">Audio count</div>
            </>
          ) : source === 'synth' ? (
            // No play button of its own: Play is in the transport bar (§3.3).
            <>
              <CountCells countInOnly />
              <div className="text-base font-bold text-white">Synth playback</div>
              <div className="text-sm">{synthDetail(status)}</div>
            </>
          ) : source === 'music' ? (
            <>
              <CountCells countInOnly />
              <div className="text-base font-bold text-white">Music playback</div>
              <div className="text-sm">{musicDetail(status)}</div>
            </>
          ) : (
            <div className="flex size-18 items-center justify-center rounded-full bg-white/8 text-white">
              <Icon name="play" size={32} />
            </div>
          )}
        </div>
      )}
      <div className={`${overlayChip} absolute top-3 left-3 flex gap-1 rounded-full p-1`}>
        {SOURCES.map((s) => {
          const available = sourceAvailable(s.id, song);
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={source === s.id}
              disabled={!available}
              title={available ? undefined : s.ready ? 'No audio for this song' : 'Not available yet'}
              onClick={() => setSource(s.id)}
              className={`h-8 rounded-full border-0 px-3.5 text-sm leading-none font-bold ${
                source === s.id ? 'bg-white text-black' : 'bg-transparent text-white'
              } ${available ? 'cursor-pointer' : 'opacity-40'}`}
            >
              {s.label}
            </button>
          );
        })}
      </div>
      <LyricsButton />
      <button
        type="button"
        aria-label="Mixer"
        title="Mixer"
        aria-haspopup="dialog"
        aria-expanded={mixerOpen}
        onClick={() => openMixer(!mixerOpen)}
        className={`${overlayChip} absolute top-3 right-3 flex size-10 cursor-pointer items-center justify-center rounded-full border-0 p-0`}
      >
        <Icon name="equalizer" />
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

/** Lyrics toggle next to the mixer button; disabled for songs without lyrics. */
function LyricsButton() {
  const on = useSession((s) => s.lyricsOn);
  const has = useSession((s) => !!s.song?.lyrics);
  const title = !has ? 'No lyrics for this song' : on ? 'Hide lyrics' : 'Show lyrics';
  return (
    <button
      type="button"
      aria-label="Lyrics"
      title={title}
      aria-pressed={has && on}
      disabled={!has}
      onClick={toggleLyrics}
      className={`absolute top-3 right-[60px] flex size-10 items-center justify-center rounded-full border-0 p-0 ${
        has && on ? 'bg-white text-black' : overlayChip
      } ${has ? 'cursor-pointer' : 'opacity-40'}`}
    >
      <Icon name="lyrics" />
    </button>
  );
}

/** The source's view in one row while the lyrics are shown: small count cells or the status line. */
function SourceRow({ source, status }: { source: SourceId; status: SourceStatus }) {
  if (source === 'count') {
    return (
      <>
        <span className="text-subdued mr-1 font-bold">Audio count</span>
        <CountCells small />
      </>
    );
  }
  if (source === 'synth' || source === 'music') {
    return (
      <>
        <span className="font-bold text-white">{source === 'synth' ? 'Synth playback' : 'Music playback'}</span>
        <span className="text-subdued truncate">{source === 'synth' ? synthDetail(status) : musicDetail(status)}</span>
        <CountCells small countInOnly />
      </>
    );
  }
  return null;
}

function synthDetail(status: SourceStatus): string {
  if (status.state === 'loading') return `Loading sounds… ${Math.round((status.progress ?? 0) * 100)} %`;
  if (status.state === 'error') return status.error ?? 'Synth unavailable';
  return 'Rendered from the score · any tempo';
}

function musicDetail(status: SourceStatus): string {
  if (status.state === 'loading') return `Loading audio… ${Math.round((status.progress ?? 0) * 100)} %`;
  if (status.state === 'error') return status.error ?? 'Music unavailable';
  return 'Rendered from the score · full speed only';
}

/**
 * One cell per eighth of the current bar ("1 & 2 & 3 & 4 &"), the current one lit, per frame.
 * During a count-in (ADR-0025) the cells count the bar before playback starts.
 * `small`: 26 px cells for the row above the lyrics. `countInOnly`: shown only during a count-in
 * (the Synth and Music views).
 */
function CountCells({ small = false, countInOnly = false }: { small?: boolean; countInOnly?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const shown = useRef({ meter: '', cell: -1, countIn: false });

  useFrame((tick) => {
    const song = useSession.getState().song;
    const el = box.current;
    if (!song || !el) return;
    const countIn = countInState();
    const counting = countIn !== null;
    if (counting !== shown.current.countIn) {
      shown.current.countIn = counting;
      el.dataset.countIn = String(counting);
      if (countInOnly) el.style.display = counting ? '' : 'none';
    }
    if (countInOnly && !countIn) return;
    const bar = song.bars[barIndexAt(song.bars, tick)]!;
    const time = countIn?.time ?? bar.time;
    const meter = time.join('/');
    if (meter !== shown.current.meter) {
      shown.current = { ...shown.current, meter, cell: -1 };
      const cells = countCells(time);
      const size = small
        ? { w: Math.min(26, Math.floor((440 - 4 * (cells.length - 1)) / cells.length)), h: 26, r: 4, beat: 13, and: 13 }
        : { w: Math.min(56, Math.floor((560 - 8 * (cells.length - 1)) / cells.length)), h: 76, r: 8, beat: 40, and: 30 };
      el.innerHTML = cells
        .map((label) => {
          const beat = label !== '&' && label !== null;
          return `<div data-beat="${beat}" style="width:${size.w}px;height:${size.h}px;border-radius:${size.r}px;display:flex;align-items:center;justify-content:center;font-size:${beat ? size.beat : size.and}px;line-height:1;font-weight:800">${label ?? '·'}</div>`;
        })
        .join('');
      for (const c of el.children) paint(c as HTMLElement, false);
    }
    const cell = countIn?.cell ?? Math.floor((tick - bar.startTick) / EIGHTH);
    if (cell !== shown.current.cell) {
      const cells = el.children;
      if (cells[shown.current.cell]) paint(cells[shown.current.cell] as HTMLElement, false);
      if (cells[cell]) paint(cells[cell] as HTMLElement, true);
      shown.current.cell = cell;
    }
  });

  return (
    <div
      ref={box}
      aria-hidden="true"
      data-testid={countInOnly ? 'count-in-cells' : 'count-cells'}
      data-count-in="false"
      style={countInOnly ? { display: 'none' } : undefined}
      className={small ? 'flex shrink-0 gap-1' : 'mb-2 flex gap-2'}
    />
  );
}

function paint(cell: HTMLElement, on: boolean) {
  const beat = cell.dataset.beat === 'true';
  cell.style.background = on ? '#ffffff' : 'var(--color-bg-surface)';
  cell.style.color = on ? '#000000' : beat ? '#ffffff' : '#7c7c7c';
}

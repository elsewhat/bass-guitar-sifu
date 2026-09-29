import { goNextChunk, restartChunk, stepTempo, toggleAutoAdvance, togglePlay } from '../practice/engine';
import { songModel } from '../practice/song-model';
import { effectiveBpm } from '../practice/view-model';
import { TEMPO, useSession } from '../state/session';
import { Icon } from './icons';

// Transport bar under the video (system description §3.4): play/pause, restart chunk, pass
// counter with the repeat toggle, tempo 40–120 % in steps of 5, and "Next chunk".

const round = 'flex shrink-0 cursor-pointer items-center justify-center rounded-full border-0 p-0 text-white';

export function TransportBar() {
  const { song, playing, pass, passes, autoAdvance, tempoPct, chunkIndex, sourceStatus } = useSession();
  const bpm = song ? effectiveBpm(song, chunkIndex, songModel(song).tempo, tempoPct) : 0;
  const autoLabel = autoAdvance
    ? `Moves to the next chunk after ${passes} passes. Click to repeat this chunk.`
    : `Repeats this chunk. Click to move on after ${passes} passes.`;
  const isLast = !song || chunkIndex >= song.chunks.length - 1;

  return (
    <section aria-label="Loop and tempo" className="bg-surface rounded-comfortable flex min-w-0 items-center gap-3 px-3">
      <button
        type="button"
        aria-label={playing ? 'Pause' : 'Play'}
        title={playing ? 'Pause' : 'Play'}
        disabled={!song || sourceStatus.state !== 'ready'}
        onClick={togglePlay}
        className={`${round} bg-accent text-on-accent size-11 disabled:opacity-40`}
      >
        <Icon name={playing ? 'pause' : 'play'} size={22} />
      </button>
      <button type="button" aria-label="Restart chunk" title="Restart chunk" onClick={restartChunk} className={`${round} bg-elevated size-9`}>
        <Icon name="restart" size={18} />
      </button>
      <div className="bg-elevated flex h-9 shrink-0 items-center gap-1 rounded-full pr-1 pl-3" aria-label={`Pass ${pass} of ${passes}`}>
        {Array.from({ length: passes }, (_, i) => (
          <span
            key={i}
            className="size-2.5 rounded-full"
            style={{ background: i < pass - 1 ? '#ffffff' : i === pass - 1 ? 'var(--color-accent)' : 'var(--color-border-strong)' }}
          />
        ))}
        <span className="mr-0.5 ml-1 text-sm leading-none font-bold">{pass <= passes ? `${pass}/${passes}` : pass}</span>
        <button
          type="button"
          aria-label={autoLabel}
          title={autoLabel}
          aria-pressed={autoAdvance}
          onClick={toggleAutoAdvance}
          className={`${round} bg-card size-[30px] ${autoAdvance ? 'text-accent' : ''}`}
        >
          <Icon name={autoAdvance ? 'repeat' : 'repeatOne'} size={18} />
        </button>
      </div>
      <div className="bg-elevated flex h-9 shrink-0 items-center gap-1 rounded-full px-1">
        <button type="button" aria-label="Slower" title="Slower" disabled={tempoPct <= TEMPO.min} onClick={() => stepTempo(-1)} className={`${round} bg-card size-[30px] disabled:opacity-40`}>
          <Icon name="minus" size={16} />
        </button>
        <div className="w-16 text-center">
          <div data-testid="tempo" className="text-sm leading-[1.1] font-extrabold">
            {tempoPct}%
          </div>
          <div className="text-subdued text-[10px] leading-[1.3] whitespace-nowrap">{bpm} BPM</div>
        </div>
        <button type="button" aria-label="Faster" title="Faster" disabled={tempoPct >= TEMPO.max} onClick={() => stepTempo(1)} className={`${round} bg-card size-[30px] disabled:opacity-40`}>
          <Icon name="plus" size={16} />
        </button>
      </div>
      <div className="grow" />
      <button
        type="button"
        disabled={isLast}
        onClick={goNextChunk}
        className="bg-elevated flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border-0 pr-3 pl-4 text-sm leading-none font-bold text-white shadow-[inset_0_0_0_1px_#7c7c7c] disabled:cursor-default disabled:opacity-40"
      >
        Next chunk
        <Icon name="skipNext" size={16} />
      </button>
    </section>
  );
}

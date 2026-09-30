import { passCounterText, type RepeatMode } from '../playback/loop';
import { cycleRepeatMode, goNextChunk, restartChunk, stepTempo, togglePlay } from '../practice/engine';
import { songModel } from '../practice/song-model';
import { effectiveBpm } from '../practice/view-model';
import { effectiveTempo, TEMPO, tempoLocked, useSession } from '../state/session';
import { Icon, type IconName } from './icons';

// Transport bar under the video (system description §3.4): play/pause, restart chunk, pass
// counter with the repeat button (ADR-0021), tempo 40–100 % in steps of 5, and "Next chunk".
// Keyboard: Space, ← →, + − (useTransportKeys); the titles show the keys.

const round = 'flex shrink-0 cursor-pointer items-center justify-center rounded-full border-0 p-0 text-white';

const REPEAT: Record<RepeatMode, { icon: IconName; accent: boolean; label: (passes: number) => string }> = {
  advance: { icon: 'repeat', accent: true, label: (n) => `Repeat each chunk ${n} times, then move on. Click for play through.` },
  once: { icon: 'playThrough', accent: true, label: () => 'Play through: each chunk once, no repeats. Click to loop this chunk.' },
  loop: { icon: 'repeatOne', accent: false, label: (n) => `Loop this chunk until you move on. Click to repeat ${n} times.` },
};

export function TransportBar() {
  const { song, playing, pass, passes, repeatMode, chunkIndex, sourceStatus, source } = useSession();
  const tempoPct = useSession(effectiveTempo);
  const locked = tempoLocked(source);
  const bpm = song ? effectiveBpm(song, chunkIndex, songModel(song).tempo, tempoPct) : 0;
  const repeat = REPEAT[repeatMode];
  const repeatLabel = repeat.label(passes);
  const isLast = !song || chunkIndex >= song.chunks.length - 1;

  return (
    <section aria-label="Loop and tempo" className="bg-surface rounded-comfortable flex min-w-0 items-center gap-3 px-3">
      <button
        type="button"
        aria-label={playing ? 'Pause' : 'Play'}
        title={playing ? 'Pause (Space)' : 'Play (Space)'}
        aria-keyshortcuts="Space"
        disabled={!song || sourceStatus.state !== 'ready'}
        onClick={togglePlay}
        className={`${round} bg-accent text-on-accent size-11 disabled:opacity-40`}
      >
        <Icon name={playing ? 'pause' : 'play'} size={22} />
      </button>
      <button type="button" aria-label="Restart chunk" title="Restart chunk" onClick={restartChunk} className={`${round} bg-elevated size-9`}>
        <Icon name="restart" size={18} />
      </button>
      <div data-testid="pass-counter" className="bg-elevated flex h-9 shrink-0 items-center gap-1 rounded-full pr-1 pl-3">
        {repeatMode === 'advance' &&
          Array.from({ length: passes }, (_, i) => (
            <span
              key={i}
              className="size-2.5 rounded-full"
              style={{ background: i < pass - 1 ? '#ffffff' : i === pass - 1 ? 'var(--color-accent)' : 'var(--color-border-strong)' }}
            />
          ))}
        <span className="mr-0.5 ml-1 text-sm leading-none font-bold whitespace-nowrap">{passCounterText({ pass, passes, repeatMode })}</span>
        <button
          type="button"
          aria-label={repeatLabel}
          title={repeatLabel}
          data-mode={repeatMode}
          onClick={cycleRepeatMode}
          className={`${round} bg-card size-[30px] ${repeat.accent ? 'text-accent' : ''}`}
        >
          <Icon name={repeat.icon} size={18} />
        </button>
      </div>
      <div className="bg-elevated flex h-9 shrink-0 items-center gap-1 rounded-full px-1" title={locked ? 'Music plays at full speed only' : undefined}>
        <button type="button" aria-label="Slower" title="Slower (−)" aria-keyshortcuts="-" disabled={locked || tempoPct <= TEMPO.min} onClick={() => stepTempo(-1)} className={`${round} bg-card size-[30px] disabled:opacity-40`}>
          <Icon name="minus" size={16} />
        </button>
        <div className="w-16 text-center">
          <div data-testid="tempo" className="text-sm leading-[1.1] font-extrabold">
            {tempoPct}%
          </div>
          <div className="text-subdued text-[10px] leading-[1.3] whitespace-nowrap">{bpm} BPM</div>
        </div>
        <button type="button" aria-label="Faster" title="Faster (+)" aria-keyshortcuts="+" disabled={locked || tempoPct >= TEMPO.max} onClick={() => stepTempo(1)} className={`${round} bg-card size-[30px] disabled:opacity-40`}>
          <Icon name="plus" size={16} />
        </button>
      </div>
      <div className="grow" />
      <button
        type="button"
        disabled={isLast}
        onClick={goNextChunk}
        title="Next chunk (→) · previous chunk (←)"
        aria-keyshortcuts="ArrowRight"
        className="bg-elevated flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border-0 pr-3 pl-4 text-sm leading-none font-bold text-white shadow-[inset_0_0_0_1px_#7c7c7c] disabled:cursor-default disabled:opacity-40"
      >
        Next chunk
        <Icon name="skipNext" size={16} />
      </button>
    </section>
  );
}

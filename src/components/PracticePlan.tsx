import { useEffect, useRef } from 'react';
import { passLabel } from '../playback/loop';
import { selectChunkAt } from '../practice/engine';
import { barRange, barsLabel, planRows } from '../practice/view-model';
import { effectiveTempo, useSession } from '../state/session';
import { Icon } from './icons';

// Practice plan column (system description §3.2): chunks with bass-rest separators, the current
// chunk expanded, done chunks with a check and their tempo; collapses to a 56 px rail.

function circleStyle(current: boolean, done: boolean) {
  if (current) return 'bg-accent text-on-accent';
  if (done) return 'bg-white text-black';
  return 'bg-card text-subdued';
}

export function PracticePlan() {
  const { planOpen, togglePlan, song, chunkIndex, pass, passes, repeatMode, done } = useSession();
  const tempoPct = useSession(effectiveTempo);
  const list = useRef<HTMLDivElement>(null);

  // Keep the current chunk in view (scrollTop only: scrollIntoView would also move the stage).
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>('[aria-current="step"]');
    const box = list.current;
    if (!el || !box) return;
    if (el.offsetTop < box.scrollTop) box.scrollTop = el.offsetTop - 8;
    else if (el.offsetTop + el.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = el.offsetTop + el.offsetHeight - box.clientHeight + 8;
  }, [chunkIndex, planOpen, song]);

  const rows = song ? planRows(song) : [];
  return (
    <nav aria-label="Practice plan" className="bg-surface rounded-comfortable row-span-2 flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden p-3">
      <div className={`flex h-8 shrink-0 items-center ${planOpen ? 'justify-between pl-1' : 'justify-center'}`}>
        {planOpen && <span className="text-base font-bold">Practice plan</span>}
        <button
          type="button"
          aria-label={planOpen ? 'Hide practice plan' : 'Show practice plan'}
          aria-expanded={planOpen}
          onClick={togglePlan}
          className="bg-elevated flex size-8 cursor-pointer items-center justify-center rounded-full border-0 text-white"
        >
          <Icon name={planOpen ? 'chevronLeft' : 'chevronRight'} />
        </button>
      </div>
      <div
        ref={list}
        className={`relative flex min-h-0 flex-col overflow-y-auto [scrollbar-width:none] ${planOpen ? 'gap-0.5' : 'items-center gap-1.5 pt-2'}`}
      >
        {rows.map((row) => {
          if (row.kind === 'rest') {
            return planOpen ? (
              <div key={`rest-${row.bar}`} className="flex h-[18px] shrink-0 items-center pl-[42px] text-[11px] text-[#7c7c7c]">
                {row.label}
              </div>
            ) : null;
          }
          const { index, chunk } = row;
          const current = index === chunkIndex;
          const doneTempo = done[index];
          const isDone = doneTempo !== undefined && !current;
          const num = isDone ? '✓' : String(index + 1);
          const aria = `Chunk ${index + 1}, ${chunk.name}, bars ${barRange(chunk.bars)}`;
          if (!planOpen) {
            return (
              <button
                key={chunk.id}
                type="button"
                aria-label={aria}
                aria-current={current ? 'step' : undefined}
                onClick={() => selectChunkAt(index)}
                className={`${circleStyle(current, isDone)} size-7 shrink-0 cursor-pointer rounded-full border-0 p-0 text-xs leading-none font-extrabold`}
              >
                {num}
              </button>
            );
          }
          const circle = (
            <span className={`${circleStyle(current, isDone)} flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-extrabold`}>{num}</span>
          );
          return current ? (
            <button
              key={chunk.id}
              type="button"
              aria-label={aria}
              aria-current="step"
              onClick={() => selectChunkAt(index)}
              className="bg-card rounded-comfortable flex h-14 shrink-0 cursor-pointer items-center gap-2.5 border-0 px-2 text-left text-white"
            >
              {circle}
              <span className="min-w-0 grow">
                <span className="block truncate text-sm font-bold">{chunk.name}</span>
                <span className="text-subdued block text-xs">
                  {barsLabel(chunk.bars)} · {passLabel({ pass, passes, repeatMode })}
                </span>
              </span>
              <span className="text-xs font-bold">{tempoPct}%</span>
            </button>
          ) : (
            <button
              key={chunk.id}
              type="button"
              aria-label={aria}
              onClick={() => selectChunkAt(index)}
              className="rounded-comfortable flex h-9 shrink-0 cursor-pointer items-center gap-2.5 border-0 bg-transparent px-2 text-left text-white"
            >
              {circle}
              <span className="min-w-0 grow truncate text-sm font-bold">{chunk.name}</span>
              <span className="text-subdued text-xs whitespace-nowrap">{isDone ? `${doneTempo}%` : barRange(chunk.bars)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

import { useEffect, useState } from 'react';
import { loadSong } from '../practice/engine';
import { headMeta } from '../practice/view-model';
import { useSession } from '../state/session';
import { Icon } from './icons';

const panel = 'bg-surface rounded-comfortable min-h-0 min-w-0';

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen();
}

export function Header() {
  const song = useSession((s) => s.song);
  const loadError = useSession((s) => s.loadError);
  return (
    <header
      className={`${panel} relative col-span-2 grid items-center gap-x-8 px-4 py-3`}
      style={{ gridTemplateColumns: '380px minmax(0, 1fr) auto' }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="bg-card text-subdued rounded-standard flex size-16 shrink-0 items-center justify-center">
          <Icon name="music" size={28} />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="m-0 truncate text-2xl leading-tight font-bold">{song?.title ?? 'No song loaded'}</h1>
          <div className="text-subdued text-sm leading-snug">{song?.artist ?? loadError ?? 'Loading…'}</div>
          {song && <div className="text-subdued text-xs leading-snug whitespace-nowrap">{headMeta(song)}</div>}
        </div>
      </div>
      {/* Lyrics block stays empty without a licensed provider (ADR-0011). */}
      <div aria-hidden="true" />
      <div className="flex items-center gap-2.5">
        <SongSwitch />
        <button
          type="button"
          aria-label="Full screen"
          title="Full screen"
          onClick={toggleFullscreen}
          className="bg-elevated flex size-10 cursor-pointer items-center justify-center rounded-full border-0 p-0 text-white shadow-[inset_0_0_0_1px_#7c7c7c]"
        >
          <Icon name="fullscreen" />
        </button>
      </div>
    </header>
  );
}

/**
 * Temporary song switch (slice 1): a short list of the catalogue. The song library overlay with
 * search and progress (system description §4) replaces it in step 6. `?song=<slug>` also works.
 */
function SongSwitch() {
  const catalog = useSession((s) => s.catalog);
  const current = useSession((s) => s.song?.slug);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      if (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`${open ? 'bg-card' : 'bg-elevated'} flex h-10 cursor-pointer items-center gap-2 rounded-full border-0 pr-2 pl-3.5 text-sm font-bold text-white shadow-[inset_0_0_0_1px_#7c7c7c]`}
      >
        <Icon name="search" size={18} />
        Songs
        <span className="bg-card text-subdued rounded-subtle px-1.5 py-1 text-[11px] leading-none font-bold">Ctrl K</span>
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="Songs"
          className="bg-card rounded-medium absolute top-12 right-0 z-20 flex w-[440px] flex-col gap-0.5 p-3 shadow-[rgba(0,0,0,0.5)_0_8px_24px]"
        >
          {catalog.map((c) => (
            <button
              key={c.slug}
              type="button"
              role="option"
              aria-selected={c.slug === current}
              onClick={() => {
                setOpen(false);
                if (c.slug !== current) void loadSong(c.slug);
              }}
              className={`${c.slug === current ? 'bg-elevated' : 'bg-transparent'} rounded-comfortable flex min-h-14 cursor-pointer flex-col justify-center border-0 px-2.5 py-1.5 text-left text-white`}
            >
              <span className="text-sm font-bold">{c.title}</span>
              <span className="text-subdued text-xs">
                {c.artist} · {c.bpm} BPM · {c.tuningName} · {c.chunks} chunks
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

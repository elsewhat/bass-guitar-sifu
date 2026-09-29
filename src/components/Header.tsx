import { openLibrary } from '../practice/engine';
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
        <SongsButton />
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

/** Opens the song library overlay (system description §4); Ctrl K / Cmd K does the same. */
function SongsButton() {
  const open = useSession((s) => s.libraryOpen);
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-keyshortcuts="Control+K Meta+K"
      onClick={() => openLibrary(true)}
      className={`${open ? 'bg-card' : 'bg-elevated'} flex h-10 cursor-pointer items-center gap-2 rounded-full border-0 pr-2 pl-3.5 text-sm font-bold text-white shadow-[inset_0_0_0_1px_#7c7c7c]`}
    >
      <Icon name="search" size={18} />
      Songs
      <span className="bg-card text-subdued rounded-subtle px-1.5 py-1 text-[11px] leading-none font-bold">Ctrl K</span>
    </button>
  );
}

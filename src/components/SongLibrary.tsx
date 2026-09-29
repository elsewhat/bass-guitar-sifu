import { useEffect, useMemo, useRef, useState } from 'react';
import type { CatalogEntry } from '../core/model';
import { openLibrary, pickSong } from '../practice/engine';
import { artistChips, cardMeta, cardProgress, cardTuning, countText, filterSongs, type SongProgress } from '../practice/library';
import { useSession } from '../state/session';
import { loadProgress } from '../state/storage';
import { Icon } from './icons';

// Song library overlay (system description §4, design/artboards/SelectorOverlay.dc.html): search,
// artist chips and a grid of song cards with progress. Ctrl K / Cmd K opens it; the backdrop, the
// close button and Esc close it; choosing a card loads the song.

const chip = (on: boolean) =>
  `${on ? 'bg-white text-black' : 'bg-card text-white'} h-8 cursor-pointer rounded-full border-0 px-3.5 text-sm leading-none font-bold whitespace-nowrap`;

export function SongLibrary() {
  const open = useSession((s) => s.libraryOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        openLibrary(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return open ? <LibraryDialog /> : null;
}

function LibraryDialog() {
  const catalog = useSession((s) => s.catalog);
  const current = useSession((s) => s.song?.slug);
  const chunkIndex = useSession((s) => s.chunkIndex);
  const done = useSession((s) => s.done);
  const [query, setQuery] = useState('');
  const [artist, setArtist] = useState<string | null>(null);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    search.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && openLibrary(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Stored progress of the other songs, read once per opening; the current song's is live.
  const stored = useMemo(() => new Map(catalog.map((c) => [c.slug, loadProgress(c.slug, c.chunks)])), [catalog]);
  const progressOf = (c: CatalogEntry): SongProgress | null => {
    if (c.slug === current) return { chunkIndex, done: Object.keys(done).length };
    const p = stored.get(c.slug);
    return p ? { chunkIndex: p.chunkIndex, done: Object.keys(p.done).length } : null;
  };

  const chips = artistChips(catalog);
  const visible = filterSongs(catalog, query, artist);

  return (
    <div className="absolute inset-0 z-30 bg-black/70">
      <button type="button" aria-label="Close song library" tabIndex={-1} onClick={() => openLibrary(false)} className="absolute inset-0 cursor-default border-0 bg-transparent p-0" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Song library"
        className="bg-elevated absolute top-[110px] left-[240px] box-border flex h-[640px] w-[960px] flex-col gap-3.5 rounded-[20px] p-5 shadow-heavy"
      >
        <div className="flex items-center gap-3">
          <input
            ref={search}
            type="search"
            aria-label="Search songs"
            placeholder="Search title or artist"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-page placeholder:text-subdued box-border h-12 grow rounded-full border-0 px-5 text-base text-white shadow-[0_1px_0_#121212,inset_0_0_0_1px_#7c7c7c] outline-none"
          />
          <button
            type="button"
            aria-label="Close"
            onClick={() => openLibrary(false)}
            className="bg-card flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 p-0 text-white"
          >
            <Icon name="close" />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button type="button" aria-pressed={!artist} onClick={() => setArtist(null)} className={chip(!artist)}>
            All
          </button>
          <span aria-hidden="true" className="mx-1.5 h-5 w-px bg-[#4d4d4d]" />
          {chips.map((c) => (
            <button
              key={c.artist}
              type="button"
              aria-pressed={artist === c.artist}
              onClick={() => setArtist(artist === c.artist ? null : c.artist)}
              className={chip(artist === c.artist)}
            >
              {c.label}
            </button>
          ))}
          <span className="grow" />
          <span className="text-subdued text-xs leading-[1.4]" aria-live="polite">
            {countText(visible.length, catalog.length)}
          </span>
        </div>

        <div className="grid min-h-0 grow auto-rows-[148px] grid-cols-3 content-start gap-3 overflow-y-auto [scrollbar-color:#4d4d4d_transparent] [scrollbar-width:thin]">
          {visible.map((c) => (
            <SongCard key={c.slug} song={c} current={c.slug === current} progress={progressOf(c)} />
          ))}
          {visible.length === 0 && <p className="text-subdued col-span-3 m-0 py-10 text-center text-sm">No songs match “{query.trim()}”.</p>}
        </div>
      </div>
    </div>
  );
}

function SongCard({ song, current, progress }: { song: CatalogEntry; current: boolean; progress: SongProgress | null }) {
  const tuning = cardTuning(song);
  const p = cardProgress(song.chunks, progress, current);
  return (
    <button
      type="button"
      aria-current={current ? 'true' : undefined}
      onClick={() => pickSong(song.slug)}
      className={`${current ? 'bg-card shadow-[inset_0_0_0_2px_#1ed760]' : 'bg-surface hover:bg-elevated'} rounded-comfortable relative flex min-w-0 cursor-pointer flex-col items-stretch gap-1 border-0 p-3.5 text-left text-white`}
    >
      <span className="truncate text-base leading-[1.4] font-bold">{song.title}</span>
      <span className="text-subdued truncate text-sm leading-[1.4]">{song.artist}</span>
      <span className="text-subdued text-xs leading-[1.4]">{cardMeta(song)}</span>
      <span className="mt-0.5 flex items-center gap-1.5">
        <span className={`bg-page rounded-[2px] px-1.5 py-0.5 text-[10.5px] leading-[1.33] font-semibold ${tuning.alt ? 'text-[#ffa42b]' : 'text-subdued'}`}>
          {tuning.name}
        </span>
        <span className="text-subdued text-xs leading-[1.4]">{tuning.strings}</span>
      </span>
      <span className="grow" />
      <span className="flex items-center gap-2">
        <span className="relative h-1 grow overflow-hidden rounded-[2px] bg-[#4d4d4d]">
          <span className="absolute top-0 left-0 h-1 bg-white" style={{ width: `${p.pct}%` }} />
        </span>
        <span className={`text-xs leading-[1.4] whitespace-nowrap ${p.started ? 'text-white' : 'text-subdued'}`}>{p.text}</span>
      </span>
    </button>
  );
}

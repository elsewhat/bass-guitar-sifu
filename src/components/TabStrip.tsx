import { useEffect, useRef, useState } from 'react';
import { useFrame } from '../playback/frame';
import { useSession } from '../state/session';
import { PLAYHEAD_HALF_WIDTH, PLAYHEAD_X } from '../strip/scroll';
import type { Strip } from '../strip/strip';

// Notation and tab strip panel (1408 × 276, design/artboards/TabStrip.dc.html). The Strip class
// and alphaTab are loaded lazily when the practice view opens (ADR-0017).

export function TabStrip() {
  const song = useSession((s) => s.song);
  const host = useRef<HTMLDivElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const strip = useRef<Strip | null>(null);
  const [status, setStatus] = useState<{ ready: boolean; error?: string }>({ ready: false });

  useEffect(() => {
    let cancelled = false;
    let instance: Strip | null = null;
    void import('../strip/strip').then(({ Strip }) => {
      if (cancelled) return;
      instance = new Strip(host.current!, gutter.current!, (ready, error) => setStatus({ ready, error }));
      strip.current = instance;
      const { song: current, chunkIndex, pass, passes } = useSession.getState();
      instance.setLoop({ chunkIndex, pass, passes });
      if (current) void instance.load(current).catch((e: unknown) => setStatus({ ready: false, error: String(e) }));
    });
    // Loop bracket and label follow the chunk and pass.
    const unsubscribe = useSession.subscribe((s, prev) => {
      if (s.chunkIndex !== prev.chunkIndex || s.pass !== prev.pass || s.passes !== prev.passes) {
        strip.current?.setLoop({ chunkIndex: s.chunkIndex, pass: s.pass, passes: s.passes });
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
      instance?.destroy();
      strip.current = null;
    };
  }, []);

  useEffect(() => {
    if (song && strip.current) void strip.current.load(song).catch((e: unknown) => setStatus({ ready: false, error: String(e) }));
  }, [song]);

  useFrame((tick) => strip.current?.update(tick));

  return (
    <section aria-label="Notation and tab" className="bg-surface rounded-comfortable relative col-span-2 overflow-hidden">
      <div className="absolute top-0 left-[72px] h-[276px] w-[1336px] overflow-hidden">
        {/* alphaTab only renders into a sized container; the horizontal layout overflows it. */}
        <div ref={host} data-testid="strip-host" className="absolute top-0 left-0 w-[1336px] origin-top-left will-change-transform" />
        <div
          data-testid="playhead"
          className="pointer-events-none absolute top-6 box-border h-[212px] border-x border-white/35 bg-white/7"
          style={{ left: PLAYHEAD_X - PLAYHEAD_HALF_WIDTH, width: 2 * PLAYHEAD_HALF_WIDTH }}
        />
      </div>
      <div ref={gutter} className="strip-gutter" />
      {!status.ready && (
        <div className="text-subdued absolute inset-0 left-[72px] flex items-center justify-center text-sm font-bold">
          {status.error ?? 'Loading notation…'}
        </div>
      )}
    </section>
  );
}

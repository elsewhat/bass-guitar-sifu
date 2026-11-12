import { useEffect } from 'react';
import { GAP, PAGE_PAD, RAIL_W, ROWS, videoWidth } from '../layout';
import { initialSlug, loadCatalog, loadSong, probeCountSamples } from '../practice/engine';
import { useSession } from '../state/session';
import { FingeringColumn } from './FingeringColumn';
import { Header } from './Header';
import { Mixer } from './Mixer';
import { PracticePlan } from './PracticePlan';
import { SongLibrary } from './SongLibrary';
import { useStageWidth } from './Stage';
import { TabStrip } from './TabStrip';
import { TransportBar } from './TransportBar';
import { useTransportKeys } from './useTransportKeys';
import { VideoCell } from './VideoCell';

// Practice view (system description §3), sizes from design/artboards/Main.dc.html. On a stage
// wider than the design's 1440 px (ADR-0037) the video cell widens to 16:9, then the fingering column.

export function PracticeView() {
  const planOpen = useSession((s) => s.planOpen);
  const railW = planOpen ? RAIL_W.open : RAIL_W.collapsed;
  const videoW = videoWidth(useStageWidth(), planOpen);
  useTransportKeys();

  useEffect(() => {
    probeCountSamples();
    void loadCatalog().then(() => {
      const slug = initialSlug(useSession.getState().catalog);
      if (slug && useSession.getState().song?.slug !== slug) void loadSong(slug);
    });
  }, []);

  return (
    <main
      className="bg-page relative box-border grid size-full text-white"
      style={{
        padding: PAGE_PAD,
        gap: GAP,
        gridTemplateRows: `${ROWS.header}px ${ROWS.video}px ${ROWS.transport}px ${ROWS.strip}px`,
        gridTemplateColumns: `${railW}px minmax(0, 1fr)`,
      }}
    >
      <Header />
      <PracticePlan />
      <div
        className="row-span-2 grid min-h-0 min-w-0"
        style={{
          gap: GAP,
          gridTemplateColumns: `${videoW}px minmax(0, 1fr)`,
          gridTemplateRows: `${ROWS.video}px ${ROWS.transport}px`,
        }}
      >
        <VideoCell />
        <FingeringColumn />
        <TransportBar />
      </div>
      <TabStrip />
      <Mixer />
      <SongLibrary />
    </main>
  );
}

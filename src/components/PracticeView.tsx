import { GAP, PAGE_PAD, RAIL_W, ROWS, VIDEO_W } from '../layout';
import { SOURCES, useSession } from '../state/session';
import { Icon } from './icons';

// Empty practice layout (milestone 1). Panels are placeholders until the song data and
// clock exist; sizes follow design/artboards/Main.dc.html.

const panel = 'bg-surface rounded-comfortable min-h-0 min-w-0';
const overlayChip = 'bg-[rgba(18,18,18,0.85)] text-white';

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen();
}

function Header() {
  return (
    <header
      className={`${panel} col-span-2 grid items-center gap-x-8 px-4 py-3`}
      style={{ gridTemplateColumns: '380px minmax(0, 1fr) auto' }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="bg-card text-subdued flex size-16 shrink-0 items-center justify-center rounded-standard">
          <Icon name="music" size={28} />
        </div>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="m-0 truncate text-2xl leading-tight font-bold">No song loaded</h1>
          <div className="text-subdued text-sm">Choose a song from the library</div>
        </div>
      </div>
      {/* Lyrics block stays empty without a licensed provider (ADR-0011). */}
      <div aria-hidden="true" />
      <button
        type="button"
        className="bg-elevated flex h-10 cursor-pointer items-center gap-2 rounded-full border-0 px-4 text-sm font-bold text-white"
      >
        <Icon name="music" size={18} />
        Songs
        <span className="text-subdued text-xs font-semibold">Ctrl K</span>
      </button>
    </header>
  );
}

function PracticePlan() {
  const { planOpen, togglePlan } = useSession();
  return (
    <nav aria-label="Practice plan" className={`${panel} row-span-2 flex flex-col gap-2 overflow-hidden p-3`}>
      <div className={`flex h-8 items-center ${planOpen ? 'justify-between pl-1' : 'justify-center'}`}>
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
    </nav>
  );
}

function VideoCell() {
  const { source, setSource } = useSession();
  return (
    <section aria-label="Video" className="rounded-comfortable relative overflow-hidden bg-black">
      <div className="text-subdued absolute inset-0 flex flex-col items-center justify-center gap-2.5">
        <div className="flex size-18 items-center justify-center rounded-full bg-white/8 text-white">
          <Icon name="play" size={32} />
        </div>
      </div>
      <div className={`${overlayChip} absolute top-3 left-3 flex gap-1 rounded-full p-1`}>
        {SOURCES.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={source === s.id}
            onClick={() => setSource(s.id)}
            className={`h-8 cursor-pointer rounded-full border-0 px-3.5 text-sm leading-none font-bold ${
              source === s.id ? 'bg-white text-black' : 'text-subdued bg-transparent'
            }`}
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
    </section>
  );
}

function TransportBar() {
  return (
    <div aria-label="Transport" className={`${panel} flex items-center gap-3 px-3`}>
      <button
        type="button"
        aria-label="Play"
        className="bg-accent text-on-accent flex size-12 cursor-pointer items-center justify-center rounded-full border-0"
      >
        <Icon name="play" size={28} />
      </button>
    </div>
  );
}

function FingeringColumn() {
  return (
    <section aria-label="Visual metronome and fingering" className="row-span-2 flex min-w-0 flex-col gap-3">
      <div className={`${panel} grow`} aria-label="Fretboard" />
      <div className="grid h-[230px] shrink-0 grid-cols-2 gap-3">
        {['Now', 'Next'].map((label) => (
          <div key={label} className="bg-card rounded-comfortable relative overflow-hidden">
            <div className="text-subdued absolute top-2.5 left-3.5 text-sm font-bold">{label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function TabStripPanel() {
  return <section aria-label="Notation and tab" className={`${panel} col-span-2`} />;
}

export function PracticeView() {
  const planOpen = useSession((s) => s.planOpen);
  const railW = planOpen ? RAIL_W.open : RAIL_W.collapsed;
  const videoW = planOpen ? VIDEO_W.open : VIDEO_W.collapsed;

  return (
    <main
      className="bg-page grid size-full box-border text-white"
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
      <TabStripPanel />
    </main>
  );
}

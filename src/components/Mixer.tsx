import { useEffect, useRef, useState } from 'react';
import { activeQuickMix, QUICK_MIXES, trackLabel, trackSilenced, volumeText, type Channel } from '../playback/mixer';
import { openMixer, setChannel, setQuickMix, setTrack } from '../practice/engine';
import { SOURCES, useSession, type SourceId } from '../state/session';
import { Icon } from './icons';

// Mixer modal (ADR-0020, system description §5.5, design/artboards/MixerOverlay.dc.html): master,
// source tabs and one row per channel. Closes on the backdrop, the close button and Esc.

const ROW_GRID = 'grid grid-cols-[minmax(0,1fr)_36px_36px_220px_52px] items-center gap-x-2.5 rounded-comfortable bg-surface';
const roundButton = 'flex size-9 cursor-pointer items-center justify-center rounded-full border-0 p-0 disabled:cursor-default';
const pill = (selected: boolean) => (selected ? 'bg-white text-black' : 'bg-card text-white');

interface RowProps {
  label: string; // for the button and slider names
  name: string;
  description: string;
  channel: Channel;
  onChange: (patch: Partial<Channel>) => void;
  silenced?: boolean; // muted or off by solo
  solo?: { on: boolean; toggle: () => void };
  yours?: boolean;
  disabled?: boolean;
  master?: boolean;
}

function ChannelRow({ label, name, description, channel, onChange, silenced = channel.muted, solo, yours, disabled, master }: RowProps) {
  const muteLabel = `${channel.muted ? 'Unmute' : 'Mute'} ${label}`;
  const dim = silenced || disabled;
  return (
    <div className={`${ROW_GRID} ${master ? 'px-3.5 py-2.5' : 'px-3.5 py-2'} ${disabled ? 'opacity-50' : ''}`} data-testid={`channel-${label}`}>
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0">
          <span className={`block truncate leading-[1.4] font-bold ${master ? 'text-base' : 'text-sm'}`}>{name}</span>
          <span className="text-subdued block truncate text-xs leading-[1.4]">{description}</span>
        </span>
        {yours && <span className="bg-page rounded-[2px] px-1.5 py-0.5 text-[10.5px] leading-[1.33] font-semibold whitespace-nowrap">Your part</span>}
      </span>
      <button
        type="button"
        aria-label={muteLabel}
        title={muteLabel}
        aria-pressed={channel.muted}
        disabled={disabled}
        onClick={() => onChange({ muted: !channel.muted })}
        className={`${roundButton} ${channel.muted ? 'bg-white text-black' : 'bg-card text-white'}`}
      >
        <Icon name={channel.muted ? 'volumeOff' : 'volumeUp'} size={18} />
      </button>
      {solo ? (
        <button
          type="button"
          aria-label={`${solo.on ? 'Unsolo' : 'Solo'} ${label}`}
          title={`${solo.on ? 'Unsolo' : 'Solo'} ${label}`}
          aria-pressed={solo.on}
          onClick={solo.toggle}
          className={`${roundButton} text-[13px] leading-none font-extrabold ${solo.on ? 'bg-accent text-on-accent' : 'bg-card text-white'}`}
        >
          S
        </button>
      ) : (
        <span />
      )}
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        aria-label={`${label} volume`}
        value={channel.volume}
        disabled={disabled}
        onChange={(e) => onChange({ volume: Number(e.target.value) })}
        className="m-0 w-[220px] accent-white"
        style={{ opacity: dim ? 0.35 : 1 }}
      />
      <span className={`text-right text-sm leading-none font-bold ${dim ? 'text-[#7c7c7c]' : 'text-white'}`}>
        {disabled ? '–' : volumeText(channel, silenced)}
      </span>
    </div>
  );
}

export function Mixer() {
  const open = useSession((s) => s.mixerOpen);
  return open ? <MixerDialog /> : null;
}

function MixerDialog() {
  const source = useSession((s) => s.source);
  const mixer = useSession((s) => s.mixer);
  const song = useSession((s) => s.song);
  const tracks = useSession((s) => s.synthTracks);
  const voiceSamples = useSession((s) => s.voiceSamples);
  const [tab, setTab] = useState<SourceId>(source); // the active source's tab on open
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && openMixer(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const bassIndex = song?.track.index ?? -1;
  const quick = activeQuickMix(tracks, bassIndex);
  const labels = (song?.tracks ?? []).map(trackLabel);
  // Button names must be unique: two "Rhythm Guitar" tracks get their description added.
  const accessibleName = (i: number) => {
    const { title, description } = labels[i]!;
    return labels.filter((l) => l.title === title).length > 1 ? `${title} (${description})` : title;
  };

  return (
    <div className="absolute inset-0 z-30 bg-black/70">
      <button type="button" aria-label="Close mixer" tabIndex={-1} onClick={() => openMixer(false)} className="absolute inset-0 cursor-default border-0 bg-transparent p-0" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Mixer"
        className="bg-elevated absolute top-24 left-[380px] box-border flex w-[680px] flex-col gap-3.5 rounded-[20px] p-5 shadow-heavy"
      >
        <div className="flex items-center gap-2.5">
          <Icon name="equalizer" size={22} />
          <span className="text-lg leading-[1.3] font-semibold">Mixer</span>
          <span className="grow" />
          <button
            ref={closeButton}
            type="button"
            aria-label="Close"
            onClick={() => openMixer(false)}
            className="bg-card flex size-10 cursor-pointer items-center justify-center rounded-full border-0 p-0 text-white"
          >
            <Icon name="close" />
          </button>
        </div>

        <ChannelRow master label="master" name="Master" description="All sources" channel={mixer.master} onChange={(p) => setChannel('master', p)} />

        <div className="flex items-center gap-1.5">
          <div role="tablist" aria-label="Source" className="flex gap-1.5">
            {SOURCES.map((s) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={tab === s.id}
                onClick={() => setTab(s.id)}
                className={`${pill(tab === s.id)} flex h-8 cursor-pointer items-center gap-2 rounded-full border-0 px-3.5 text-sm leading-none font-bold`}
              >
                {s.id === source && <span title="Current source" className="bg-accent size-2 rounded-full" />}
                {s.label}
              </button>
            ))}
          </div>
          <span className="grow" />
          {tab === 'synth' && (
            <>
              <span className="text-subdued mr-0.5 text-xs leading-[1.4]">Quick mix</span>
              {QUICK_MIXES.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  aria-pressed={quick === q.id}
                  onClick={() => setQuickMix(q.id)}
                  className={`${pill(quick === q.id)} h-7 cursor-pointer rounded-full border-0 px-3 text-xs leading-none font-bold`}
                >
                  {q.label}
                </button>
              ))}
            </>
          )}
        </div>

        <div role="tabpanel" className="flex max-h-[480px] flex-col gap-1.5 overflow-y-auto">
          {tab === 'youtube' && (
            <ChannelRow label="video" name="Video" description="YouTube player" channel={mixer.video} onChange={(p) => setChannel('video', p)} />
          )}
          {tab === 'music' && (
            <ChannelRow
              label="music"
              name="Music"
              description={song?.media.music ? 'Rendered from the score · the whole band' : 'No audio for this song'}
              channel={mixer.music}
              disabled={!song?.media.music}
              onChange={(p) => setChannel('music', p)}
            />
          )}
          {tab === 'count' && (
            <>
              <ChannelRow label="click" name="Click" description="Tone on every count, accent on beat 1" channel={mixer.click} onChange={(p) => setChannel('click', p)} />
              <ChannelRow
                label="voice"
                name="Voice"
                description={voiceSamples === false ? 'No samples' : 'Spoken one, and, two, and …'}
                channel={mixer.voice}
                disabled={voiceSamples === false}
                onChange={(p) => setChannel('voice', p)}
              />
            </>
          )}
          {tab === 'synth' &&
            song?.tracks.map((trackName, i) => {
              const t = tracks[i];
              if (!t) return null;
              const { title, description } = labels[i]!;
              return (
                <ChannelRow
                  key={`${i}:${trackName}`}
                  label={accessibleName(i)}
                  name={title}
                  description={description}
                  channel={t}
                  silenced={trackSilenced(tracks, i)}
                  solo={{ on: t.solo, toggle: () => setTrack(i, { solo: !t.solo }) }}
                  yours={i === bassIndex}
                  onChange={(p) => setTrack(i, p)}
                />
              );
            })}
        </div>
      </div>
    </div>
  );
}

// ADR-0017 spike: alphaTab horizontal layout + smooth scroll + string-coloured overlay circles.
// Evaluates: look vs TabStrip artboard, scroll steadiness, overlay alignment, chunk loop + speed.
import * as alphaTab from '@coderline/alphatab';
import type { SongData } from '../core/model';
import { colourNotes, fetchScore, STRING_FILL, STRING_TEXT } from '../strip/alphatab-score';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const base = import.meta.env.BASE_URL;
const status = $('status');
const scroller = $('scroller');
const host = $('at');

const { Color } = alphaTab.model;
const settings = new alphaTab.Settings();
settings.core.fontDirectory = `${base}font/`;
settings.core.includeNoteBounds = true;
settings.display.layoutMode = alphaTab.LayoutMode.Horizontal;
settings.display.staveProfile = alphaTab.StaveProfile.ScoreTab;
settings.display.padding = [8, 8, 8, 8];
const res = settings.display.resources;
res.staffLineColor = Color.fromJson('#7c7c7c')!;
res.barSeparatorColor = Color.fromJson('#cbcbcb')!;
res.mainGlyphColor = Color.fromJson('#ffffff')!;
res.secondaryGlyphColor = Color.fromJson('#b3b3b3')!;
res.barNumberColor = Color.fromJson('#b3b3b3')!;
res.scoreInfoColor = Color.fromJson('#ffffff')!;
// Design: notation staff space 9 px (alphaTab default), tab lines 20 px apart (default 13.5).
res.engravingSettings.tabLineSpacing = 20;
for (const el of [
  alphaTab.NotationElement.ScoreTitle,
  alphaTab.NotationElement.ScoreSubTitle,
  alphaTab.NotationElement.ScoreArtist,
  alphaTab.NotationElement.ScoreAlbum,
  alphaTab.NotationElement.ScoreWords,
  alphaTab.NotationElement.ScoreMusic,
  alphaTab.NotationElement.ScoreWordsAndMusic,
  alphaTab.NotationElement.ScoreCopyright,
  alphaTab.NotationElement.GuitarTuning,
  alphaTab.NotationElement.TrackNames,
  alphaTab.NotationElement.EffectTempo,
  // Effect bands push the tab staff out of the 276 px strip; the app draws its own labels.
  alphaTab.NotationElement.EffectMarker,
  alphaTab.NotationElement.EffectText,
  alphaTab.NotationElement.EffectHammerOnPullOffText,
  alphaTab.NotationElement.EffectSlideText,
  alphaTab.NotationElement.EffectPalmMute,
  alphaTab.NotationElement.EffectLetRing,
  alphaTab.NotationElement.EffectDynamics,
  alphaTab.NotationElement.EffectTripletFeel,
  alphaTab.NotationElement.EffectCapo,
  alphaTab.NotationElement.EffectChordNames,
]) {
  settings.notation.elements.set(el, false);
}
settings.player.playerMode = alphaTab.PlayerMode.EnabledSynthesizer;
settings.player.soundFont = `${base}soundfont/sonivox.sf2`;
settings.player.scrollElement = scroller;
settings.player.scrollMode = alphaTab.ScrollMode.Smooth;
settings.player.enableCursor = true;

const api = new alphaTab.AlphaTabApi(host, settings);
let song: SongData;
let overlay: SVGSVGElement | null = null;

async function loadSong(slug: string) {
  song = (await (await fetch(`${base}data/songs/${slug}.json`)).json()) as SongData;
  const score = await fetchScore(song, api.settings);
  colourNotes(score.tracks[song.track.index]!, (s) => STRING_TEXT[s]!);
  $<HTMLSelectElement>('chunk').innerHTML = song.chunks.map((c, i) => `<option value="${i}">${c.name} · ${c.bars[0]}–${c.bars[1]}</option>`).join('');
  api.renderScore(score, [song.track.index]);
}

function setChunk() {
  const chunk = song.chunks[Number($<HTMLSelectElement>('chunk').value)]!;
  const first = song.bars[chunk.bars[0] - 1]!;
  const last = song.bars[chunk.bars[1] - 1]!;
  api.playbackRange = { startTick: first.startTick, endTick: last.startTick + last.durTicks };
  api.isLooping = true;
  api.tickPosition = first.startTick;
}

// Overlay: one circle per tab note, placed from alphaTab's bounds lookup.
function drawOverlay() {
  overlay?.remove();
  const lookup = api.renderer.boundsLookup;
  if (!lookup) return;
  const svgNs = 'http://www.w3.org/2000/svg';
  overlay = document.createElementNS(svgNs, 'svg');
  overlay.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;overflow:visible';
  overlay.setAttribute('width', String(host.scrollWidth));
  overlay.setAttribute('height', String(host.scrollHeight));
  const debug = $<HTMLInputElement>('debug').checked;
  const circles = $<HTMLInputElement>('circles').checked;
  let count = 0;
  const probe: string[] = [];
  // Each partial render adds a copy of the (single) horizontal system: dedupe by bar.
  const seen = new Set<number>();
  for (const system of lookup.staffSystems) {
    for (const mb of system.bars) {
      if (seen.has(mb.index)) continue;
      seen.add(mb.index);
      // With the ScoreTab profile each master bar has two BarBounds: [0] notation, [1] tab.
      // (Bounds come back from the render worker without their Bar references.)
      mb.bars.forEach((bar, staff) => {
        if (mb.index === song.stats.firstBar - 1) {
          probe.push(`bar ${mb.index + 1} staff ${staff}: y=${bar.visualBounds.y.toFixed(1)} h=${bar.visualBounds.h.toFixed(1)}`);
        }
        for (const beat of bar.beats) {
          for (const nb of beat.notes ?? []) {
            const b = nb.noteHeadBounds;
            count++;
            if (debug) {
              const r = document.createElementNS(svgNs, 'rect');
              r.setAttribute('x', String(b.x));
              r.setAttribute('y', String(b.y));
              r.setAttribute('width', String(b.w));
              r.setAttribute('height', String(b.h));
              r.setAttribute('fill', 'none');
              r.setAttribute('stroke', staff === 0 ? '#539df5' : '#f3727f');
              overlay!.appendChild(r);
            }
            if (circles && staff === 1) {
              const c = document.createElementNS(svgNs, 'circle');
              c.setAttribute('cx', String(b.x + b.w / 2));
              c.setAttribute('cy', String(b.y + b.h / 2));
              c.setAttribute('r', '10');
              c.setAttribute('fill', STRING_FILL[nb.note.string - 1]!);
              overlay!.insertBefore(c, overlay!.firstChild);
            }
          }
        }
      });
    }
  }
  // Circles must sit under the fret numbers: put the overlay behind alphaTab's surface.
  const surface = host.querySelector('.at-surface');
  if (surface) {
    surface.parentElement!.insertBefore(overlay, surface);
    (surface as HTMLElement).style.position = 'relative';
  } else {
    host.appendChild(overlay);
  }
  report(`rendered: ${count} note bounds · ${lookup.staffSystems.length} systems\n${probe.join('\n')}`);
}

let lastReport = '';
function report(msg: string) {
  lastReport = msg;
}

// Steadiness: x of the beat cursor relative to the scroller, sampled every frame while playing.
const samples: number[] = [];
function sample() {
  const cursor = host.querySelector<HTMLElement>('.at-cursor-beat');
  if (cursor && api.playerState === alphaTab.synth.PlayerState.Playing) {
    samples.push(cursor.getBoundingClientRect().left - scroller.getBoundingClientRect().left);
    if (samples.length > 240) samples.shift();
  }
  const mean = samples.reduce((a, b) => a + b, 0) / (samples.length || 1);
  const sd = Math.sqrt(samples.reduce((a, b) => a + (b - mean) ** 2, 0) / (samples.length || 1));
  status.textContent = `${lastReport}\ntick ${api.tickPosition} · speed ${api.playbackSpeed} · state ${api.playerState}\ncursor x: mean ${mean.toFixed(1)} px, sd ${sd.toFixed(2)} px over ${samples.length} frames`;
  requestAnimationFrame(sample);
}
requestAnimationFrame(sample);

api.postRenderFinished.on(() => {
  drawOverlay();
  setChunk();
});
api.playerReady.on(() => report(`${lastReport}\nplayer ready`));
api.error.on((e) => (status.textContent = `error: ${String(e)}`));

$('song').addEventListener('change', (e) => void loadSong((e.target as HTMLSelectElement).value));
$('chunk').addEventListener('change', setChunk);
$('speed').addEventListener('change', (e) => (api.playbackSpeed = Number((e.target as HTMLSelectElement).value)));
$('play').addEventListener('click', () => api.playPause());
$('debug').addEventListener('change', drawOverlay);
$('circles').addEventListener('change', drawOverlay);
api.playbackSpeed = 0.75;

void loadSong('vortex-surfer');
// Exposed for inspection from the browser console / automation.
Object.assign(window, { api });

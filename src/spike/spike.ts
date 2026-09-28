// ADR-0017 spike (accepted 2026-09-28): alphaTab engraves the notation and tab and plays the
// synth; everything that moves or highlights is ours:
// - our own clock (alphaTab position events, extrapolated per animation frame),
// - our own scroll: the beat-to-beat mapping averaged over a 2-beat window (the owner's choice
//   from the "Scroll" selector), with the playhead band fixed at 180 px,
// - overlays from alphaTab's bounds lookup: string circles, current-note ring, loop bracket +
//   label, dimming outside the loop, next-chunk label, re-tab labels,
// - a fixed gutter with clef, time signature, TAB and coloured string badges.
// Kept as the reference implementation until the practice view's strip replaces it.
import * as alphaTab from '@coderline/alphatab';
import type { BeatEvent, SongData } from '../core/model';
import { bpmAt } from '../core/timing';
import { stringNames } from '../core/tuning';
import { colourNotes, fetchScore, STRING_FILL, STRING_TEXT } from '../strip/alphatab-score';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const base = import.meta.env.BASE_URL;
const host = $('at');
const gutter = $('gutter');
const status = $('status');
const SVG = 'http://www.w3.org/2000/svg';
const PLAYHEAD_X = 180; // centre of the playhead band inside the clip area
const STRIP_H = 276;
const PASSES = 3;

// ---------------------------------------------------------------- alphaTab setup
const { Color } = alphaTab.model;
const settings = new alphaTab.Settings();
settings.core.fontDirectory = `${base}font/`;
settings.core.includeNoteBounds = true;
settings.display.layoutMode = alphaTab.LayoutMode.Horizontal;
settings.display.staveProfile = alphaTab.StaveProfile.ScoreTab;
settings.display.padding = [8, 28, 8, 8]; // room for the loop bracket above the bar numbers
const res = settings.display.resources;
res.staffLineColor = Color.fromJson('#7c7c7c')!;
res.barSeparatorColor = Color.fromJson('#cbcbcb')!;
res.mainGlyphColor = Color.fromJson('#ffffff')!;
res.secondaryGlyphColor = Color.fromJson('#b3b3b3')!;
res.barNumberColor = Color.fromJson('#b3b3b3')!;
res.scoreInfoColor = Color.fromJson('#ffffff')!;
res.engravingSettings.tabLineSpacing = 20; // design: tab lines 20 px apart
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
settings.player.scrollMode = alphaTab.ScrollMode.Off; // we scroll
settings.player.enableCursor = false; // we draw the playhead
settings.player.enableElementHighlighting = false;

const api = new alphaTab.AlphaTabApi(host, settings);

// ---------------------------------------------------------------- state
let song: SongData;
let plucks: BeatEvent[] = []; // note events in time order (incl. tie continuations)
let chunkIndex = 0;
let pass = 1;
let scale = 1;
let offsetY = 0;

interface NoteBox {
  x: number;
  y: number;
  w: number;
  h: number;
  string: number;
}
interface Layout {
  anchors: { tick: number; x: number }[]; // bar downbeats (and the end of the last bar)
  beatAnchors: { tick: number; x: number }[]; // every beat onset (and the end of the last bar)
  barX: Map<number, { x: number; right: number }>; // bar number → real bounds
  notation: Map<string, NoteBox[]>; // "bar:tick" → note heads
  tab: Map<string, NoteBox[]>; // "bar:tick" → fret number boxes
  notationTop: number;
  tabTop: number;
  height: number;
}
let layout: Layout | null = null;
let back: SVGSVGElement | null = null; // behind alphaTab's surface: string circles, current ring
let front: SVGSVGElement | null = null; // above: dimming, labels, loop bracket, notation highlight
let currentGroup: SVGGElement | null = null;
let currentEventId = -1;

// ---------------------------------------------------------------- clock
// alphaTab reports the synth position a few times per second; we extrapolate every frame with
// the tempo map and playback speed and correct softly, so motion stays continuous.
const clock = { tick: 0, time: 0, lastEventTick: 0, playing: false };

function rate(tick: number) {
  return (bpmAt(tick, song.tempoMap, song.bars) / 60) * 960 * api.playbackSpeed; // ticks per second
}

function predictTick(now: number) {
  if (!clock.playing) return clock.tick;
  const t = clock.tick + ((now - clock.time) / 1000) * rate(clock.tick);
  const range = api.playbackRange;
  return range ? Math.min(t, range.endTick - 1) : t;
}

function snap(tick: number, now = performance.now()) {
  clock.tick = tick;
  clock.time = now;
}

api.playerPositionChanged.on((e) => {
  const now = performance.now();
  const tick = e.currentTick;
  if (e.isSeek || !clock.playing) {
    snap(tick, now);
  } else if (tick < clock.lastEventTick - 960) {
    snap(tick, now);
    passCompleted();
  } else {
    const predicted = predictTick(now);
    const error = tick - predicted;
    if (Math.abs(error) > 960) snap(tick, now);
    else snap(predicted + error * 0.2, now);
  }
  clock.lastEventTick = tick;
});

api.playerStateChanged.on((e) => {
  clock.playing = e.state === alphaTab.synth.PlayerState.Playing;
  snap(api.tickPosition);
});

// ---------------------------------------------------------------- song + chunk
async function loadSong(slug: string) {
  layout = null;
  song = (await (await fetch(`${base}data/songs/${slug}.json`)).json()) as SongData;
  plucks = song.events.filter((e) => e.kind === 'note' && e.notes.some((n) => !n.dead || n.tieFromPrev));
  const score = await fetchScore(song, api.settings);
  colourNotes(score.tracks[song.track.index]!, (s) => STRING_TEXT[s]!);
  $<HTMLSelectElement>('chunk').innerHTML = song.chunks
    .map((c, i) => `<option value="${i}">${i + 1} · ${c.name} · ${c.bars[0]}–${c.bars[1]}</option>`)
    .join('');
  chunkIndex = 0;
  api.renderScore(score, [song.track.index]);
}

function chunkTicks(i: number) {
  const chunk = song.chunks[i]!;
  const first = song.bars[chunk.bars[0] - 1]!;
  const last = song.bars[chunk.bars[1] - 1]!;
  return { startTick: first.startTick, endTick: last.startTick + last.durTicks };
}

function setChunk(i: number, keepPlaying = true) {
  chunkIndex = Math.max(0, Math.min(song.chunks.length - 1, i));
  $<HTMLSelectElement>('chunk').value = String(chunkIndex);
  pass = 1;
  const range = chunkTicks(chunkIndex);
  api.playbackRange = range;
  api.isLooping = true;
  api.tickPosition = range.startTick;
  snap(range.startTick);
  clock.lastEventTick = range.startTick;
  if (!keepPlaying) api.pause();
  drawLoop();
}

function passCompleted() {
  pass++;
  if (pass > PASSES && $<HTMLInputElement>('advance').checked && chunkIndex < song.chunks.length - 1) {
    setChunk(chunkIndex + 1);
  } else {
    drawLoop();
  }
}

// ---------------------------------------------------------------- layout from alphaTab bounds
function readLayout(): Layout | null {
  const lookup = api.renderer.boundsLookup;
  if (!lookup) return null;
  const l: Layout = { anchors: [], beatAnchors: [], barX: new Map(), notation: new Map(), tab: new Map(), notationTop: 0, tabTop: 0, height: 0 };
  const seen = new Set<number>();
  // One copy of the horizontal system per partial render: dedupe by bar. With the ScoreTab
  // profile each master bar has two BarBounds, [0] notation and [1] tab. Bounds come back from
  // the render worker without their Bar references, so bars are identified by mb.index.
  const masterBars = lookup.staffSystems.flatMap((s) => s.bars).filter((mb) => !seen.has(mb.index) && seen.add(mb.index));
  masterBars.sort((a, b) => a.index - b.index);
  for (const mb of masterBars) {
    const n = mb.index + 1;
    const bar = song.bars[mb.index]!;
    l.barX.set(n, { x: mb.realBounds.x, right: mb.realBounds.x + mb.realBounds.w });
    const staffNotation = mb.bars[0]!;
    const downbeat = staffNotation.beats.find((b) => b.beat.playbackStart === 0) ?? staffNotation.beats[0];
    l.anchors.push({ tick: bar.startTick, x: downbeat ? downbeat.onNotesX : mb.realBounds.x });
    for (const b of staffNotation.beats) {
      const tick = bar.startTick + b.beat.playbackStart;
      const prev = l.beatAnchors[l.beatAnchors.length - 1];
      if (!prev || tick > prev.tick) l.beatAnchors.push({ tick, x: b.onNotesX });
    }
    if (n === song.stats.firstBar) {
      l.notationTop = staffNotation.visualBounds.y;
      l.tabTop = mb.bars[1]!.visualBounds.y;
    }
    mb.bars.forEach((staff, i) => {
      const target = i === 0 ? l.notation : l.tab;
      for (const beat of staff.beats) {
        const key = `${n}:${beat.beat.playbackStart}`;
        const boxes = (beat.notes ?? []).map((nb) => ({ ...boundsOf(nb.noteHeadBounds), string: nb.note.string - 1 }));
        if (boxes.length) target.set(key, [...(target.get(key) ?? []), ...boxes]);
      }
    });
  }
  const last = masterBars[masterBars.length - 1];
  const lastBar = song.bars[song.bars.length - 1]!;
  if (last) {
    const end = { tick: lastBar.startTick + lastBar.durTicks, x: last.realBounds.x + last.realBounds.w };
    l.anchors.push(end);
    l.beatAnchors.push(end);
  }
  l.height = host.querySelector<HTMLElement>('.at-surface')?.offsetHeight ?? 0;
  return l;
}

function boundsOf(b: { x: number; y: number; w: number; h: number }) {
  return { x: b.x, y: b.y, w: b.w, h: b.h };
}

/**
 * x of a tick for the chosen scroll mapping:
 * - note: piecewise linear between beat onsets (each note exactly on the playhead, but the strip
 *   speeds up across every barline gap, like alphaTab's own smooth scroll),
 * - bar: linear inside each bar between downbeats (constant speed, notes drift off the playhead
 *   late in the bar by up to the barline gap),
 * - smooth:<ticks>: the note mapping averaged over a window (continuous speed; the wider the
 *   window, the steadier the speed and the further notes drift from the playhead).
 */
function xAt(tick: number): number {
  const mode = $<HTMLSelectElement>('scroll').value;
  if (mode === 'bar') return interpolate(layout!.anchors, tick);
  if (mode === 'note') return interpolate(layout!.beatAnchors, tick);
  const window = Number(mode.split(':')[1] ?? 1920);
  const samples = 17;
  let sum = 0;
  for (let i = 0; i < samples; i++) sum += interpolate(layout!.beatAnchors, tick + window * (i / (samples - 1) - 0.5));
  return sum / samples;
}

function interpolate(a: { tick: number; x: number }[], tick: number): number {
  let lo = 0;
  let hi = a.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (a[mid]!.tick <= tick) lo = mid;
    else hi = mid;
  }
  const p = a[lo]!;
  const q = a[hi]!;
  return q.tick === p.tick ? p.x : p.x + ((tick - p.tick) / (q.tick - p.tick)) * (q.x - p.x);
}

// ---------------------------------------------------------------- drawing
function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  parent?.appendChild(el);
  return el;
}

function buildOverlays() {
  back?.remove();
  front?.remove();
  const surface = host.querySelector<HTMLElement>('.at-surface');
  if (!surface || !layout) return;
  surface.style.position = 'relative';
  const size = { width: surface.offsetWidth, height: surface.offsetHeight };
  const style = 'position:absolute;left:0;top:0;pointer-events:none;overflow:visible';
  back = svgEl('svg', size);
  back.style.cssText = style;
  front = svgEl('svg', size);
  front.style.cssText = `${style};z-index:2`;
  surface.parentElement!.insertBefore(back, surface);
  surface.parentElement!.appendChild(front);

  // String circles under every tab fret number (20 px).
  for (const boxes of layout.tab.values()) {
    for (const b of boxes) svgEl('circle', { cx: b.x + b.w / 2, cy: b.y + b.h / 2, r: 10, fill: STRING_FILL[b.string]! }, back);
  }
  // Re-tab labels: first re-tabbed note per bar.
  const S = stringNames(song.tuning);
  const labelled = new Set<number>();
  for (const e of song.events) {
    const n = e.notes.find((x) => x.retabFrom && !x.tieFromPrev);
    if (!n || labelled.has(e.bar)) continue;
    labelled.add(e.bar);
    const box = layout.tab.get(`${e.bar}:${e.tick}`)?.[0];
    if (!box) continue;
    const t = svgEl('text', { x: box.x - 4, y: layout.tabTop - 10, fill: '#539df5', 'font-size': 11, 'font-weight': 700, 'font-family': 'Figtree' }, front);
    t.textContent = `Retab · source ${S[n.retabFrom!.string]}${n.retabFrom!.fret}`;
  }
  svgEl('g', { id: 'loop' }, front);
  currentGroup = svgEl('g', {}, front);
  currentEventId = -1;
  drawLoop();
  drawGutter();
}

function drawLoop() {
  const g = front?.querySelector('#loop');
  if (!g || !layout || !song) return;
  g.replaceChildren();
  const chunk = song.chunks[chunkIndex]!;
  const start = layout.barX.get(chunk.bars[0])!.x;
  const end = layout.barX.get(chunk.bars[1])!.right;
  const width = Number(front!.getAttribute('width'));
  const top = 22;
  // Dim everything outside the loop.
  svgEl('rect', { x: 0, y: top, width: start, height: layout.height, fill: 'rgba(24,24,24,0.74)' }, g);
  svgEl('rect', { x: end, y: top, width: width - end, height: layout.height, fill: 'rgba(24,24,24,0.74)' }, g);
  // Bracket and label.
  svgEl('path', { d: `M${start + 1} ${top} V${top - 8} H${end - 1} V${top}`, fill: 'none', stroke: '#1ed760', 'stroke-width': 2 }, g);
  const label = `Loop · chunk ${chunkIndex + 1} · ${chunk.name} · bars ${chunk.bars[0]}–${chunk.bars[1]} · pass ${Math.min(pass, PASSES)} of ${PASSES}`;
  const bg = svgEl('rect', { x: start + 12, y: 4, height: 16, fill: '#181818' }, g);
  const t = svgEl('text', { x: start + 20, y: 16, fill: '#ffffff', 'font-size': 12, 'font-weight': 700, 'font-family': 'Figtree' }, g);
  t.textContent = label;
  bg.setAttribute('width', String(t.getComputedTextLength() + 16));
  // Next chunk preview label.
  const next = song.chunks[chunkIndex + 1];
  if (next) {
    const nt = svgEl('text', { x: end + 12, y: Math.min(layout.height - 6, 262), fill: '#b3b3b3', 'font-size': 12, 'font-weight': 700, 'font-family': 'Figtree' }, g);
    nt.textContent = `Next · chunk ${chunkIndex + 2} · ${next.name}`;
  }
}

function drawGutter() {
  if (!layout) return;
  const S = stringNames(song.tuning);
  const y = (v: number) => offsetY + v * scale;
  const parts: string[] = ['<div class="label">Bar</div>'];
  for (let i = 0; i < 5; i++) parts.push(`<div class="line" style="top:${y(layout.notationTop + i * 9)}px"></div>`);
  parts.push(`<div class="clef" style="top:${y(layout.notationTop) - 7}px">𝄢</div>`);
  parts.push(`<div class="time" id="ts-num" style="top:${y(layout.notationTop) - 1}px"></div>`);
  parts.push(`<div class="time" id="ts-den" style="top:${y(layout.notationTop + 18) - 1}px"></div>`);
  for (let i = 0; i < 4; i++) parts.push(`<div class="line" style="top:${y(layout.tabTop + i * 20)}px"></div>`);
  parts.push(`<div class="tab" style="top:${y(layout.tabTop) + 2}px"><span>T</span><span>A</span><span>B</span></div>`);
  // Badges top to bottom: highest string first, at the tab line of that string.
  for (let s = 3; s >= 0; s--) {
    const lineY = y(layout.tabTop + (3 - s) * 20);
    parts.push(`<div class="badge" style="top:${lineY - 9}px;background:${STRING_FILL[s]};color:${STRING_TEXT[s]}">${S[s]}</div>`);
  }
  gutter.innerHTML = parts.join('');
}

function drawCurrent(event: BeatEvent | null) {
  if (!currentGroup || !layout) return;
  const id = event?.id ?? -1;
  if (id === currentEventId) return;
  currentEventId = id;
  currentGroup.replaceChildren();
  if (!event) return;
  const key = `${event.bar}:${event.tick}`;
  // Tab: 26 px circle with a white ring (drawn above the number's own circle, number re-drawn).
  for (const b of layout.tab.get(key) ?? []) {
    const note = event.notes.find((n) => n.string === b.string);
    svgEl('circle', { cx: b.x + b.w / 2, cy: b.y + b.h / 2, r: 12, fill: STRING_FILL[b.string]!, stroke: '#ffffff', 'stroke-width': 2 }, currentGroup);
    const t = svgEl('text', { x: b.x + b.w / 2, y: b.y + b.h / 2 + 5, 'text-anchor': 'middle', fill: STRING_TEXT[b.string]!, 'font-size': 14, 'font-weight': 800, 'font-family': 'Figtree' }, currentGroup);
    t.textContent = note?.dead ? 'x' : String(note?.fret ?? '');
  }
  // The notation is not highlighted (owner's decision); only the tab note gets the ring.
}

/** The note event sounding at a tick (last onset at or before it, while it lasts). */
function eventAt(tick: number): BeatEvent | null {
  let lo = 0;
  let hi = plucks.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (plucks[mid]!.start <= tick) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  const e = plucks[found];
  return e && tick < e.start + e.dur ? e : null;
}

// ---------------------------------------------------------------- frame loop
let frames = 0;
let lastFps = performance.now();
let fps = 0;
function frame(now: number) {
  if (layout) {
    const tick = predictTick(now);
    const x = xAt(tick);
    host.style.transform = `translate3d(${PLAYHEAD_X - x * scale}px, ${offsetY}px, 0) scale(${scale})`;
    drawCurrent(eventAt(tick));
    const bar = song.bars.find((b) => tick >= b.startTick && tick < b.startTick + b.durTicks);
    if (bar) {
      const num = document.getElementById('ts-num');
      const den = document.getElementById('ts-den');
      if (num && num.textContent !== String(bar.time[0])) num.textContent = String(bar.time[0]);
      if (den && den.textContent !== String(bar.time[1])) den.textContent = String(bar.time[1]);
    }
    frames++;
    if (now - lastFps > 1000) {
      fps = frames;
      frames = 0;
      lastFps = now;
    }
    status.textContent = `bar ${bar?.n ?? '-'} · tick ${Math.round(tick)} · pass ${Math.min(pass, PASSES)}/${PASSES} · speed ${api.playbackSpeed} · ${clock.playing ? 'playing' : 'paused'} · ${fps} fps · scale ${scale.toFixed(2)}`;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------- events
api.postRenderFinished.on(() => {
  layout = readLayout();
  if (!layout) return;
  // Fit the engraving into the strip height; centre whatever room is left.
  scale = Math.min(1, (STRIP_H - 4) / layout.height);
  offsetY = Math.max(0, (STRIP_H - layout.height * scale) / 2);
  buildOverlays();
  setChunk(chunkIndex, false);
});
api.error.on((e) => (status.textContent = `error: ${String(e)}`));

$('song').addEventListener('change', (e) => void loadSong((e.target as HTMLSelectElement).value));
$('chunk').addEventListener('change', (e) => setChunk(Number((e.target as HTMLSelectElement).value)));
$('speed').addEventListener('change', (e) => {
  snap(predictTick(performance.now()));
  api.playbackSpeed = Number((e.target as HTMLSelectElement).value);
});
$('play').addEventListener('click', () => api.playPause());
$('restart').addEventListener('click', () => setChunk(chunkIndex));
api.playbackSpeed = 0.75;

void loadSong('vortex-surfer');
// For inspection from the console / automation.
Object.assign(window, { api, spike: { xAt, eventAt, get layout() { return layout; }, get song() { return song; } } });

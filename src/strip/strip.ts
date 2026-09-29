// Notation and tab strip (ADR-0017, system description §3.6), built from the accepted spike.
// alphaTab engraves the notation and tab; everything that moves or highlights is ours:
// - the scroll ("smoothed over 2 beats", bounded so notes are in the band when plucked;
//   src/strip/scroll.ts) with the playhead band at 150 px,
// - overlays placed from alphaTab's bounds lookup: string circles under the tab fret numbers, the
//   current-note ring, the loop bracket and label, dimming outside the loop, the next-chunk label
//   and the re-tab labels (the notation is not highlighted),
// - the fixed gutter: "Bar", clef, current time signature, TAB and string badges.
// This module imports alphaTab, so the practice view loads it lazily.
import * as alphaTab from '@coderline/alphatab';
import type { BeatEvent, SongData } from '../core/model';
import { barIndexAt } from '../core/timing';
import { stringNames } from '../core/tuning';
import { passLabel } from '../playback/loop';
import { songModel } from '../practice/song-model';
import { colourNotes, fetchScore, stringPalette } from './alphatab-score';
import { MAX_ONSET_OFFSET, PLAYHEAD_X, playheadX, type Anchor } from './scroll';

const STRIP_H = 276;
const SVG = 'http://www.w3.org/2000/svg';
const DIM = 'rgba(24,24,24,0.74)';
const FONT = 'Figtree, sans-serif';

export interface StripLoop {
  chunkIndex: number;
  pass: number;
  passes: number;
}

interface NoteBox {
  x: number;
  y: number;
  w: number;
  h: number;
  string: number;
}

interface Layout {
  beatAnchors: Anchor[]; // every notation beat onset, plus the end of the last bar
  barX: Map<number, { x: number; right: number }>; // bar number → real bounds
  tab: Map<string, NoteBox[]>; // "bar:tick" → fret number boxes
  notationTop: number;
  tabTop: number;
  height: number;
}

function createSettings(): alphaTab.Settings {
  const base = import.meta.env.BASE_URL;
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
  // Texts and effect bands would push the tab staff out of the 276 px strip.
  const E = alphaTab.NotationElement;
  for (const el of [
    E.ScoreTitle, E.ScoreSubTitle, E.ScoreArtist, E.ScoreAlbum, E.ScoreWords, E.ScoreMusic, E.ScoreWordsAndMusic,
    E.ScoreCopyright, E.GuitarTuning, E.TrackNames, E.EffectTempo, E.EffectMarker, E.EffectText,
    E.EffectHammerOnPullOffText, E.EffectSlideText, E.EffectPalmMute, E.EffectLetRing, E.EffectDynamics,
    E.EffectTripletFeel, E.EffectCapo, E.EffectChordNames,
  ]) {
    settings.notation.elements.set(el, false);
  }
  // Count is the only source so far; the Synth and YouTube sources switch the player on (ADR-0017).
  settings.player.playerMode = alphaTab.PlayerMode.Disabled;
  settings.player.scrollMode = alphaTab.ScrollMode.Off; // we scroll
  settings.player.enableCursor = false; // we draw the playhead
  settings.player.enableElementHighlighting = false;
  return settings;
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  parent?.appendChild(el);
  return el;
}

export class Strip {
  private readonly api: alphaTab.AlphaTabApi;
  private song: SongData | null = null;
  private layout: Layout | null = null;
  private scale = 1;
  private offsetY = 0;
  private back: SVGSVGElement | null = null; // behind alphaTab's surface: string circles, current ring
  private front: SVGSVGElement | null = null; // above: dimming, labels, bracket
  private loopGroup: SVGGElement | null = null;
  /** The loop label slides right to stay readable while the loop start is scrolled out of view. */
  private loopLabel: { el: SVGGElement; min: number; max: number; offset: number } | null = null;
  private currentGroup: SVGGElement | null = null;
  private currentEventId = -1;
  private loop: StripLoop = { chunkIndex: 0, pass: 1, passes: 3 };
  private barIndex = -1;
  private palette = stringPalette();

  constructor(
    private readonly host: HTMLElement,
    private readonly gutter: HTMLElement,
    private readonly onReady: (ready: boolean, error?: string) => void,
  ) {
    this.api = new alphaTab.AlphaTabApi(host, createSettings());
    this.api.postRenderFinished.on(() => this.afterRender());
    this.api.error.on((e) => this.onReady(false, String(e)));
  }

  async load(song: SongData) {
    this.song = song;
    this.layout = null;
    this.onReady(false);
    const score = await fetchScore(song, this.api.settings);
    if (this.song !== song) return;
    colourNotes(score.tracks[song.track.index]!, (s) => this.palette.text[s]!);
    this.api.renderScore(score, [song.track.index]);
  }

  setLoop(loop: StripLoop) {
    this.loop = loop;
    this.drawLoop();
  }

  /** Per animation frame: scroll, current-note ring and time signature. */
  update(tick: number) {
    const { layout, song } = this;
    if (!layout || !song) return;
    const x = playheadX(layout.beatAnchors, tick, MAX_ONSET_OFFSET / this.scale); // host px
    this.host.style.transform = `translate3d(${PLAYHEAD_X - x * this.scale}px, ${this.offsetY}px, 0) scale(${this.scale})`;
    this.drawCurrent(this.eventAt(tick));
    const label = this.loopLabel;
    if (label) {
      const visibleLeft = x - PLAYHEAD_X / this.scale; // host x at the clip's left edge
      const offset = Math.round(Math.min(label.max, Math.max(label.min, visibleLeft + 8)) - label.min);
      if (offset !== label.offset) {
        label.offset = offset;
        label.el.setAttribute('transform', `translate(${offset} 0)`);
      }
    }
    const i = barIndexAt(song.bars, tick);
    if (i !== this.barIndex) {
      this.barIndex = i;
      const [num, den] = song.bars[i]!.time;
      this.gutter.querySelector('[data-ts-num]')!.textContent = String(num);
      this.gutter.querySelector('[data-ts-den]')!.textContent = String(den);
    }
  }

  destroy() {
    this.song = null;
    this.api.destroy();
  }

  // ------------------------------------------------------------------ layout from alphaTab bounds

  private afterRender() {
    this.layout = this.readLayout();
    if (!this.layout) return;
    // Fit the engraving into the strip height and centre whatever room is left.
    this.scale = Math.min(1, (STRIP_H - 4) / this.layout.height);
    this.offsetY = Math.max(0, (STRIP_H - this.layout.height * this.scale) / 2);
    this.buildOverlays();
    this.drawGutter();
    this.barIndex = -1;
    this.onReady(true);
  }

  private readLayout(): Layout | null {
    const lookup = this.api.renderer.boundsLookup;
    const song = this.song;
    if (!lookup || !song) return null;
    const l: Layout = { beatAnchors: [], barX: new Map(), tab: new Map(), notationTop: 0, tabTop: 0, height: 0 };
    // One copy of the horizontal system per partial render: dedupe by bar. With the ScoreTab
    // profile each master bar has two BarBounds, [0] notation and [1] tab. Bounds come back from
    // the render worker without their Bar references, so bars are identified by mb.index.
    const seen = new Set<number>();
    const masterBars = lookup.staffSystems.flatMap((s) => s.bars).filter((mb) => !seen.has(mb.index) && seen.add(mb.index));
    masterBars.sort((a, b) => a.index - b.index);
    for (const mb of masterBars) {
      const n = mb.index + 1;
      const bar = song.bars[mb.index]!;
      l.barX.set(n, { x: mb.realBounds.x, right: mb.realBounds.x + mb.realBounds.w });
      const notation = mb.bars[0]!;
      for (const b of notation.beats) {
        const tick = bar.startTick + b.beat.playbackStart;
        const prev = l.beatAnchors[l.beatAnchors.length - 1];
        if (!prev || tick > prev.tick) l.beatAnchors.push({ tick, x: b.onNotesX });
      }
      if (n === song.stats.firstBar) {
        l.notationTop = notation.visualBounds.y;
        l.tabTop = mb.bars[1]!.visualBounds.y;
      }
      for (const beat of mb.bars[1]?.beats ?? []) {
        const key = `${n}:${beat.beat.playbackStart}`;
        const boxes = (beat.notes ?? []).map((nb) => {
          const b = nb.noteHeadBounds;
          return { x: b.x, y: b.y, w: b.w, h: b.h, string: nb.note.string - 1 };
        });
        if (boxes.length) l.tab.set(key, [...(l.tab.get(key) ?? []), ...boxes]);
      }
    }
    const last = masterBars[masterBars.length - 1];
    const lastBar = song.bars[song.bars.length - 1]!;
    if (last) l.beatAnchors.push({ tick: lastBar.startTick + lastBar.durTicks, x: last.realBounds.x + last.realBounds.w });
    l.height = this.host.querySelector<HTMLElement>('.at-surface')?.offsetHeight ?? 0;
    return l;
  }

  // ------------------------------------------------------------------ drawing

  private buildOverlays() {
    this.back?.remove();
    this.front?.remove();
    const surface = this.host.querySelector<HTMLElement>('.at-surface');
    const { layout, song } = this;
    if (!surface || !layout || !song) return;
    surface.style.position = 'relative';
    const size = { width: surface.offsetWidth, height: surface.offsetHeight };
    const style = 'position:absolute;left:0;top:0;pointer-events:none;overflow:visible';
    this.back = svgEl('svg', size);
    this.back.style.cssText = style;
    this.front = svgEl('svg', size);
    this.front.style.cssText = `${style};z-index:2`;
    surface.parentElement!.insertBefore(this.back, surface);
    surface.parentElement!.appendChild(this.front);

    // String circles under every tab fret number (20 px).
    for (const boxes of layout.tab.values()) {
      for (const b of boxes) svgEl('circle', { cx: b.x + b.w / 2, cy: b.y + b.h / 2, r: 10, fill: this.palette.fill[b.string]! }, this.back);
    }
    // Re-tab labels: the first re-tabbed note per bar.
    const names = stringNames(song.tuning);
    const labelled = new Set<number>();
    for (const e of song.events) {
      const n = e.notes.find((x) => x.retabFrom && !x.tieFromPrev);
      if (!n || labelled.has(e.bar)) continue;
      labelled.add(e.bar);
      const box = layout.tab.get(`${e.bar}:${e.tick}`)?.[0];
      if (!box) continue;
      const t = svgEl('text', { x: box.x - 4, y: layout.tabTop - 10, fill: '#539df5', 'font-size': 11, 'font-weight': 700, 'font-family': FONT }, this.front);
      t.textContent = `Retab · source ${names[n.retabFrom!.string]}${n.retabFrom!.fret}`;
    }
    this.loopGroup = svgEl('g', {}, this.front);
    this.currentGroup = svgEl('g', {}, this.back);
    this.currentEventId = -1;
    this.drawLoop();
  }

  private drawLoop() {
    const g = this.loopGroup;
    const { layout, song, front, loop } = this;
    if (!g || !layout || !song || !front) return;
    g.replaceChildren();
    this.loopLabel = null;
    const chunk = song.chunks[loop.chunkIndex];
    const startBar = chunk && layout.barX.get(chunk.bars[0]);
    const endBar = chunk && layout.barX.get(chunk.bars[1]);
    if (!chunk || !startBar || !endBar) return;
    const start = startBar.x;
    const end = endBar.right;
    const width = Number(front.getAttribute('width'));
    const top = 22;
    // Dim everything outside the loop.
    svgEl('rect', { x: 0, y: top, width: start, height: layout.height, fill: DIM }, g);
    svgEl('rect', { x: end, y: top, width: Math.max(0, width - end), height: layout.height, fill: DIM }, g);
    // Bracket and label.
    svgEl('path', { d: `M${start + 1} ${top} V${top - 8} H${end - 1} V${top}`, fill: 'none', stroke: '#1ed760', 'stroke-width': 2 }, g);
    const label = svgEl('g', {}, g);
    const bg = svgEl('rect', { x: start + 12, y: 4, height: 16, fill: '#181818' }, label);
    const t = svgEl('text', { x: start + 20, y: 16, fill: '#ffffff', 'font-size': 12, 'font-weight': 700, 'font-family': FONT }, label);
    t.textContent = `Loop · chunk ${loop.chunkIndex + 1} · ${chunk.name} · bars ${chunk.bars[0]}–${chunk.bars[1]} · ${passLabel(loop)}`;
    const labelW = t.getComputedTextLength() + 16;
    bg.setAttribute('width', String(labelW));
    this.loopLabel = { el: label, min: start + 12, max: Math.max(start + 12, end - labelW - 4), offset: -1 };
    // Next chunk preview label.
    const next = song.chunks[loop.chunkIndex + 1];
    const nt = svgEl('text', { x: end + 12, y: layout.tabTop + 3 * 20 + 26, fill: '#b3b3b3', 'font-size': 12, 'font-weight': 700, 'font-family': FONT }, g);
    nt.textContent = next ? `Next · chunk ${loop.chunkIndex + 2} · ${next.name} · bar ${next.bars[0]}` : 'End of song';
  }

  private drawGutter() {
    const { layout, song } = this;
    if (!layout || !song) return;
    const names = stringNames(song.tuning);
    const y = (v: number) => this.offsetY + v * this.scale;
    const parts: string[] = ['<div class="label">Bar</div>'];
    for (let i = 0; i < 5; i++) parts.push(`<div class="line" style="top:${y(layout.notationTop + i * 9)}px"></div>`);
    parts.push(`<div class="clef" style="top:${y(layout.notationTop) - 7}px">𝄢</div>`);
    parts.push(`<div class="time" data-ts-num style="top:${y(layout.notationTop) - 1}px"></div>`);
    parts.push(`<div class="time" data-ts-den style="top:${y(layout.notationTop + 18) - 1}px"></div>`);
    for (let i = 0; i < 4; i++) parts.push(`<div class="line" style="top:${y(layout.tabTop + i * 20)}px"></div>`);
    parts.push(`<div class="tab" style="top:${y(layout.tabTop) + 2}px"><span>T</span><span>A</span><span>B</span></div>`);
    // Badges top to bottom: highest string first, at the tab line of that string.
    for (let s = 3; s >= 0; s--) {
      const lineY = y(layout.tabTop + (3 - s) * 20);
      parts.push(`<div class="badge" style="top:${lineY - 9}px;background:var(--string-${s + 1});color:var(--string-${s + 1}-text)">${names[s]}</div>`);
    }
    this.gutter.innerHTML = parts.join('');
  }

  private drawCurrent(event: BeatEvent | null) {
    const g = this.currentGroup;
    if (!g || !this.layout) return;
    const id = event?.id ?? -1;
    if (id === this.currentEventId) return;
    this.currentEventId = id;
    g.replaceChildren();
    if (!event) return;
    // 26 px circle with a white ring over the note's own circle, in the back layer: alphaTab's
    // fret number stays on top in its own position (redrawing it shifted the number).
    for (const b of this.layout.tab.get(`${event.bar}:${event.tick}`) ?? []) {
      svgEl('circle', { cx: b.x + b.w / 2, cy: b.y + b.h / 2, r: 12, fill: this.palette.fill[b.string]!, stroke: '#ffffff', 'stroke-width': 2 }, g);
    }
  }

  /** The note event sounding at a tick (last onset at or before it, while it lasts). */
  private eventAt(tick: number): BeatEvent | null {
    const events = songModel(this.song!).noteEvents;
    let lo = 0;
    let hi = events.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (events[mid]!.start <= tick) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    const e = events[found];
    return e && tick < e.start + e.dur ? e : null;
  }
}

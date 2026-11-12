// Practice view geometry from design/artboards/Main.dc.html (system description §3).
// The stage is 900 px high and as wide as the window's shape asks for, between 16:10 (1440 px, the
// design's size) and 16:9 (1600 px). A wider window keeps 16:9, with room left on both sides
// (ADR-0037). The extra width goes to the video cell first, then to the fretboard, and to the strip.
export const STAGE_W = 1440;
export const STAGE_W_MAX = 1600;
export const STAGE_H = 900;
export const PAGE_PAD = 16;
export const GAP = 12;
export const ROWS = { header: 88, video: 400, transport: 64, strip: 276 } as const;
export const RAIL_W = { open: 260, collapsed: 56 } as const;
export const VIDEO_W = { open: 619, collapsed: 711 } as const;
/** The video cell is never wider than a 16:9 picture of its height (400 px). */
export const VIDEO_W_MAX = 711;

/** Stage width for a viewport: 900 px × the viewport's aspect ratio, kept between 1440 and 1600 px. */
export function stageWidth(viewportW: number, viewportH: number): number {
  if (viewportW <= 0 || viewportH <= 0) return STAGE_W;
  return Math.max(STAGE_W, Math.min(STAGE_W_MAX, Math.floor((STAGE_H * viewportW) / viewportH)));
}

/**
 * Scale factor that fits the stage into the viewport without scrolling. The design is laid out at
 * its reference size and scaled as a whole (1280 px wide → 0.889).
 */
export function fitScale(viewportW: number, viewportH: number): number {
  if (viewportW <= 0 || viewportH <= 0) return 1;
  return Math.min(viewportW / stageWidth(viewportW, viewportH), viewportH / STAGE_H);
}

/** Width of the video cell: the design's width plus the stage's extra width, up to 16:9. */
export function videoWidth(stageW: number, planOpen: boolean): number {
  return Math.min(VIDEO_W_MAX, (planOpen ? VIDEO_W.open : VIDEO_W.collapsed) + stageW - STAGE_W);
}

/** Width of the fingering column, right of the video cell. */
export function fingeringWidth(stageW: number, planOpen: boolean): number {
  return stageW - 2 * PAGE_PAD - (planOpen ? RAIL_W.open : RAIL_W.collapsed) - videoWidth(stageW, planOpen) - 2 * GAP;
}

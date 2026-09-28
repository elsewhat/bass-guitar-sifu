// Practice view geometry from design/artboards/Main.dc.html (system description §3).
export const STAGE_W = 1440;
export const STAGE_H = 900;
export const PAGE_PAD = 16;
export const GAP = 12;
export const ROWS = { header: 88, video: 400, transport: 64, strip: 276 } as const;
export const RAIL_W = { open: 260, collapsed: 56 } as const;
export const VIDEO_W = { open: 619, collapsed: 711 } as const;

/**
 * Scale factor that fits the fixed 1440×900 stage into the viewport without scrolling.
 * The design is laid out at reference size and scaled as a whole (1280 px wide → 0.889).
 */
export function fitScale(viewportW: number, viewportH: number): number {
  if (viewportW <= 0 || viewportH <= 0) return 1;
  return Math.min(viewportW / STAGE_W, viewportH / STAGE_H);
}

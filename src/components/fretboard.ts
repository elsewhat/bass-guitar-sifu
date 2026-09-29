// Fretboard with the hand (system description §3.5), geometry from design/artboards/Fretboard.dc.html
// at 673 × 208 and scaled as a whole. It follows the playhead, so it is rendered imperatively
// by the fingering column's frame callback (ADR-0002), not through React state.

export const FRETBOARD_W = 673;
export const FRETBOARD_H = 208;
const X0 = 44;

export interface FretboardNote {
  string: number;
  fret: number;
  finger: number | null; // 0 = open string, null = dead note
  position: number;
}

export interface FretboardModel {
  frets: number; // frets drawn, at least 9
  letters: string[]; // string names, lowest first
  current: FretboardNote | null; // null during rests: the hand stays, no finger is active
  position: number; // hand position to draw
  next: { string: number; fret: number } | null;
}

const sv = (s: number) => `var(--string-${s + 1})`;
const sf = (s: number) => `var(--string-${s + 1}-text)`;

export function fretboardHtml(m: FretboardModel): string {
  const d = (FRETBOARD_W - 16 - X0) / m.frets;
  const slot = (n: number) => (n === 0 ? X0 - 16 : X0 + (n - 0.5) * d);
  const sy = (s: number) => 116 - s * 28;
  const pos = Math.max(1, Math.min(m.frets - 3, m.position));
  const html: string[] = [];
  const box = (style: string, content = '') => html.push(`<div style="position:absolute;${style}">${content}</div>`);

  box(`left:${X0}px;top:18px;width:${FRETBOARD_W - 16 - X0}px;height:112px;background:#252525;border-radius:4px`);
  box(`left:${X0 + (pos - 1) * d}px;top:18px;width:${4 * d}px;height:112px;background:rgba(255,255,255,0.06)`);
  box('left:41px;top:16px;width:5px;height:116px;background:#cbcbcb;border-radius:2px');
  for (let n = 1; n <= m.frets; n++) {
    box(`left:${X0 + n * d - 1}px;top:18px;width:2px;height:112px;background:#4d4d4d`);
    if ([3, 5, 7, 9, 12, 15, 17].includes(n)) box(`left:${slot(n) - 6}px;top:68px;width:12px;height:12px;border-radius:50%;background:#3a3a3a`);
    const inBand = n >= pos && n <= pos + 3;
    box(
      `left:${slot(n) - 10}px;top:0;width:20px;text-align:center;font-size:11px;line-height:14px;font-weight:${inBand ? 700 : 400};color:${inBand ? '#ffffff' : '#7c7c7c'}`,
      String(n),
    );
  }
  const thickness = [3.5, 3, 2.5, 2];
  m.letters.forEach((letter, s) => {
    const t = thickness[s] ?? 2;
    box(`left:24px;top:${sy(s) - t / 2}px;width:${FRETBOARD_W - 16 - 24}px;height:${t}px;background:${sv(s)}`);
    box(
      `left:0;top:${sy(s) - 9}px;width:18px;height:18px;border-radius:50%;background:${sv(s)};text-align:center;font-size:11px;line-height:18px;font-weight:800;color:${sf(s)}`,
      letter,
    );
  });
  const { current: cur, next } = m;
  if (next && !(cur && next.string === cur.string && next.fret === cur.fret)) {
    box(`left:${slot(next.fret) - 15}px;top:${sy(next.string) - 15}px;width:30px;height:30px;box-sizing:border-box;border-radius:50%;border:2px dashed #ffffff`);
    box(
      `left:${slot(next.fret) - 20}px;top:${sy(next.string) - 30}px;width:40px;text-align:center;font-size:10px;line-height:12px;font-weight:700;color:#ffffff;background:#252525`,
      'Next',
    );
  }
  box(`left:${slot(pos) - 26}px;top:178px;width:${slot(pos + 3) - slot(pos) + 52}px;height:30px;background:rgba(255,255,255,0.1);border-radius:16px 16px 0 0`);
  for (let k = 1; k <= 4; k++) {
    const fret = pos + k - 1;
    if (fret > m.frets) continue;
    const active = !!cur && cur.finger === k;
    const top = (active ? sy(cur.string) : 142) - 12;
    box(
      `left:${slot(fret) - 12}px;top:${top}px;width:24px;height:${198 - top}px;box-sizing:border-box;border-radius:12px 12px 8px 8px;` +
        `background:${active ? sv(cur.string) : 'rgba(255,255,255,0.14)'};border:${active ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.3)'};` +
        `text-align:center;font-size:12px;line-height:22px;font-weight:800;color:${active ? sf(cur.string) : '#cbcbcb'}`,
      String(k),
    );
  }
  if (cur?.finger === 0) {
    box(
      `left:19px;top:${sy(cur.string) - 11}px;width:22px;height:22px;border-radius:50%;background:${sv(cur.string)};box-shadow:#ffffff 0 0 0 2px;text-align:center;font-size:12px;line-height:22px;font-weight:800;color:${sf(cur.string)}`,
      '0',
    );
  }
  return html.join('');
}

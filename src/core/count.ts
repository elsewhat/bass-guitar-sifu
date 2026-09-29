// Spoken count for Count mode (system description §5.4): one position per eighth note, "1 & 2 &
// 3 & 4 &" in x/4. In x/8 every eighth is a beat ("1 2 3 4 5 6"); in x/2 the eighths between a
// beat and its "&" are silent.
import { PPQ } from './model';

export const EIGHTH = PPQ / 2;

export type CountLabel = string | null;

/** Label of an eighth-note position in a bar ("1", "&", "2" …), or null when nothing is said. */
export function countLabel([, den]: [number, number], eighth: number): CountLabel {
  const beat = Math.max(1, 8 / den); // eighths per beat
  if (eighth % beat === 0) return String(eighth / beat + 1);
  return beat >= 2 && eighth % beat === beat / 2 ? '&' : null;
}

/** Labels for every eighth-note position of a bar. */
export function countCells(time: [number, number]): CountLabel[] {
  const eighths = Math.ceil((time[0] * 8) / time[1]);
  return Array.from({ length: eighths }, (_, i) => countLabel(time, i));
}

/** Sample file name for a label: "1" → "one", "&" → "and". */
export function sampleName(label: string): string {
  return label === '&' ? 'and' : (['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][Number(label) - 1] ?? 'and');
}

// Tuning names for 4-string basses (lowest string first, MIDI pitches).

export const STANDARD_4 = [28, 33, 38, 43]; // E1 A1 D2 G2

const PITCH_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

export function pitchClassName(pitch: number): string {
  return PITCH_NAMES[((pitch % 12) + 12) % 12]!;
}

/** Scientific pitch name, e.g. 34 → "B♭1". */
export function pitchName(pitch: number): string {
  return `${pitchClassName(pitch)}${Math.floor(pitch / 12) - 1}`;
}

/** String letters lowest first, e.g. ["E", "A", "D", "G"]. */
export function stringNames(tuning: number[]): string[] {
  return tuning.map(pitchClassName);
}

/**
 * Human name for a tuning: "Standard", "Drop D", "E♭ standard", "C♯ standard", or the
 * string letters when nothing fits.
 */
export function tuningName(tuning: number[]): string {
  if (tuning.length !== 4) return stringNames(tuning).join(' ');
  const offsets = tuning.map((p, i) => p - STANDARD_4[i]!);
  const upper = offsets.slice(1);
  const shift = upper[0]!;
  if (upper.every((o) => o === shift)) {
    const low = offsets[0]!;
    if (low === shift) return shift === 0 ? 'Standard' : `${pitchClassName(STANDARD_4[0]! + shift)} standard`;
    if (low === shift - 2) {
      const drop = `Drop ${pitchClassName(tuning[0]!)}`;
      return shift === 0 ? drop : `${drop} (${pitchClassName(STANDARD_4[0]! + shift)} standard)`;
    }
  }
  return stringNames(tuning).join(' ');
}

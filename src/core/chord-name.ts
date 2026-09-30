// Short chord names for the Now/Next squares (system description §3.5): only the shapes a bass
// plays as chords get a name. Root + fifth (with or without octaves) is a power chord "D5";
// octaves alone are named by their note, "D". Anything else has no name.
import { pitchClassName } from './tuning';

/** MIDI pitches of the sounding (not dead) notes; null when there is no simple name. */
export function chordName(pitches: number[]): string | null {
  const unique = [...new Set(pitches)].sort((a, b) => a - b);
  if (unique.length < 2) return null;
  const root = unique[0]!;
  const intervals = new Set(unique.map((p) => (p - root) % 12));
  if ([...intervals].some((i) => i !== 0 && i !== 7)) return null;
  return intervals.has(7) ? `${pitchClassName(root)}5` : pitchClassName(root);
}

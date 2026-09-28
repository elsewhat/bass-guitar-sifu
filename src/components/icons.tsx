// Material-style icon paths used in the design artboards.
const PATHS = {
  music: 'M12 3v10.55A4 4 0 1 0 14 17V7h4V3z',
  play: 'M8 5v14l11-7z',
  fullscreen: 'M5 5h5v2H7v3H5zm9 0h5v5h-2V7h-3zM5 14h2v3h3v2H5zm12 0h2v5h-5v-2h3z',
  chevronLeft: 'M15.4 7.4 14 6l-6 6 6 6 1.4-1.4-4.6-4.6z',
  chevronRight: 'M8.6 16.6 10 18l6-6-6-6-1.4 1.4 4.6 4.6z',
} as const;

export function Icon({ name, size = 20 }: { name: keyof typeof PATHS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

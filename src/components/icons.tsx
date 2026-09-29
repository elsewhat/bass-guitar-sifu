// Material-style icon paths used in the design artboards.
const PATHS = {
  music: 'M12 3v10.55A4 4 0 1 0 14 17V7h4V3z',
  play: 'M8 5v14l11-7z',
  fullscreen: 'M5 5h5v2H7v3H5zm9 0h5v5h-2V7h-3zM5 14h2v3h3v2H5zm12 0h2v5h-5v-2h3z',
  chevronLeft: 'M15.4 7.4 14 6l-6 6 6 6 1.4-1.4-4.6-4.6z',
  chevronRight: 'M8.6 16.6 10 18l6-6-6-6-1.4 1.4 4.6 4.6z',
  pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
  restart: 'M12 5V2L7 6l5 4V7a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7z',
  repeat: 'M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z',
  repeatOne: 'M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2zm-4-2V9h-1l-2 1v1h1.5v4z',
  minus: 'M5 11h14v2H5z',
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z',
  skipNext: 'M6 6v12l8.5-6zM16 6h2v12h-2z',
  search: 'M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 14 15.5l.3.3v.8l5 5 1.5-1.5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

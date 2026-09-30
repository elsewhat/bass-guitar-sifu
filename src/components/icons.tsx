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
  playThrough: 'M3 11h11.2l-4.6-4.6L11 5l7 7-7 7-1.4-1.4 4.6-4.6H3zM19 5h2v14h-2z',
  minus: 'M5 11h14v2H5z',
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z',
  skipNext: 'M6 6v12l8.5-6zM16 6h2v12h-2z',
  equalizer: 'M10 20h4V4h-4v16zm-6 0h4v-8H4v8zM16 9v11h4V9h-4z',
  lyrics: 'M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM4 12h4v2H4v-2zm10 6H4v-2h10v2zm6 0h-4v-2h4v2zm0-4H10v-2h10v2z',
  close: 'M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z',
  volumeUp: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z',
  volumeOff:
    'M16.5 12A4.5 4.5 0 0 0 14 8v2.2l2.5 2.5V12zm2.5 0c0 .9-.2 1.8-.5 2.6l1.5 1.5A8.8 8.8 0 0 0 21 12a9 9 0 0 0-7-8.8v2.1a7 7 0 0 1 5 6.7zM4.3 3 3 4.3 7.7 9H3v6h4l5 5v-6.7l4.3 4.3a7 7 0 0 1-2.3 1.2v2.1a9 9 0 0 0 3.7-1.8l2 2 1.3-1.3L4.3 3zM12 4 9.9 6.1 12 8.2V4z',
  search:'M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 14 15.5l.3.3v.8l5 5 1.5-1.5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

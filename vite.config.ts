import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { alphaTab } from '@coderline/alphatab-vite';
import { songScores } from './scripts/vite-song-scores';

// ADR-0012: the Pages workflow sets BASE_PATH=/bass-guitar-sifu/; locally the app runs at /.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), tailwindcss(), alphaTab(), songScores()],
  build: {
    rollupOptions: {
      // spike.html is the ADR-0017 alphaTab spike (dev and preview only until decided).
      input: { main: 'index.html', spike: 'spike.html' },
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
  },
});

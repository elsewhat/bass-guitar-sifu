import { defineConfig, devices } from '@playwright/test';

// Smoke tests against the production build (`npm run build` first).
export default defineConfig({
  testDir: 'e2e',
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    // Follows the Vite base path so the Pages build is tested as deployed.
    baseURL: `http://localhost:4173${process.env.BASE_PATH ?? '/'}`,
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: `http://localhost:4173${process.env.BASE_PATH ?? '/'}`,
    reuseExistingServer: !process.env.CI,
  },
});

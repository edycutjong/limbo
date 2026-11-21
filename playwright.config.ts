import { defineConfig } from '@playwright/test';

// Vite serves the spike page on 5173 and BASECAMP on 5174; the store-and-forward relay runs on 5175.
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  projects: [
    { name: 'spike', testMatch: 'offline-spike.spec.ts', use: { baseURL: 'http://localhost:5173' } },
    { name: 'basecamp', testMatch: 'basecamp-offline.spec.ts', use: { baseURL: 'http://localhost:5174' } },
  ],
  webServer: [
    {
      command: 'pnpm exec vite e2e/spike --port 5173 --strictPort',
      url: 'http://localhost:5173/',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm exec vite apps/basecamp --port 5174 --strictPort',
      url: 'http://localhost:5174/',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'node e2e/spike/relay.mjs',
      url: 'http://localhost:5175/ops',
      reuseExistingServer: !process.env.CI,
    },
  ],
});

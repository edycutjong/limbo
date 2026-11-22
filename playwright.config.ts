import { defineConfig } from '@playwright/test';

// Vite serves the spike page on 5173 and BASECAMP on 5174; the store-and-forward relay runs on 5175.
// One worker: the spike test and BASECAMP test (b) share the relay and each POST /reset it, so they must not overlap.
export default defineConfig<{ app: 'basecamp' | 'aftershock' }>({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  workers: 1,
  projects: [
    { name: 'spike', testMatch: 'offline-spike.spec.ts', use: { baseURL: 'http://localhost:5173' } },
    { name: 'basecamp', testMatch: 'basecamp-offline.spec.ts', use: { baseURL: 'http://localhost:5174' } },
    { name: 'aftershock', testMatch: 'aftershock-offline.spec.ts', use: { baseURL: 'http://localhost:5176' } },
    // Production previews of each built app (service worker enabled); `app` picks the title checked in offline-shell.spec.ts.
    { name: 'basecamp-shell', testMatch: 'offline-shell.spec.ts', use: { baseURL: 'http://localhost:5177', app: 'basecamp' } },
    { name: 'aftershock-shell', testMatch: 'offline-shell.spec.ts', use: { baseURL: 'http://localhost:5178', app: 'aftershock' } },
    // ui-polish layout checks against each dev server; `app` picks the scene button.
    { name: 'ui-polish-basecamp', testMatch: 'ui-polish.spec.ts', use: { baseURL: 'http://localhost:5174', app: 'basecamp' } },
    { name: 'ui-polish-aftershock', testMatch: 'ui-polish.spec.ts', use: { baseURL: 'http://localhost:5176', app: 'aftershock' } },
    // The static landing site with the /judge route (served by e2e/site-server.mjs, which mirrors Vercel cleanUrls).
    { name: 'judge', testMatch: 'judge.spec.ts', use: { baseURL: 'http://localhost:5179' } },
    { name: 'landing', testMatch: 'landing.spec.ts', use: { baseURL: 'http://localhost:5179' } },
    // Deployed URLs come from env vars; no server and no baseURL.
    { name: 'live', testMatch: 'live.spec.ts' },
    { name: 'live-judge', testMatch: 'judge.spec.ts' }, // needs LIMBO_LIVE_LANDING; skipped otherwise
  ],
  webServer: [
    {
      command: 'node e2e/site-server.mjs',
      url: 'http://localhost:5179/judge',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm exec vite apps/aftershock --port 5176 --strictPort',
      url: 'http://localhost:5176/',
      reuseExistingServer: !process.env.CI,
    },
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
    {
      command: 'pnpm --filter @limbo/basecamp build && pnpm --filter @limbo/basecamp exec vite preview --port 5177 --strictPort',
      url: 'http://localhost:5177/',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter @limbo/aftershock build && pnpm --filter @limbo/aftershock exec vite preview --port 5178 --strictPort',
      url: 'http://localhost:5178/',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});

import { defineConfig } from 'vitest/config';

// Projects: fast unit tests, React component tests (jsdom), and the property suite (fast-check over simulated replicas).
export default defineConfig({
  test: {
    passWithNoTests: true,
    // 100% thresholds on the domain code: the skeleton and each app's op, model and action modules. Every exclusion has a reason.
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text-summary', 'json-summary', 'json', 'lcov'],
      include: ['skeleton/src/**/*.{ts,tsx}', 'apps/*/src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.test.{ts,tsx}', // tests
        'skeleton/src/limbo/test/**', // test harness helpers
        '**/*.props.ts', // property definitions: inputs to the props project, not product logic (the ops they test are covered)
        '**/env.d.ts', // type declarations only
        'apps/*/src/main.tsx', // browser entry: service worker, relay and DOM mount, covered by the Playwright e2e
        'apps/*/src/shuffle.worker.ts', // Web Worker entry: runs only in a real browser worker, covered by the e2e shuffle test
        'apps/*/src/shuffle-runner.ts', // Worker bridge: needs a real Worker, covered by the e2e shuffle test
        'apps/*/src/devrelay.ts', // dev-only relay glue, stripped from production builds (asserted by build.test.ts) and used by the e2e
        'apps/*/src/views/**', // React views: covered by jsdom component tests and the Playwright e2e, not held to a unit threshold
      ],
      thresholds: { lines: 100, statements: 100, functions: 100, branches: 100 },
    },
    projects: [
      {
        test: {
          name: 'unit',
          include: ['skeleton/src/**/*.test.ts', 'apps/*/src/**/*.test.ts', 'apps/*.test.ts', 'kit/**/*.test.ts'],
          exclude: ['**/*.props.test.ts', '**/node_modules/**'],
        },
      },
      {
        test: {
          name: 'limbo',
          include: ['skeleton/src/**/*.test.tsx', 'apps/*/src/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['skeleton/src/limbo/test/setup.ts'],
          // The scene tests run the 1,000-ordering shuffle in jsdom (3 to 7 s alone, more under parallel load).
          testTimeout: 60_000,
        },
      },
      {
        test: {
          name: 'props',
          include: ['**/*.props.test.ts'],
          // evidence/ holds archived A/B run files (copies of Kiro's tests); they are records, not suites.
          exclude: ['**/node_modules/**', 'evidence/**'],
          setupFiles: ['kit/props/setup.ts'],
          testTimeout: 600_000,
        },
      },
    ],
  },
});

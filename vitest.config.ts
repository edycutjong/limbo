import { defineConfig } from 'vitest/config';

// Projects: fast unit tests, React component tests (jsdom), and the property suite (fast-check over simulated replicas).
export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      {
        test: {
          name: 'unit',
          include: ['skeleton/src/**/*.test.ts', 'apps/*/src/**/*.test.ts', 'kit/**/*.test.ts'],
          exclude: ['**/*.props.test.ts', '**/node_modules/**'],
        },
      },
      {
        test: {
          name: 'limbo',
          include: ['skeleton/src/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['skeleton/src/limbo/test/setup.ts'],
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

import { defineConfig } from 'vitest/config';

// Two projects: fast unit tests, and the property suite (fast-check over simulated replicas).
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
          name: 'props',
          include: ['**/*.props.test.ts'],
          exclude: ['**/node_modules/**'],
          setupFiles: ['kit/props/setup.ts'],
          testTimeout: 600_000,
        },
      },
    ],
  },
});

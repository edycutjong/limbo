import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

// Vitest sets NODE_ENV=test and MODE=test; a real production build must not inherit them.
const prodEnv = { ...process.env, NODE_ENV: 'production', MODE: 'production' };

it('pnpm --filter @limbo/aftershock build produces dist/index.html', () => {
  execFileSync('pnpm', ['--filter', '@limbo/aftershock', 'build'], { stdio: 'pipe', env: prodEnv });
  expect(existsSync(resolve(__dirname, '../dist/index.html'))).toBe(true);
}, 120_000);

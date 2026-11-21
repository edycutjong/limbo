import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

it('pnpm --filter @limbo/basecamp build produces dist/index.html', () => {
  execFileSync('pnpm', ['--filter', '@limbo/basecamp', 'build'], { stdio: 'pipe' });
  expect(existsSync(resolve(__dirname, '../dist/index.html'))).toBe(true);
}, 120_000);

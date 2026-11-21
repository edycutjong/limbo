#!/usr/bin/env node
// Bundle budget for the two built apps: total JavaScript under dist/assets (the service worker is excluded).
// Warns over 500 KB, fails over 700 KB. Run after `pnpm build`.
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const WARN_KB = 500;
const FAIL_KB = 700;
let failed = false;
for (const app of ['basecamp', 'aftershock']) {
  const dir = join('apps', app, 'dist', 'assets');
  if (!existsSync(dir)) {
    console.error(`FAIL ${app}: ${dir} missing (run pnpm build first)`);
    failed = true;
    continue;
  }
  const bytes = readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .reduce((n, f) => n + statSync(join(dir, f)).size, 0);
  const kb = Math.round((bytes / 1024) * 10) / 10;
  const level = kb > FAIL_KB ? 'FAIL' : kb > WARN_KB ? 'WARN' : 'OK';
  console.log(`${level} ${app}: ${kb} KB of JS (warn ${WARN_KB}, fail ${FAIL_KB})`);
  if (level === 'FAIL') failed = true;
}
process.exit(failed ? 1 : 0);

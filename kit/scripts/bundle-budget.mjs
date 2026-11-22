#!/usr/bin/env node
// Bundle budget for the two built apps: total JavaScript under dist/assets (the service worker is excluded).
// Warns over 500 KB, fails over 700 KB (raw bytes) or when no JavaScript is found. Run after `pnpm build`.
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
  const js = readdirSync(dir, { recursive: true }).filter((f) => /\.m?js$/.test(String(f)));
  const bytes = js.reduce((n, f) => n + statSync(join(dir, String(f))).size, 0);
  const kb = Math.round((bytes / 1024) * 10) / 10; // display only; the gates compare raw bytes
  const level = js.length === 0 ? 'FAIL' : bytes > FAIL_KB * 1024 ? 'FAIL' : bytes > WARN_KB * 1024 ? 'WARN' : 'OK';
  console.log(`${level} ${app}: ${kb} KB of JS (warn ${WARN_KB}, fail ${FAIL_KB})`);
  if (level === 'FAIL') failed = true;
}
process.exit(failed ? 1 : 0);

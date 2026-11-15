// pnpm e2e:spike:10 — run the spike spec 10 times and write evidence/e2e/spike-<date>.json (R17.7).
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const r = spawnSync(
  'pnpm',
  ['exec', 'playwright', 'test', 'e2e/offline-spike.spec.ts', '--repeat-each=10', '--reporter=json'],
  { encoding: 'utf8', maxBuffer: 1 << 28 },
);
let report;
try { report = JSON.parse(r.stdout); } catch { process.stderr.write(r.stdout + r.stderr); process.exit(1); }

const results = [];
const walk = (s) => {
  for (const sp of s.specs ?? []) for (const t of sp.tests) for (const x of t.results)
    results.push({ repeat: t.repeatEachIndex ?? results.length, status: x.status, durationMs: x.duration });
  for (const c of s.suites ?? []) walk(c);
};
for (const s of report.suites) walk(s);
results.sort((a, b) => a.repeat - b.repeat);

const browser = await chromium.launch();
const browserVersion = browser.version();
await browser.close();

const date = new Date().toISOString().slice(0, 10);
const out = {
  date,
  spec: 'e2e/offline-spike.spec.ts',
  repeatEach: 10,
  browser: 'chromium',
  browserVersion,
  playwright: '1.59.1',
  node: process.version,
  runs: results.length,
  passed: results.filter((x) => x.status === 'passed').length,
  failed: results.filter((x) => x.status !== 'passed').length,
  durationsMs: results.map((x) => x.durationMs),
  results,
  totalWallMs: Math.round(report.stats?.duration ?? 0),
};
mkdirSync('evidence/e2e', { recursive: true });
const file = `evidence/e2e/spike-${date}.json`;
writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
console.log(`${file}: ${out.passed}/${out.runs} passed`);
process.exit(out.failed === 0 && out.runs === 10 ? 0 : 1);

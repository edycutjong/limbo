#!/usr/bin/env node
// Local CI: runs the same checks as the six stages of .github/workflows/ci.yml on this machine, in order, and records the
// result in evidence/ci/local-<date>.txt. Only a complete green run (no skipped stage, test/coverage/e2e numbers parsed)
// replaces evidence/ci/latest.json (read by judge-build.mjs) and re-renders the judge pages; any other run is kept as
// evidence/ci/partial-<date>.json and leaves the published receipts alone. Used because GitHub Actions on
// the private repo do not start while the account billing limit is hit. Usage: node kit/scripts/ci-local.mjs [--skip-e2e]
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';

const skipE2e = process.argv.includes('--skip-e2e');
const steps = [
  ['Stage 1 typecheck', 'pnpm typecheck'],
  ['Stage 1 /.kiro root check', 'pnpm kiro:check'],
  ['Stage 1 gate integrity', 'pnpm gate'],
  ['Stage 1 /judge page and JUDGE.md match the committed measurements', 'node kit/scripts/judge-build.mjs --check'],
  ['Stage 1 tests + 100% coverage', 'pnpm test:coverage'],
  ['Stage 2 gitleaks (full history)', 'gitleaks detect --source . --log-opts="--all" --no-banner -l warn'],
  ['Stage 2 pnpm audit (shipped deps)', 'pnpm audit --prod --audit-level=high'],
  ['Stage 2 pnpm audit (all deps, advisory)', 'pnpm audit --audit-level=high', { advisory: true }],
  ['Stage 3 build', 'pnpm build'],
  ['Stage 3 bundle budget', 'node kit/scripts/bundle-budget.mjs'],
  ['Stage 3 landing hero bundle fresh', 'node kit/scripts/site-hero.mjs --check'],
  ...(skipE2e ? [] : [['Stage 4 e2e', 'pnpm e2e:ci']]),
];

const out = [];
const results = [];
let unit = { passed: 0, skipped: 0 };
let coverage = {};
let e2e = { passed: 0, skipped: 0 };
for (const [name, cmd, opt = {}] of steps) {
  const t0 = Date.now();
  const r = spawnSync('bash', ['-c', cmd], { encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, CI: '1' } });
  const text = `${r.stdout}${r.stderr}`.replace(/\u001b\[[0-9;]*m/g, '');
  const seconds = Math.round((Date.now() - t0) / 100) / 10;
  results.push({ name, cmd, ok: r.status === 0, seconds, ...(opt.advisory ? { advisory: true } : {}) });
  out.push(`\n$ ${cmd}   # ${name}\n${text.split('\n').slice(-14).join('\n')}\nexit ${r.status} in ${seconds}s`);
  console.log(`${r.status === 0 ? 'PASS' : opt.advisory ? 'WARN' : 'FAIL'} ${name} (${seconds}s)`);
  if (name.includes('tests + 100%')) {
    // the run's final summary is the last match (per-project lines can come first)
    const m = [...text.matchAll(/Tests\s+(\d+) passed(?: \| (\d+) skipped)?/g)].at(-1);
    if (m) unit = { passed: Number(m[1]), skipped: Number(m[2] ?? 0) };
    for (const k of ['statements', 'branches', 'functions', 'lines']) {
      const c = text.match(new RegExp(`${k[0].toUpperCase()}${k.slice(1)}\\s*:\\s*([\\d.]+)%`));
      if (c) coverage[k] = Number(c[1]);
    }
  }
  if (name === 'Stage 4 e2e') {
    const m = [...text.matchAll(/(\d+) passed/g)].at(-1);
    const k = [...text.matchAll(/(\d+) skipped/g)].at(-1);
    if (m) e2e = { passed: Number(m[1]), skipped: k ? Number(k[1]) : 0 };
  }
}

const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const dirty = git('status', '--short').split('\n').filter((l) => l && !l.includes('evidence/ci/')).length > 0;
const date = new Date().toISOString();
const meta = {
  date,
  commit: git('rev-parse', 'HEAD'),
  tree_dirty: dirty,
  machine: `${os.cpus()[0]?.model}, ${os.platform()} ${os.release()}`,
  node: process.version,
  pnpm: execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim(),
  stages_skipped: skipE2e ? ['Stage 4 e2e'] : [],
  note: 'Stage 5 (Lighthouse, advisory) and Stage 6 (deploy gate) run only on GitHub Actions',
  all_passed: results.every((r) => r.ok || r.advisory), // advisory steps are recorded, never blocking (as in ci.yml)
  steps: results,
  unit,
  coverage,
  e2e,
};
const parsed =
  unit.passed > 0 && ['statements', 'branches', 'functions', 'lines'].every((k) => typeof coverage[k] === 'number') && e2e.passed > 0;
const complete = meta.all_passed && !skipE2e && parsed;
mkdirSync('evidence/ci', { recursive: true });
writeFileSync(`evidence/ci/${complete ? 'latest' : `partial-${date.slice(0, 10)}`}.json`, JSON.stringify(meta, null, 2) + '\n');
writeFileSync(
  `evidence/ci/local-${date.slice(0, 10)}.txt`,
  `# Local CI (GitHub Actions on this private repo do not start: account billing limit)\ncommit: ${meta.commit}${dirty ? ' (tree dirty)' : ''}\ndate: ${date}\nmachine: ${meta.machine}\nnode: ${meta.node}  pnpm: ${meta.pnpm}\n${out.join('\n')}\n\nRESULT: ${meta.all_passed ? 'all steps passed' : 'FAILED'}\n`,
);
// The /judge page and JUDGE.md read latest.json; re-render them only when it was replaced by a complete green run.
if (complete) execFileSync('node', ['kit/scripts/judge-build.mjs'], { stdio: 'inherit' });
else console.log(`not promoted: ${!meta.all_passed ? 'a step failed' : skipE2e ? 'e2e skipped' : 'numbers not parsed'}; latest.json and the judge pages are unchanged`);
process.exit(complete ? 0 : 1);

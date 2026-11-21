// Full-tier evidence (R16): run the property suite with LIMBO_PROPS_TIER=full and write
// evidence/convergence/full-<YYYY-MM-DD>.json. Not an op file; the clock rules do not apply here.
// Convergence is measured, property-tested.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Local calendar date as YYYY-MM-DD. */
export function isoDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function evidenceFileName(date) {
  return `full-${isoDate(date)}.json`;
}

/**
 * Compose the evidence object from vitest's JSON report and the suite sidecar.
 * Per-property counts group the `op <name>` tests by test title (convergence, idempotence, ...).
 * The sidecar holds one vacuity report per app. `share` takes each class from the app that registers its ops,
 * `byApp` keeps every report, and `na` lists only classes that no app registers.
 */
export function composeEvidence({ report, sidecar, yjsVersion, nodeVersion, durationMs, date }) {
  const properties = {};
  for (const file of report.testResults ?? []) {
    for (const t of file.assertionResults ?? []) {
      if (!(t.ancestorTitles?.[0] ?? '').startsWith('op ')) continue;
      const row = (properties[t.title] ??= { passed: 0, failed: 0, skipped: 0 });
      if (t.status === 'passed') row.passed++;
      else if (t.status === 'failed') row.failed++;
      else row.skipped++;
    }
  }
  const byApp = sidecar.apps ?? {};
  const names = Object.keys(byApp).sort();
  let vacuity;
  if (names.length === 0) {
    vacuity = { runs: 0, share: {}, na: [], byApp: {}, note: 'no registered ops' };
  } else {
    const share = {};
    for (const name of names) {
      for (const c of byApp[name].applicable ?? Object.keys(byApp[name].share)) {
        if (!(c in share)) share[c] = byApp[name].share[c]; // first app (by name) that registers the class
      }
    }
    // A class is n/a only when every app lists it as n/a.
    const na = byApp[names[0]].na.filter((c) => names.every((n) => byApp[n].na.includes(c)));
    vacuity = { runs: Math.max(...names.map((n) => byApp[n].runs)), share, na, byApp };
  }
  return {
    tier: sidecar.config.tier,
    replicas: sidecar.config.replicas,
    orderings: sidecar.config.orderings,
    seed: sidecar.config.seed,
    passed: report.success === true,
    passesPerProperty: Object.fromEntries(Object.entries(properties).map(([k, r]) => [k, r.passed])),
    failuresPerProperty: Object.fromEntries(Object.entries(properties).map(([k, r]) => [k, r.failed])),
    vacuity,
    yjsVersion,
    nodeVersion,
    durationMs,
    date: isoDate(date),
  };
}

function main() {
  const tmp = mkdtempSync(join(tmpdir(), 'limbo-props-full-'));
  const reportPath = join(tmp, 'report.json');
  const sidecarPath = join(tmp, 'sidecar.json');
  writeFileSync(sidecarPath, ''); // each app's sweep merges its report into this file
  const started = performance.now();
  const r = spawnSync('pnpm', ['exec', 'vitest', 'run', '--project', 'props', '--reporter=default', '--reporter=json', `--outputFile.json=${reportPath}`], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, LIMBO_PROPS_TIER: 'full', LIMBO_PROPS_SIDECAR: sidecarPath },
  });
  const durationMs = Math.round(performance.now() - started);
  if (!existsSync(reportPath) || readFileSync(sidecarPath, 'utf8').trim() === '') {
    console.error('props:full: vitest produced no report or sidecar; no evidence written');
    rmSync(tmp, { recursive: true, force: true });
    process.exit(r.status || 1);
  }
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const sidecar = JSON.parse(readFileSync(sidecarPath, 'utf8'));
  const yjsVersion = JSON.parse(readFileSync(join(ROOT, 'skeleton', 'node_modules', 'yjs', 'package.json'), 'utf8')).version;
  const now = new Date();
  const evidence = composeEvidence({ report, sidecar, yjsVersion, nodeVersion: process.versions.node, durationMs, date: now });
  const dir = join(ROOT, 'evidence', 'convergence');
  mkdirSync(dir, { recursive: true });
  const out = join(dir, evidenceFileName(now));
  writeFileSync(out, `${JSON.stringify(evidence, null, 2)}\n`);
  rmSync(tmp, { recursive: true, force: true });
  console.log(`props:full: wrote ${out}`);
  process.exit(r.status ?? 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

// The protected gate set: directories (hashed recursively) and single files. Shared by kiro-run.mjs and gate-integrity.mjs.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

export const GATE_ROOTS = [
  '.kiro/hooks',
  '.kiro/agents',
  'kit/hooks',
  'kit/props/intent',
  'kit/props/bad',
  'kit/props/golden',
  'kit/props/arbitraries',
  'kit/mcp',
];

export const GATE_FILES = [
  'kit/props/intents.json',
  'kit/props/run.ts',
  'kit/props/config.ts',
  'kit/props/suite.props.test.ts',
  'kit/props/vacuity.ts',
  'kit/props/vacuity.scaling.test.ts',
  'skeleton/src/core/simulate.ts',
  'kit/scripts/kiro-run.mjs',
  'kit/scripts/gate-list.mjs',
  'kit/scripts/gate-integrity.mjs',
];

function listFiles(d) {
  if (!existsSync(d)) return [];
  const out = [];
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    statSync(p).isDirectory() ? out.push(...listFiles(p)) : out.push(p);
  }
  return out.sort();
}

/** Map of repo-relative path -> sha256 for every protected file under `root`, keys sorted. */
export function hashGate(root) {
  const out = {};
  for (const r of GATE_ROOTS) for (const f of listFiles(join(root, r))) out[relative(root, f)] = sha(f);
  for (const f of GATE_FILES) if (existsSync(join(root, f))) out[f] = sha(join(root, f));
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function sha(f) {
  return createHash('sha256').update(readFileSync(f)).digest('hex');
}

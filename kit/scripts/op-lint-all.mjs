#!/usr/bin/env node
// Runs the op-lint hook (kit/hooks/op-lint.mjs) over every op file in both apps, the way CI lints.
// The hook's own rules: no clock or randomness tokens, `merge` and `intent` declared, intent kind matches
// kit/props/intents.json, and a commutes op has a .props.test.ts. LIMBO_HOOKS_LOG=/dev/null keeps these runs
// out of evidence/kiro/hooks.jsonl, which only Kiro sessions write. Exit 1 if any op fails.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const files = [];
for (const app of readdirSync('apps', { withFileTypes: true })) {
  if (!app.isDirectory()) continue;
  const dir = join('apps', app.name, 'src', 'ops');
  let names = [];
  try {
    names = readdirSync(dir);
  } catch {
    continue;
  }
  for (const n of names.sort()) if (n.endsWith('.op.ts')) files.push(join(dir, n));
}
if (files.length === 0) {
  console.error('op-lint-all: no op files found under apps/*/src/ops');
  process.exit(1);
}
let failed = 0;
for (const file of files) {
  const r = spawnSync(process.execPath, ['kit/hooks/op-lint.mjs'], {
    input: JSON.stringify({ file_path: file }),
    env: { ...process.env, LIMBO_HOOKS_LOG: '/dev/null' },
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    failed++;
    process.stderr.write(r.stderr || `op-lint ${file}: exit ${r.status}\n`);
  }
}
console.log(`op-lint: ${files.length - failed} of ${files.length} op files pass`);
process.exit(failed === 0 ? 0 : 1);

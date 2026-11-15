import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { runHook, root, runFastProps } from './lib.mjs';

const MAX_BLOCKS = 3;

runHook('stop-gate', 'Stop', (ev) => {
  const r = runFastProps();
  if (r.status !== 'fail') return { result: r.status, detail: r.detail ?? null };
  const sid = ev.session_id ?? process.env.KIRO_SESSION_ID ?? 'unknown';
  const sp = join(root(), '.kiro-runs', 'stop-gate-state.json');
  let state = {};
  try { state = JSON.parse(readFileSync(sp, 'utf8')); } catch { /* fresh */ }
  const n = state[sid] ?? 0;
  if (n >= MAX_BLOCKS) return { result: 'gave_up', detail: `blocked ${n} times; giving up` };
  state[sid] = n + 1;
  mkdirSync(dirname(sp), { recursive: true });
  writeFileSync(sp, JSON.stringify(state, null, 2));
  const reason =
    `The fast-tier properties failed (${r.detail ?? 'fail'}). Counterexample and failure output:\n` +
    `${(r.output ?? '').slice(0, 3000)}\n` +
    'Fix the op so the properties pass. Do not weaken, skip, or remove any property, and do not lower numRuns.';
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  return { result: 'block', detail: `block ${n + 1}/${MAX_BLOCKS}` };
});

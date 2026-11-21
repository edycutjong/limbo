import { mkdirSync, readFileSync, writeFileSync, writeSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { runHook, root, runFastProps } from './lib.mjs';

const MAX_BLOCKS = 3;

// Synchronous, complete write to fd 1. A pipe can return EAGAIN; retry until all bytes are out.
function writeAll(text) {
  const buf = Buffer.from(text);
  let off = 0;
  while (off < buf.length) {
    try {
      off += writeSync(1, buf, off, buf.length - off);
    } catch (e) {
      if (e && e.code === 'EAGAIN') continue;
      throw e;
    }
  }
}

runHook('stop-gate', 'Stop', (ev) => {
  const r = runFastProps();
  if (r.status !== 'fail') return { result: r.status, detail: r.detail ?? null };
  const sid = ev.session_id ?? process.env.KIRO_SESSION_ID ?? 'unknown';
  const sp = join(root(), '.kiro-runs', 'stop-gate-state.json');
  const stateErrors = [];
  let state = {};
  try {
    state = JSON.parse(readFileSync(sp, 'utf8'));
    if (state === null || typeof state !== 'object' || Array.isArray(state)) throw new Error('state is not an object');
  } catch (e) {
    state = {};
    if (!(e && e.code === 'ENOENT')) stateErrors.push(`state read: ${e && e.message ? e.message : e}`);
  }
  const n = Number.isInteger(state[sid]) ? state[sid] : 0;
  if (n >= MAX_BLOCKS) return { result: 'gave_up', detail: `blocked ${n} times; giving up` };
  const reason =
    `The fast-tier properties failed (${r.detail ?? 'fail'}). Counterexample and failure output:\n` +
    `${(r.output ?? '').slice(0, 3000)}\n` +
    'Fix the op so the properties pass. Do not weaken, skip, or remove any property, and do not lower numRuns.';
  // The decision goes out first, so no state error can stop it.
  writeAll(JSON.stringify({ decision: 'block', reason }));
  try {
    state[sid] = n + 1;
    mkdirSync(dirname(sp), { recursive: true });
    writeFileSync(sp, JSON.stringify(state, null, 2));
  } catch (e) {
    stateErrors.push(`state write: ${e && e.message ? e.message : e}`);
  }
  const detail = `block ${n + 1}/${MAX_BLOCKS}`;
  return { result: 'block', detail: stateErrors.length ? `${detail}; ${stateErrors.join('; ')}` : detail };
});

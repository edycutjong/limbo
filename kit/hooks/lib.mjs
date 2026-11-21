// Shared helpers for LIMBO Kiro hooks. Node ESM, no dependencies.
import { readFileSync, appendFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function root() {
  if (process.env.LIMBO_ROOT) return resolve(process.env.LIMBO_ROOT);
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
}

// Repo-relative form of a path: the root prefix becomes `.`. Text outside the root is unchanged.
export function rel(p) {
  if (typeof p !== 'string') return p;
  const r = root().replace(/\/+$/, '');
  if (!r) return p;
  const esc = r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return p.replace(new RegExp(`${esc}(?=/|$|[^\\w.-])`, 'g'), '.');
}

export function readEvent() {
  try {
    const text = readFileSync(0, 'utf8');
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

// Strict variant for guard hooks: an unreadable, empty, malformed or non-object event is an error, not `{}`.
export function readEventStrict() {
  let text;
  try {
    text = readFileSync(0, 'utf8');
  } catch (e) {
    return { event: {}, error: `cannot read the event: ${e && e.message ? e.message : e}` };
  }
  if (!text.trim()) return { event: {}, error: 'empty event' };
  let ev;
  try {
    ev = JSON.parse(text);
  } catch {
    return { event: {}, error: 'malformed event JSON' };
  }
  if (ev === null || typeof ev !== 'object' || Array.isArray(ev)) return { event: {}, error: 'event is not a JSON object' };
  return { event: ev, error: null };
}

export function hooksLogPath() {
  return process.env.LIMBO_HOOKS_LOG || join(root(), 'evidence', 'kiro', 'hooks.jsonl');
}

// Append exactly one JSON line. `ts` is a log timestamp only, never an ordering input.
export function log(row) {
  const line = {
    ts: new Date().toISOString(),
    hook: null,
    trigger: null,
    target: null,
    result: null,
    ms: 0,
    session_id: process.env.KIRO_SESSION_ID ?? null,
    task: null,
    detail: null,
    ...row,
  };
  line.target = rel(line.target);
  line.detail = rel(line.detail);
  try {
    const p = hooksLogPath();
    mkdirSync(dirname(p), { recursive: true });
    appendFileSync(p, JSON.stringify(line) + '\n');
  } catch {
    /* logging must never break the session */
  }
}

// Wrap a hook body: logs exactly one line, even on error, and exits per the body's return.
// body(event) returns { result, target?, task?, detail?, exit? }.
// `opts.failClosed` (guard hooks): a bad event or an exception in the body denies with exit 2.
// Logging-only hooks keep the default: a bad event becomes `{}` and an exception exits 0.
export function runHook(hook, trigger, body, opts = {}) {
  const start = Date.now();
  let event;
  let eventError = null;
  if (opts.failClosed) ({ event, error: eventError } = readEventStrict());
  else event = readEvent();
  const session_id = event.session_id ?? process.env.KIRO_SESSION_ID ?? null;
  const deny = (why) => {
    try { process.stderr.write(`${hook}: denied (fail closed): ${why}\n`); } catch { /* stderr gone */ }
    return { result: 'deny', detail: `fail closed: ${why}`, exit: 2 };
  };
  let out;
  if (eventError) out = deny(eventError);
  else {
    try {
      out = body(event) ?? { result: 'pass' };
    } catch (e) {
      const why = String(e && e.message ? e.message : e);
      out = opts.failClosed ? deny(`internal error: ${why}`) : { result: 'error', detail: why, exit: 0 };
    }
  }
  log({
    hook,
    trigger,
    target: out.target ?? null,
    result: out.result,
    ms: Date.now() - start,
    session_id,
    task: out.task ?? null,
    detail: out.detail ?? null,
  });
  process.exit(out.exit ?? 0);
}

export function walk(dir, pred, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, pred, acc);
    else if (pred(p)) acc.push(p);
  }
  return acc;
}

export function findOpFiles(r = root()) {
  const files = [];
  walk(join(r, 'skeleton', 'src'), (p) => p.endsWith('.op.ts'), files);
  const apps = join(r, 'apps');
  if (existsSync(apps)) {
    for (const a of readdirSync(apps)) walk(join(apps, a, 'src'), (p) => p.endsWith('.op.ts'), files);
  }
  return files.sort();
}

// Fast-tier property run. Bootstrap rule: never block the session that builds the harness.
export function runFastProps() {
  const r = root();
  if (!existsSync(join(r, 'kit', 'props', 'run.ts')) || findOpFiles(r).length === 0) {
    return { status: 'skipped:no-harness' };
  }
  const cmd = process.env.LIMBO_PROPS_CMD || 'pnpm exec vitest run --project props';
  const res = spawnSync(cmd, {
    cwd: r,
    shell: true,
    encoding: 'utf8',
    timeout: 100_000,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, LIMBO_PROPS_TIER: 'fast' },
  });
  const output = `${res.stdout ?? ''}${res.stderr ?? ''}`;
  if (res.error && res.error.code === 'ETIMEDOUT') return { status: 'fail', detail: 'timeout', output };
  if (res.status === 0) return { status: 'pass', detail: 'ok', output };
  return { status: 'fail', detail: `exit ${res.status}`, output };
}

// Last properties result recorded in the hook ledger, or null.
export function lastPropsResult() {
  try {
    const rows = readFileSync(hooksLogPath(), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    for (let i = rows.length - 1; i >= 0; i--) {
      const x = rows[i];
      if ((x.hook === 'props-after-task' || x.hook === 'stop-gate') && /^(pass|fail|block|skipped)/.test(x.result)) return x;
    }
  } catch { /* none */ }
  return null;
}

// Strip // and /* */ comments (string-aware enough for op files).
export function stripComments(src) {
  let out = '';
  let i = 0;
  let q = null;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (q) {
      out += c;
      if (c === '\\') { out += d ?? ''; i += 2; continue; }
      if (c === q) q = null;
      i++;
    } else if (c === '/' && d === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '/' && d === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i++; }
      i += 2;
    } else {
      if (c === '"' || c === "'" || c === '`') q = c;
      out += c;
      i++;
    }
  }
  return out;
}

export function opFacts(src) {
  const code = stripComments(src);
  return {
    code,
    name: /\bname:\s*['"`]([^'"`]+)['"`]/.exec(code)?.[1] ?? null,
    merge: /\bmerge:\s*['"`]([^'"`]+)['"`]/.exec(code)?.[1] ?? null,
    intent: /\bintent:\s*\{[^}]*?\bkind:\s*['"`]([^'"`]+)['"`]/s.exec(code)?.[1] ?? null,
    hasIntent: /\bintent:/.test(code),
  };
}

export const OP_FILE_RE = /(^|\/)ops\/[^/]+\.op\.ts$/;

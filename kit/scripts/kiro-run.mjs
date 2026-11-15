#!/usr/bin/env node
// kiro-run: launch one headless Kiro CLI session in this repo and append one row to evidence/kiro/sessions.jsonl.
//
// Usage:
//   node kit/scripts/kiro-run.mjs --agent <spec|limbo-builder|limbo-kitsmith|default> --prompt <file>
//        [--spec <name>] [--task <id>] [--label <slug>] [--timeout <s>] [--kit-session]
//        [--verify "<shell cmd>"] [--relaunch <n>] [--trust "<tool,...>"] [--mcp]
//
// What it does (and why):
//   * cwd is always the repository root, stdin is /dev/null, and a watchdog kills a hung run (macOS has no `timeout`).
//   * The raw stream-json goes to $LIMBO_KIRO_LOGDIR (default .kiro-runs/, gitignored): it can contain absolute paths.
//   * Credits come from the stream-json `session_usage` event (cumulative per session).
//   * Gate manifest: the protected files (hooks, agents, kit-owned properties, simulator, MCP server) are hashed before and
//     after. A non-kit session that changes them is marked `rejected-gate` and the protected paths are restored.
//   * --verify runs a check after the session; on failure the session is resumed (up to --relaunch times) with the failure.
//   * A session that spends more than 10 credits is stopped from relaunching and logged (runaway guard).
//   The wrapper never commits; the orchestrator reviews the diff and commits with Kiro-Session / Kiro-Task trailers.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const KIRO = process.env.KIRO_CLI || 'kiro-cli';
const RUNAWAY_CREDITS = 10;

const args = parseArgs(process.argv.slice(2));
if (!args.prompt) die('missing --prompt <file>');
const agent = args.agent || 'limbo-builder';
const label = args.label || `${args.spec || 'adhoc'}-${args.task || 'x'}-${stamp()}`;
const timeout = Number(args.timeout || 900);
const relaunch = Number(args.relaunch || 0);
const logDir = process.env.LIMBO_KIRO_LOGDIR || join(ROOT, '.kiro-runs');
mkdirSync(logDir, { recursive: true });

// The exact prompt sent is kept build-side for the record.
const promptAbs = join(ROOT, args.prompt);
if (!existsSync(promptAbs)) die(`prompt file not found: ${args.prompt}`);
const promptDir = join(ROOT, 'evidence/kiro/prompts');
mkdirSync(promptDir, { recursive: true });
const promptRel = relative(ROOT, promptAbs).startsWith('evidence/kiro/prompts/')
  ? relative(ROOT, promptAbs)
  : (copyFileSync(promptAbs, join(promptDir, basename(promptAbs))), `evidence/kiro/prompts/${basename(promptAbs)}`);
const promptText = readFileSync(promptAbs, 'utf8');

const version = sh(`${KIRO} --version`).stdout.trim();
const hooksFile = join(ROOT, 'evidence/kiro/hooks.jsonl');
const hooksBefore = lineCount(hooksFile);
const gateBefore = gateManifest();
const dirtyBefore = new Set(changedPaths());
const t0 = Date.now();

let sessionId = null;
let credits = 0;
let outcome = 'done';
let reason;
let attempts = 0;
let verifyOut = '';
const runs = [];

for (;;) {
  attempts++;
  const text = attempts === 1 ? promptText
    : `The repository check \`${args.verify}\` still fails after your last turn. Fix the cause (do not weaken or skip any property, test or hook). Output:\n\n${verifyOut.slice(-4000)}`;
  const r = runKiro(text, attempts === 1 ? null : sessionId, `${label}${attempts > 1 ? `-r${attempts}` : ''}`);
  runs.push(r);
  sessionId = r.sessionId || sessionId;
  credits = Math.max(credits, r.credits); // cumulative within a session
  if (r.exit !== 0 || r.status !== 'success') { outcome = r.timedOut ? 'aborted' : 'failed'; reason = r.timedOut ? `watchdog ${timeout}s` : `exit ${r.exit} status ${r.status}`; break; }
  if (credits > RUNAWAY_CREDITS) { outcome = 'aborted'; reason = `runaway guard: ${credits.toFixed(2)} credits > ${RUNAWAY_CREDITS}`; break; }
  if (!args.verify) break;
  const v = sh(args.verify, 900);
  verifyOut = (v.stdout + '\n' + v.stderr).trim();
  if (v.status === 0) break;
  if (attempts > relaunch) { outcome = 'failed'; reason = `verify failed after ${attempts} attempt(s)`; break; }
}

const gateAfter = gateManifest();
const gateChanged = Object.keys({ ...gateBefore, ...gateAfter }).filter((k) => gateBefore[k] !== gateAfter[k]);
let gateOk = gateChanged.length === 0;
if (!gateOk && !args['kit-session']) {
  outcome = 'rejected-gate';
  reason = `protected files changed: ${gateChanged.join(', ')}`;
  for (const p of gateChanged) {
    if (gateBefore[p]) sh(`git checkout -- ${JSON.stringify(p)}`);
    else sh(`rm -f ${JSON.stringify(p)}`);
  }
} else if (!gateOk) {
  gateOk = true; // kit sessions are allowed to change the gate; the change is listed below
}

const newHooks = readLines(hooksFile).slice(hooksBefore).map(safeJson).filter(Boolean)
  .filter((h) => !sessionId || !h.session_id || h.session_id === sessionId);
const hooksFired = {};
let stopBlocks = 0;
for (const h of newHooks) {
  hooksFired[h.trigger] = (hooksFired[h.trigger] || 0) + 1;
  if (h.trigger === 'Stop' && h.result === 'block') stopBlocks++;
}
const filesChanged = changedPaths().filter((p) => !dirtyBefore.has(p));

const row = {
  date: new Date().toISOString(),
  actor: 'kiro',
  session_id: sessionId,
  surface: 'kiro-cli chat --v3 --no-interactive (headless)',
  agent,
  model_reported: runs.map((r) => r.model).find(Boolean) || null,
  kiro_cli_version: version,
  spec: args.spec || null,
  task: args.task || null,
  prompt_file: promptRel,
  credits_delta: round(credits),
  attempts,
  hooks_fired: hooksFired,
  hook_updates_in_stream: runs.reduce((n, r) => n + r.hookUpdates, 0),
  stop_blocks: stopBlocks,
  steering_loaded: [...new Set(runs.flatMap((r) => r.steering))],
  files_changed: filesChanged,
  gate_manifest_ok: outcome !== 'rejected-gate',
  gate_changed: gateChanged,
  outcome,
  wall_s: Math.round((Date.now() - t0) / 1000),
  ...(reason ? { reason } : {}),
  ...(args.verify ? { verify: args.verify, verify_passed: outcome === 'done' } : {}),
  run_logs: runs.map((r) => basename(r.log)),
};
mkdirSync(join(ROOT, 'evidence/kiro'), { recursive: true });
appendFileSync(join(ROOT, 'evidence/kiro/sessions.jsonl'), JSON.stringify(row) + '\n');
console.log(JSON.stringify(row, null, 2));
process.exit(outcome === 'done' ? 0 : 1);

// ---------------------------------------------------------------------------

function runKiro(text, resumeId, runLabel) {
  const log = join(logDir, `${runLabel}.jsonl`);
  const kiroArgs = ['chat', '--v3', '--no-interactive', '--output-format', 'stream-json'];
  if (agent !== 'default') kiroArgs.push('--agent', agent);
  if (args.trust) kiroArgs.push(`--trust-tools=${args.trust}`); else kiroArgs.push('--trust-all-tools');
  if (args.mcp) kiroArgs.push('--require-mcp-startup');
  if (resumeId) kiroArgs.push('--resume-id', resumeId);
  kiroArgs.push(text);
  const started = Date.now();
  const p = spawnSync('perl', ['-e', 'alarm shift; exec @ARGV', String(timeout), KIRO, ...kiroArgs], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28, env: { ...process.env },
  });
  const out = p.stdout?.toString() || '';
  writeFileSync(log, out);
  if (p.stderr?.length) writeFileSync(log.replace(/\.jsonl$/, '.stderr.txt'), p.stderr);
  const events = out.split('\n').map(safeJson).filter(Boolean);
  let sessionIdSeen = null, creditsSeen = 0, status = null, model = null, hookUpdates = 0;
  const steering = [];
  for (const e of events) {
    walk(e, (k, v, parent) => {
      if (k === 'sessionId' && typeof v === 'string' && v.startsWith('sess_') && !sessionIdSeen) sessionIdSeen = v;
      if (k === 'credits' && Array.isArray(v)) for (const c of v) if (typeof c?.usage === 'number') creditsSeen = Math.max(creditsSeen, c.usage);
      if (k === 'steeringDocuments' && Array.isArray(v)) for (const d of v) steering.push(String(d).replace(/^.*\/\.kiro\//, '.kiro/'));
      if (k === 'id' && v === 'model' && parent && typeof parent.currentValue === 'string') model = parent.currentValue;
      if (k === 'sessionUpdate' && v === 'hook_update') hookUpdates++;
    });
    if (e.type === 'runFinished' || e.runFinished || e.event === 'runFinished') status = e.data?.status || e.runFinished?.status || status;
  }
  if (!status) { const m = out.match(/"runFinished","data":\{[^}]*"status":"([a-z_]+)"/); if (m) status = m[1]; }
  return {
    log, exit: p.status ?? -1, timedOut: p.signal === 'SIGALRM' || (p.status === null && Date.now() - started >= timeout * 1000 - 1000),
    status, sessionId: sessionIdSeen, credits: creditsSeen, model, steering, hookUpdates,
  };
}

function gateManifest() {
  const roots = ['.kiro/hooks', '.kiro/agents', 'kit/hooks', 'kit/props/intent', 'kit/props/bad', 'kit/props/golden', 'kit/mcp'];
  const files = ['kit/props/intents.json', 'kit/props/run.ts', 'kit/props/config.ts', 'skeleton/src/core/simulate.ts'];
  const out = {};
  for (const r of roots) for (const f of listFiles(join(ROOT, r))) out[relative(ROOT, f)] = sha(f);
  for (const f of files) if (existsSync(join(ROOT, f))) out[f] = sha(join(ROOT, f));
  return out;
}

function changedPaths() {
  const r = sh('git status --porcelain --untracked-files=all');
  return r.stdout.split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, ''))
    .filter((p) => !p.startsWith('evidence/kiro/sessions.jsonl') && !p.startsWith('evidence/kiro/hooks.jsonl'));
}
function listFiles(d) {
  if (!existsSync(d)) return [];
  const out = [];
  for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? out.push(...listFiles(p)) : out.push(p); }
  return out.sort();
}
function walk(o, fn, parent = null) {
  if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { fn(k, v, o); walk(v, fn, o); }
}
function sh(cmd, tSec = 120) {
  const p = spawnSync('bash', ['-c', cmd], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26, timeout: tSec * 1000 });
  return { status: p.status, stdout: p.stdout || '', stderr: p.stderr || '' };
}
function sha(f) { return createHash('sha256').update(readFileSync(f)).digest('hex'); }
function readLines(f) { return existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean) : []; }
function lineCount(f) { return readLines(f).length; }
function safeJson(l) { try { return JSON.parse(l); } catch { return null; } }
function round(x) { return Math.round(x * 10000) / 10000; }
function stamp() { return new Date().toISOString().replace(/[-:]/g, '').slice(0, 13); }
function die(m) { console.error(`kiro-run: ${m}`); process.exit(2); }
function parseArgs(a) {
  const o = {};
  for (let i = 0; i < a.length; i++) {
    if (!a[i].startsWith('--')) continue;
    const k = a[i].slice(2);
    if (a[i + 1] === undefined || a[i + 1].startsWith('--')) o[k] = true; else o[k] = a[++i];
  }
  return o;
}

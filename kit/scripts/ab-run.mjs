#!/usr/bin/env node
// ab-run: the pre-registered A/B pilot runner (evidence/kiro/ab/PREREG.md). Orchestration tooling, written by the
// orchestrator (Claude Code), not by Kiro. One run = one fresh throwaway copy of the repo at the frozen commit, one
// headless Kiro spec-task session through kit/scripts/kiro-run.mjs, then held-out scoring from outside the copy.
//
// Usage: node kit/scripts/ab-run.mjs --frozen <sha> --heldout <dir> [--from 1] [--to 20] [--n 10000] [--budget 80]
//        [--logdir <dir>] [--no-isolate] [--dry <reference-ops-dir>]
//
// Arms (PREREG §Arms): both copies drop evidence/ and .kiro/specs/merge-kit/ and get the identical fixture
// (evidence/kiro/ab/fixture: apps/_ab + .kiro/specs/ab). Arm A also drops the treatment: .kiro/{steering,hooks,agents,
// settings}, kit/, and the basecamp property bindings that import kit/.
import { spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAIN = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const AB = join(MAIN, 'evidence/kiro/ab');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]]] : acc), []),
);
if (!args.frozen || !args.heldout) die('need --frozen <sha> --heldout <dir>');
const order = JSON.parse(readFileSync(join(AB, 'order.json'), 'utf8')).runs; // [{k, op: 'Q'|'S', arm: 'A'|'B'}]
const OPS = {
  Q: { task: 1, name: 'item.adjustQty', file: 'apps/_ab/src/ops/item.adjustQty.op.ts' },
  S: { task: 2, name: 'sector.report', file: 'apps/_ab/src/ops/sector.report.op.ts' },
};
const from = Number(args.from ?? 1);
const to = Number(args.to ?? order.length);
const N = String(args.n ?? 10000);
const budget = Number(args.budget ?? 80);
const logdir = args.logdir ?? join(MAIN, '.kiro-runs', 'ab');
const runsFile = args.dry ? join(logdir, 'dry-runs.jsonl') : join(AB, 'runs.jsonl');
mkdirSync(logdir, { recursive: true });

const KHOME = join(homedir(), '.kiro');
const iso = { mcp: join(KHOME, 'settings/mcp.json'), skills: join(KHOME, 'skills') };
let isolated = false;
function isolate() {
  if (args['no-isolate']) return;
  if (existsSync(iso.mcp) && !existsSync(iso.mcp + '.limbo-ab-backup')) {
    cpSync(iso.mcp, iso.mcp + '.limbo-ab-backup');
    const j = JSON.parse(readFileSync(iso.mcp, 'utf8'));
    for (const s of Object.values(j.mcpServers ?? {})) s.disabled = true;
    writeFileSync(iso.mcp, JSON.stringify(j, null, 2));
  }
  if (existsSync(iso.skills) && !existsSync(iso.skills + '.limbo-ab-off')) renameSync(iso.skills, iso.skills + '.limbo-ab-off');
  sh('kiro-cli settings app.disableAutoupdates true', MAIN);
  isolated = true;
}
function restore() {
  if (!isolated) return;
  if (existsSync(iso.mcp + '.limbo-ab-backup')) { cpSync(iso.mcp + '.limbo-ab-backup', iso.mcp); rmSync(iso.mcp + '.limbo-ab-backup'); }
  if (existsSync(iso.skills + '.limbo-ab-off') && !existsSync(iso.skills)) renameSync(iso.skills + '.limbo-ab-off', iso.skills);
  sh('kiro-cli settings --delete app.disableAutoupdates', MAIN);
  isolated = false;
  console.error('ab-run: global Kiro config restored');
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { restore(); process.exit(130); });

const spent = () => (existsSync(runsFile) ? readFileSync(runsFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [])
  .reduce((s, r) => s + (r.credits_delta ?? 0), 0);

try {
  isolate();
  for (const run of order.filter((r) => r.k >= from && r.k <= to)) {
    if (spent() > budget) { console.error(`ab-run: A/B budget ${budget} credits reached (${spent().toFixed(2)}); stopping`); break; }
    const row = oneRun(run);
    appendFileSync(runsFile, JSON.stringify(row) + '\n');
    console.log(JSON.stringify({ k: row.k, id: row.id, fail: row.fail, heldout: row.heldout.passed, typecheck: row.typecheck, op: row.op_file_exists, credits: row.credits_delta, stops: row.stop_blocks, reads: row.reads }));
  }
} finally {
  restore();
}

function oneRun({ k, op, arm }) {
  const o = OPS[op];
  const id = `r${String(k).padStart(2, '0')}-${op}-${arm}`;
  const C = join('/tmp/limbo-ab', id);
  rmSync(C, { recursive: true, force: true });
  mkdirSync(C, { recursive: true });
  must(sh(`git -C ${q(MAIN)} archive ${args.frozen} | tar -x -C ${q(C)}`, MAIN), 'archive');
  for (const d of ['node_modules', 'skeleton/node_modules', 'kit/node_modules', 'apps/basecamp/node_modules', 'apps/aftershock/node_modules']) {
    if (existsSync(join(MAIN, d)) && existsSync(dirname(join(C, d)))) must(sh(`cp -Rc ${q(join(MAIN, d))} ${q(join(C, d))}`, MAIN), 'clone ' + d);
  }
  cpSync(join(AB, 'fixture'), C, { recursive: true });
  rmSync(join(C, 'evidence'), { recursive: true, force: true });
  rmSync(join(C, '.kiro/specs/merge-kit'), { recursive: true, force: true });
  if (arm === 'A') {
    for (const d of ['.kiro/steering', '.kiro/hooks', '.kiro/agents', '.kiro/settings', 'kit']) rmSync(join(C, d), { recursive: true, force: true });
    const ops = join(C, 'apps/basecamp/src/ops');
    for (const f of readdirSync(ops)) if (/\.props(\.test)?\.ts$/.test(f)) rmSync(join(ops, f));
  }
  mkdirSync(join(C, 'evidence/kiro/prompts'), { recursive: true });
  const prompt = `evidence/kiro/prompts/ab-task-${o.task}.md`;
  writeFileSync(join(C, prompt), `Run task ${o.task} of the ab spec only.\n`);
  must(sh('git init -q && git add -A && git -c user.email=ab@localhost -c user.name=ab commit -qm baseline', C), 'baseline');

  const label = `ab-${id}`;
  const started = Date.now();
  // --dry <dir>: mechanics check only (no Kiro session): drop a reference op from <dir> in and score it.
  const kr = args.dry ? (cpSync(join(args.dry, o.file.split('/').pop()), join(C, o.file)), { stderr: 'dry run' }) : spawnSync('node', [join(MAIN, 'kit/scripts/kiro-run.mjs'), '--agent', 'spec', '--prompt', prompt, '--spec', 'ab', '--task', String(o.task), '--label', label, '--timeout', '1500'], {
    cwd: C, encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, LIMBO_RUN_ROOT: C, LIMBO_KIRO_LOGDIR: logdir },
  });
  const sessionLines = lines(join(C, 'evidence/kiro/sessions.jsonl'));
  const session = sessionLines.length ? JSON.parse(sessionLines.at(-1)) : { outcome: 'no-row', wrapper_stderr: (kr.stderr || '').slice(-800) };
  const hooks = lines(join(C, 'evidence/kiro/hooks.jsonl'));

  // Keep the run's record build-side (repo-relative paths only).
  const out = args.dry ? join(logdir, 'dry', id) : join(AB, 'runs', id);
  mkdirSync(join(out, 'files'), { recursive: true });
  writeFileSync(join(out, 'session.json'), JSON.stringify(session, null, 2) + '\n');
  if (hooks.length) writeFileSync(join(out, 'hooks.jsonl'), hooks.join('\n') + '\n');
  sh('git add -A', C);
  const changed = sh('git diff --cached --name-only', C).stdout.split('\n').filter((p) => p && !p.startsWith('evidence/'));
  for (const p of changed) if (existsSync(join(C, p))) cpSync(join(C, p), join(out, 'files', p), { recursive: true });
  writeFileSync(join(out, 'diff.patch'), sh('git diff --cached -- . ":(exclude)evidence"', C).stdout);

  // Score from outside: typecheck, then the held-out suite copied in only now.
  const opExists = existsSync(join(C, o.file));
  const tc = sh('pnpm -s typecheck', C, 600);
  cpSync(args.heldout, join(C, '.heldout'), { recursive: true, filter: (s) => !s.includes('/selftest') });
  const rep = join(C, '.heldout-report.json');
  sh(`AB_HELDOUT_N=${N} pnpm exec vitest run --config .heldout/vitest.heldout.config.mjs -t ${q(o.name)} --reporter=json --outputFile=${q(rep)}`, C, 1800);
  let heldout = { passed: false, msg: 'no report' };
  if (existsSync(rep)) {
    const r = JSON.parse(readFileSync(rep, 'utf8'));
    const t = r.testResults.flatMap((f) => f.assertionResults).find((a) => a.ancestorTitles[0]?.startsWith(o.name));
    heldout = t ? { passed: t.status === 'passed', msg: (t.failureMessages[0] ?? '').split('\n').slice(0, 3).join(' ').slice(0, 600) } : { passed: false, msg: (r.testResults[0]?.message ?? 'test not found').slice(0, 600) };
  }
  writeFileSync(join(out, 'score.txt'), `typecheck exit ${tc.status}\n${(tc.stdout + tc.stderr).slice(-3000)}\nheldout: ${JSON.stringify(heldout)}\n`);
  const registered = sh(`grep -rlF ${q(o.name)} apps/_ab --include='*registry*' 2>/dev/null`, C).stdout.trim().length > 0;

  // Treatment leakage: Kiro reads of kit/ or .kiro/ outside the stimulus spec, from the raw stream (kitchen-side).
  const reads = { kit: 0, kiro: 0 };
  let memoryTokens = null;
  const raw = join(logdir, `${label}.jsonl`);
  for (const l of lines(raw)) {
    const m = l.match(/"memory"\s*:\s*\{[^}]*"tokens"\s*:\s*(\d+)/);
    if (m) memoryTokens = Math.max(memoryTokens ?? 0, Number(m[1]));
    if (!l.includes('"tool_call"')) continue;
    let paths = [];
    try { const u = JSON.parse(l).data?.update ?? {}; paths = [...(u.locations ?? []).map((x) => x.path), u.rawInput?.path, u.rawInput?.command].filter(Boolean); } catch { continue; }
    for (const p of paths) {
      const rel = String(p).split(C + '/').pop();
      if (/(^|\s|\/)kit\//.test(rel)) reads.kit++;
      if (/(^|\s|\/)\.kiro\//.test(rel) && !rel.includes('.kiro/specs/ab')) reads.kiro++;
    }
  }
  const stopRows = hooks.map((h) => JSON.parse(h)).filter((h) => /stop/i.test(h.hook ?? h.trigger ?? ''));
  const row = {
    k, id, arm, op: o.name, task: o.task, frozen: args.frozen, date: new Date(started).toISOString(),
    session_id: session.session_id ?? null, agent: session.agent ?? 'spec', model_reported: session.model_reported ?? null,
    kiro_cli_version: session.kiro_cli_version ?? null, credits_delta: session.credits_delta ?? 0, wall_s: session.wall_s ?? null,
    outcome: session.outcome, hooks_fired: session.hooks_fired ?? {}, stop_blocks: session.stop_blocks ?? 0,
    first_stop_verdict: stopRows[0]?.result ?? null, steering_loaded: (session.steering_loaded ?? []).length,
    files_changed: changed, op_file_exists: opExists, typecheck: tc.status === 0, heldout, registered, reads, memory_tokens: memoryTokens,
    fail: !opExists || tc.status !== 0 || !heldout.passed,
  };
  rmSync(C, { recursive: true, force: true });
  return row;
}

function sh(cmd, cwd, tSec = 300) {
  const p = spawnSync('bash', ['-c', cmd], { cwd, encoding: 'utf8', maxBuffer: 1 << 26, timeout: tSec * 1000 });
  return { status: p.status, stdout: p.stdout || '', stderr: p.stderr || '' };
}
function must(r, what) { if (r.status !== 0) die(`${what} failed: ${r.stderr.slice(-400)}`); }
function lines(f) { return existsSync(f) ? readFileSync(f, 'utf8').split('\n').filter(Boolean) : []; }
function q(s) { return JSON.stringify(s); }
function die(m) { console.error('ab-run: ' + m); restore(); process.exit(2); }

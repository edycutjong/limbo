#!/usr/bin/env node
// README / DEMO.md tally. Read-only: derives every Kiro-ledger and leanness number the README prints.
// Writes evidence/kiro/tally.json and evidence/lean.json; prints a summary. Run: node kit/scripts/readme-tally.mjs
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const rows = (f) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const sessions = rows('evidence/kiro/sessions.jsonl');
const hooks = rows('evidence/kiro/hooks.jsonl');
// One row per Kiro session id: a duplicated ledger row must not count twice (retries are separate sessions with their own ids).
const kiro = [...new Map(sessions.filter((s) => s.actor === 'kiro').map((s) => [s.session_id ?? JSON.stringify(s), s])).values()];
const bump = (o, k) => ((o[k] = (o[k] || 0) + 1), o);

const hooksByTrigger = {}, hooksByHook = {}, results = {};
for (const h of hooks) {
  bump(hooksByTrigger, h.trigger); bump(hooksByHook, h.hook); bump(results, `${h.hook}:${h.result}`);
}
const specDirs = new Set(readdirSync('.kiro/specs', { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name));
const tasks = kiro.filter((s) => s.task != null && specDirs.has(s.spec));
const kitRevisions = kiro.filter((s) => s.spec && !specDirs.has(s.spec)).length;
const specs = {};
for (const s of kiro) if (s.spec) bump(specs, s.spec);
const share = JSON.parse(readFileSync('evidence/kiro/share.json', 'utf8'));
const first = execFileSync('git', ['log', '--reverse', '--format=%ad %h', '--date=short'], { encoding: 'utf8' }).split('\n')[0];
const commits = Number(execFileSync('git', ['rev-list', '--count', 'HEAD'], { encoding: 'utf8' }).trim());
const ab = JSON.parse(readFileSync('evidence/kiro/ab/results.json', 'utf8'));
const mcpCalls = existsSync('evidence/kiro/mcp-calls.jsonl') ? rows('evidence/kiro/mcp-calls.jsonl') : [];

const tally = {
  sessions_total: sessions.length,
  kiro_sessions: kiro.length,
  claude_direct_rows: sessions.length - kiro.length,
  kiro_executed_spec_tasks: tasks.length, // legacy name: every Kiro session tied to one of the spec dirs (see the split below)
  spec_sessions_numbered_task: tasks.filter((s) => /^\d+(\.\d+)*$/.test(String(s.task))).length,
  spec_sessions_authoring: tasks.filter((s) => s.task === 'spec').length,
  spec_sessions_other: tasks.filter((s) => !/^\d+(\.\d+)*$/.test(String(s.task)) && s.task !== 'spec').length,
  bootstrap_sessions: kiro.length - tasks.length - kitRevisions,
  spec_dirs: specDirs.size,
  kit_revision_sessions: kitRevisions,
  specs,
  credits_used: Math.round(kiro.reduce((a, s) => a + (s.credits_delta || 0), 0) * 100) / 100,
  hook_fires_total: hooks.length,
  hooks_by_trigger: hooksByTrigger,
  hooks_by_hook: hooksByHook,
  hook_results: results,
  agent_stop_blocks_ledger: kiro.reduce((a, s) => a + (s.stop_blocks || 0), 0),
  agent_stop_blocks_hooklog: results['stop-gate:block'] || 0,
  shell_denials: results['guard-shell:deny'] || 0,
  // Sessions whose stream reported each steering file as loaded (`steering_loaded`); fileMatch files load only on a match.
  steering_sessions_any: kiro.filter((s) => (s.steering_loaded || []).length > 0).length,
  steering_sessions_by_file: kiro.flatMap((s) => s.steering_loaded || []).reduce((m, f) => ({ ...m, [f]: (m[f] || 0) + 1 }), {}),
  product_commits: share.product_commits,
  kiro_product_commits: share.kiro_commits,
  kiro_share: share.share,
  // CLI version per Kiro session, as the wrapper recorded it (`kiro-cli --version` at launch).
  cli_versions: kiro.reduce((m, s) => ({ ...m, [s.kiro_cli_version ?? 'unknown']: (m[s.kiro_cli_version ?? 'unknown'] || 0) + 1 }), {}),
  // The MCP server's own call log (kit/mcp writes evidence/kiro/mcp-calls.jsonl); hooks.jsonl mcp-log rows name the sessions.
  mcp_calls: mcpCalls.length,
  mcp_calls_by_tool: mcpCalls.reduce((m, c) => ({ ...m, [c.tool]: (m[c.tool] || 0) + 1 }), {}),
  mcp_fuzzed_ops: [...new Set(mcpCalls.filter((c) => c.tool === 'fuzz_op').map((c) => `${c.app}:${c.op}`))],
  mcp_apps: [...new Set(mcpCalls.map((c) => c.app).filter(Boolean))],
  mcp_sessions: [...new Set(hooks.filter((h) => h.hook === 'mcp-log').map((h) => h.session_id))].length,
  total_commits: commits,
  first_commit: first,
  ab_keys: Object.keys(ab),
};
writeFileSync('evidence/kiro/tally.json', JSON.stringify(tally, null, 2) + '\n');

// Leanness: skeleton production TS/TSX (no tests), CSS+tokens split out, exports of top-level index.ts.
const walk = (d) => readdirSync(d).flatMap((n) => {
  if (n === 'node_modules' || n === 'dist') return [];
  const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p];
});
const files = walk('skeleton/src');
const isTest = (f) => /\.test\.tsx?$/.test(f);
const ts = files.filter((f) => /\.tsx?$/.test(f) && !isTest(f));
const loc = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).length;
const code = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => { const t = l.trim(); return t && !/^(\/\/|\/\*|\*)/.test(t); }).length;
const lean = {
  skeleton_production_files: files.filter((f) => !isTest(f)).length,
  skeleton_ts_files: ts.length,
  skeleton_ts_loc_nonblank: ts.reduce((a, f) => a + loc(f), 0),
  skeleton_ts_loc_noncomment: ts.reduce((a, f) => a + code(f), 0),
  skeleton_test_files: files.filter(isTest).length,
  // exported value names (type-only exports excluded): `export { a, b }` counts 2, `export const x` counts 1
  index_exports: readFileSync('skeleton/src/index.ts', 'utf8').split('\n').reduce((n, l) => (/^export \{/.test(l) ? n + l.slice(l.indexOf('{') + 1, l.indexOf('}')).split(',').filter((x) => x.trim()).length : /^export const /.test(l) ? n + 1 : n), 0),
  files_by_dir: ts.reduce((o, f) => bump(o, relative('skeleton/src', f).split('/')[0]), {}),
};
// The 30-file / 2,400-line budget's own count (evidence/budget-basecamp-baseline.md): TS/TSX outside tests and limbo/test/,
// non-blank lines that are not `//` lines or inside `/* ... */` blocks.
const budgetFiles = ts.filter((f) => !relative('skeleton/src', f).startsWith('limbo/test/'));
const budgetLoc = (f) => { let blk = false; return readFileSync(f, 'utf8').split('\n').filter((raw) => { const l = raw.trimStart();
  if (blk) { if (l.includes('*/')) blk = false; return false; } if (!l || l.startsWith('//')) return false;
  if (l.startsWith('/*')) { if (!l.includes('*/')) blk = true; return false; } return true; }).length; };
lean.skeleton_budget_files = budgetFiles.length;
lean.skeleton_budget_loc = budgetFiles.reduce((a, f) => a + budgetLoc(f), 0);
for (const app of ['basecamp', 'aftershock']) {
  const af = walk(`apps/${app}/src`).filter((f) => /\.tsx?$/.test(f) && !isTest(f));
  lean[`${app}_ts_files`] = af.length;
  lean[`${app}_ts_loc_nonblank`] = af.reduce((a, f) => a + loc(f), 0);
  lean[`${app}_ops`] = af.filter((f) => /\.op\.ts$/.test(f)).length;
}
writeFileSync('evidence/lean.json', JSON.stringify(lean, null, 2) + '\n');
console.log(JSON.stringify({ tally, lean }, null, 1));

#!/usr/bin/env node
// ab-report: turn evidence/kiro/ab/runs.jsonl into results.json + summary.md, exactly as PREREG.md registers
// (fail counts per arm per op, 95% Wilson intervals, two-sided Fisher exact p on the pooled arms, the class rule).
// Orchestration tooling (claude-direct). Usage: node kit/scripts/ab-report.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AB = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'evidence/kiro/ab');
const rows = readFileSync(join(AB, 'runs.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const planned = JSON.parse(readFileSync(join(AB, 'order.json'), 'utf8')).runs.length;

export function wilson(k, n, z = 1.959964) {
  if (n === 0) return [0, 1];
  const p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d, h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
const lf = (n) => { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; };
/** Two-sided Fisher exact p for [[a, b], [c, d]] (sum of tables at most as likely as the observed one). */
export function fisher(a, b, c, d) {
  const r1 = a + b, r2 = c + d, c1 = a + c, n = r1 + r2;
  const pr = (x) => Math.exp(lf(r1) + lf(r2) + lf(c1) + lf(n - c1) - lf(n) - lf(x) - lf(r1 - x) - lf(c1 - x) - lf(r2 - c1 + x));
  const p0 = pr(a);
  let p = 0;
  for (let x = Math.max(0, c1 - r2); x <= Math.min(r1, c1); x++) { const q = pr(x); if (q <= p0 * (1 + 1e-9)) p += q; }
  return Math.min(1, p);
}
export function classify(a, b) {
  if (b > a) return 'NEGATIVE';
  if (a === 0 || a === b) return 'NONE';
  if (a >= 0.3 && b <= 0.1) return 'STRONG';
  return 'WEAK';
}

const cell = (arm, op) => {
  const rs = rows.filter((r) => r.arm === arm && (!op || r.op === op));
  const k = rs.filter((r) => r.fail).length, n = rs.length;
  return { k, n, rate: n ? k / n : null, wilson95: wilson(k, n).map((x) => +x.toFixed(3)) };
};
const ops = ['item.adjustQty', 'sector.report'];
const A = cell('A'), B = cell('B');
const p = fisher(A.k, A.n - A.k, B.k, B.n - B.k);
const mean = (xs) => (xs.length ? +(xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(3) : null);
const per = (arm) => {
  const rs = rows.filter((r) => r.arm === arm);
  return {
    credits_total: +rs.reduce((s, r) => s + (r.credits_delta ?? 0), 0).toFixed(4), credits_mean: mean(rs.map((r) => r.credits_delta ?? 0)),
    wall_s_mean: mean(rs.map((r) => r.wall_s ?? 0)), stop_blocks: rs.reduce((s, r) => s + (r.stop_blocks ?? 0), 0),
    runs_with_stop_block: rs.filter((r) => r.stop_blocks > 0).length,
    first_stop_verdicts: rs.map((r) => r.first_stop_verdict), registered: rs.filter((r) => r.registered).length,
    reads_kit: rs.reduce((s, r) => s + r.reads.kit, 0), reads_kiro: rs.reduce((s, r) => s + r.reads.kiro, 0),
    op_missing: rs.filter((r) => !r.op_file_exists).length, typecheck_fail: rs.filter((r) => !r.typecheck).length,
    heldout_fail: rs.filter((r) => !r.heldout.passed).length, models: [...new Set(rs.map((r) => r.model_reported))],
    memory_tokens_max: Math.max(0, ...rs.map((r) => r.memory_tokens ?? 0)),
  };
};
const results = {
  pilot: true, planned_runs: planned, runs_done: rows.length, frozen: rows[0]?.frozen ?? null,
  kiro_cli: [...new Set(rows.map((r) => r.kiro_cli_version))],
  fails: { A, B, byOp: Object.fromEntries(ops.map((o) => [o, { A: cell('A', o), B: cell('B', o) }])) },
  fisher_two_sided_p: +p.toFixed(4), class: classify(A.rate ?? 0, B.rate ?? 0),
  arms: { A: per('A'), B: per('B') },
  runs: rows.map((r) => ({ k: r.k, id: r.id, arm: r.arm, op: r.op, fail: r.fail, op_file: r.op_file_exists, typecheck: r.typecheck, heldout: r.heldout.passed,
    heldout_msg: r.heldout.msg.slice(0, 240), stop_blocks: r.stop_blocks, credits: r.credits_delta, wall_s: r.wall_s, session_id: r.session_id })),
};
writeFileSync(join(AB, 'results.json'), JSON.stringify(results, null, 2) + '\n');

const pc = (c) => `${c.k}/${c.n} (95% CI ${(c.wilson95[0] * 100).toFixed(0)}–${(c.wilson95[1] * 100).toFixed(0)}%)`;
const md = `# A/B pilot — results

Pre-registration: \`PREREG.md\` (committed before run 1). Runs: ${rows.length} of ${planned} planned. Frozen commit \`${results.frozen?.slice(0, 7)}\`.
This is a **pilot**; the numbers below are published whatever they show.

| | arm A (no kit) | arm B (kit) |
|---|---|---|
| held-out failures, both ops | ${pc(A)} | ${pc(B)} |
${ops.map((o) => `| \`${o}\` | ${pc(results.fails.byOp[o].A)} | ${pc(results.fails.byOp[o].B)} |`).join('\n')}
| op file missing / typecheck fail / held-out fail | ${per('A').op_missing} / ${per('A').typecheck_fail} / ${per('A').heldout_fail} | ${per('B').op_missing} / ${per('B').typecheck_fail} / ${per('B').heldout_fail} |
| Agent Stop blocks (runs with a block) | — | ${per('B').stop_blocks} (${per('B').runs_with_stop_block}) |
| credits per session (mean) | ${per('A').credits_mean} | ${per('B').credits_mean} |
| wall time per session, s (mean) | ${per('A').wall_s_mean} | ${per('B').wall_s_mean} |
| op registered in a registry (not scored) | ${per('A').registered} | ${per('B').registered} |
| Kiro reads of kit/ · .kiro/ (outside the stimulus) | ${per('A').reads_kit} · ${per('A').reads_kiro} | ${per('B').reads_kit} · ${per('B').reads_kiro} |

Two-sided Fisher exact p (pooled arms): **${results.fisher_two_sided_p}**. Model as reported: ${[...new Set(rows.map((r) => r.model_reported))].join(', ')}.
Pre-registered internal bin: ${results.class} (internal only; judge-facing copy gives counts, intervals and p).

## Per run
| k | run | fail | op file | typecheck | held-out | Stop blocks | credits | first failure |
|---|---|---|---|---|---|---|---|---|
${rows.map((r) => `| ${r.k} | ${r.id} | ${r.fail ? 'FAIL' : 'pass'} | ${r.op_file_exists ? 'yes' : 'no'} | ${r.typecheck ? 'ok' : 'fail'} | ${r.heldout.passed ? 'pass' : 'fail'} | ${r.stop_blocks} | ${r.credits_delta} | ${r.heldout.passed ? '' : r.heldout.msg.replace(/\|/g, '/').slice(0, 140)} |`).join('\n')}

Observations beyond the pre-registered measures (read them before quoting arm B's Stop blocks): \`observations.md\`.

Raw: \`runs.jsonl\`, \`runs/<run>/\` (session row, hook rows, Kiro's files, diff, score), held-out suite in \`heldout/\`.
`;
writeFileSync(join(AB, 'summary.md'), md);
console.log(JSON.stringify({ runs: rows.length, A: `${A.k}/${A.n}`, B: `${B.k}/${B.n}`, p: results.fisher_two_sided_p, class: results.class }));

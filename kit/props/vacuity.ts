// Vacuity guard (R12): tag each simulated script with the conflict classes it contains,
// then report the share of runs per class. A class under MIN_SHARE fails; a class whose ops
// are not registered is `n/a` and excluded. Not a reducer file; no clock or randomness here.
import { canonical, concurrent, covers } from '../../skeleton/src/core/causal.ts';
import { simulate } from '../../skeleton/src/core/simulate.ts';
import type { Op, OpDef } from '../../skeleton/src/core/types.ts';
import { applicableClasses } from './arbitraries/index.ts';
import { config as defaultConfig } from './config.ts';
import type { RunOptions } from './run.ts';

export const MIN_SHARE = 0.5;

/** Ops that write item content (requirements glossary: Edit), minus restore which has its own classes. */
const EDITS = new Set(['item.tick', 'item.rename', 'item.claim']);

function conc(a: Op, b: Op): boolean {
  return a.id !== b.id && a.target === b.target && concurrent(a, b);
}

/** "Same gap": equal `left`/`right` bounds when the payload carries them, else an identical key. */
function gapOf(o: Op): string | undefined {
  const p = o.payload as { key?: unknown; left?: unknown; right?: unknown } | null;
  if (p === null || typeof p !== 'object') return undefined;
  if ('left' in p || 'right' in p) return canonical({ left: p.left ?? null, right: p.right ?? null });
  return typeof p.key === 'string' ? p.key : undefined;
}

const who = (o: Op): unknown => (o.payload as { who?: unknown } | null)?.who;

/** Scan a script (the ops of one run) and return the R12.3 classes it contains. */
export function classify(script: readonly Op[]): Set<string> {
  const found = new Set<string>();
  const by = (name: string): Op[] => script.filter((o) => o.op === name);
  const dels = by('item.delete');
  const restores = by('item.restore');
  const claims = by('item.claim');
  const releases = by('item.release');
  const moves = by('item.move');
  const renames = by('item.rename');
  const edits = script.filter((o) => EDITS.has(o.op));

  if (dels.some((d) => edits.some((e) => conc(d, e)))) found.add('delete-edit');
  if (dels.some((d) => restores.some((r) => conc(d, r)))) found.add('restore-delete');
  // Keep (a restore that covers one delete) concurrent with another delete of the same item.
  if (restores.some((r) => dels.some((d1) => d1.target === r.target && covers(r, d1) && dels.some((d2) => d2 !== d1 && conc(r, d2))))) {
    found.add('keep-delete');
  }
  // Includes a duplicate claimant: the same `who` on two concurrent claims counts.
  if (claims.some((a) => claims.some((b) => a.id < b.id && conc(a, b)))) found.add('claim-claim');
  if (claims.some((c) => dels.some((d) => conc(c, d)))) found.add('claim-delete');
  if (moves.some((a) => moves.some((b) => a.id < b.id && conc(a, b)))) found.add('move-move');
  if (
    moves.some((a) =>
      moves.some((b) => {
        const g = gapOf(a);
        return a.id < b.id && a.stamp.r !== b.stamp.r && concurrent(a, b) && g !== undefined && g === gapOf(b);
      }),
    )
  ) {
    found.add('move-same-gap');
  }
  if (moves.some((m) => dels.some((d) => conc(m, d)))) found.add('move-delete');
  // claim -> release -> claim again: same item, same claimant, each covering the previous.
  if (
    claims.some((c1) =>
      releases.some(
        (r) =>
          r.target === c1.target &&
          who(r) === who(c1) &&
          covers(r, c1) &&
          claims.some((c2) => c2.target === c1.target && who(c2) === who(c1) && covers(c2, r)),
      ),
    )
  ) {
    found.add('claim-release-claim');
  }
  for (const a of renames) {
    for (const b of renames) {
      if (a.id >= b.id || !conc(a, b)) continue;
      found.add(canonical(a.payload) === canonical(b.payload) ? 'lww-equal' : 'lww-different');
    }
  }
  return found;
}

export interface VacuityReport {
  runs: number;
  /** Share of runs containing each applicable class (0..1). */
  share: Record<string, number>;
  applicable: string[];
  /** Classes whose ops are not registered: reported, never counted as passing. */
  na: string[];
}

/** Share per class over a list of per-run class sets. Unregistered classes are `n/a`. */
export function vacuityReport(registered: Iterable<string>, runs: readonly ReadonlySet<string>[]): VacuityReport {
  const { applicable, na } = applicableClasses(registered);
  const share: Record<string, number> = {};
  for (const c of applicable) share[c] = runs.length === 0 ? 0 : runs.filter((r) => r.has(c)).length / runs.length;
  return { runs: runs.length, share, applicable, na };
}

/** Applicable classes whose share is under `min`, one message each. Empty = pass. `n/a` is never a failure. */
export function vacuityFailures(report: VacuityReport, min: number = MIN_SHARE): string[] {
  return report.applicable
    .filter((c) => (report.share[c] ?? 0) < min)
    .map(
      (c) =>
        `conflict class "${c}" occurred in ${((report.share[c] ?? 0) * 100).toFixed(1)}% of ${report.runs} runs, under ${min * 100}%; fix the generator, not the threshold`,
    );
}

/** Human-readable summary that names the `n/a` classes. */
export function formatVacuity(report: VacuityReport): string {
  const lines = report.applicable.map((c) => `  ${c}: ${((report.share[c] ?? 0) * 100).toFixed(1)}%`);
  const na = report.na.map((c) => `  ${c}: n/a (op not registered)`);
  return [`vacuity over ${report.runs} runs:`, ...lines, ...na].join('\n');
}

/** Simulate `runs` scripts over all registered defs and measure class shares. */
export function measureVacuity(defs: readonly OpDef[], opts: RunOptions = {}, runs?: number): VacuityReport {
  const cfg = opts.config ?? defaultConfig;
  const n = runs ?? cfg.orderings;
  const range = opts.steps ?? { min: 2, max: 14 };
  const init = opts.init ?? (() => ({}));
  const sets: Set<string>[] = [];
  for (let i = 0; i < n; i++) {
    const res = simulate({
      defs: [...defs],
      replicas: cfg.replicas,
      seed: (cfg.seed + i) >>> 0,
      steps: range.min + (i % (range.max - range.min + 1)),
      init,
      ...(opts.gen ? { gen: opts.gen } : {}),
    });
    sets.push(classify(res.ops));
  }
  return vacuityReport(
    defs.map((d) => d.name),
    sets,
  );
}

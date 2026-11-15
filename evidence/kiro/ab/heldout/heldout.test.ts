// Held-out scoring suite for the LIMBO A/B pilot. Imports each op module BY PATH (registration is not scored).
// A run fails if the op file is missing, any golden history fails, or any of the 10,000 scripts fails.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { OpDef } from '../skeleton/src/core/types.ts';
import { SEVERITIES, qtyOracle, runMany, severityOracle, type Severity, type Subject } from './engine.ts';
import { pair } from './golden.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const N = Number(process.env.AB_HELDOUT_N ?? 10_000);
const OPS = process.env.AB_HELDOUT_OPS_DIR ?? join(ROOT, 'apps/_ab/src/ops');
type AnyMod = Record<string, unknown> & { default?: OpDef };
async function load(file: string): Promise<AnyMod> {
  const p = join(OPS, file);
  if (!existsSync(p)) throw new Error(`op file missing: ${file}`);
  return (await import(pathToFileURL(p).href)) as AnyMod;
}
const fn = (m: AnyMod, k: string) => {
  if (typeof m[k] !== 'function') throw new Error(`missing export ${k}`);
  return m[k] as (...a: unknown[]) => unknown;
};

describe('item.adjustQty (held-out)', () => {
  it(`golden + ${N} scripts x 3 replicas, seeds 90000001..`, async () => {
    const m = await load('item.adjustQty.op.ts');
    const def = m.default!;
    expect(def?.name).toBe('item.adjustQty');
    const pay = fn(m, 'adjustQtyPayload');
    const qty = fn(m, 'qtyOf');
    // G-Q1: both at 0, +1 and +1 concurrently -> 2 everywhere.
    let g = pair(def);
    g.act('a', 'x', (s) => pay(s, 'x', 1)); g.act('b', 'x', (s) => pay(s, 'x', 1));
    g.sync('a', 'b'); g.sync('b', 'a');
    expect([qty(g.state('a'), 'x'), qty(g.state('b'), 'x')]).toEqual([2, 2]);
    // G-Q2: a +3, b sees it then -1, a sees that -> 2; untouched item reads 0.
    g = pair(def);
    g.act('a', 'x', (s) => pay(s, 'x', 3)); g.sync('a', 'b');
    g.act('b', 'x', (s) => pay(s, 'x', -1)); g.sync('b', 'a');
    expect([qty(g.state('a'), 'x'), qty(g.state('b'), 'x'), qty(g.state('a'), 'y')]).toEqual([2, 2, 0]);
    // G-Q3: synced at 5, then a -1 and b +2 concurrently -> 6.
    g = pair(def);
    g.act('a', 'x', (s) => pay(s, 'x', 5)); g.sync('a', 'b');
    g.act('a', 'x', (s) => pay(s, 'x', -1)); g.act('b', 'x', (s) => pay(s, 'x', 2));
    g.sync('b', 'a'); g.sync('a', 'b');
    expect([qty(g.state('a'), 'x'), qty(g.state('b'), 'x')]).toEqual([6, 6]);
    const BY = [-2, -1, 1, 1, 2, 3];
    const s: Subject<{ by: number }> = {
      def, targets: ['i1', 'i2'], draw: (r) => ({ by: r.pick(BY) }),
      payload: (st, t, a) => pay(st, t, a.by), read: (st, t) => qty(st, t), expected: qtyOracle,
    };
    const res = runMany(s, 90_000_001, N);
    expect(res.failed, res.samples.join('\n')).toBe(0);
  }, 1_800_000);
});

describe('sector.report (held-out)', () => {
  it(`golden + ${N} scripts x 3 replicas, seeds 91000001..`, async () => {
    const m = await load('sector.report.op.ts');
    const def = m.default!;
    expect(def?.name).toBe('sector.report');
    const pay = fn(m, 'reportPayload');
    const sev = fn(m, 'severityOf');
    // G-S1: concurrent major (a) and minor (b) -> major on both.
    let g = pair(def);
    g.act('a', 's', (st) => pay(st, 's', 'major')); g.act('b', 's', (st) => pay(st, 's', 'minor'));
    g.sync('a', 'b'); g.sync('b', 'a');
    expect([sev(g.state('a'), 's'), sev(g.state('b'), 's')]).toEqual(['major', 'major']);
    // G-S2: a critical; b sees it and re-inspects to minor -> minor on both; unreported sector reads none.
    g = pair(def);
    g.act('a', 's', (st) => pay(st, 's', 'critical')); g.sync('a', 'b');
    g.act('b', 's', (st) => pay(st, 's', 'minor')); g.sync('b', 'a');
    expect([sev(g.state('a'), 's'), sev(g.state('b'), 's'), sev(g.state('a'), 'q')]).toEqual(['minor', 'minor', 'none']);
    // G-S3: synced at major; then a clears to none (seen) while b concurrently reports critical -> critical.
    g = pair(def);
    g.act('a', 's', (st) => pay(st, 's', 'major')); g.sync('a', 'b');
    g.act('a', 's', (st) => pay(st, 's', 'none')); g.act('b', 's', (st) => pay(st, 's', 'critical'));
    g.sync('a', 'b'); g.sync('b', 'a');
    expect([sev(g.state('a'), 's'), sev(g.state('b'), 's')]).toEqual(['critical', 'critical']);
    const s: Subject<{ severity: Severity }> = {
      def, targets: ['s1', 's2'], draw: (r) => ({ severity: r.pick(SEVERITIES) }),
      payload: (st, t, a) => pay(st, t, a.severity), read: (st, t) => sev(st, t), expected: severityOracle,
    };
    const res = runMany(s, 91_000_001, N);
    expect(res.failed, res.samples.join('\n')).toBe(0);
  }, 1_800_000);
});

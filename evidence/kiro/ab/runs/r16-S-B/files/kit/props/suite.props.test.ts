// Property suite over every registered op (R10.3) plus the vacuity guard (R12).
// Registries are the generated `apps/*/src/ops/registry.gen.ts` files (`export const ops = [...]`).
// With no registered ops the suite reports `skipped:no-ops`; that is a skip, never a pass.
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { OpDef } from '../../skeleton/src/core/types.ts';
import { CONFLICT_CLASSES, applicableClasses } from './arbitraries/index.ts';
import { config } from './config.ts';
import { runOpProperties, type RunOptions } from './run.ts';
import { writeSidecar } from './sidecar.ts';
import { MIN_SHARE, formatVacuity, measureVacuityAsync, vacuityFailures, type VacuityReport } from './vacuity.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Per-op options come from the sibling `<op>.props.ts` (`export const opts`), as in each op's own test. */
const optsByOp = new Map<string, RunOptions>();

async function loadRegistry(): Promise<OpDef[]> {
  const appsDir = join(ROOT, 'apps');
  if (!existsSync(appsDir)) return [];
  const defs: OpDef[] = [];
  for (const app of readdirSync(appsDir).sort()) {
    const file = join(appsDir, app, 'src', 'ops', 'registry.gen.ts');
    if (!existsSync(file)) continue;
    const mod = (await import(pathToFileURL(file).href)) as { ops?: OpDef[] };
    for (const def of mod.ops ?? []) {
      defs.push(def);
      const propsFile = join(appsDir, app, 'src', 'ops', `${def.name}.props.ts`);
      if (!existsSync(propsFile)) continue;
      const pm = (await import(pathToFileURL(propsFile).href)) as { opts?: RunOptions };
      if (pm.opts) optsByOp.set(def.name, pm.opts);
    }
  }
  return defs;
}

const defs = await loadRegistry();

if (defs.length === 0) {
  writeSidecar(null);
  describe('props suite', () => {
    it.skip('skipped:no-ops (no registered ops; not counted as passing)', () => {});
  });
} else {
  for (const def of defs) runOpProperties(def, optsByOp.get(def.name));

  // Mixed-script generator for the vacuity guard: each op draws its payload from its own generator, and every
  // op lands on one hot item so ops of different kinds collide (delete-edit, claim-delete, move-delete ...).
  const gen: NonNullable<RunOptions['gen']> = (def, rand) => {
    const g = optsByOp.get(def.name)?.gen ?? (() => ({ target: 't0', payload: {} }));
    return { ...g(def, rand), target: 't0' };
  };
  // Long scripts: a class such as claim-release-claim needs three causally chained ops on one replica.
  const steps = { min: 60, max: 120 };

  describe('vacuity guard', () => {
    // n/a classes depend only on the registered defs, so they are known at collection time.
    const { na: naList } = applicableClasses(
      defs.map((d) => d.name),
      defs.filter((d) => d.merge === 'causal-lww').map((d) => d.name),
    );
    const na = new Set(naList);
    // The simulation runs in beforeAll (async, yielding) so no sync block outlives Vitest's worker RPC timeout.
    let report!: VacuityReport;
    beforeAll(async () => {
      report = await measureVacuityAsync(defs, { gen, steps });
      writeSidecar(report);
    }, 30 * 60_000);
    for (const c of CONFLICT_CLASSES) {
      if (na.has(c.name)) {
        it.skip(`${c.name}: n/a (${c.anyLww ? 'no causal-lww op registered' : `op not registered: ${c.requires.join(', ')}`})`, () => {});
        continue;
      }
      it(`${c.name} occurs in at least ${MIN_SHARE * 100}% of ${config.orderings} runs`, () => {
        const msgs = vacuityFailures({ ...report, applicable: [c.name] });
        expect(msgs, formatVacuity(report)).toEqual([]);
      });
    }
  });
}

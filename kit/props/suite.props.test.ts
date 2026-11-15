// Property suite over every registered op (R10.3) plus the vacuity guard (R12).
// Registries are the generated `apps/*/src/ops/registry.gen.ts` files (`export const ops = [...]`).
// With no registered ops the suite reports `skipped:no-ops`; that is a skip, never a pass.
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { OpDef } from '../../skeleton/src/core/types.ts';
import { CONFLICT_CLASSES } from './arbitraries/index.ts';
import { config } from './config.ts';
import { runOpProperties } from './run.ts';
import { MIN_SHARE, formatVacuity, measureVacuity, vacuityFailures } from './vacuity.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

async function loadRegistry(): Promise<OpDef[]> {
  const appsDir = join(ROOT, 'apps');
  if (!existsSync(appsDir)) return [];
  const defs: OpDef[] = [];
  for (const app of readdirSync(appsDir).sort()) {
    const file = join(appsDir, app, 'src', 'ops', 'registry.gen.ts');
    if (!existsSync(file)) continue;
    const mod = (await import(pathToFileURL(file).href)) as { ops?: OpDef[] };
    defs.push(...(mod.ops ?? []));
  }
  return defs;
}

const defs = await loadRegistry();

if (defs.length === 0) {
  describe('props suite', () => {
    it.skip('skipped:no-ops (no registered ops; not counted as passing)', () => {});
  });
} else {
  for (const def of defs) runOpProperties(def);

  describe('vacuity guard', () => {
    const report = measureVacuity(defs);
    const na = new Set(report.na);
    for (const c of CONFLICT_CLASSES) {
      if (na.has(c.name)) {
        it.skip(`${c.name}: n/a (op not registered: ${c.requires.join(', ')})`, () => {});
        continue;
      }
      it(`${c.name} occurs in at least ${MIN_SHARE * 100}% of ${config.orderings} runs`, () => {
        const msgs = vacuityFailures({ ...report, applicable: [c.name] });
        expect(msgs, formatVacuity(report)).toEqual([]);
      });
    }
  });
}

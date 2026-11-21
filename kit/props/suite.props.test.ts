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
import { MIXED_PROPERTIES, mixedRun, shrinkMixed, type AppProps, type MixedRun } from './mixed.ts';
import { runOpProperties, type RunOptions } from './run.ts';
import { writeSidecar } from './sidecar.ts';
import { MIN_SHARE, formatVacuity, mixedGen, mixedReport, vacuityFailures, type VacuityReport } from './vacuity.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Per-op options come from the sibling `<op>.props.ts` (`export const opts`), as in each op's own test. */
const optsByOp = new Map<string, RunOptions>();

interface AppEntry {
  app: string;
  defs: OpDef[];
  hook?: AppProps;
}

async function loadRegistry(): Promise<AppEntry[]> {
  const appsDir = join(ROOT, 'apps');
  if (!existsSync(appsDir)) return [];
  const apps: AppEntry[] = [];
  for (const app of readdirSync(appsDir).sort()) {
    const dir = join(appsDir, app, 'src', 'ops');
    const file = join(dir, 'registry.gen.ts');
    if (!existsSync(file)) continue;
    const mod = (await import(pathToFileURL(file).href)) as { ops?: OpDef[] };
    const entry: AppEntry = { app, defs: [] };
    for (const def of mod.ops ?? []) {
      entry.defs.push(def);
      const propsFile = join(dir, `${def.name}.props.ts`);
      if (!existsSync(propsFile)) continue;
      const pm = (await import(pathToFileURL(propsFile).href)) as { opts?: RunOptions };
      if (pm.opts) optsByOp.set(def.name, pm.opts);
    }
    const hookFile = join(dir, 'app.props.ts');
    if (existsSync(hookFile)) entry.hook = ((await import(pathToFileURL(hookFile).href)) as { app?: AppProps }).app;
    if (entry.defs.length > 0) apps.push(entry);
  }
  return apps;
}

const apps = await loadRegistry();
const defs = apps.flatMap((a) => a.defs);

if (defs.length === 0) {
  writeSidecar(null);
  describe('props suite', () => {
    it.skip('skipped:no-ops (no registered ops; not counted as passing)', () => {});
  });
} else {
  for (const def of defs) runOpProperties(def, optsByOp.get(def.name));

  // Mixed scripts: every registered op of one app on a few hot targets, each op's payload from its own generator.
  // One sweep per app feeds both the mixed properties and the vacuity guard, so the guard measures the checked runs.
  const gen = mixedGen(optsByOp);
  const sidecarDone = { value: false };

  for (const { app, defs: appDefs, hook } of apps) {
    const runs: MixedRun[] = [];
    let report!: VacuityReport;
    // The sweep runs in beforeAll (async, yielding) so no sync block outlives Vitest's worker RPC timeout.
    const sweep = (async (): Promise<void> => {
      for (let i = 0; i < config.orderings; i++) {
        runs.push(mixedRun(appDefs, hook, gen, config, i));
        if ((i + 1) % 25 === 0) await new Promise<void>((res) => setImmediate(res));
      }
      report = mixedReport(appDefs, runs.map((r) => r.classes));
      if (!sidecarDone.value) {
        sidecarDone.value = true;
        writeSidecar(report);
      }
    })();

    describe(`mixed ${app}`, () => {
      beforeAll(() => sweep, 30 * 60_000);
      const names = hook ? MIXED_PROPERTIES.filter((n) => hook[n === 'intent:life' ? 'life' : n === 'intent:claim' ? 'claim' : n === 'intent:move' ? 'move' : 'materialize'] !== undefined) : [];
      if (!hook) it.skip(`no ${app}/src/ops/app.props.ts: mixed properties not run`, () => {});
      for (const name of names) {
        it(name, () => {
          const bad = runs.find((r) => r.failures.some((f) => f.property === name));
          if (!bad) return;
          throw new Error(shrinkMixed(appDefs, hook!, gen, config, bad.index, bad.steps, name).reason);
        });
      }
    });

    describe(apps.length > 1 ? `vacuity guard (${app})` : 'vacuity guard', () => {
      const { na: naList } = applicableClasses(
        appDefs.map((d) => d.name),
        appDefs.filter((d) => d.merge === 'causal-lww').map((d) => d.name),
      );
      const na = new Set(naList);
      beforeAll(() => sweep, 30 * 60_000);
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
}

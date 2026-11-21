// Property harness: runOpProperties(def) registers one `it` per property for one op.
// The vitest-free harness lives in `engine.ts`; this file re-exports it.
// Not a reducer file. Randomness comes only from fast-check and the simulator's seeded PRNG.
// Convergence is measured, property-tested.
import * as fc from 'fast-check';
import { describe, it } from 'vitest';
import type { OpDef } from '../../skeleton/src/core/types.ts';
import { config as defaultConfig } from './config.ts';
import { checkManifest, checkRun, loadManifest, PROPERTY_NAMES, type RunOptions } from './engine.ts';

export * from './engine.ts';

/** Register the property blocks for one op. Call from a `*.props.test.ts` file. */
export function runOpProperties(def: OpDef, opts: RunOptions = {}): void {
  const cfg = opts.config ?? defaultConfig;
  const range = opts.steps ?? { min: 2, max: 14 };
  const arb = fc.record({
    seed: fc.integer({ min: 0, max: 0x7fffffff }),
    steps: fc.integer({ min: range.min, max: range.max }),
  });

  describe(`op ${def.name}`, () => {
    const names = [...PROPERTY_NAMES.filter((n) => n !== 'manifest'), ...(opts.checks ?? []).map((c) => c.name)];
    for (const name of names) {
      it(name, () => {
        fc.assert(
          fc.property(arb, ({ seed, steps }) => {
            const f = checkRun(def, seed, steps, opts).find((x) => x.property === name);
            if (f) throw new Error(f.reason);
          }),
          { numRuns: cfg.orderings, seed: cfg.seed, endOnFailure: false },
        );
      });
    }
    it('manifest', () => {
      const r = checkManifest(def, opts.manifest ?? loadManifest());
      if (r !== true) throw new Error(r);
    });
  });
}

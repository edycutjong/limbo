// Mutation fixtures (R15): deliberately wrong ops, each of which the kit must catch.
// Not product code and not an op file. Convergence is measured, property-tested.
import type { Op, OpDef } from '../../../skeleton/src/core/types.ts';
import type { RunOptions } from '../run.ts';

/** A golden check for a fixture whose bug only a golden history shows (R15, design: G20). */
export interface GoldenMutant {
  file: string;
  /** Materialize a golden history's ops with the wrong reducer. */
  run(ops: readonly Op[]): unknown;
}

export interface Fixture {
  name: string;
  /** Property names (e.g. `intent:set`, `convergence`) or `golden:<G..>`; at least one must fail. */
  expectFails: readonly string[];
  def?: OpDef;
  opts?: RunOptions;
  golden?: GoldenMutant;
}

export const asDef = (d: unknown): OpDef => d as OpDef;

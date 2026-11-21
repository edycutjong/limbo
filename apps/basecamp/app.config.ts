// BASECAMP app config (R13.1): everything the skeleton needs from this app, in one place.
import { describeConflicts, twinCount } from './src/conflicts.ts';
import { materialize } from './src/model.ts';
import { ops } from './src/ops/registry.gen.ts';
import { goldens } from './src/scene.ts';
import { seedOps } from './src/seed.ts';

export const name = 'basecamp';
export const defs = ops;
export { materialize, describeConflicts, twinCount, seedOps, goldens };

/** Replica `a` acts as Sari and `b` as Budi. */
export const members = {
  a: { member: 'sari', display: 'Sari' },
  b: { member: 'budi', display: 'Budi' },
} as const;

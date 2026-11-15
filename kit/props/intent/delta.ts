// Intent `delta`: field += n. Oracle: field = initial + sum of the deltas of every op in the log.
import type { Op } from '../../../skeleton/src/core/types.ts';
import type { RunCheck } from '../run.ts';
import { eachTarget, type State, intentCheck } from './common.ts';

export interface DeltaSpec {
  /** The integer an op adds, or `undefined` if the op is not a delta of the field. */
  delta(op: Op): number | undefined;
  read(state: State, target: string): number | undefined;
  /** Field value before any op. Default 0. */
  initial?: number;
}

export function deltaIntent(spec: DeltaSpec): RunCheck {
  return intentCheck('intent:delta', (res) =>
    eachTarget(res, (o) => spec.delta(o) !== undefined, ({ state, target, ops }) => {
      let want = spec.initial ?? 0;
      for (const o of ops) want += spec.delta(o)!;
      const got = spec.read(state, target) ?? spec.initial ?? 0;
      return got === want ? true : `field is ${got}, expected initial + sum of ${ops.length} delta(s) = ${want}`;
    }),
  );
}

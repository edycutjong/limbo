// Intent `set`: field := value. Ticks are this, never a toggle.
// Oracle: the final value is one some frontier write wrote; equal concurrent values give that value;
// a write that has seen another beats it (the simulator skews each replica's clock, so a reducer that
// reads a wall clock picks a dominated write and fails here).
import type { RunCheck } from '../run.ts';
import { eachTarget, type State, intentCheck, same, sees, show } from './common.ts';
import type { Op } from '../../../skeleton/src/core/types.ts';

export interface SetSpec {
  /** The value an op writes to the field, or `undefined` if the op is not a write of it. */
  write(op: Op): unknown;
  /** The field's value in a replica state for a target. */
  read(state: State, target: string): unknown;
}

export function setIntent(spec: SetSpec): RunCheck {
  return intentCheck('intent:set', (res) =>
    eachTarget(res, (o) => spec.write(o) !== undefined, ({ state, target, ops }) => {
      const frontier = ops.filter((w) => !ops.some((o) => o !== w && sees(o, w)));
      const values = frontier.map((w) => spec.write(w));
      const got = spec.read(state, target);
      if (!values.some((v) => same(v, got))) {
        return `value ${show(got)} is not written by any frontier write (frontier values: ${show(values)})`;
      }
      if (values.every((v) => same(v, values[0])) && !same(got, values[0])) {
        return `concurrent writes all wrote ${show(values[0])} but the field is ${show(got)}`;
      }
      return true;
    }),
  );
}

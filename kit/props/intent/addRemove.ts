// Intent `add-remove`: set membership. An add concurrent with a remove survives.
// Oracle: member m is present iff some add of m is not covered by a remove of m that observed it.
import type { Op } from '../../../skeleton/src/core/types.ts';
import type { RunCheck } from '../run.ts';
import { eachTarget, type State, intentCheck, sees, show } from './common.ts';

export interface AddRemoveSpec {
  add(op: Op): string | undefined;
  remove(op: Op): string | undefined;
  /** Members present in a replica state for a target. */
  read(state: State, target: string): readonly string[];
}

export function addRemoveIntent(spec: AddRemoveSpec): RunCheck {
  return intentCheck('intent:add-remove', (res) =>
    eachTarget(res, (o) => spec.add(o) !== undefined || spec.remove(o) !== undefined, ({ state, target, ops }) => {
      const want = new Set<string>();
      for (const a of ops) {
        const m = spec.add(a);
        if (m === undefined) continue;
        const observed = ops.some((r) => spec.remove(r) === m && sees(r, a));
        if (!observed) want.add(m);
      }
      const got = [...new Set(spec.read(state, target))].sort();
      const exp = [...want].sort();
      return show(got) === show(exp) ? true : `members ${show(got)}, expected ${show(exp)}`;
    }),
  );
}

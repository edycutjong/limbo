// Intent `max`: monotone until an observing clear (severity).
// Oracle: value = highest level (by the declared order) among reports not covered by a clear that observed them.
import type { Op } from '../../../skeleton/src/core/types.ts';
import type { RunCheck } from '../run.ts';
import { eachTarget, type State, intentCheck, same, sees, show } from './common.ts';

export interface MaxSpec {
  /** Levels from lowest to highest. */
  order: readonly string[];
  report(op: Op): string | undefined;
  isClear(op: Op): boolean;
  read(state: State, target: string): string | undefined;
}

export function maxIntent(spec: MaxSpec): RunCheck {
  return intentCheck('intent:max', (res) =>
    eachTarget(res, (o) => spec.report(o) !== undefined || spec.isClear(o), ({ state, target, ops }) => {
      const clears = ops.filter((o) => spec.isClear(o));
      let best = -1;
      for (const r of ops) {
        const lvl = spec.report(r);
        if (lvl === undefined || clears.some((c) => sees(c, r))) continue;
        best = Math.max(best, spec.order.indexOf(lvl));
      }
      const want = best < 0 ? undefined : spec.order[best];
      const got = spec.read(state, target);
      return same(got, want) ? true : `level ${show(got)}, expected ${show(want)}`;
    }),
  );
}

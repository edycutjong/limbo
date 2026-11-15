// Intent `move`: ordering of a list.
// Oracle: the order has no duplicate, no missing item, and is the same on every replica.
import type { Op } from '../../../skeleton/src/core/types.ts';
import type { RunCheck } from '../run.ts';
import { type State, intentCheck, show } from './common.ts';

export interface MoveSpec {
  /** Ids that must appear in the order, given the whole log (created and not deleted). */
  expected(ops: readonly Op[]): readonly string[];
  read(state: State): readonly string[];
}

export function moveIntent(spec: MoveSpec): RunCheck {
  return intentCheck('intent:move', (res) => {
    const want = [...new Set(spec.expected(res.ops))].sort();
    let first: { replica: string; order: readonly string[] } | undefined;
    for (const [replica, json] of Object.entries(res.states)) {
      const order = spec.read(JSON.parse(json) as State);
      if (new Set(order).size !== order.length) return `replica ${replica}: duplicate item in ${show(order)}`;
      const missing = want.filter((id) => !order.includes(id));
      if (missing.length > 0) return `replica ${replica}: missing item(s) ${show(missing)}`;
      const extra = order.filter((id) => !want.includes(id));
      if (extra.length > 0) return `replica ${replica}: unexpected item(s) ${show(extra)}`;
      if (first === undefined) first = { replica, order };
      else if (show(first.order) !== show(order)) return `replicas ${first.replica} and ${replica} order differently: ${show(first.order)} vs ${show(order)}`;
    }
    return true;
  });
}

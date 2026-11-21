// Intent `move`: ordering of a list.
// Oracle: each replica's order has no duplicate, no missing item, and equals `spec.expected(ops)` as an ordered list.
// `expectedOrder` derives that list from the raw ops and their `deps`/`stamp` only (no `merges.ts`).
import type { Op } from '../../../skeleton/src/core/types.ts';
import type { RunCheck } from '../run.ts';
import { type State, byStamp, intentCheck, sees, show } from './common.ts';

export interface MoveSpec {
  /** Item ids in the order every replica must show, given the whole log (created and not deleted). */
  expected(ops: readonly Op[]): readonly string[];
  read(state: State): readonly string[];
}

const codeUnitLess = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Expected display order from the ops alone. `keyOf` returns the fractional key an op writes (a create or a move),
 * else `undefined`. An item's position is the key of the highest-stamp write that no other write of the item has seen.
 * Items sort by (key, id) in UTF-16 code-unit order. `keep` drops items (for example deleted ones).
 */
export function expectedOrder(
  ops: readonly Op[],
  keyOf: (o: Op) => string | undefined,
  keep: (target: string) => boolean = () => true,
): string[] {
  const writes = new Map<string, Op[]>();
  for (const o of ops) {
    if (keyOf(o) === undefined) continue;
    const list = writes.get(o.target) ?? [];
    if (!list.some((w) => w.id === o.id)) list.push(o);
    writes.set(o.target, list);
  }
  const placed: { id: string; key: string }[] = [];
  for (const [id, list] of writes) {
    if (!keep(id)) continue;
    const frontier = list.filter((w) => !list.some((x) => x !== w && sees(x, w)));
    const winner = [...frontier].sort(byStamp).at(-1)!;
    placed.push({ id, key: keyOf(winner)! });
  }
  return placed.sort((a, b) => codeUnitLess(a.key, b.key) || codeUnitLess(a.id, b.id)).map((p) => p.id);
}

export function moveIntent(spec: MoveSpec): RunCheck {
  return intentCheck('intent:move', (res) => {
    const want = [...new Set(spec.expected(res.ops))];
    let first: { replica: string; order: readonly string[] } | undefined;
    for (const [replica, json] of Object.entries(res.states)) {
      const order = spec.read(JSON.parse(json) as State);
      if (new Set(order).size !== order.length) return `replica ${replica}: duplicate item in ${show(order)}`;
      const missing = want.filter((id) => !order.includes(id));
      if (missing.length > 0) return `replica ${replica}: missing item(s) ${show(missing)}`;
      const extra = order.filter((id) => !want.includes(id));
      if (extra.length > 0) return `replica ${replica}: unexpected item(s) ${show(extra)}`;
      if (show(order) !== show(want)) return `replica ${replica}: order ${show(order)}, expected ${show(want)}`;
      if (first === undefined) first = { replica, order };
      else if (show(first.order) !== show(order)) return `replicas ${first.replica} and ${replica} order differently: ${show(first.order)} vs ${show(order)}`;
    }
    return true;
  });
}

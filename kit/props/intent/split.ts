// Intent `split`: money is integer cents; shares add up to the amount.
// Oracle: every share is an integer >= 0; with no members there are no shares; otherwise shares are
// exactly the members' and their sum equals the amount.
import type { Op } from '../../../skeleton/src/core/types.ts';
import type { RunCheck } from '../run.ts';
import { eachTarget, type State, intentCheck, show } from './common.ts';

export interface SplitView {
  amount: number;
  members: readonly string[];
  shares: Readonly<Record<string, number>>;
}

export interface SplitSpec {
  /** Ops that belong to the split (set the amount, add a member, ...). */
  relevant(op: Op): boolean;
  read(state: State, target: string): SplitView | undefined;
}

export function splitIntent(spec: SplitSpec): RunCheck {
  return intentCheck('intent:split', (res) =>
    eachTarget(res, spec.relevant, ({ state, target }) => {
      const v = spec.read(state, target);
      if (v === undefined) return true;
      const ids = Object.keys(v.shares);
      for (const id of ids) {
        const s = v.shares[id]!;
        if (!Number.isInteger(s) || s < 0) return `share of ${id} is ${show(s)}, not an integer >= 0`;
      }
      if (v.members.length === 0) return ids.length === 0 ? true : `no members but shares ${show(v.shares)}`;
      if (show([...ids].sort()) !== show([...new Set(v.members)].sort())) return `shares ${show(ids)} do not match members ${show(v.members)}`;
      const sum = ids.reduce((a, id) => a + v.shares[id]!, 0);
      return sum === v.amount ? true : `shares sum to ${sum}, amount is ${v.amount}`;
    }),
  );
}

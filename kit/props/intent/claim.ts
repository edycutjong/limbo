// Intent `claim`: at most `units` winners, chosen deterministically; nobody is dropped silently.
// Oracle: a claim is eligible unless a release by the same `who` observed it; each `who` counts once
// (lowest stamp); eligible claims sorted by stamp, the first min(units, n) win and the rest are loser twins.
// A claim that has seen another never beats it: the order is by Lamport counter, which grows along deps.
import type { Op } from '../../../skeleton/src/core/types.ts';
import type { RunCheck } from '../run.ts';
import { byStamp, eachTarget, type State, intentCheck, sees, show } from './common.ts';

export interface ClaimSpec {
  claim(op: Op): string | undefined; // who
  release(op: Op): string | undefined; // who
  units(target: string): number;
  /** The item was deleted (a deleted item has no winners). Default: never. */
  deleted?(state: State, target: string): boolean;
  winners(state: State, target: string): readonly string[];
  losers(state: State, target: string): readonly string[];
}

export function claimIntent(spec: ClaimSpec): RunCheck {
  return intentCheck('intent:claim', (res) =>
    eachTarget(res, (o) => spec.claim(o) !== undefined || spec.release(o) !== undefined, ({ state, target, ops }) => {
      const claims = ops.filter((o) => spec.claim(o) !== undefined).sort(byStamp);
      const rels = ops.filter((o) => spec.release(o) !== undefined);
      const live = claims.filter((c) => !rels.some((r) => spec.release(r) === spec.claim(c) && sees(r, c)));
      const seen = new Set<string>();
      const eligible: Op[] = [];
      for (const c of live) {
        const who = spec.claim(c)!;
        if (!seen.has(who)) {
          seen.add(who);
          eligible.push(c);
        }
      }
      const gone = spec.deleted?.(state, target) === true;
      const k = gone ? 0 : Math.min(spec.units(target), eligible.length);
      const wantW = eligible.slice(0, k).map((c) => spec.claim(c)!);
      const wantL = gone ? [] : eligible.slice(k).map((c) => spec.claim(c)!);
      const gotW = spec.winners(state, target);
      const gotL = spec.losers(state, target);
      if (show(gotW) !== show(wantW)) return `winners ${show(gotW)}, expected ${show(wantW)}`;
      if (show([...gotL].sort()) !== show([...wantL].sort())) return `loser twins ${show(gotL)}, expected ${show(wantL)} (an eligible claim must be a winner or a loser)`;
      return true;
    }),
  );
}

// Hand-written golden histories for the two A/B ops (an oracle that does not use the random engine).
import { causalBuffer, createOp, newReplica, observe } from '../skeleton/src/core/causal.ts';
import type { Op, OpDef } from '../skeleton/src/core/types.ts';

/** Two replicas a, b. `act` creates an op on a replica from its current state; `sync` delivers everything one has to the other. */
export function pair(def: OpDef) {
  const reps = { a: newReplica('a'), b: newReplica('b') };
  const bufs = { a: causalBuffer(reps.a.vv), b: causalBuffer(reps.b.vv) };
  const st: Record<'a' | 'b', unknown> = { a: {}, b: {} };
  const log: Op[] = [];
  return {
    state: (k: 'a' | 'b') => st[k],
    act(k: 'a' | 'b', target: string, payload: (s: unknown) => unknown) {
      const op = createOp(reps[k], def, target, payload(st[k]));
      log.push(op);
      st[k] = def.apply!(st[k], op);
    },
    sync(from: 'a' | 'b', to: 'a' | 'b') {
      for (const o of log.filter((x) => x.stamp.r === from || (bufs[from].vv[x.stamp.r] ?? 0) >= x.stamp.n)) {
        for (const a of bufs[to].offer(o)) { observe(reps[to], a); st[to] = def.apply!(st[to], a); }
      }
    },
  };
}

// The replica runtime: applies local and received ops in causal order, so `materialize`
// always sees a causally closed op set. No wall clock, randomness or locale in any path here.
import { canonical, causalBuffer, createOp, newReplica, observe } from '../core/causal.ts';
import type { Op, OpDef, VV } from '../core/types.ts';
import type { OpStore } from './store.ts';

export interface Rejection {
  id: string;
  reason: 'unknown-op' | 'malformed' | 'store-failed';
}

export interface ReceiveResult {
  applied: Op[];
  duplicates: number;
  held: number;
  rejected: Rejection[];
}

export interface ReplicaConfig<S> {
  app: string;
  replicaId: string;
  defs: readonly OpDef[];
  /** The app's fold over the applied ops (seed ops included), in apply order. */
  materialize(ops: readonly Op[]): S;
  /** Number of twins in a state; supplied by the app. */
  twinCount(s: S): number;
  store: OpStore;
  seedOps: readonly Op[];
}

export interface Replica<S> {
  /** Member id. */
  id: string;
  /** Dot namespace: the `r` of every stamp this replica creates. */
  ns: string;
  local(name: string, target: string, payload: unknown): Op;
  receive(ops: readonly Op[]): ReceiveResult;
  state(): S;
  twins(): number;
  /** Applied frontier, a copy. Held ops are not in it. */
  vv(): VV;
  /** Applied ops in apply order, then held ops in arrival order. */
  log(): Op[];
  applied(): Op[];
  buffered(): Op[];
  /** True once the store confirmed the write of this op. */
  saved(id: string): boolean;
  /** The last 50 rejections. */
  rejected(): Rejection[];
  /** Held ops from an earlier incarnation of this replica whose own-namespace predecessor is neither applied nor held. */
  stalledOwn(): number;
  /** The last peer `vv` seen in a hello or ack; persisted in the store meta. */
  peerAck: { get(peer: string): VV; set(peer: string, vv: VV): void };
  subscribe(fn: () => void): () => void;
  close(): void;
}

const SEED = 'seed';
const KEEP = 50;

/** Build seed ops with a core replica `seed`: the same script gives byte-identical ops on every replica. */
export function makeSeedOps(
  defs: readonly OpDef[],
  script: readonly { name: string; target: string; payload: unknown }[],
): Op[] {
  const core = newReplica(SEED);
  const names = new Set(defs.map((d) => d.name));
  return script.map((s) => {
    if (!names.has(s.name)) throw new Error(`unknown op: ${s.name}`);
    return createOp(core, { name: s.name }, s.target, s.payload);
  });
}

/** FNV-1a over the canonical seed ops: a version tag, not a security hash. */
function seedHash(ops: readonly Op[]): string {
  let h = 0x811c9dc5;
  for (const c of canonical(ops)) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return h.toString(16);
}

function malformed(op: Op): boolean {
  const st = op?.stamp;
  return (
    typeof op?.id !== 'string' ||
    typeof st !== 'object' ||
    st === null ||
    typeof st.r !== 'string' ||
    !Number.isInteger(st.l) ||
    !Number.isInteger(st.n) ||
    st.n < 1 ||
    op.id !== `${st.r}:${st.n}`
  );
}

export async function createReplica<S>(cfg: ReplicaConfig<S>): Promise<Replica<S>> {
  const { store, defs, replicaId } = cfg;
  await store.ready;
  const meta = store.meta.read();
  const seedVersion = seedHash(cfg.seedOps);
  if (meta.seedVersion !== undefined && meta.seedVersion !== seedVersion) {
    throw Object.assign(new Error('seed-version-changed'), { name: 'seed-version-changed' });
  }
  // The incarnation write is confirmed before the replica exists, so no op precedes it.
  const k = (meta.k ?? 0) + 1;
  await store.meta.write({ replicaId, k, seedVersion });
  const ns = `${replicaId}#${k}`;
  const ackMap: Record<string, VV> = { ...(meta.peerAckVV ?? {}) };
  const byName = new Map(defs.map((d) => [d.name, d] as const));
  const core = newReplica(ns);
  const buf = causalBuffer(core.vv);
  const applied: Op[] = [];
  const savedIds = new Set<string>();
  const rejections: Rejection[] = [];
  const subs = new Set<() => void>();
  let cache: { n: number; s: S } | undefined;

  const notify = (): void => {
    for (const fn of [...subs]) fn();
  };
  const reject = (r: Rejection): void => {
    rejections.push(r);
    if (rejections.length > KEEP) rejections.shift();
  };
  const persist = (op: Op): void => {
    store.put(op).then(
      () => {
        savedIds.add(op.id);
        notify();
      },
      () => {
        reject({ id: op.id, reason: 'store-failed' });
        notify();
      },
    );
  };
  const apply = (op: Op): void => {
    applied.push(op);
    observe(core, op);
  };

  const state = (): S => {
    if (!cache || cache.n !== applied.length) cache = { n: applied.length, s: cfg.materialize(applied) };
    return cache.s;
  };

  // Seed ops apply first and are never written to the store.
  for (const op of cfg.seedOps) for (const a of buf.offer(op)) apply(a);

  // Stored ops: the Lamport counter starts at the maximum l; ops that cannot apply stay held.
  const stored = store.all();
  for (const op of stored) {
    observe(core, op);
    savedIds.add(op.id);
  }
  for (const op of stored) for (const a of buf.offer(op)) apply(a);

  return {
    id: replicaId,
    ns,
    local(name, target, payload) {
      const def = byName.get(name);
      if (!def) throw new Error(`unknown op: ${name}`);
      const op = createOp(core, def, target, payload);
      applied.push(op); // createOp already advanced vv and the Lamport maximum
      persist(op);
      notify();
      return op;
    },
    receive(ops) {
      const res: ReceiveResult = { applied: [], duplicates: 0, held: 0, rejected: [] };
      const offered: Op[] = [];
      for (const op of ops) {
        const bad: Rejection | undefined = malformed(op)
          ? { id: String((op as { id?: unknown })?.id), reason: 'malformed' }
          : byName.has(op.op)
            ? undefined
            : { id: op.id, reason: 'unknown-op' };
        if (bad) {
          reject(bad);
          res.rejected.push(bad);
          continue;
        }
        const known = (core.vv[op.stamp.r] ?? 0) >= op.stamp.n || buf.held().some((h) => h.id === op.id);
        if (known) {
          res.duplicates++;
          continue;
        }
        offered.push(op);
        for (const a of buf.offer(op)) {
          apply(a);
          res.applied.push(a);
        }
        if (op.stamp.r !== SEED) persist(op);
      }
      const ids = new Set(res.applied.map((a) => a.id));
      res.held = offered.filter((o) => !ids.has(o.id)).length;
      if (offered.length > 0 || res.rejected.length > 0) notify();
      return res;
    },
    state,
    twins: () => cfg.twinCount(state()),
    vv: () => ({ ...core.vv }),
    log: () => [...applied, ...buf.held()],
    applied: () => [...applied],
    buffered: () => buf.held(),
    stalledOwn() {
      const held = buf.held();
      const ids = new Set(held.map((h) => h.id));
      return held.filter(
        (h) =>
          h.stamp.r.startsWith(`${replicaId}#`) &&
          h.stamp.r !== ns &&
          !ids.has(`${h.stamp.r}:${(core.vv[h.stamp.r] ?? 0) + 1}`),
      ).length;
    },
    peerAck: {
      get: (peer) => ({ ...(ackMap[peer] ?? {}) }),
      set(peer, vv) {
        ackMap[peer] = { ...vv };
        store.meta.write({ peerAckVV: { ...ackMap } }).catch(() => undefined); // need not be awaited (R4.9)
      },
    },
    saved: (id) => savedIds.has(id),
    rejected: () => [...rejections],
    subscribe(fn) {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    close() {
      subs.clear();
      store.close();
    },
  };
}

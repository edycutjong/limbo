// G1 spike page: one replica per browser context. Exposes `window.limbo`.
// Replica id comes from `?r=<id>`, the relay from `?relay=<url>` (default http://localhost:5175).
import { allocKey, causalBuffer, canonical, createOp, newReplica, observe } from '../../skeleton/src/core/causal.ts';
import type { Op, OpDef } from '../../skeleton/src/core/types.ts';
import { openStore } from '../../skeleton/src/sync/store.ts';
import { materialize } from '../../apps/basecamp/src/model.ts';

const params = new URLSearchParams(location.search);
const rid = params.get('r') ?? 'a';
const relay = params.get('relay') ?? 'http://localhost:5175';
const POLL_MS = 200;

const def = (name: string): Pick<OpDef, 'name'> => ({ name });

const replica = newReplica(rid);
const buf = causalBuffer(replica.vv);
const store = openStore(`limbo-spike-${rid}`);
const ops = new Map<string, Op>();
const unsent = new Map<string, Op>();
let cursor = 0;
let itemCount = 0;

function accept(op: Op): void {
  if (ops.has(op.id)) return;
  ops.set(op.id, op);
  for (const a of buf.offer(op)) observe(replica, a);
  if (op.stamp.r === rid && op.stamp.n > replica.counter) replica.counter = op.stamp.n;
}

// Same seed in every context: x, y, z created by a fixed `seed` replica. Never sent to the relay.
function seedOps(): Op[] {
  const s = newReplica('seed');
  const kx = allocKey(null, null, 'seed');
  const ky = allocKey(kx, null, 'seed');
  const kz = allocKey(ky, null, 'seed');
  return [
    createOp(s, def('item.add'), 'x', { name: 'x', units: 1, key: kx }),
    createOp(s, def('item.add'), 'y', { name: 'y', units: 1, key: ky }),
    createOp(s, def('item.add'), 'z', { name: 'z', units: 1, key: kz }),
  ];
}

function local<P>(name: string, target: string, payload: P): Op<P> {
  const op = createOp(replica, def(name), target, payload);
  ops.set(op.id, op);
  store.put(op);
  unsent.set(op.id, op);
  void push();
  return op;
}

async function push(): Promise<void> {
  if (unsent.size === 0) return;
  const batch = [...unsent.values()];
  try {
    const r = await fetch(`${relay}/ops`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(batch),
    });
    if (r.ok) for (const o of batch) unsent.delete(o.id);
  } catch {
    // offline: keep queued, retry on the next poll
  }
}

async function pull(): Promise<void> {
  try {
    const r = await fetch(`${relay}/ops?since=${cursor}`);
    if (!r.ok) return;
    const body = (await r.json()) as { ops: Op[]; cursor: number };
    for (const op of body.ops) {
      accept(op);
      store.put(op);
    }
    cursor = body.cursor;
  } catch {
    // offline: try again next tick
  }
}

function order(): string[] {
  return materialize([...ops.values()]).order;
}

const api = {
  replica: rid,
  ready: Promise.resolve() as Promise<void>,
  /** Add an item; returns its id. */
  add(name: string, units = 1): string {
    const ord = order();
    const last = ord.length > 0 ? materialize([...ops.values()]).items[ord[ord.length - 1]!]!.pos : null;
    const id = `${rid}-item-${++itemCount}`;
    local('item.add', id, { name, units, key: allocKey(last, null, rid) });
    return id;
  },
  tick(id: string, ticked = true): void {
    local('item.tick', id, { ticked });
  },
  delete(id: string): void {
    local('item.delete', id, {});
  },
  /** Move `id` so it sits at `index` among the other visible items (0 = top). */
  move(id: string, index: number): void {
    const st = materialize([...ops.values()]);
    const others = st.order.filter((x) => x !== id);
    const i = Math.max(0, Math.min(index, others.length));
    const left = i > 0 ? st.items[others[i - 1]!]!.pos : null;
    const right = i < others.length ? st.items[others[i]!]!.pos : null;
    local('item.move', id, { key: allocKey(left, right, rid) });
  },
  claim(id: string): void {
    local('item.claim', id, { who: rid });
  },
  /** Canonical JSON of the materialized state. */
  state(): string {
    return canonical(materialize([...ops.values()]));
  },
  /** Number of local ops not yet accepted by the relay. */
  queued(): number {
    return unsent.size;
  },
};

declare global {
  interface Window {
    limbo: typeof api;
  }
}

api.ready = (async () => {
  await store.ready;
  for (const op of seedOps()) accept(op);
  // Persisted ops from this replica's earlier session; any not yet on the relay are re-sent (the relay dedupes by id).
  const persisted = store.all().sort((a, b) => a.stamp.l - b.stamp.l);
  for (const op of persisted) {
    accept(op);
    if (op.stamp.r === rid) unsent.set(op.id, op);
  }
  const m = /-item-(\d+)$/;
  for (const op of ops.values()) {
    const n = Number(m.exec(op.target)?.[1] ?? 0);
    if (op.target.startsWith(`${rid}-item-`) && n > itemCount) itemCount = n;
  }
  const out = document.getElementById('out');
  const tick = async (): Promise<void> => {
    await push();
    await pull();
    if (out) out.textContent = api.state();
  };
  setInterval(() => void tick(), POLL_MS);
  void tick();
})();

window.limbo = api;

// LimboShell and useLimbo: the one place the layer reads sync state. It only displays what `Pair` derives.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Op, OpDef } from '../core/types.ts';
import type { Session } from '../sync/link.ts';
import type { Pair, PairView } from '../sync/pair.ts';
import type { Replica } from '../sync/replica.ts';
import type { Crossing } from '../sync/status.ts';
import './tokens.css';

export type Id = 'a' | 'b';
/** An app-supplied record for one surfaced twin. `rule` is a Merge name. */
export interface ConflictDescriptor {
  id: string;
  target: string;
  rule: string;
  caption: string;
}
export type Motion = 'full' | 'reduced';
export interface Limbo {
  view: PairView;
  replica: Replica<any>;
  session: Session;
  queued: Op[];
  exchanges: { last: Crossing[][]; open: Crossing[] };
  conflicts: ConflictDescriptor[];
  /** Conflicts that resolved since the last crossing (presentation state only). */
  resolved: ConflictDescriptor[];
  /** `seq` bumps on each crossing event; `k` is the count of ops it newly applied. */
  crossing: { seq: number; k: number };
  /** The latest live-region message. */
  announce: string;
  motion: Motion;
}
interface Ctx {
  pair: Pair<any>;
  defs: readonly OpDef[];
  describe(state: any): ConflictDescriptor[];
  motion: Motion;
}
const LimboCtx = createContext<Ctx | null>(null);

// Keys (shell root): L cuts/restores, I toggles the Inspector, ArrowUp/Down move focus across
// `[data-limbo-row]`. Space (tick) and Delete belong to the app's rows: mark each row `data-limbo-row`.

export function LimboShell(p: {
  pair: Pair<any>;
  defs: readonly OpDef[];
  describeConflicts(state: any): ConflictDescriptor[];
  children?: ReactNode;
}): ReactNode {
  const [reduce, setReduce] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = (e: { matches: boolean }): void => setReduce(e.matches);
    mq.addEventListener('change', on);
    setReduce(mq.matches);
    return () => mq.removeEventListener('change', on);
  }, []);
  const motion: Motion = reduce ? 'reduced' : 'full';
  const latest = useRef(p.describeConflicts);
  latest.current = p.describeConflicts;
  const describe = useCallback((s: unknown) => latest.current(s), []);
  const ctx = useMemo(() => ({ pair: p.pair, defs: p.defs, describe, motion }), [p.pair, p.defs, describe, motion]);
  return (
    <LimboCtx.Provider value={ctx}>
      <div className="limbo-shell" data-motion={motion}>
        {p.children}
      </div>
    </LimboCtx.Provider>
  );
}

type Snap = Omit<Limbo, 'motion'>;

function makeStore(c: Ctx, id: Id) {
  const { pair } = c;
  const replica = id === 'a' ? pair.a : pair.b;
  const session = pair.sessions[id];
  const subs = new Set<() => void>();
  const seen = new Map<string, { d: ConflictDescriptor; resolved: boolean }>();
  let version = 0;
  let built = -1;
  let snap: Snap | undefined;
  let crossing = { seq: 0, k: 0 };
  let announce = '';
  let warned = false;
  let prev: { link: string; xkey: string } | undefined;
  const bump = (): void => {
    version++;
    for (const f of [...subs]) f();
  };
  const build = (): Snap => {
    const view = pair.view(id);
    const exchanges = pair.exchanges();
    const now = c.describe(replica.state());
    const ids = new Set(now.map((d) => d.id));
    for (const d of now) seen.set(d.id, { d, resolved: false });
    for (const [k, e] of seen) if (!ids.has(k)) e.resolved = true;
    if (now.length !== view.twins && !warned) {
      warned = true;
      console.warn(`limbo: ${now.length} conflict descriptors but view.twins = ${view.twins}`);
    }
    const newest = exchanges.last[exchanges.last.length - 1];
    const xkey = newest ? `${newest[0]?.id}:${newest.length}` : '';
    if (prev) {
      if (prev.link === 'up' && view.link !== 'up') announce = 'Link cut. Edits will wait on this device.';
      else if (prev.link === 'down' && view.link !== 'down') announce = 'Link restored. Syncing…';
      else if (view.axis === 'LIVE' && newest && xkey !== prev.xkey) {
        const k = newest.length;
        announce = `${k} edit${k === 1 ? '' : 's'} synced.`;
        if (view.twins > 0) announce += ` ${view.twins} conflict${view.twins === 1 ? '' : 's'} need${view.twins === 1 ? 's' : ''} you.`;
      }
    }
    prev = { link: view.link, xkey };
    const vals = [...seen.values()];
    return {
      view,
      replica,
      session,
      queued: pair.queued(id),
      exchanges,
      conflicts: now,
      resolved: vals.filter((e) => e.resolved).map((e) => e.d),
      crossing,
      announce,
    };
  };
  return {
    subscribe(fn: () => void) {
      subs.add(fn);
      const off = [
        replica.subscribe(bump),
        session.subscribe(bump),
        session.onCross((ops) => {
          for (const [k, e] of seen) if (e.resolved) seen.delete(k);
          crossing = { seq: crossing.seq + 1, k: ops.length };
          bump();
        }),
      ];
      return () => {
        subs.delete(fn);
        for (const o of off) o();
      };
    },
    get(): Snap {
      if (snap === undefined || built !== version) {
        snap = build();
        built = version;
      }
      return snap;
    },
  };
}

export function useLimbo(id: Id): Limbo {
  const c = useContext(LimboCtx);
  if (c === null) throw new Error('useLimbo must be used inside <LimboShell>');
  const { pair, defs, describe } = c;
  const store = useMemo(() => makeStore({ pair, defs, describe, motion: 'full' }, id), [pair, defs, describe, id]);
  const snap = useSyncExternalStore(store.subscribe, store.get);
  return useMemo(() => ({ ...snap, motion: c.motion }), [snap, c.motion]);
}

/** Looks up an op def by name (merge and intent columns). */
export function useDefs(): readonly OpDef[] {
  const c = useContext(LimboCtx);
  if (c === null) throw new Error('useDefs must be used inside <LimboShell>');
  return c.defs;
}

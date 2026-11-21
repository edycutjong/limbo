// One writer per replica id (R14). The only module that draws random ids, and only through `newId`.
import { deleteStore } from './store.ts';

export interface IdStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface IdLocks {
  request(
    name: string,
    opts: { ifAvailable: true },
    cb: (lock: unknown) => Promise<unknown> | null,
  ): Promise<unknown>;
}
export interface Identity {
  /** Database names this identity owns. */
  names: string[];
  /** Member ids, in the same order as `names`. */
  replicaIds: string[];
  /** False when no Web Locks exist: nothing stops a second writer. */
  exclusive: boolean;
  /** Close this tab's stores, delete only its own databases, clear its storage keys. */
  reset(closeStores?: () => void | Promise<void>): Promise<void>;
  /** Give up the lock. */
  release(): void;
}
export interface AcquireOpts {
  app: string;
  mode: 'pair' | 'single';
  storage: IdStorage;
  locks: IdLocks | undefined;
  newId: () => string;
  /** URL query string; `reset=1` wipes this identity before the stores open. */
  search?: string;
}

const MAX_TRIES = 5;

/** Try to take `name` without waiting. Resolves a release function, or undefined when held. */
async function take(locks: IdLocks, name: string): Promise<(() => void) | undefined> {
  return new Promise<(() => void) | undefined>((resolve) => {
    void locks.request(name, { ifAvailable: true }, (lock) => {
      if (!lock) {
        resolve(undefined);
        return null;
      }
      return new Promise<void>((res) => resolve(() => res()));
    });
  });
}

export async function acquireIdentity(o: AcquireOpts): Promise<Identity> {
  const { app, mode, storage, locks, newId } = o;
  const key = mode === 'pair' ? `limbo:${app}:session` : `limbo:${app}:replica`;
  const lockName = (id: string) => (mode === 'pair' ? `limbo:${app}:pair-${id}` : `limbo:${app}:${id}`);
  let id = storage.getItem(key) ?? newId();
  let release: () => void = () => {};
  if (locks) {
    let got: (() => void) | undefined;
    for (let i = 0; i < MAX_TRIES && !got; i++) {
      got = await take(locks, lockName(id));
      if (!got) id = newId(); // a duplicated tab becomes a new pair, never a second writer
    }
    if (!got) throw new Error(`identity: lock held after ${MAX_TRIES} tries`);
    release = got;
  }
  storage.setItem(key, id);
  const base = lockName(id);
  const names = mode === 'pair' ? [`${base}:a`, `${base}:b`] : [base];
  const replicaIds = mode === 'pair' ? ['a', 'b'] : [id];
  const wipe = async () => {
    for (const n of names) await deleteStore(n); // only our own names, never enumerated
  };
  if (new URLSearchParams(o.search ?? '').get('reset') === '1') await wipe();
  return {
    names,
    replicaIds,
    exclusive: locks !== undefined,
    async reset(closeStores) {
      await closeStores?.();
      await wipe();
      storage.removeItem(key);
    },
    release: () => release(),
  };
}

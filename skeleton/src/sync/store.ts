// The only importer of yjs / y-indexeddb. It stores and moves the grow-only op log.
// No merge logic lives here: every merge rule is in core/merges.ts.
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import type { Op, VV } from '../core/types.ts';

/** Replica metadata. Single writer per database (R14), so overwriting keys is safe. */
export interface Meta {
  replicaId?: string;
  k?: number;
  peerAckVV?: Record<string, VV>;
  seedVersion?: string;
}

export interface OpStore {
  /** Resolves once persisted ops have loaded (immediately when there is no IndexedDB). */
  ready: Promise<void>;
  /**
   * Append an op keyed by its id. A second put of the same id is a no-op.
   * Resolves once the update is committed to IndexedDB (immediately when memory-only).
   */
  put(op: Op): Promise<void>;
  /** Every stored op, in no meaningful order. */
  all(): Op[];
  /** Replica metadata, kept beside the log in the same database. */
  meta: {
    read(): Meta;
    /** Set the given keys; resolves once the write is committed. */
    write(patch: Meta): Promise<void>;
  };
  /** Call `cb` after any change to the log, local or loaded. Returns an unsubscribe. */
  onChange(cb: () => void): () => void;
  close(): void;
}

const UPDATES = 'updates'; // y-indexeddb's update object store

export function openStore(name: string): OpStore {
  const doc = new Y.Doc();
  const map = doc.getMap<Op>('ops');
  const metaMap = doc.getMap<unknown>('meta');
  const persistence =
    typeof indexedDB === 'undefined' ? undefined : new IndexeddbPersistence(name, doc);
  // y-indexeddb exposes no promise for an update write. IndexedDB runs readwrite transactions
  // with overlapping scope in creation order, so an empty readwrite transaction on the updates
  // store completes after every earlier update write has committed.
  const flush = (): Promise<void> => {
    const db = persistence?.db;
    if (!db) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction([UPDATES], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('store flush failed'));
      tx.onabort = () => reject(tx.error ?? new Error('store flush aborted'));
    });
  };
  return {
    ready: persistence ? persistence.whenSynced.then(() => undefined) : Promise.resolve(),
    put(op) {
      if (!map.has(op.id)) map.set(op.id, op); // grow-only: never overwrite
      return flush();
    },
    all: () => [...map.values()],
    meta: {
      read: () => Object.fromEntries(metaMap.entries()) as Meta,
      write(patch) {
        doc.transact(() => {
          for (const [key, value] of Object.entries(patch)) metaMap.set(key, value);
        });
        return flush();
      },
    },
    onChange(cb) {
      const h = () => cb();
      map.observe(h);
      return () => map.unobserve(h);
    },
    close() {
      void persistence?.destroy();
      doc.destroy();
    },
  };
}

/**
 * Delete one database by name. The caller closes its store first; a blocked delete
 * resolves once the last connection closes (IndexedDB fires `success` then).
 */
export function deleteStore(name: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error('deleteStore failed'));
  });
}

// The only importer of yjs / y-indexeddb. It stores and moves the grow-only op log.
// No merge logic lives here: every merge rule is in core/merges.ts.
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import type { Op } from '../core/types.ts';

export interface OpStore {
  /** Resolves once persisted ops have loaded (immediately when there is no IndexedDB). */
  ready: Promise<void>;
  /** Append an op keyed by its id. A second put of the same id is a no-op. */
  put(op: Op): void;
  /** Every stored op, in no meaningful order. */
  all(): Op[];
  /** Call `cb` after any change to the log, local or loaded. Returns an unsubscribe. */
  onChange(cb: () => void): () => void;
  close(): void;
}

export function openStore(name: string): OpStore {
  const doc = new Y.Doc();
  const map = doc.getMap<Op>('ops');
  const persistence =
    typeof indexedDB === 'undefined' ? undefined : new IndexeddbPersistence(name, doc);
  return {
    ready: persistence ? persistence.whenSynced.then(() => undefined) : Promise.resolve(),
    put(op) {
      if (map.has(op.id)) return; // grow-only: never overwrite
      map.set(op.id, op);
    },
    all: () => [...map.values()],
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

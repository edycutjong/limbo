import { acquireIdentity, type Identity, type IdLocks, type IdStorage } from '../skeleton/src/sync/identity.ts';

export interface IdentityOptions {
  storage?: IdStorage;
  locks?: IdLocks;
  newId?: () => string;
  search?: string;
}

/** Short random hex id. The only random draw in the apps; called only by `acquireIdentity`, never on an op path. */
const hexId = (): string => {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

/** Acquire the R14 pair identity for `app` with the browser's storage, locks and query string as defaults. */
export function acquirePairIdentity(app: string, o: IdentityOptions = {}): Promise<Identity> {
  return acquireIdentity({
    app,
    mode: 'pair',
    storage: o.storage ?? sessionStorage,
    locks: 'locks' in o ? o.locks : typeof navigator !== 'undefined' ? (navigator.locks as IdLocks | undefined) : undefined,
    newId: o.newId ?? hexId,
    search: o.search ?? (typeof location !== 'undefined' ? location.search : ''),
  });
}

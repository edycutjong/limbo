import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { canonical } from '../../../skeleton/src/core/causal.ts';
import type { Op } from '../../../skeleton/src/core/types.ts';
import { LimboShell, ReplicaPair, type Id } from '../../../skeleton/src/limbo/index.ts';
import '../../../skeleton/src/limbo/tokens.css';
import '../../controls.css';
import { createPair, type Pair } from '../../../skeleton/src/sync/pair.ts';
import type { Identity } from '../../../skeleton/src/sync/identity.ts';
import { openStore } from '../../../skeleton/src/sync/store.ts';
import * as config from '../app.config.ts';
import { displayName } from './members.ts';
import type { State } from './model.ts';
import { createWorkerRunner } from './shuffle-runner.ts';
import { ScenePanel, ScriptedContext, useScriptedState } from './views/ScenePanel.tsx';
import { ReplicaBody } from './views/ReplicaBody.tsx';
import { ShuffleSection } from './views/ShuffleSection.tsx';
import type { ShuffleRunner } from '../../../skeleton/src/limbo/shuffle-test.tsx';
import { registerShell } from '../../offline-shell.ts';
import { acquirePairIdentity, type IdentityOptions } from '../../pair-identity.ts';
import '../app.css';

/** Default the pair to two replicas: a phone shows the stacked pair unless `replicas` is given. */
export function withReplicas(search: string): string {
  const params = new URLSearchParams(search);
  if (!params.has('replicas')) params.set('replicas', '2');
  return `?${params.toString()}`;
}

export const TAGLINE = 'For small teams who fill the same form when the signal is gone.';
export const DEMO_CHIP = 'DEMO DATA';
export const DEMO_NOTE = 'Demonstration data shape — not used in the field';

/** Root component: heading, tagline, DEMO DATA chip (a note, not dismissible), and the pair when given. */
export function App(p: { pair?: Pair<State>; onReset?(): void; createRunner?(): ShuffleRunner; sceneDelay?: number }): ReactNode {
  const scripted = useScriptedState();
  return (
    <ScriptedContext.Provider value={scripted}>
    <main className="as-shell">
      <h1 className="limbo-title">AFTERSHOCK</h1>
      <p>{TAGLINE}</p>
      <div className="as-chip" role="note">
        <strong>{DEMO_CHIP}</strong>
        <span>{DEMO_NOTE}</span>
      </div>
      {p.pair && (
        <LimboShell pair={p.pair} defs={config.defs} describeConflicts={config.describeConflicts}>
          <ReplicaPair
            search={withReplicas(typeof location === 'undefined' ? '' : location.search)}
            pair={p.pair}
            names={{
              a: displayName(config.members.a.member).toUpperCase(),
              b: displayName(config.members.b.member).toUpperCase(),
            }}
            plate={{ a: 1, b: 2 }}
            onReset={() => {
              scripted.reset();
              (p.onReset ?? (() => undefined))();
            }}
            renderReplica={(id: Id) => <ReplicaBody id={id} />}
          />
          <ScenePanel pair={p.pair} {...(p.sceneDelay === undefined ? {} : { delay: p.sceneDelay })} />
          <ShuffleSection createRunner={p.createRunner ?? createWorkerRunner} goldens={config.goldens} />
        </LimboShell>
      )}
    </main>
    </ScriptedContext.Provider>
  );
}

export interface LimboDebug {
  ready: Promise<void>;
  pair: Pair<State> | undefined;
  state(id: Id): string;
  ops(id: Id): unknown[];
  view(id: Id): unknown;
  queued(id: Id): unknown[];
}

/** Dev and test builds only. Vite replaces the guard with `false` in a production build. */
const DEBUG = import.meta.env.DEV || import.meta.env.MODE === 'test';

export interface BootOptions {
  /** Storage, locks, id source and query string for the pair identity. Default: the browser's. */
  identity?: IdentityOptions;
  /** Called after Reset demo has deleted this session's two databases. Default `location.reload`. */
  reload?(): void;
  /** Seed ops. Default: the survey seed. */
  seedOps?: readonly Op[];
  /** Shuffle test runner. Default: a Web Worker. */
  createRunner?(): ShuffleRunner;
}

/** Create the pair over the seed, mount the app, and (dev and test only) expose `window.limbo`. */
export function boot(el: HTMLElement, o: BootOptions = {}): { ready: Promise<Pair<State>> } {
  const root = createRoot(el);
  let pair: Pair<State> | undefined;
  let identity: Identity | undefined;
  const reset = async (): Promise<void> => {
    await identity?.reset(() => pair?.close());
    (o.reload ?? (() => location.reload()))();
  };
  const ready = acquirePairIdentity(config.name, o.identity).then((id) => {
    identity = id;
    return createPair<State>({
      app: config.name,
      defs: config.defs,
      materialize: config.materialize,
      twinCount: config.twinCount,
      seedOps: o.seedOps ?? config.seedOps,
      store: (name) => openStore(name.endsWith(':a') ? id.names[0]! : id.names[1]!),
    });
  }).then((p) => {
    pair = p;
    root.render(
      <StrictMode>
        <App pair={p} onReset={() => void reset()} {...(o.createRunner ? { createRunner: o.createRunner } : {})} />
      </StrictMode>,
    );
    return p;
  });
  if (DEBUG) {
    const rep = (id: Id) => (id === 'a' ? pair!.a : pair!.b);
    const debug: LimboDebug = {
      ready: ready.then(() => undefined),
      get pair() {
        return pair;
      },
      state: (id) => canonical(rep(id).state()),
      ops: (id) => rep(id).log(),
      view: (id) => pair!.view(id),
      queued: (id) => pair!.queued(id),
    };
    (window as unknown as { limbo: LimboDebug }).limbo = debug;
  }
  return { ready };
}

const el = typeof document === 'undefined' ? null : document.getElementById('root');
if (el) {
  // Dev and test only (R14.1): `?devrelay=<url>&r=<id>` mounts the solo page. A production build
  // replaces DEBUG with `false`, drops this branch, and never emits the dynamic import.
  const relay = DEBUG ? new URLSearchParams(location.search).get('devrelay') : null;
  if (DEBUG && relay) {
    const r = new URLSearchParams(location.search).get('r') ?? 'a';
    void import('./devrelay.ts').then((m) => m.mountSolo({ url: relay, r, el }));
  } else boot(el);
  void registerShell({ prod: import.meta.env.PROD, nav: navigator });
}

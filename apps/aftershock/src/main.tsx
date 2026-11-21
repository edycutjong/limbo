import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { canonical } from '../../../skeleton/src/core/causal.ts';
import type { Op } from '../../../skeleton/src/core/types.ts';
import { LimboShell, ReplicaPair, type Id } from '../../../skeleton/src/limbo/index.ts';
import '../../../skeleton/src/limbo/tokens.css';
import { createPair, type Pair } from '../../../skeleton/src/sync/pair.ts';
import { deleteStore } from '../../../skeleton/src/sync/store.ts';
import * as config from '../app.config.ts';
import { displayName } from './members.ts';
import type { State } from './model.ts';
import { createWorkerRunner } from './shuffle-runner.ts';
import { ReplicaBody } from './views/ReplicaBody.tsx';
import { ShuffleSection } from './views/ShuffleSection.tsx';
import type { ShuffleRunner } from '../../../skeleton/src/limbo/shuffle-test.tsx';
import '../app.css';

export const TAGLINE = 'For small teams who fill the same form when the signal is gone.';
export const DEMO_CHIP = 'DEMO DATA';
export const DEMO_NOTE = 'Demonstration data shape — not used in the field';

/** Root component: heading, tagline, DEMO DATA chip (a note, not dismissible), and the pair when given. */
export function App(p: { pair?: Pair<State>; onReset?(): void; createRunner?(): ShuffleRunner }): ReactNode {
  return (
    <main className="as-shell">
      <h1>AFTERSHOCK</h1>
      <p>{TAGLINE}</p>
      <div className="as-chip" role="note">
        <strong>{DEMO_CHIP}</strong>
        <span>{DEMO_NOTE}</span>
      </div>
      {p.pair && (
        <LimboShell pair={p.pair} defs={config.defs} describeConflicts={config.describeConflicts}>
          <ReplicaPair
            pair={p.pair}
            names={{
              a: displayName(config.members.a.member).toUpperCase(),
              b: displayName(config.members.b.member).toUpperCase(),
            }}
            plate={{ a: 1, b: 2 }}
            onReset={() => (p.onReset ?? (() => undefined))()}
            renderReplica={(id: Id) => <ReplicaBody id={id} />}
          />
          <ShuffleSection createRunner={p.createRunner ?? createWorkerRunner} goldens={config.goldens} />
        </LimboShell>
      )}
    </main>
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
  /** Called after Reset demo has deleted both databases. Default `location.reload`. */
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
  const reset = async (): Promise<void> => {
    pair?.close();
    await Promise.all(['a', 'b'].map((id) => deleteStore(`limbo:${config.name}:${id}`)));
    (o.reload ?? (() => location.reload()))();
  };
  const ready = createPair<State>({
    app: config.name,
    defs: config.defs,
    materialize: config.materialize,
    twinCount: config.twinCount,
    seedOps: o.seedOps ?? config.seedOps,
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
if (el) boot(el);

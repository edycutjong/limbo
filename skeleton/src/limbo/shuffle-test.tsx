// ShuffleTest: replays the ops on screen in random causal orders through an injected runner (a worker in an app).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Op } from '../core/types.ts';
import type { ShuffleInput, ShuffleResult } from './shuffle.ts';

export interface ShuffleRunner {
  run(input: ShuffleInput): Promise<ShuffleResult>;
  cancel(): void;
}
export interface Golden {
  opIds: string[];
  state: string;
}

/** 1000 -> "1,000" by string slicing; `toLocaleString` is locale-dependent. */
export function groupThousands(n: number): string {
  const s = String(Math.trunc(n));
  let out = '';
  for (let i = 0; i < s.length; i++) out += (i > 0 && (s.length - i) % 3 === 0 && s[i - 1] !== '-' ? ',' : '') + s[i];
  return out;
}

type Phase = { k: 'idle' } | { k: 'running' } | { k: 'cancelled' } | { k: 'error'; message: string } | { k: 'done'; r: ShuffleResult };

export function ShuffleTest(p: { ops: readonly Op[]; n?: number; createRunner: () => ShuffleRunner; golden?: Golden }): ReactNode {
  const n = p.n ?? 1000;
  const ops = [...new Map(p.ops.map((o) => [o.id, o] as const)).values()];
  const [phase, setPhase] = useState<Phase>({ k: 'idle' });
  const runner = useRef<ShuffleRunner | null>(null);
  const token = useRef(0);
  useEffect(
    () => () => {
      token.current++;
      runner.current?.cancel();
    },
    [],
  );

  const start = (): void => {
    const mine = ++token.current;
    const r = p.createRunner();
    runner.current = r;
    setPhase({ k: 'running' });
    r.run({ ops, n, seed: 1 }).then(
      (res) => mine === token.current && setPhase({ k: 'done', r: res }),
      (e: unknown) => mine === token.current && setPhase({ k: 'error', message: e instanceof Error ? e.message : String(e) }),
    );
  };
  const cancel = (): void => {
    token.current++;
    runner.current?.cancel();
    setPhase({ k: 'cancelled' });
  };

  const ids = ops.map((o) => o.id).sort();
  const res = phase.k === 'done' ? phase.r : undefined;
  const sameIds = p.golden !== undefined && ids.length === p.golden.opIds.length && [...p.golden.opIds].sort().every((id, i) => id === ids[i]);
  const agrees = res !== undefined && res.ran > 0 && res.disagree === 0;
  return (
    <section className="limbo-shuffle" aria-label="Shuffle test">
      <p>Replays the {groupThousands(ops.length)} ops on screen in random causal orders. Measured, property-tested.</p>
      {phase.k === 'running' ? (
        <>
          <p role="status">Running…</p>
          <button type="button" className="limbo-button" onClick={cancel}>
            Cancel
          </button>
        </>
      ) : (
        <button type="button" className="limbo-button" onClick={start}>
          Run shuffle test
        </button>
      )}
      {phase.k === 'cancelled' && <p>Cancelled.</p>}
      {phase.k === 'error' && <p role="alert">Shuffle test failed: {phase.message}</p>}
      {res && agrees && <p>{`${groupThousands(res.ran)} / ${groupThousands(n)} orderings → same state`}</p>}
      {res && agrees && sameIds && res.states[0] === p.golden!.state && <p>matches the specified result ✓</p>}
      {res && res.disagree > 0 && (
        <>
          <p>{`${groupThousands(res.disagree)} of ${groupThousands(res.ran)} disagree`}</p>
          {res.trace && <pre>{res.trace}</pre>}
        </>
      )}
    </section>
  );
}

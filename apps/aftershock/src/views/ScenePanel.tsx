// ScenePanel (R11): the "Play the survey scene" button and the "scripted edit" labels.
// The button performs the six edits of `surveyScript` one at a time and nothing else. It does not
// restore the link and does not tap Keep this note. Presentation state only: no op reads it.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLimbo } from '../../../../skeleton/src/limbo/index.ts';
import type { Pair } from '../../../../skeleton/src/sync/pair.ts';
import type { State } from '../model.ts';
import { surveyScript } from '../scene.ts';

export interface Scripted {
  /** Ids of the ops the button created, until the next link restore. */
  ids: ReadonlySet<string>;
  /** The scene flag: set once the button has run, cleared by Reset demo. */
  ran: boolean;
  add(id: string): void;
  markRan(): void;
  clearIds(): void;
  reset(): void;
}

export const ScriptedContext = createContext<Scripted>({
  ids: new Set(),
  ran: false,
  add: () => undefined,
  markRan: () => undefined,
  clearIds: () => undefined,
  reset: () => undefined,
});
export const useScripted = (): Scripted => useContext(ScriptedContext);

export function useScriptedState(): Scripted {
  const [ids, setIds] = useState<ReadonlySet<string>>(new Set());
  const [ran, setRan] = useState(false);
  return {
    ids,
    ran,
    add: (id) => setIds((s) => new Set(s).add(id)),
    markRan: () => setRan(true),
    clearIds: () => setIds((s) => (s.size === 0 ? s : new Set())),
    reset: () => {
      setIds(new Set());
      setRan(false);
    },
  };
}

const pause = (ms: number): Promise<void> => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

/** `delay` is the presentation pause between edits in ms (350 by default, 0 in tests). */
export function ScenePanel(p: { pair: Pair<State>; delay?: number }): ReactNode {
  const { view } = useLimbo('a');
  const s = useScripted();
  const down = view.link === 'down';
  const clear = s.clearIds;
  const hasIds = s.ids.size > 0;
  useEffect(() => {
    if (!down && hasIds) clear();
  }, [down, hasIds, clear]);

  const play = async (): Promise<void> => {
    s.markRan();
    for (const [i, step] of surveyScript.entries()) {
      if (i > 0) await pause(p.delay ?? 350);
      s.add(step.run(step.replica === 'a' ? p.pair.a : p.pair.b).id);
    }
  };
  return (
    <section className="as-scene" aria-label="Survey scene">
      {down && !s.ran && (
        <button type="button" className="limbo-button" onClick={() => void play()}>
          Play the survey scene
        </button>
      )}
    </section>
  );
}

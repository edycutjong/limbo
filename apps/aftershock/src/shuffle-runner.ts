// Worker-backed ShuffleRunner for the app (R12.1).
import type { ShuffleRunner } from '../../../skeleton/src/limbo/shuffle-test.tsx';
import type { ShuffleResult } from '../../../skeleton/src/limbo/shuffle.ts';

export function createWorkerRunner(): ShuffleRunner {
  let w: Worker | undefined;
  return {
    run(input) {
      w?.terminate();
      const worker = new Worker(new URL('./shuffle.worker.ts', import.meta.url), { type: 'module' });
      w = worker;
      return new Promise<ShuffleResult>((resolve, reject) => {
        worker.onmessage = (e: MessageEvent<{ ok: boolean; result?: ShuffleResult; message?: string }>) => {
          worker.terminate();
          if (e.data.ok && e.data.result) resolve(e.data.result);
          else reject(new Error(e.data.message ?? 'shuffle worker failed'));
        };
        worker.onerror = (e) => {
          worker.terminate();
          reject(new Error(e.message || 'shuffle worker failed'));
        };
        worker.postMessage(input);
      });
    },
    cancel() {
      w?.terminate();
      w = undefined;
    },
  };
}

// Worker entry for the shuffle test (R12.1): replays the ops in random causal orders off the main thread.
import { runShuffle, type ShuffleInput } from '../../../skeleton/src/limbo/shuffle.ts';
import { materialize } from './model.ts';

self.onmessage = (e: MessageEvent<ShuffleInput>): void => {
  try {
    (self as unknown as { postMessage(m: unknown): void }).postMessage({ ok: true, result: runShuffle(e.data, materialize) });
  } catch (err) {
    (self as unknown as { postMessage(m: unknown): void }).postMessage({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
};

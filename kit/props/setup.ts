import { afterEach } from 'vitest';

// Property tests are long synchronous loops. Yield one macrotask between tests so the worker's
// event loop reaches its timers/messages phase and worker->main RPC replies are processed.
afterEach(() => new Promise<void>((resolve) => setImmediate(resolve)));

import { runHook, runFastProps } from './lib.mjs';

runHook('props-after-task', 'PostTaskExec', (ev) => {
  const r = runFastProps();
  return { result: r.status, task: ev.task_name ?? null, target: ev.spec_name ?? null, detail: r.detail ?? null, exit: 0 };
});

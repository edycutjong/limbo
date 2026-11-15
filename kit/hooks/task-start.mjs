import { runHook } from './lib.mjs';

runHook('task-start', 'PreTaskExec', (ev) => ({
  result: 'logged',
  target: ev.spec_name ?? null,
  task: ev.task_name ?? null,
  detail: `spec=${ev.spec_name ?? ''}`,
}));

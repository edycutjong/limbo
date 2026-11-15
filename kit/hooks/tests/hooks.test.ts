import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const hooksDir = join(here, '..');
const sample = (n: string) => JSON.parse(readFileSync(join(here, 'samples', `${n}.json`), 'utf8'));

let tmp: string;
let logFile: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'limbo-hooks-'));
  logFile = join(tmp, 'hooks.jsonl');
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

function run(script: string, event: object, env: Record<string, string> = {}) {
  const r = spawnSync('node', [join(hooksDir, `${script}.mjs`)], {
    input: JSON.stringify(event),
    encoding: 'utf8',
    env: { ...process.env, LIMBO_ROOT: tmp, LIMBO_HOOKS_LOG: logFile, ...env },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const rows = () =>
  existsSync(logFile) ? readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
function put(rel: string, text: string) {
  const p = join(tmp, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text);
  return p;
}
const shell = (command: string) => ({ ...sample('PreToolUse'), tool_name: 'shell', tool_input: { command } });

describe('guard-shell', () => {
  it.each([
    'git push origin main',
    'git commit -m x',
    'pnpm publish',
    'echo ok && git push',
    'curl -X POST https://x',
    'gh pr create',
    'rm -rf /',
    'wget -T f https://x',
  ])('denies %s', (c) => {
    const r = run('guard-shell', shell(c));
    expect(r.code).toBe(2);
    expect(r.err).not.toBe('');
    expect(rows().map((x) => x.result)).toEqual(['deny']);
  });
  it.each(['pnpm test', 'git status', 'node kit/x.mjs', 'curl https://x'])('allows %s', (c) => {
    const r = run('guard-shell', shell(c));
    expect(r.code).toBe(0);
    expect(rows().map((x) => x.result)).toEqual(['allow']);
  });
});

const INTENTS = JSON.stringify({ 'add-item': { intent: { kind: 'add-remove' } }, bump: { intent: { kind: 'delta' } } });
const goodOp = `// ok\nexport default { name: 'bump', merge: 'commutes', intent: { kind: 'delta', field: 'n' }, apply: (s) => s };\n`;
const lint = (rel: string) =>
  run('op-lint', { ...sample('PostFileCreate'), hook_event_name: 'PostFileSave', cwd: tmp, file_path: join(tmp, rel) });

describe('op-lint', () => {
  beforeEach(() => {
    put('kit/props/intents.json', INTENTS);
  });
  it('passes a clean op', () => {
    put('apps/a/src/ops/bump.op.ts', goodOp);
    put('apps/a/src/ops/bump.props.test.ts', '');
    expect(lint('apps/a/src/ops/bump.op.ts').code).toBe(0);
    expect(rows()[0].result).toBe('pass');
  });
  it('ignores banned tokens in comments', () => {
    put('apps/a/src/ops/bump.op.ts', '// Date.now is banned\n' + goodOp);
    put('apps/a/src/ops/bump.props.test.ts', '');
    expect(lint('apps/a/src/ops/bump.op.ts').code).toBe(0);
  });
  it('fails on Date.now()', () => {
    put('apps/a/src/ops/bump.op.ts', goodOp.replace('(s) => s', '(s) => ({ t: Date.now() })'));
    put('apps/a/src/ops/bump.props.test.ts', '');
    const r = lint('apps/a/src/ops/bump.op.ts');
    expect(r.code).toBe(1);
    expect(r.err).toContain('Date.now');
    expect(rows()[0]).toMatchObject({ result: 'fail' });
  });
  it('fails with no intent', () => {
    put('apps/a/src/ops/bump.op.ts', `export default { name: 'bump', merge: 'commutes' };\n`);
    put('apps/a/src/ops/bump.props.test.ts', '');
    expect(lint('apps/a/src/ops/bump.op.ts').code).toBe(1);
    expect(rows()[0].detail).toContain('intent-declared');
  });
  it('fails when intent kind differs from the manifest', () => {
    put('apps/a/src/ops/bump.op.ts', goodOp.replace("kind: 'delta'", "kind: 'set'"));
    put('apps/a/src/ops/bump.props.test.ts', '');
    expect(lint('apps/a/src/ops/bump.op.ts').code).toBe(1);
    expect(rows()[0].detail).toContain('intent-matches-manifest');
  });
  it('fails a commutes op without a props test', () => {
    put('apps/a/src/ops/bump.op.ts', goodOp);
    expect(lint('apps/a/src/ops/bump.op.ts').code).toBe(1);
    expect(rows()[0].detail).toContain('commutes-needs-props');
  });
});

describe('op-scaffold', () => {
  const create = (rel: string) => run('op-scaffold', { ...sample('PostFileCreate'), cwd: tmp, file_path: join(tmp, rel) });
  it('creates props test and registry', () => {
    put('apps/a/src/ops/b-op.op.ts', goodOp);
    put('apps/a/src/ops/a.op.ts', goodOp);
    expect(create('apps/a/src/ops/b-op.op.ts').code).toBe(0);
    const props = readFileSync(join(tmp, 'apps/a/src/ops/b-op.props.test.ts'), 'utf8');
    expect(props).toContain('runOpProperties(def)');
    expect(props).toContain('kit/props/run.ts');
    const reg = readFileSync(join(tmp, 'apps/a/src/ops/registry.gen.ts'), 'utf8');
    expect(reg.startsWith('// generated by kit/hooks/op-scaffold.mjs — do not edit')).toBe(true);
    expect(reg.indexOf('./a.op.ts')).toBeLessThan(reg.indexOf('./b-op.op.ts'));
    expect(reg).toContain('export const ops = [');
    expect(rows().map((x) => x.result)).toEqual(['scaffolded']);
  });
  it('does not overwrite an existing props file', () => {
    put('apps/a/src/ops/a.op.ts', goodOp);
    put('apps/a/src/ops/a.props.test.ts', 'custom');
    create('apps/a/src/ops/a.op.ts');
    expect(readFileSync(join(tmp, 'apps/a/src/ops/a.props.test.ts'), 'utf8')).toBe('custom');
    expect(rows()).toHaveLength(1);
  });
});

describe('props hooks', () => {
  const harness = () => {
    put('kit/props/run.ts', '');
    put('apps/a/src/ops/a.op.ts', goodOp);
  };
  const failCmd = { LIMBO_PROPS_CMD: `node -e "console.log('counterexample: x');process.exit(1)"` };
  it('stop-gate and props-after-task skip in an empty fixture', () => {
    const a = run('stop-gate', sample('Stop'));
    const b = run('props-after-task', sample('PostTaskExec'));
    expect([a.code, a.out, b.code, b.out]).toEqual([0, '', 0, '']);
    expect(rows().map((x) => x.result)).toEqual(['skipped:no-harness', 'skipped:no-harness']);
  });
  it('stop-gate blocks with JSON on failure and gives up after 3', () => {
    harness();
    for (let i = 0; i < 3; i++) {
      const r = run('stop-gate', sample('Stop'), failCmd);
      expect(r.code).toBe(0);
      const j = JSON.parse(r.out);
      expect(j.decision).toBe('block');
      expect(j.reason).toContain('counterexample: x');
      expect(j.reason).toContain('weaken');
    }
    const r = run('stop-gate', sample('Stop'), failCmd);
    expect(r.out).toBe('');
    expect(rows().map((x) => x.result)).toEqual(['block', 'block', 'block', 'gave_up']);
    expect(existsSync(join(tmp, '.kiro-runs/stop-gate-state.json'))).toBe(true);
  });
  it('stop-gate passes silently; props-after-task never blocks', () => {
    harness();
    const ok = { LIMBO_PROPS_CMD: 'node -e "process.exit(0)"' };
    expect(run('stop-gate', sample('Stop'), ok)).toMatchObject({ code: 0, out: '' });
    expect(run('props-after-task', sample('PostTaskExec'), failCmd)).toMatchObject({ code: 0, out: '' });
    expect(rows().map((x) => x.result)).toEqual(['pass', 'fail']);
  });
});

describe('other hooks and the one-line-per-run rule', () => {
  it('session-context prints ops and logs context', () => {
    put('apps/a/src/ops/bump.op.ts', goodOp);
    const r = run('session-context', sample('SessionStart'));
    expect(r.out).toContain('bump | commutes | delta');
    expect(rows().map((x) => x.result)).toEqual(['context']);
  });
  it('task-start logs spec and task', () => {
    run('task-start', sample('PreTaskExec'));
    expect(rows()[0]).toMatchObject({
      result: 'logged',
      task: sample('PreTaskExec').task_name,
      target: sample('PreTaskExec').spec_name,
    });
  });
  it('mcp-log records pass', () => {
    const ev = { ...sample('PostToolUse'), tool_name: '@limbo-convergence/check', tool_response: '{"pass":true}' };
    run('mcp-log', ev);
    expect(rows()[0]).toMatchObject({ result: 'logged', target: '@limbo-convergence/check', detail: 'pass=true' });
  });
  it.each(['op-scaffold', 'op-lint', 'props-after-task', 'stop-gate', 'guard-shell', 'session-context', 'task-start', 'mcp-log'])(
    '%s logs exactly one line, even on bad input',
    (s) => {
      const r = spawnSync('node', [join(hooksDir, `${s}.mjs`)], {
        input: 'not json',
        encoding: 'utf8',
        env: { ...process.env, LIMBO_ROOT: tmp, LIMBO_HOOKS_LOG: logFile },
      });
      expect([0, 1, 2]).toContain(r.status);
      expect(rows()).toHaveLength(1);
      expect(rows()[0]).toHaveProperty('hook', s);
    },
  );
});

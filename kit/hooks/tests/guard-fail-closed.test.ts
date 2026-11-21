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
  tmp = mkdtempSync(join(tmpdir(), 'limbo-guard-'));
  logFile = join(tmp, 'hooks.jsonl');
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

function runRaw(script: string, input: string, env: Record<string, string> = {}) {
  const r = spawnSync('node', [join(hooksDir, `${script}.mjs`)], {
    input,
    encoding: 'utf8',
    env: { ...process.env, LIMBO_ROOT: tmp, LIMBO_HOOKS_LOG: logFile, ...env },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const rows = () =>
  existsSync(logFile) ? readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const guard = (command: string) =>
  runRaw('guard-shell', JSON.stringify({ ...sample('PreToolUse'), tool_name: 'shell', tool_input: { command } }));

describe('guard-shell fails closed (item 1)', () => {
  it.each([
    ['empty input', ''],
    ['whitespace input', '  \n'],
    ['malformed JSON', '{not json'],
    ['a JSON array', '[]'],
    ['JSON null', 'null'],
    ['a JSON string', '"git push"'],
    ['no tool_input', '{"tool_name":"shell"}'],
    ['tool_input without command', '{"tool_input":{}}'],
    ['a null command', '{"tool_input":{"command":null}}'],
    ['a numeric command', '{"tool_input":{"command":7}}'],
    ['an array command', '{"tool_input":{"command":["git","push"]}}'],
    ['an empty command', '{"tool_input":{"command":""}}'],
    ['a blank command', '{"tool_input":{"command":"  "}}'],
  ])('denies %s with exit 2, a reason and one deny row', (_n, input) => {
    const r = runRaw('guard-shell', input);
    expect(r.code).toBe(2);
    expect(r.err).toContain('guard-shell');
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ hook: 'guard-shell', result: 'deny' });
    expect(rows()[0].detail).toBeTruthy();
  });

  it('denies when the guard body throws (deep nesting overflows the parser)', () => {
    const r = guard(`echo ${'$('.repeat(20_000)}x${')'.repeat(20_000)}`);
    expect(r.code).toBe(2);
    expect(rows()).toHaveLength(1);
    expect(rows()[0].result).toBe('deny');
    expect(rows()[0].detail).toContain('fail closed: internal error');
  });

  it('keeps logging-only hooks as they were: bad input exits 0', () => {
    for (const s of ['session-context', 'task-start', 'mcp-log']) {
      expect(runRaw(s, 'not json').code).toBe(0);
    }
  });
});

describe('heredocs that feed a shell (item 2)', () => {
  it.each([
    "sh <<'EOF'\ngit commit -m x\nEOF",
    'sh <<EOF\ngit push\nEOF',
    'bash <<EOF\ngh pr create\nEOF',
    'zsh <<EOF\nvercel deploy\nEOF',
    'dash <<EOF\ngit add .\nEOF',
    'ksh <<EOF\ngit reset\nEOF',
    "bash -s <<'EOF'\ngit stash\nEOF",
    "env FOO=1 sh <<'EOF'\ngit push\nEOF",
    "command bash <<'EOF'\ngit push\nEOF",
    "exec sh <<'EOF'\ngit push\nEOF",
    "<<'EOF' sh\ngit push\nEOF",
    "eval <<'EOF'\ngit push\nEOF",
    "source /dev/stdin <<'EOF'\ngit push\nEOF",
    ". /dev/stdin <<'EOF'\ngit push\nEOF",
    "sh <<-EOF\n\tgit push\n\tEOF",
    "sh <<'A' && cat <<'B'\ngit push\nA\nplain\nB",
    "sh <<'EOF'\necho a\ngit push\nEOF\necho done",
    "sh <<'EOF'\nsh -c 'git push'\nEOF",
    'sh <<< "git push"',
    "sh <<<'git commit -m x'",
    "bash <<<git\\ push",
  ])('denies %j', (c) => {
    const r = guard(c);
    expect(r.code).toBe(2);
    expect(rows().map((x) => x.result)).toEqual(['deny']);
  });

  it.each([
    'cat <<EOF\n$(git push)\nEOF',
    'cat <<EOF\nnow `git commit -m x`\nEOF',
    'cat > f <<EOF\nvalue $(gh pr create)\nEOF',
    'cat <<EOF\n$(echo $(git add .))\nEOF',
    'cat <<EOF\n${X:-$(git push)}\nEOF',
    'echo "${X:-$(git push)}"',
  ])('parses substitutions in an unquoted heredoc body: %j', (c) => {
    expect(guard(c).code).toBe(2);
  });

  it.each([
    "cat <<'EOF'\n$(git push)\nEOF",
    'cat <<"EOF"\n`git push`\nEOF',
    'cat <<\\EOF\n$(git push)\nEOF',
    "sh <<'EOF'\necho hello\nls\nEOF",
    'sh <<EOF\necho $(date)\nEOF',
    "bash <<< 'echo hi'",
    'cat <<EOF\nescaped \\$(git push) and \\`git push\\`\nEOF',
  ])('allows %j', (c) => {
    const r = guard(c);
    expect(r.code).toBe(0);
    expect(rows().map((x) => x.result)).toEqual(['allow']);
  });
});

describe('non-literal command words (item 3)', () => {
  it.each([
    '$(echo git) push',
    '`echo git` push',
    '$G push',
    '${G} push',
    '"$G" push',
    '"${G}" push',
    '"$(echo git)" push',
    '$1 push',
    "$'git' push",
    'G=git; $G push',
    'env $G push',
    'sudo $CMD',
    'FOO=1 $(echo git) push',
    'echo hi && $X',
    'g*t push',
    'gi? push',
    '{git,x} push',
    'eval "$X"',
    'sh -c "$X"',
    'bash -c "$(cat x)"',
  ])('denies %j', (c) => {
    const r = guard(c);
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/not a literal|blocked/);
    expect(rows().map((x) => x.result)).toEqual(['deny']);
  });

  it.each([
    'echo $HOME',
    'echo "$(date)"',
    'echo "${HOME}/x" > /tmp/f',
    'echo $(git status)',
    'git diff $(git rev-parse HEAD)',
    'node kit/x.mjs "$FILE"',
    'ls *.ts',
    'pnpm exec vitest run --project props',
    'X=$(pwd) pnpm test',
    '{ echo a; echo b; }',
    '[ -f x ] && echo y',
    'echo ${#X}',
    "echo $'a\\n'",
  ])('allows %j', (c) => {
    const r = guard(c);
    expect(r.code).toBe(0);
    expect(rows().map((x) => x.result)).toEqual(['allow']);
  });

  it.each(['{ git push; }', 'if true; then git push; fi', 'while true; do git commit -m x; done', '! git push'])(
    'sees through a shell keyword before the command: %j',
    (c) => {
      expect(guard(c).code).toBe(2);
    },
  );
});

describe('nesting limit (item 4)', () => {
  const nest = (levels: number, inner: string): string => {
    let c = inner;
    for (let i = 0; i < levels; i++) c = `sh -c ${JSON.stringify(c)}`;
    return c;
  };
  const nestEval = (levels: number, inner: string): string => {
    let c = inner;
    for (let i = 0; i < levels; i++) c = `eval ${JSON.stringify(c)}`;
    return c;
  };
  it('still finds git push four levels down', () => {
    expect(guard(nest(4, 'git push')).code).toBe(2);
    expect(guard(nestEval(4, 'git push')).code).toBe(2);
  });
  it.each([5, 6, 12])('denies %i levels of sh -c even when the inner command is harmless', (levels) => {
    const r = guard(nest(levels, 'echo hi'));
    expect(r.code).toBe(2);
    expect(r.err).toContain('nested deeper than');
  });
  it('denies deep eval nesting', () => {
    expect(guard(nestEval(8, 'echo hi')).code).toBe(2);
  });
  it('allows shallow harmless nesting', () => {
    expect(guard(nest(3, 'echo hi')).code).toBe(0);
  });
});

describe('allows that must stay allowed (item 5)', () => {
  it.each([
    "cat > f <<'EOF'\nrun git push and git stash, then gh pr create\nEOF",
    "cat > notes.md <<'EOF'\ngit push\nEOF",
    "cat > f <<'EOF'\nvercel deploy; rm -rf /\nEOF\npnpm test",
    "cat <<'EOF' | wc -l\ngit commit\nEOF\necho done",
    'pnpm typecheck && pnpm test && pnpm props',
    'pnpm gate',
    'node kit/scripts/gate-integrity.mjs --write',
    'npx vitest run --project unit',
    'pnpm exec vitest run kit/hooks',
    'node -e "console.log(1)"',
    'git status && git diff | head',
  ])('allows %j', (c) => {
    const r = guard(c);
    expect(r.code).toBe(0);
    expect(rows().map((x) => x.result)).toEqual(['allow']);
  });
  it.each(['git push', 'gh pr list', 'vercel --prod', 'npm publish', 'rm -rf /', 'rm -rf ~'])('policy still denies %s', (c) => {
    expect(guard(c).code).toBe(2);
  });
});

describe('stop-gate blocks even when its state file is unusable (item 6)', () => {
  const failCmd = { LIMBO_PROPS_CMD: `node -e "console.log('counterexample: x');process.exit(1)"` };
  const harness = () => {
    mkdirSync(join(tmp, 'kit', 'props'), { recursive: true });
    writeFileSync(join(tmp, 'kit', 'props', 'run.ts'), '');
    mkdirSync(join(tmp, 'apps', 'a', 'src', 'ops'), { recursive: true });
    writeFileSync(join(tmp, 'apps', 'a', 'src', 'ops', 'a.op.ts'), 'export default {};\n');
  };
  const stopInput = JSON.stringify(sample('Stop'));

  it('blocks when the state path cannot be written (.kiro-runs is a file)', () => {
    harness();
    writeFileSync(join(tmp, '.kiro-runs'), 'in the way');
    const r = runRaw('stop-gate', stopInput, failCmd);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out)).toMatchObject({ decision: 'block' });
    expect(rows()).toHaveLength(1);
    expect(rows()[0].result).toBe('block');
    expect(rows()[0].detail).toContain('state read');
    expect(rows()[0].detail).toContain('state write');
  });

  it('blocks when the state file is corrupt, and records the read error', () => {
    harness();
    mkdirSync(join(tmp, '.kiro-runs'), { recursive: true });
    writeFileSync(join(tmp, '.kiro-runs', 'stop-gate-state.json'), '{broken');
    const r = runRaw('stop-gate', stopInput, failCmd);
    expect(JSON.parse(r.out)).toMatchObject({ decision: 'block' });
    expect(rows()[0].detail).toContain('state read');
    expect(rows()[0].detail).not.toContain('state write');
  });

  it('blocks when the state path is a directory (read and write both fail)', () => {
    harness();
    mkdirSync(join(tmp, '.kiro-runs', 'stop-gate-state.json'), { recursive: true });
    const r = runRaw('stop-gate', stopInput, failCmd);
    expect(JSON.parse(r.out)).toMatchObject({ decision: 'block' });
    expect(rows()[0].result).toBe('block');
  });

  it('writes a complete decision for a large failure output', () => {
    harness();
    const big = { LIMBO_PROPS_CMD: `node -e "console.log('y'.repeat(50000));process.exit(1)"` };
    const r = runRaw('stop-gate', stopInput, big);
    expect(JSON.parse(r.out).decision).toBe('block');
  });

  it('a clean state still counts blocks and gives up after 3', () => {
    harness();
    const results: string[] = [];
    for (let i = 0; i < 4; i++) {
      runRaw('stop-gate', stopInput, failCmd);
      results.push(rows()[i].result);
    }
    expect(results).toEqual(['block', 'block', 'block', 'gave_up']);
    expect(rows()[0].detail).toBe('block 1/3');
  });
});

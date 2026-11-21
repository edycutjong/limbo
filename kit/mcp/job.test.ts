import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { fixtures } from '../props/bad/index.ts';
import type { Counterexample } from '../props/engine.ts';
import { runJobInProcess, type ExplainResult, type JobError, type JobOverrides, type OpInfo } from './job.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function fixtureOverrides(name: string): { overrides: JobOverrides; op: string } {
  const f = fixtures.find((x) => x.name === name);
  if (!f?.def) throw new Error(`fixture ${name} has no def`);
  // Fixture defs are not in intents.json; give each a manifest entry for its own intent.
  const opts = { ...f.opts, manifest: { [f.def.name]: f.def.intent } };
  return { overrides: { defs: { [f.def.name]: { def: f.def, opts } } }, op: f.def.name };
}

async function counterexampleOf(name: string): Promise<{ ce: Counterexample; overrides: JobOverrides; op: string }> {
  const { overrides, op } = fixtureOverrides(name);
  const r = await runJobInProcess({ job: 'fuzz_op', root, app: 'basecamp', op, orderings: 200, replicas: 3, seed: 20251031 }, overrides);
  if (!r.ok) throw new Error(r.error.message);
  const ce = (r.result as { counterexample?: Counterexample }).counterexample;
  if (!ce) throw new Error(`fixture ${name} produced no counterexample`);
  return { ce, overrides, op };
}

const tmp: string[] = [];
afterAll(() => tmp.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('job: list_ops', () => {
  it('lists both apps sorted, with propsFile or null', async () => {
    for (const app of ['basecamp', 'aftershock']) {
      const r = await runJobInProcess({ job: 'list_ops', root, app });
      expect(r.ok).toBe(true);
      const ops = (r as { ok: true; result: { ops: OpInfo[] } }).result.ops;
      expect(ops.length).toBeGreaterThan(0);
      const names = ops.map((o) => o.name);
      expect(names).toEqual([...names].sort());
      for (const o of ops) {
        expect(Object.keys(o).sort()).toEqual(['intent', 'merge', 'name', 'propsFile']);
        expect(o.propsFile === null || o.propsFile === `apps/${app}/src/ops/${o.name}.props.ts`).toBe(true);
      }
    }
    const bc = (await runJobInProcess({ job: 'list_ops', root, app: 'basecamp' })) as { ok: true; result: { ops: OpInfo[] } };
    expect(bc.result.ops.find((o) => o.name === 'item.tick')).toMatchObject({ merge: 'causal-lww', intent: 'set', propsFile: 'apps/basecamp/src/ops/item.tick.props.ts' });
  });

  it('propsFile is null when the op has no props file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'limbo-job-'));
    tmp.push(dir);
    const ops = join(dir, 'apps', 'basecamp', 'src', 'ops');
    mkdirSync(ops, { recursive: true });
    writeFileSync(join(ops, 'x.op.ts'), `export default { name: 'x.set', merge: 'commutes', intent: { kind: 'set', field: 'v' } };\n`);
    writeFileSync(join(ops, 'registry.gen.ts'), `import x from './x.op.ts';\nexport const ops = [x];\n`);
    const r = await runJobInProcess({ job: 'list_ops', root: dir, app: 'basecamp' });
    expect(r).toEqual({ ok: true, result: { app: 'basecamp', ops: [{ name: 'x.set', merge: 'commutes', intent: 'set', propsFile: null }] } });
  });
});

describe('job: fuzz_op', () => {
  it('passes on item.tick', async () => {
    const r = await runJobInProcess({ job: 'fuzz_op', root, app: 'basecamp', op: 'item.tick', orderings: 50, replicas: 3, seed: 20251031 });
    expect(r.ok).toBe(true);
    expect((r as { result: { pass: boolean; runs: number } }).result).toMatchObject({ pass: true, runs: 50 });
  });

  it('unknown op lists the valid names', async () => {
    const r = await runJobInProcess({ job: 'fuzz_op', root, app: 'basecamp', op: 'item.nope' });
    expect(r.ok).toBe(false);
    const e = (r as { ok: false; error: JobError }).error;
    expect(e.code).toBe('unknown-op');
    expect(e.message).toContain('item.nope');
    expect(e.valid).toContain('item.tick');
    expect(e.message).toContain('item.tick');
  });

  it('unknown app names both valid apps', async () => {
    const r = await runJobInProcess({ job: 'list_ops', root, app: 'nope' });
    expect(r).toMatchObject({ ok: false, error: { code: 'unknown-app' } });
    const m = (r as { ok: false; error: JobError }).error.message;
    expect(m).toContain('basecamp');
    expect(m).toContain('aftershock');
  });
});

describe('job: explain_trace', () => {
  it('wall-clock fixture: names a first differing step with two replicas and different states', async () => {
    const { ce, overrides, op } = await counterexampleOf('lww-wallclock');
    const r = await runJobInProcess({ job: 'explain_trace', root, app: 'basecamp', op, counterexample: ce }, overrides);
    expect(r.ok).toBe(true);
    const x = (r as { ok: true; result: ExplainResult }).result;
    expect(x.agree).toBe(false);
    expect(x.firstDifference).not.toBeNull();
    const d = x.firstDifference!;
    expect(d.replicas).toHaveLength(2);
    expect(d.replicas[0]).not.toBe(d.replicas[1]);
    const [a, b] = d.replicas;
    expect(d.states[a]).toBeTruthy();
    expect(d.states[b]).toBeTruthy();
    expect(d.states[a]).not.toBe(d.states[b]);
    expect(Number.isInteger(d.step)).toBe(true);
    expect(x.text).toContain(`first difference at step ${d.step}`);
    expect(Object.keys(x.states).length).toBe(ce.replicas);
  });

  it('toggle fixture: replicas agree, failing property is reported', async () => {
    const { ce, overrides, op } = await counterexampleOf('tick-toggle');
    const r = await runJobInProcess({ job: 'explain_trace', root, app: 'basecamp', op, counterexample: ce }, overrides);
    expect(r.ok).toBe(true);
    const x = (r as { ok: true; result: ExplainResult }).result;
    expect(x.agree).toBe(true);
    expect(x.firstDifference).toBeNull();
    // A toggle also fails raw idempotence, and shrinking may land on either.
    expect(['intent:set', 'raw idempotence']).toContain(x.property);
    expect(x.reason.length).toBeGreaterThan(0);
  });

  it('an edited script is a stale-counterexample', async () => {
    const { ce, overrides, op } = await counterexampleOf('tick-toggle');
    const edited: Counterexample = { ...ce, script: ce.script.map((s, i) => (i === 0 ? { ...s, payload: { ticked: 'edited' } } : s)) };
    const r = await runJobInProcess({ job: 'explain_trace', root, app: 'basecamp', op, counterexample: edited }, overrides);
    expect(r).toMatchObject({ ok: false, error: { code: 'stale-counterexample' } });
  });

  it('edited deliveries are a stale-counterexample', async () => {
    const { ce, overrides, op } = await counterexampleOf('tick-toggle');
    const first = Object.keys(ce.deliveries)[0]!;
    const edited: Counterexample = { ...ce, deliveries: { ...ce.deliveries, [first]: [...ce.deliveries[first]!].reverse().concat('x:99') } };
    const r = await runJobInProcess({ job: 'explain_trace', root, app: 'basecamp', op, counterexample: edited }, overrides);
    expect(r).toMatchObject({ ok: false, error: { code: 'stale-counterexample' } });
  });
});

describe('job: broken op module', () => {
  it('returns import-failed with the message', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'limbo-job-'));
    tmp.push(dir);
    const ops = join(dir, 'apps', 'basecamp', 'src', 'ops');
    mkdirSync(ops, { recursive: true });
    writeFileSync(join(ops, 'broken.op.ts'), `throw new Error('boom from broken op');\nexport default {};\n`);
    writeFileSync(join(ops, 'registry.gen.ts'), `import b from './broken.op.ts';\nexport const ops = [b];\n`);
    for (const spec of [
      { job: 'list_ops' as const, root: dir, app: 'basecamp' },
      { job: 'fuzz_op' as const, root: dir, app: 'basecamp', op: 'broken' },
    ]) {
      const r = await runJobInProcess(spec);
      expect(r).toMatchObject({ ok: false, error: { code: 'import-failed' } });
      expect((r as { ok: false; error: JobError }).error.message).toContain('boom from broken op');
    }
  });
});

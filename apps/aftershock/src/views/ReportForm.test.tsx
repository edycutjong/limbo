import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createReplica, type Replica } from '../../../../skeleton/src/sync/replica.ts';
import { openStore } from '../../../../skeleton/src/sync/store.ts';
import * as act from '../actions.ts';
import { twinCount } from '../conflicts.ts';
import { materialize, type State } from '../model.ts';
import { ops as defs } from '../ops/registry.gen.ts';
import { seedOps } from '../seed.ts';
import { ReportForm } from './ReportForm.tsx';

afterEach(cleanup);

let n = 0;
const make = (id = 'a'): Promise<Replica<State>> =>
  createReplica<State>({ app: 'aftershock', replicaId: id, defs, materialize, twinCount, store: openStore(`as-form-${id}-${n++}`), seedOps });

const mount = (r: Replica<State>, id: string) => {
  const ui = () => <ReportForm replica={r} id={id} sector={r.state().sectors[id]} />;
  const view = render(ui());
  const q = (s: string) => view.container.querySelector<HTMLElement>(s)!;
  const save = () => view.getByText('Save') as HTMLButtonElement;
  const press = (s: string) => fireEvent.click(q(s));
  const type = (s: string, v: string) => fireEvent.change(q(s), { target: { value: v } });
  const after = () => view.rerender(ui());
  return { view, q, save, press, type, after };
};
const names = (r: Replica<State>, from: number): string[] => r.applied().slice(from).map((o) => o.op);

describe('ReportForm', () => {
  it('the Re-inspection input is inside a .ui-check label', async () => {
    const f = mount(await make('a'), 'C3');
    const box = f.q('input[type="checkbox"]');
    expect(box.closest('label.ui-check')).not.toBeNull();
    expect(box.closest('label')!.textContent).toContain('Re-inspection');
  });

  it('A saves C3 damaged, 2, "cracked stairwell": exactly report, count, note', async () => {
    const r = await make('a');
    const before = r.applied().length;
    const f = mount(r, 'C3');
    f.press('[data-severity-option="damaged"]');
    f.type('input[type="number"]', '2');
    f.type('textarea', 'cracked stairwell');
    fireEvent.click(f.save());
    const ops = r.applied().slice(before);
    expect(ops.map((o) => o.op)).toEqual(['sector.report', 'sector.count', 'sector.note']);
    expect(ops[1]!.target).toBe('C3#sari');
    expect(r.state().sectors.C3!.severity).toBe('damaged');
    f.after();
    expect(f.save().disabled).toBe(true);
  });

  it('Save is disabled with nothing changed', async () => {
    const r = await make('a');
    const f = mount(r, 'B2');
    expect(f.save().disabled).toBe(true);
  });

  it('a lower report without Re-inspection is not written; with it a clear then a report are', async () => {
    const r = await make('a');
    act.reportSector(r, 'C3', 'unsafe');
    let from = r.applied().length;
    const f = mount(r, 'C3');
    f.press('[data-severity-option="safe"]');
    fireEvent.click(f.save());
    expect(names(r, from)).toEqual([]);
    f.press('[data-severity-option="safe"]');
    fireEvent.click(f.view.getByLabelText('Re-inspection'));
    from = r.applied().length;
    fireEvent.click(f.save());
    expect(names(r, from)).toEqual(['sector.clear', 'sector.report']);
    expect(r.state().sectors.C3!.severity).toBe('safe');
  });

  it('rejects bad values with an inline error, creates no op and keeps the text', async () => {
    const r = await make('a');
    const from = r.applied().length;
    const f = mount(r, 'C3');
    f.press('[data-severity-option="damaged"]');
    for (const bad of ['-1', '2.5']) {
      f.type('input[type="number"]', bad);
      fireEvent.click(f.save());
      expect(f.q('[data-error="count"]').getAttribute('role')).toBe('alert');
      expect((f.q('input[type="number"]') as HTMLInputElement).value).toBe(bad);
    }
    f.type('input[type="number"]', '1');
    const long = 'x'.repeat(281);
    f.type('textarea', long);
    fireEvent.click(f.save());
    expect(f.q('[data-error="note"]')).toBeTruthy();
    expect((f.q('textarea') as HTMLTextAreaElement).value).toBe(long);
    expect(r.applied().length).toBe(from);
  });

  it('Save with no severity on a new sector shows an error and creates no op', async () => {
    const r = await make('a');
    const from = r.applied().length;
    const f = mount(r, 'C3');
    f.type('textarea', 'only a note');
    fireEvent.click(f.save());
    expect(f.q('[data-error="severity"]')).toBeTruthy();
    expect((f.q('textarea') as HTMLTextAreaElement).value).toBe('only a note');
    expect(r.applied().length).toBe(from);
  });

  it('needs write add for newly pressed and unneed for newly unpressed, never both for one need', async () => {
    const r = await make('a');
    act.reportSector(r, 'C3', 'damaged');
    act.addNeed(r, 'C3', 'water');
    const from = r.applied().length;
    const f = mount(r, 'C3');
    f.press('[data-need-option="water"]');
    f.press('[data-need-option="food"]');
    f.press('[data-need-option="power"]');
    f.press('[data-need-option="power"]');
    fireEvent.click(f.save());
    const ops = r.applied().slice(from);
    expect(ops.map((o) => [o.op, (o.payload as { need: string }).need])).toEqual([
      ['sector.unneed', 'water'],
      ['sector.need', 'food'],
    ]);
    expect(r.state().sectors.C3!.needs).toEqual(['food']);
  });
});

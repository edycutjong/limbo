import { cleanup, fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Op } from '../../../../skeleton/src/core/types.ts';
import { materialize } from '../model.ts';
import { makeSeed } from '../seed.ts';
import { SectorCard } from './SectorCard.tsx';
import { SectorGrid } from './SectorGrid.tsx';

afterEach(cleanup);

function op(r: string, n: number, l: number, deps: Record<string, number>, name: string, target: string, payload: unknown): Op {
  return { id: `${r}:${n}`, op: name, target, payload, stamp: { l, r, n }, deps };
}

const c3 = (sev: string | undefined, extra: Op[] = []): Op[] => [
  op('a#1', 1, 1, {}, 'sector.count', 'C3#sari', { count: 2 }),
  op('b#1', 1, 1, {}, 'sector.count', 'C3#budi', { count: 3 }),
  ...(sev ? [op('a#1', 2, 2, { 'a#1': 1 }, 'sector.report', 'C3', { severity: sev })] : []),
  ...extra,
];

const card = (ops: Op[], id = 'C3') => {
  const sectors = materialize(ops).sectors;
  return render(<SectorCard id={id} sector={sectors[id]} />);
};

describe('SectorCard', () => {
  it('C3 total line, with may-overlap as a sibling outside the instruction line', () => {
    const r = card(c3('unsafe'));
    const total = r.container.querySelector('[data-total]')!;
    expect(total.textContent).toBe('5 reported — Sari 2, Budi 3');
    const overlap = r.container.querySelector('[data-may-overlap]')!;
    expect(overlap.textContent).toBe('may overlap');
    expect(overlap.parentElement).toBe(total.parentElement);
    expect(total.contains(overlap)).toBe(false);
    expect(r.container.querySelector('[data-instruction]')!.contains(overlap)).toBe(false);
  });

  it('instruction line only for unsafe', () => {
    expect(card(c3('unsafe')).container.querySelector('[data-instruction]')!.textContent).toBe('C3 — do not enter');
    cleanup();
    for (const sev of ['safe', 'damaged', undefined]) {
      const r = card(c3(sev));
      expect(r.container.querySelector('[data-instruction]')).toBeNull();
      cleanup();
    }
  });

  it('B2 from the seed lists rina 3 and sari 1 in roster order', () => {
    const r = card(makeSeed(), 'B2');
    expect(r.container.querySelector('[data-severity-word]')!.textContent).toBe('DAMAGED');
    const rows = Array.from(r.container.querySelectorAll('.as-counts li')).map((li) => li.textContent);
    expect(rows).toEqual(['Sari 1', 'Rina 3']);
    expect(r.container.querySelector('[data-total]')!.textContent).toBe('4 reported — Sari 1, Rina 3');
  });

  it('shows needs, note, and scripted tags; names and notes render as text', () => {
    const ops = c3('damaged', [
      op('a#1', 3, 3, { 'a#1': 2 }, 'sector.need', 'C3', { need: 'water' }),
      op('a#1', 4, 4, { 'a#1': 3 }, 'sector.note', 'C3', { note: '<b>gas</b> smell' }),
      op('<i>x</i>', 1, 5, {}, 'sector.count', 'C3#<i>x</i>', { count: 1 }),
    ]);
    const sectors = materialize(ops).sectors;
    const r = render(<SectorCard id="C3" sector={sectors.C3} scripted={['note']} />);
    expect(r.container.querySelector('.as-need-chip')!.textContent).toBe('water');
    expect(r.container.querySelector('[data-note]')!.textContent).toBe('<b>gas</b> smell');
    expect(r.container.querySelector('[data-scripted="note"]')!.textContent).toBe('scripted edit');
    expect(r.container.querySelector('b')).toBeNull();
    expect(r.container.querySelector('i')).toBeNull();
    expect(r.container.textContent).toContain('<i>x</i> 1');
  });

  it('two cards select different sectors independently', () => {
    const sectors = materialize(makeSeed()).sectors;
    function Pane() {
      const [sel, setSel] = useState<string | undefined>();
      return (
        <div data-pane>
          <SectorGrid sectors={sectors} selected={sel} onSelect={setSel} />
          {sel && <SectorCard id={sel} sector={sectors[sel]} />}
        </div>
      );
    }
    const r = render(<><Pane /><Pane /></>);
    const [p1, p2] = Array.from(r.container.querySelectorAll<HTMLElement>('[data-pane]'));
    fireEvent.click(p1!.querySelector('[data-sector="B2"]')!);
    fireEvent.click(p2!.querySelector('[data-sector="A1"]')!);
    expect(p1!.querySelector('[data-card]')!.getAttribute('data-card')).toBe('B2');
    expect(p2!.querySelector('[data-card]')!.getAttribute('data-card')).toBe('A1');
    fireEvent.click(p1!.querySelector('[data-sector="E3"]')!);
    expect(p1!.querySelector('[data-card]')!.getAttribute('data-card')).toBe('E3');
    expect(p2!.querySelector('[data-card]')!.getAttribute('data-card')).toBe('A1');
  });
});

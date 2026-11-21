import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { materialize } from '../model.ts';
import { makeSeed } from '../seed.ts';
import { SECTOR_IDS } from '../sectors.ts';
import { SectorGrid, GRID_NAME } from './SectorGrid.tsx';

afterEach(cleanup);

const sectors = materialize(makeSeed()).sectors;

function setup() {
  const onSelect = vi.fn();
  const r = render(<SectorGrid sectors={sectors} onSelect={onSelect} />);
  const cell = (id: string) => r.container.querySelector<HTMLElement>(`[data-sector="${id}"]`)!;
  return { r, onSelect, cell };
}

describe('SectorGrid', () => {
  it('seed: 10 cells with a word, 14 NO REPORT', () => {
    const { r } = setup();
    expect(r.container.querySelectorAll('[data-sector]').length).toBe(24);
    const text = SECTOR_IDS.map((id) => r.container.querySelector(`[data-sector="${id}"]`)!.textContent!);
    expect(text.filter((t) => t.includes('NO REPORT')).length).toBe(14);
    expect(text.filter((t) => /SAFE|DAMAGED|UNSAFE/.test(t)).length).toBe(10);
  });

  it('B2 and E3 read DAMAGED; A1 reads SAFE with total 2', () => {
    const { cell } = setup();
    expect(cell('B2').textContent).toContain('DAMAGED');
    expect(cell('E3').textContent).toContain('DAMAGED');
    expect(cell('A1').textContent).toContain('SAFE');
    expect(cell('A1').querySelector('.as-cell-total')!.textContent).toBe('2');
    expect(cell('A1').textContent).not.toContain('NO REPORT');
  });

  it('aria-labels follow R17.3 and the grid is named', () => {
    const { r, cell } = setup();
    expect(r.getByRole('grid').getAttribute('aria-label')).toBe(GRID_NAME);
    expect(cell('A1').getAttribute('aria-label')).toBe('A1, SAFE, 2 people reported');
    expect(cell('B2').getAttribute('aria-label')).toBe('B2, DAMAGED, 4 people reported');
    expect(cell('C3').getAttribute('aria-label')).toBe('C3, not reported');
  });

  it('only one cell has tabindex 0', () => {
    const { r } = setup();
    expect(r.container.querySelectorAll('[data-sector][tabindex="0"]').length).toBe(1);
    expect(r.container.querySelectorAll('[data-sector][tabindex="-1"]').length).toBe(23);
  });

  it('arrows move focus and stop at the edges; roving tabindex follows', () => {
    const { cell } = setup();
    cell('A1').focus();
    fireEvent.keyDown(cell('A1'), { key: 'ArrowLeft' });
    fireEvent.keyDown(cell('A1'), { key: 'ArrowUp' });
    expect(document.activeElement).toBe(cell('A1'));
    fireEvent.keyDown(cell('A1'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cell('B1'));
    expect(cell('B1').getAttribute('tabindex')).toBe('0');
    expect(cell('A1').getAttribute('tabindex')).toBe('-1');
    fireEvent.keyDown(cell('B1'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cell('B2'));
    cell('F4').focus();
    fireEvent.keyDown(cell('F4'), { key: 'ArrowRight' });
    fireEvent.keyDown(cell('F4'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cell('F4'));
    fireEvent.keyDown(cell('F4'), { key: 'ArrowUp' });
    expect(document.activeElement).toBe(cell('F3'));
  });

  it('Home and End go to the first and last cell of the row', () => {
    const { cell } = setup();
    cell('C3').focus();
    fireEvent.keyDown(cell('C3'), { key: 'End' });
    expect(document.activeElement).toBe(cell('F3'));
    fireEvent.keyDown(cell('F3'), { key: 'Home' });
    expect(document.activeElement).toBe(cell('A3'));
  });

  it('Enter and Space select the focused cell', () => {
    const { cell, onSelect } = setup();
    cell('C3').focus();
    fireEvent.keyDown(cell('C3'), { key: 'Enter' });
    fireEvent.keyDown(cell('C3'), { key: ' ' });
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect).toHaveBeenCalledWith('C3');
  });

  it('typing in a text input inside the grid does not select', () => {
    const { r, onSelect } = setup();
    const input = document.createElement('input');
    r.getByRole('grid').append(input);
    input.focus();
    fireEvent.keyDown(input, { key: ' ' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('cells have a 44 px minimum size in CSS', async () => {
    const css = (await import('node:fs')).readFileSync('apps/aftershock/app.css', 'utf8');
    expect(css).toMatch(/\.as-cell\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/s);
  });
});

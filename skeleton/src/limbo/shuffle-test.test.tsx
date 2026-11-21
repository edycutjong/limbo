import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { canonical, createOp, newReplica } from '../core/causal.ts';
import type { Op, OpDef } from '../core/types.ts';
import { runShuffle, type ShuffleInput, type ShuffleResult } from './shuffle.ts';
import { ShuffleTest, type ShuffleRunner } from './shuffle-test.tsx';

const add: OpDef = { name: 'add', merge: 'commutes', intent: { kind: 'delta', field: 'sum' } };
function ops(): Op[] {
  const a = newReplica('a');
  const b = newReplica('b');
  return [createOp(a, add, 't', { by: 1 }), createOp(a, add, 't', { by: 2 }), createOp(b, add, 't', { by: 5 })];
}
const sum = (os: readonly Op[]) => ({ sum: os.reduce((s, o) => s + (o.payload as { by: number }).by, 0) });
const rmw = (os: readonly Op[]) => ({ v: os.reduce((v, o) => v * 2 + (o.id.startsWith('a') ? 1 : 2), 0) });

const inline = (m: (os: readonly Op[]) => unknown): (() => ShuffleRunner) => () => ({
  run: (i) => Promise.resolve(runShuffle(i, m)),
  cancel: () => undefined,
});
async function start(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByText('Run shuffle test'));
  });
}

describe('ShuffleTest', () => {
  it('prints the converged line and the on-screen caption', async () => {
    render(<ShuffleTest ops={ops()} createRunner={inline(sum)} />);
    expect(screen.getByText(/Replays the 3 ops on screen in random causal orders/)).toBeTruthy();
    await start();
    expect(screen.getByText('1,000 / 1,000 orderings → same state')).toBeTruthy();
  });

  it('prints the count the runner returned, not N', async () => {
    const createRunner = (): ShuffleRunner => ({
      run: (_i: ShuffleInput) => Promise.resolve<ShuffleResult>({ ran: 640, disagree: 0, states: ['x'] }),
      cancel: () => undefined,
    });
    render(<ShuffleTest ops={ops()} createRunner={createRunner} />);
    await start();
    expect(screen.getByText('640 / 1,000 orderings → same state')).toBeTruthy();
  });

  it('golden line only when ids and state match', async () => {
    const os = ops();
    const golden = { opIds: os.map((o) => o.id), state: canonical(sum(os)) };
    const { unmount } = render(<ShuffleTest ops={os} n={50} createRunner={inline(sum)} golden={golden} />);
    await start();
    expect(screen.getByText('matches the specified result ✓')).toBeTruthy();
    unmount();

    const edited = [...os, createOp(newReplica('c'), add, 't', { by: 9 })];
    render(<ShuffleTest ops={edited} n={50} createRunner={inline(sum)} golden={golden} />);
    await start();
    expect(screen.getByText(/orderings → same state/)).toBeTruthy();
    expect(screen.queryByText(/matches the specified result/)).toBeNull();
  });

  it('shows k of N disagree and an explainTrace trace for a non-commutative materialize', async () => {
    render(<ShuffleTest ops={ops()} n={100} createRunner={inline(rmw)} />);
    await start();
    const line = screen.getByText(/^\d+ of 100 disagree$/);
    expect(Number(line.textContent!.split(' ')[0])).toBeGreaterThan(0);
    expect(document.querySelector('pre')!.textContent).toContain('replica a:');
    expect(screen.queryByText(/orderings → same state/)).toBeNull();
  });

  it('shows Running… and cancel while pending', async () => {
    const cancel = vi.fn();
    render(<ShuffleTest ops={ops()} createRunner={() => ({ run: () => new Promise(() => undefined), cancel })} />);
    await start();
    expect(screen.getByText('Running…')).toBeTruthy();
    fireEvent.click(screen.getByText('Cancel'));
    expect(cancel).toHaveBeenCalled();
    expect(screen.queryByText('Running…')).toBeNull();
  });

  it('a runner error shows an error line and no pass', async () => {
    render(<ShuffleTest ops={ops()} createRunner={() => ({ run: () => Promise.reject(new Error('boom')), cancel: () => undefined })} />);
    await start();
    expect(screen.getByRole('alert').textContent).toContain('boom');
    expect(screen.queryByText(/orderings → same state/)).toBeNull();
  });

  it('never says proven or guaranteed', async () => {
    const { container } = render(<ShuffleTest ops={ops()} n={20} createRunner={inline(sum)} />);
    await start();
    expect(container.textContent!.toLowerCase()).not.toMatch(/proven|guaranteed/);
  });

  it('shows a rejection that is not an Error as its own text', async () => {
    render(<ShuffleTest ops={ops()} createRunner={() => ({ run: () => Promise.reject('plain text'), cancel: () => undefined })} />);
    await start();
    expect(screen.getByRole('alert').textContent).toBe('Shuffle test failed: plain text');
  });

  it('ignores a runner error that arrives after cancel', async () => {
    let fail!: (e: unknown) => void;
    render(<ShuffleTest ops={ops()} createRunner={() => ({ run: () => new Promise((_, rej) => (fail = rej)), cancel: () => undefined })} />);
    await start();
    fireEvent.click(screen.getByText('Cancel'));
    await act(async () => fail(new Error('late')));
    expect(screen.getByText('Cancelled.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

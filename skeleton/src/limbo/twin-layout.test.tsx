import { act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Twin } from './twin.tsx';
import { useLimbo } from './shell.tsx';
import { makeStubPair, renderApp } from './test/app.ts';

function Rows() {
  const { conflicts } = useLimbo('a');
  return (
    <>
      {conflicts.map((d) => (
        <Twin
          key={d.id}
          replica="a"
          id={d.id}
          atRest={<span>at rest</span>}
          ghost={<span>ghost</span>}
          caption={d.caption}
          rule={d.rule}
          actions={<button>Keep</button>}
        />
      ))}
    </>
  );
}

// jsdom has no layout, so this checks the DOM contract the CSS relies on (R2.1, R2.2):
// the ghost is sized by a stage that holds the at-rest content and the ghost, and nothing else.
describe('Twin stage layout', () => {
  it('ghost and at-rest share one parent that holds no caption, rule line or action', async () => {
    const pair = await makeStubPair();
    const { container } = renderApp(pair, <Rows />);
    act(() => void pair.a.local('note.add', 'n1', {}));
    await act(async () => void (await pair.settle()));
    act(() => pair.cut());
    act(() => {
      pair.a.local('note.set', 'n1', 'edited');
      pair.b.local('note.delete', 'n1', {});
    });
    act(() => pair.restore());
    await act(async () => void (await pair.settle()));

    const ghost = container.querySelector<HTMLElement>('.limbo-twin-ghost')!;
    const rest = container.querySelector<HTMLElement>('.limbo-twin-rest')!;
    expect(ghost.parentElement).toBe(rest.parentElement);
    const stage = ghost.parentElement!;
    expect(stage.classList.contains('limbo-twin-stage')).toBe(true);
    expect(stage.classList.contains('limbo-twin')).toBe(false);
    expect(stage.querySelector('.limbo-twin-caption, .limbo-twin-rule, .limbo-twin-actions, .limbo-twin-label, button')).toBeNull();
    const twin = container.querySelector('.limbo-twin')!;
    expect(stage.parentElement).toBe(twin);
    pair.close();
  });
});

import { describe, expect, it } from 'vitest';
import { createInPageLink } from './inpage-link.ts';

describe('in-page link state changes', () => {
  it('announces up once on restore and down once on cut, ignoring repeats', () => {
    const link = createInPageLink({ schedule: () => undefined });
    const seen: string[] = [];
    link.a.onState((s) => seen.push(s));
    link.cut(); // already down: nothing to announce
    link.restore();
    link.restore(); // already up: nothing to announce
    link.cut();
    link.cut();
    expect(seen).toEqual(['up', 'down']);
    expect(link.a.isUp()).toBe(false);
  });
});

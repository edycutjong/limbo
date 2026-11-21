import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { App } from './main.tsx';

it('renders one h1, the tagline and the DEMO DATA chip', () => {
  render(<App />);
  const h1 = screen.getAllByRole('heading', { level: 1 });
  expect(h1).toHaveLength(1);
  expect(h1[0]!.textContent).toBe('AFTERSHOCK');
  expect(screen.getByText('For small teams who fill the same form when the signal is gone.')).toBeTruthy();
  const chip = screen.getByRole('note');
  expect(chip.textContent).toContain('DEMO DATA');
  expect(chip.textContent).toContain('Demonstration data shape — not used in the field');
  expect(chip.querySelector('button')).toBeNull();
});

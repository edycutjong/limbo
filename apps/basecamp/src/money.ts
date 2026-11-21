// Money is integer cents. String operations only: no floats, no locale.

const AMOUNT = /^\d+(\.\d{1,2})?$/;

/** Text to integer cents, or null when the text is not a whole or two-decimal amount. */
export function parseCents(text: string): number | null {
  let t = text.trim();
  if (t.startsWith('$')) t = t.slice(1).trim();
  if (!AMOUNT.test(t)) return null;
  const [whole = '0', frac = ''] = t.split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Integer cents to `$26.00`. Throws on a non-integer or negative amount. */
export function formatCents(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error(`formatCents: bad amount ${cents}`);
  const s = String(cents).padStart(3, '0');
  return `$${s.slice(0, -2)}.${s.slice(-2)}`;
}

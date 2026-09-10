import { describe, it, expect } from 'vitest';
import { identityClass, formatEvalue } from '@/lib/format';

/**
 * Finding 15: there must be exactly one identity-bracket implementation, and
 * changing it must not silently alter scientific interpretation. These are the
 * boundary values from the audit.
 */
describe('identity brackets (finding 15)', () => {
  const cases = [
    [100, 'id-95'], [97, 'id-95'], [96.999, 'id-95'], [95, 'id-95'],
    [94.999, 'id-80'], [90, 'id-80'], [89.999, 'id-80'], [80, 'id-80'],
    [79.999, 'id-50'], [50, 'id-50'],
    [49.999, 'id-low'], [0, 'id-low'],
  ];
  for (const [pct, cls] of cases) {
    it(`${pct}% -> ${cls}`, () => expect(identityClass(pct)).toBe(cls));
  }

  it('every returned class exists in globals.css', async () => {
    const fs = await import('node:fs/promises');
    const css = await fs.readFile(new URL('../src/app/globals.css', import.meta.url), 'utf8');
    for (const cls of new Set(cases.map((c) => c[1]))) {
      expect(css.includes(`.${cls}`), `.${cls} missing from globals.css`).toBe(true);
    }
  });
});

describe('E-value formatting', () => {
  it('renders zero and tiny values without losing meaning', () => {
    expect(formatEvalue(0)).toBe('0.0');
    expect(formatEvalue(1e-180)).toBe('1.0e-180');
    expect(formatEvalue(null)).toBe('N/A');
    expect(formatEvalue(undefined)).toBe('N/A');
    expect(formatEvalue(NaN)).toBe('N/A');
  });
  it('never rounds a significant value to zero', () => {
    expect(formatEvalue(3e-9)).not.toBe('0.0');
    expect(formatEvalue(0.00002)).not.toBe('0.0000');
  });
});

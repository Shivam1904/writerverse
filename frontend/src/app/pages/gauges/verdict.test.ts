import { describe, expect, it } from 'vitest';
import { deriveVerdict } from './verdict';

describe('deriveVerdict', () => {
  it('a reading that holds is "holds"', () => {
    expect(deriveVerdict({ verdict: { ok: true } }).verdict).toBe('holds');
  });

  it('an outdated reading is something to look at, not "holds"', () => {
    expect(deriveVerdict({ verdict: { ok: true }, stale: true })).toEqual({ verdict: 'warn', label: 'outdated' });
  });

  it('a descriptive lens stays "noting" even when outdated', () => {
    expect(deriveVerdict({ mode: 'descriptive', stale: true }).verdict).toBe('noting');
  });
});

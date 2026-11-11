import { describe, expect, it } from 'vitest';
import { formatWelcomeHeadline, leftWhen } from './outlineSnapshot';

describe('leftWhen', () => {
  const now = new Date('2026-10-03T20:41:00');
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const MIN = 60_000;

  it('reads naturally after "You left"', () => {
    expect(leftWhen(ago(10_000), now)).toBe('just now');
    expect(leftWhen(ago(2 * MIN), now)).toBe('2 minutes ago');
    expect(leftWhen(ago(3 * 60 * MIN), now)).toBe('3 hours ago');
    expect(leftWhen(ago(26 * 60 * MIN), now)).toBe('yesterday at 6:41 pm');
    expect(leftWhen(ago(3 * 24 * 60 * MIN), now)).toMatch(/^on \w+day at 8:41 pm$/);
    expect(leftWhen(ago(30 * 24 * 60 * MIN), now)).toBe('on Sep 3 at 8:41 pm');
  });
});

describe('formatWelcomeHeadline', () => {
  it('puts the "when" in italics, keeping "on" outside', () => {
    expect(formatWelcomeHeadline('You left 2 minutes ago. Nothing changed since then.'))
      .toBe('You left <em>2 minutes ago</em>. Nothing changed since then.');
    expect(formatWelcomeHeadline('You left on Monday at 8:41 pm. Nothing changed since then.'))
      .toBe('You left on <em>Monday at 8:41 pm</em>. Nothing changed since then.');
  });

  it('escapes scene titles so they cannot inject HTML', () => {
    expect(formatWelcomeHeadline('You left just now. Since then, you added one scene — <img src=x>.'))
      .toContain('&lt;img src=x&gt;');
  });
});

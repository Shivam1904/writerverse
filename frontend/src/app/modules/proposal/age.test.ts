import { describe, it, expect } from 'vitest';
import { suggestedAgo, isRecent, sortNewestFirst } from './age';
import type { PendingProposal } from './useProposalStore';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const now = Date.parse('2026-10-19T12:00:00Z');

const prop = (id: number, createdAt?: number): PendingProposal => ({
  proposalId: id, capability: 'add_character', result: {}, onAccept: () => {}, onCancel: () => {},
  ...(createdAt == null ? {} : { createdAt }),
});

describe('suggestedAgo — plain human words', () => {
  it.each([
    [5 * MIN, 'just now'],
    [3 * HOUR, 'today'],
    [1 * DAY, '1 day ago'],
    [2 * DAY, '2 days ago'],
    [7 * DAY, '1 week ago'],
    [22 * DAY, '3 weeks ago'],
    [31 * DAY, '1 month ago'],
    [65 * DAY, '2 months ago'],
    [400 * DAY, '1 year ago'],
  ])('%i ms ago → %s', (age, words) => {
    expect(suggestedAgo(now - age, now)).toBe(words);
  });

  it('a clock slightly ahead still reads "just now"', () => {
    expect(suggestedAgo(now + MIN, now)).toBe('just now');
  });
});

describe('isRecent — the badge counts the last 7 days', () => {
  it('under 7 days (or no date) is recent; 7 days or more is not', () => {
    expect(isRecent(prop(1, now - 6.9 * DAY), now)).toBe(true);
    expect(isRecent(prop(2), now)).toBe(true);
    expect(isRecent(prop(3, now - 7 * DAY), now)).toBe(false);
  });
});

describe('sortNewestFirst', () => {
  it('orders newest first, undated first, without changing the input', () => {
    const old = prop(1, now - 30 * DAY), mid = prop(2, now - DAY), undated = prop(3), fresh = prop(4, now);
    const input = [old, mid, undated, fresh];
    expect(sortNewestFirst(input).map((p) => p.proposalId)).toEqual([3, 4, 2, 1]);
    expect(input.map((p) => p.proposalId)).toEqual([1, 2, 3, 4]);
  });
});

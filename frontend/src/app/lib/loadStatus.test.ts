import { describe, expect, it } from 'vitest';
import { loadStatus } from './loadStatus';

describe('loadStatus', () => {
  it('is loading while nothing has arrived yet', () => {
    expect(loadStatus({ data: undefined, isError: false })).toBe('loading');
  });

  it('is error when the first load failed', () => {
    expect(loadStatus({ data: undefined, isError: true })).toBe('error');
  });

  it('is ready once data arrived, even if it is empty', () => {
    expect(loadStatus({ data: [], isError: false })).toBe('ready');
    expect(loadStatus({ data: null, isError: false })).toBe('ready');
  });

  it('stays ready when a background refetch fails over cached data', () => {
    expect(loadStatus({ data: [{ id: 1 }], isError: true })).toBe('ready');
  });
});

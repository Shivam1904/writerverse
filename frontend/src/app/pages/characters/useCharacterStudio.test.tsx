// SA-138: the studio shows the presence chart (not the teaching card) as soon as
// any scene records a mention — an @mention counted on save is enough; the
// optional noun resolver does not have to be on.
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { qk } from '../../queries';
import { useCharacterStudio } from './useCharacterStudio';

vi.mock('../../gateway', () => ({
  callOp: () => new Promise(() => {}),
  callResource: () => new Promise(() => {}),
}));

function hasAnyMention(scenes: any[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(qk.outline('1'), { acts: [{ chapters: [{ scenes }] }] });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>
  );
  return renderHook(() => useCharacterStudio('1', '7'), { wrapper }).result.current.hasAnyMention;
}

describe('useCharacterStudio hasAnyMention', () => {
  it('is true for a scene with only @mention counts (no resolver data)', () => {
    expect(hasAnyMention([{ id: 'sc-1', mention_counts: { character: { '7': 2 } } }])).toBe(true);
  });

  it('is true for resolver hits, as before', () => {
    const analysis = { resolve_nouns: { mentions: [{ entity_type: 'character', entity_id: 7 }] } };
    expect(hasAnyMention([{ id: 'sc-1', analysis }])).toBe(true);
  });

  it('is false when no scene records a mention', () => {
    expect(hasAnyMention([{ id: 'sc-1' }, { id: 'sc-2', mention_counts: { character: { '7': 0 } } }]))
      .toBe(false);
  });
});

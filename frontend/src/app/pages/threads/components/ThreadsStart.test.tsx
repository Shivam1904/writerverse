import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { ThreadsStart } from './ThreadsStart';

vi.mock('../../characters/data', () => ({ loadCharacters: vi.fn(async () => ({ characters: [] })) }));

function renderStart(extractQueued: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ThreadsStart
          projectId="p1"
          canExtract
          beats={3}
          extracting={false}
          extractQueued={extractQueued}
          onExtract={() => {}}
          onSuggest={() => {}}
          onNewThread={() => {}}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('ThreadsStart — Extract from scenes (SA-92)', () => {
  it('says "Queued for review" (never "Extracted") while a proposal is pending', () => {
    renderStart(true);
    const btn = screen.getByRole('button', { name: /Queued for review/ });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(/Extracted/)).toBeNull();
  });

  it('offers Extract again once nothing is pending', () => {
    renderStart(false);
    const btn = screen.getByRole('button', { name: /Extract from scenes/ });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });
});

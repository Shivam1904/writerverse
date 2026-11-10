import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '../../ui';
import { ThreadBlock } from './ThreadBlock';

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <TooltipProvider>{ui}</TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('ThreadBlock', () => {
  // SA-36: a thread saved with no scope used to throw on `thread.scope.name`
  // and white-screen the whole Threads page.
  it('renders a thread with scope: null as a story thread', () => {
    const thread = { id: 't1', name: 'Revenge', scope: null, beats: [] };
    wrap(<ThreadBlock projectId="p1" thread={thread} focused={false} onFocus={() => {}} />);
    expect(screen.getByText('Revenge')).toBeTruthy();
    expect(screen.getByText(/Story/)).toBeTruthy();
  });

  // SA-41: the Edit-storyline dialog existed but nothing opened it, so a
  // thread's scope could never change after creation.
  it('offers "Change scope" in the menu and reports the thread id', () => {
    const onEdit = vi.fn();
    const thread = { id: 't3', name: 'Heist', scope: null, beats: [] };
    wrap(<ThreadBlock projectId="p1" thread={thread} focused={false} onFocus={() => {}} onEdit={onEdit} />);
    fireEvent.click(screen.getByLabelText('More actions'));
    fireEvent.click(screen.getByText('Change scope'));
    expect(onEdit).toHaveBeenCalledWith('t3');
  });

  it('hides "Change scope" when the caller cannot edit', () => {
    const thread = { id: 't4', name: 'Heist', scope: null, beats: [] };
    wrap(<ThreadBlock projectId="p1" thread={thread} focused={false} onFocus={() => {}} onRename={() => {}} />);
    fireEvent.click(screen.getByLabelText('More actions'));
    expect(screen.queryByText('Change scope')).toBeNull();
  });

  it('still names the owner of a character thread', () => {
    const thread = { id: 't2', name: 'Jane I', scope: { type: 'character', name: 'Jane' }, beats: [] };
    wrap(<ThreadBlock projectId="p1" thread={thread} focused={false} onFocus={() => {}} />);
    expect(screen.getByText(/Jane's/)).toBeTruthy();
  });
});

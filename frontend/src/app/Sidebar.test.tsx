// wrt-114: hovering Characters on a book with no characters must not open the
// sub-list popover (it opened as a big empty panel that looked broken).
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from './Sidebar';

vi.mock('./gateway', () => ({
  callOp: vi.fn().mockResolvedValue({ characters: [{ id: 1, name: 'Harry' }], threads: [] }),
  callResource: vi.fn().mockResolvedValue({}),
}));

const renderSidebar = (characters: number) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/project/1/braindumps']}>
        <Sidebar
          projectId="1"
          state={{ hasMaterial: true, hasOutline: false, hasChapter: false, counts: { characters } }}
          onOpenTheme={() => {}}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const hoverCharacters = () => fireEvent.mouseEnter(screen.getByText('Characters', { selector: '.wv2-nav-label' }).closest('div')!);

describe('Sidebar sub-list popover', () => {
  beforeEach(() => localStorage.setItem('wv2:sidebar-pinned', '1')); // rail open, no dwell

  it('stays closed when there is nothing to list', () => {
    const { container } = renderSidebar(0);
    hoverCharacters();
    expect(container.querySelector('.fixed.z-\\[60\\]')).toBeNull();
  });

  it('opens when there are characters', () => {
    const { container } = renderSidebar(1);
    hoverCharacters();
    expect(container.querySelector('.fixed.z-\\[60\\]')).not.toBeNull();
  });
});

// The cast list is the one place a character is deleted (the old PersonPage is
// gone, SA-95): delete shows "Deleted — Undo", and Undo brings the character back.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CharactersPage } from './CharactersPage';
import { TooltipProvider } from '../../ui';
import { ReceiptToasts } from '../../modules/receipt/ReceiptToasts';

const callOp = vi.fn();
const callResource = vi.fn();
vi.mock('../../gateway', () => ({
  callOp: (...a: unknown[]) => callOp(...a),
  callResource: (...a: unknown[]) => callResource(...a),
}));

const NAME = 'Tomas Reed';
const ROW = { id: 7, name: NAME, type: 'supporting', description: 'a ferryman' };

describe('cast list delete shows an Undo toast', () => {
  let deleted = false;
  beforeEach(() => {
    deleted = false;
    callResource.mockReset().mockImplementation((_pid: unknown, method: string) => {
      if (method === 'GET') return Promise.resolve({ characters: deleted ? [] : [ROW] });
      if (method === 'DELETE') { deleted = true; return Promise.resolve({}); }
      return Promise.resolve({});
    });
    callOp.mockReset().mockImplementation((_pid: unknown, op: string) => {
      if (op === 'undelete_character') { deleted = false; return Promise.resolve({ character: { id: 7, name: NAME } }); }
      if (op === 'get_braindumps') return Promise.resolve({ braindumps: [] });
      return Promise.resolve({});
    });
  });

  it('removes the character, then Undo restores it', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/project/1/characters']}>
          <TooltipProvider>
            <Routes>
              <Route path="/project/:projectId/characters" element={<CharactersPage />} />
            </Routes>
            <ReceiptToasts />
          </TooltipProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await screen.findByText(NAME);
    fireEvent.click(screen.getByLabelText('delete'));

    await waitFor(() => expect(callResource).toHaveBeenCalledWith('1', 'DELETE', 'characters/7/'));
    expect(await screen.findByText('Deleted')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(callOp).toHaveBeenCalledWith('1', 'undelete_character', { id: 7 }, 'Characters'));
    expect(await screen.findByText(NAME)).toBeTruthy();
  });
});

// SA-151: "Create" saves the author's own words as a character; it runs no AI.
// So no AI mark (sparkle / AI button) and no "✦ Drafted — see the suggestion
// above" claim afterwards: just an honest "Added … to your cast".
describe('"describe one" create is not dressed up as AI', () => {
  beforeEach(() => {
    callResource.mockReset().mockImplementation((_pid: unknown, method: string) => {
      if (method === 'GET') return Promise.resolve({ characters: [ROW] });
      if (method === 'POST') return Promise.resolve({ character: { id: 8, name: 'Mara', description: 'a retired diver' } });
      return Promise.resolve({});
    });
    callOp.mockReset().mockImplementation((_pid: unknown, op: string) =>
      Promise.resolve(op === 'get_braindumps' ? { braindumps: [] } : {}));
  });

  it('creates the character with no AI marks and says plainly it was added', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/project/1/characters']}>
          <TooltipProvider>
            <Routes>
              <Route path="/project/:projectId/characters" element={<CharactersPage />} />
            </Routes>
          </TooltipProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByText(NAME);
    expect(container.querySelector('.kit-btn-ai')).toBeNull();
    expect(screen.queryByText(/we'll generate/i)).toBeNull();

    fireEvent.change(screen.getByLabelText('describe a person'), { target: { value: 'Mara, a retired diver' } });
    fireEvent.click(container.querySelector('.pi-generate') as HTMLElement);

    const pop = document.querySelector('.gip-pop') as HTMLElement;
    expect(within(pop).getByText('Add a character')).toBeTruthy();
    expect(pop.textContent).not.toContain('✦');
    fireEvent.click(within(pop).getByRole('button', { name: 'Add to cast' }));

    await waitFor(() => expect(callResource).toHaveBeenCalledWith(
      '1', 'POST', 'characters/', { name: 'Mara', type: undefined, description: 'a retired diver' }));
    expect(await screen.findByText(/Added Mara to your cast/)).toBeTruthy();
    expect(screen.queryByText(/Drafted/)).toBeNull();
  });
});

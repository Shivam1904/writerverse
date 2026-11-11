// SA-47: the World page's Story section shows the AI's pending story-detail
// suggestions in the field they change (green + ✓ / ✗), and its Suggest button
// shows the chat's cost label before the click. No real AI runs here: every op is mocked.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorldIntro } from './WorldIntro';
import { useMetaFields } from '../useMetaFields';
import { EMPTY_WORLD, type WorldData } from '../data';
import { useChatStore } from '../../../modules/chat/useChatStore';
import { TooltipProvider } from '../../../ui';

const callOp = vi.fn();
vi.mock('../../../gateway', () => ({
  callOp: (...a: unknown[]) => callOp(...a),
  callResource: () => Promise.resolve({}),
}));

// The cost label comes from the extension's useCostLabel slot; fake one here.
vi.mock('@writerverse/extensions', () => ({ default: { useCostLabel: () => '~5 units' } }));

const cell = (actual: any, proposed?: any) =>
  proposed === undefined ? { actual_value: actual } : { actual_value: actual, proposal: 9, proposed_value: proposed };

let metaFull: Record<string, any>;
const staleError = { response: { status: 409, data: { code: 'proposal_stale', conflicts: [] } } };

function Harness({ world, onApplied, onSave }: {
  world: WorldData; onApplied: (p: any) => void; onSave: (p: any) => void;
}) {
  const meta = useMetaFields('1', onApplied);
  return <WorldIntro world={world} onSave={onSave} meta={meta} />;
}

function renderIntro(world: WorldData = { ...EMPTY_WORLD, synopsis: ['Old synopsis'] }) {
  const onApplied = vi.fn();
  const onSave = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter initialEntries={['/p/1/world']}>
          <Routes>
            <Route path="/p/:projectId/:section" element={<Harness world={world} onApplied={onApplied} onSave={onSave} />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return { onApplied, onSave };
}

const opCalls = (op: string) => callOp.mock.calls.filter((c) => c[1] === op);

beforeEach(() => {
  metaFull = {
    synopsis: cell('Old synopsis', 'A thief steals a crown and loses herself.'),
    logline: cell(''),
    genres: cell([], ['Fantasy', 'Heist']),
  };
  callOp.mockReset().mockImplementation(async (_pid: string, op: string) => {
    if (op === 'get_project_meta_full') return { meta: metaFull };
    return {};
  });
  useChatStore.setState({ seed: null, isOpen: false });
});

describe('World story section: ideas from braindumps', () => {
  it('shows the author\'s plot and theme ideas behind the lightbulb (no AI)', async () => {
    metaFull = { synopsis: cell('Old synopsis') };
    callOp.mockImplementation(async (_pid: string, op: string) => {
      if (op === 'get_project_meta_full') return { meta: metaFull };
      if (op === 'get_braindumps') {
        return { braindumps: [{ id: 1, content: 'an idea', ai_data: { phrases: [
          { text: 'grief turns into courage', tags: ['theme'] },
          { text: 'the cook wears a red hat', tags: ['appearance'] },
        ] } }] };
      }
      return {};
    });
    renderIntro();
    fireEvent.click(await screen.findByRole('button', { name: '1 ideas from your braindumps' }));
    await waitFor(() => expect(document.body.textContent).toContain('grief turns into courage'));
    expect(document.body.textContent).not.toContain('the cook wears a red hat');
  });
});

describe('World story section: AI suggestions', () => {
  it('Suggest shows the chat cost label and only opens the chat with a request ready to send', async () => {
    metaFull = { synopsis: cell('Old synopsis') };
    renderIntro();
    const btn = await screen.findByRole('button', { name: /Suggest · from ~5 units/ });
    fireEvent.click(btn);
    expect(useChatStore.getState().isOpen).toBe(true);
    expect(useChatStore.getState().seed).toMatch(/synopsis, logline, genres, themes and tone/);
    // Clicking never runs an AI op by itself: the author still has to send it.
    expect(callOp.mock.calls.every((c) => String(c[1]).startsWith('get_'))).toBe(true);
  });

  it('shows each pending suggestion in its own field, marked as AI', async () => {
    renderIntro();
    const syn = await screen.findByText('A thief steals a crown and loses herself.');
    expect(syn.className).toContain('is-proposed');
    expect(screen.getByText('Fantasy, Heist').className).toContain('is-proposed');
    expect(screen.getByText(/AI suggestions are shaded green/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^Accept AI / })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Dismiss AI synopsis' })).toBeTruthy();
    // ✓ / ✗ sit in the text flow right after their own field (not floated above
    // it, where they would land on the row before).
    const accept = screen.getByRole('button', { name: 'Accept AI synopsis' });
    expect(accept.parentElement!.className).not.toContain('kit-prop-acts');
    expect(accept.parentElement!.previousElementSibling).toBe(syn);
  });

  it('hides a "suggestion" that only repeats the current value', async () => {
    metaFull = {
      synopsis: cell('Old synopsis', 'A thief steals a crown and loses herself.'),
      perspective: cell('', ''),
      tense: cell(null, ''),
      genres: cell(['Fantasy'], [' fantasy ']),
      themes: cell([], []),
    };
    renderIntro();
    await screen.findByText('A thief steals a crown and loses herself.');
    expect(screen.getAllByRole('button', { name: /^Accept AI / })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /AI (perspective|tense|genres|themes)/ })).toBeNull();
  });

  it('accept writes that one field and shows it as the author\'s', async () => {
    const { onApplied } = renderIntro();
    await screen.findByText('A thief steals a crown and loses herself.');
    fireEvent.click(screen.getByRole('button', { name: 'Accept AI synopsis' }));
    await waitFor(() => expect(opCalls('accept_project_meta_field')).toHaveLength(1));
    expect(opCalls('accept_project_meta_field')[0][2]).toEqual({
      proposal_id: '9', field: 'synopsis', value: 'A thief steals a crown and loses herself.',
    });
    await waitFor(() => expect(onApplied).toHaveBeenCalledWith({ synopsis: 'A thief steals a crown and loses herself.' }));
  });

  it('accepting a list suggestion sends a list', async () => {
    const { onApplied } = renderIntro();
    await screen.findByText('Fantasy, Heist');
    fireEvent.click(screen.getByRole('button', { name: 'Accept AI genres' }));
    await waitFor(() => expect(onApplied).toHaveBeenCalledWith({ genres: ['Fantasy', 'Heist'] }));
    expect(opCalls('accept_project_meta_field')[0][2]).toMatchObject({ field: 'genres', value: ['Fantasy', 'Heist'] });
  });

  it('dismiss drops just that field and writes nothing', async () => {
    const { onApplied } = renderIntro();
    await screen.findByText('Fantasy, Heist');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss AI genres' }));
    await waitFor(() => expect(opCalls('reject_project_meta_field')).toHaveLength(1));
    expect(opCalls('reject_project_meta_field')[0][2]).toEqual({ proposal_id: '9', field: 'genres' });
    expect(opCalls('accept_project_meta_field')).toHaveLength(0);
    expect(onApplied).not.toHaveBeenCalled();
  });

  it('a failed accept keeps the suggestion and saves nothing', async () => {
    callOp.mockImplementation(async (_pid: string, op: string) => {
      if (op === 'get_project_meta_full') return { meta: metaFull };
      if (op === 'accept_project_meta_field') throw { response: { status: 500 } };
      return {};
    });
    const { onApplied } = renderIntro();
    await screen.findByText('A thief steals a crown and loses herself.');
    fireEvent.click(screen.getByRole('button', { name: 'Accept AI synopsis' }));
    await waitFor(() => expect(opCalls('accept_project_meta_field')).toHaveLength(1));
    expect(onApplied).not.toHaveBeenCalled();
    expect(screen.getByText('A thief steals a crown and loses herself.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('SA-209: if the author changed the field since, asks before using the AI\'s value', async () => {
    callOp.mockImplementation(async (_pid: string, op: string, args: any) => {
      if (op === 'get_project_meta_full') return { meta: metaFull };
      if (op === 'accept_project_meta_field' && !args.force) throw staleError;
      return {};
    });
    const { onApplied } = renderIntro();
    await screen.findByText('A thief steals a crown and loses herself.');
    fireEvent.click(screen.getByRole('button', { name: 'Accept AI synopsis' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/You changed the synopsis after the AI suggested it/);
    expect(onApplied).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: "Use the AI's" }));
    await waitFor(() => expect(onApplied).toHaveBeenCalledWith({ synopsis: 'A thief steals a crown and loses herself.' }));
    expect(opCalls('accept_project_meta_field')[1][2]).toMatchObject({ field: 'synopsis', force: true });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('SA-209: "Keep mine" dismisses the suggestion', async () => {
    callOp.mockImplementation(async (_pid: string, op: string) => {
      if (op === 'get_project_meta_full') return { meta: metaFull };
      if (op === 'accept_project_meta_field') throw staleError;
      return {};
    });
    renderIntro();
    await screen.findByText('A thief steals a crown and loses herself.');
    fireEvent.click(screen.getByRole('button', { name: 'Accept AI synopsis' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Keep mine' }));
    await waitFor(() => expect(opCalls('reject_project_meta_field')).toHaveLength(1));
    expect(opCalls('reject_project_meta_field')[0][2]).toEqual({ proposal_id: '9', field: 'synopsis' });
  });
});

describe('World story section: Suggest a title (wrt-104)', () => {
  it('runs the title helper only on click and fills the title', async () => {
    metaFull = { synopsis: cell('Old synopsis') };
    callOp.mockImplementation(async (_pid: string, op: string) => {
      if (op === 'get_project_meta_full') return { meta: metaFull };
      if (op === 'generate_title') return { title: 'The Ember Lake', alternatives: [] };
      return {};
    });
    const { onSave } = renderIntro();
    const btn = await screen.findByRole('button', { name: /Suggest a title/ });
    expect(opCalls('generate_title')).toHaveLength(0);
    fireEvent.click(btn);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ title: 'The Ember Lake' }));
    expect(opCalls('generate_title')[0][2]).toEqual({ from_project: true });
    expect((screen.getByPlaceholderText('Untitled Book') as HTMLInputElement).value).toBe('The Ember Lake');
  });

  it('without a synopsis, says what to do and runs nothing', async () => {
    metaFull = {};
    const { onSave } = renderIntro({ ...EMPTY_WORLD, synopsis: [] });
    fireEvent.click(await screen.findByRole('button', { name: /Suggest a title/ }));
    expect(opCalls('generate_title')).toHaveLength(0);
    expect(onSave).not.toHaveBeenCalled();
  });
});

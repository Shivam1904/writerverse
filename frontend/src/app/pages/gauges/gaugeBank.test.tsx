// SA-261: the lens bank is two reads. The static catalogue is fetched ONCE per
// session however many parts of the app read it, and a `gauges` restale (every
// bind, every World edit) refetches only the small presets list, never the catalogue.
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { callOp } = vi.hoisted(() => ({ callOp: vi.fn() }));
vi.mock('../../gateway', () => ({ callOp }));

import { queries } from '../../queries';
import { bindQueryClient, handleDispatchInvalidates } from '../../queryInvalidator';
import { useLensCatalogue } from '../../modules/lensKit/catalogue';
import { useGaugeBank, useGaugeRules } from './hooks';

const LENS = { id: 'does_hero_grow', name: 'Does the Hero Grow?', type_id: 'arc', scope_type: 'character', y_items: [] };
const CATALOGUE = {
  types: [{ id: 'arc', kind_word: 'an arc', lenses: [LENS] }],
  shared: { rules: { rising: { label: 'Rises', family: 'shape' } } },
};
const PRESET = { id: 'p1', name: 'Mine', type_id: 'arc', type: 'arc' };

const calls = (op: string) => callOp.mock.calls.filter((c) => c[1] === op).length;

beforeEach(() => {
  callOp.mockReset();
  callOp.mockImplementation(async (_pid: unknown, op: string) => {
    if (op === 'get_gauge_catalogue') return CATALOGUE;
    if (op === 'get_gauge_presets') return { presets: [PRESET] };
    return {};
  });
});

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  bindQueryClient(client);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/project/7/gauges']}>
        <Routes><Route path="/project/:projectId/:section" element={<>{children}</>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return renderHook(() => ({
    bank: useGaugeBank('7'),
    rules: useGaugeRules(),
    shelf: useLensCatalogue('7'),
    init: useQuery({ ...queries.gaugeCatalogue('7'), enabled: true }),
  }), { wrapper });
}

describe('lens bank reads (SA-261)', () => {
  it('every bank reader shares one catalogue fetch and one presets fetch', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.bank.presets).toHaveLength(1));
    await waitFor(() => expect(result.current.shelf).toHaveLength(1));

    expect(calls('get_gauge_catalogue')).toBe(1);
    expect(calls('get_gauge_presets')).toBe(1);
    expect(calls('get_gauge_bank')).toBe(0);
    expect(result.current.bank.templates[0]).toMatchObject({ id: 'does_hero_grow', source: 'bank' });
    expect(result.current.bank.presets[0]).toMatchObject({ id: 'p1', source: 'preset' });
    expect(result.current.rules.rising).toMatchObject({ label: 'Rises' });
    expect(result.current.shelf[0]).toMatchObject({ templateId: 'does_hero_grow', scopeType: 'character' });
  });

  it('a gauges restale refetches the presets, not the catalogue', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.bank.presets).toHaveLength(1));

    act(() => handleDispatchInvalidates('7', ['gauges']));
    await waitFor(() => expect(calls('get_gauge_presets')).toBe(2));
    expect(calls('get_gauge_catalogue')).toBe(1);
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// SA-270: the lens is run only by an explicit button that shows its cost label
// (read from the backend estimate), and an empty book has nothing to run.
const api = vi.hoisted(() => ({ analyseGauge: vi.fn(async () => ({})) }));
vi.mock('../../pages/gauges/api', () => api);

// The cost label comes from the extension's useCostLabel slot; fake one here.
vi.mock('@writerverse/extensions', () => ({
  default: { useCostLabel: (f: string) => (f === 'analyse_gauge' ? '~1 unit' : '') },
}));

import { ReadStoryButton } from './VerdictCard';
import { chartToVerdict } from './verdict';

function renderButton(chart: any) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ReadStoryButton projectId="7" bindingId="b-1" verdict={chartToVerdict(chart)} />
    </QueryClientProvider>,
  );
}

const unread = { type: 'arc', y_items: [], ticks: [{ id: 'sc-1', label: 'One' }], data_points: [] };

beforeEach(() => { api.analyseGauge.mockClear(); });

describe('ReadStoryButton', () => {
  it('shows the cost label on an unread lens and runs only on click', async () => {
    renderButton(unread);
    const btn = await screen.findByRole('button', { name: 'Read my story · ~1 unit' });
    expect(api.analyseGauge).not.toHaveBeenCalled();   // rendering never spends
    fireEvent.click(btn);
    await waitFor(() => expect(api.analyseGauge).toHaveBeenCalledWith('7', 'b-1'));
  });

  it('says "Read again" once the lens has been read', async () => {
    renderButton({ ...unread, analysed_at: '2026-10-03T00:00:00Z' });
    expect(await screen.findByRole('button', { name: /^Read again · / })).toBeTruthy();
  });

  it('is hidden on a truly empty book', () => {
    renderButton({ ...unread, ticks: [], has_content: false });
    expect(screen.queryByRole('button')).toBeNull();
  });

  // Coverage lenses (checklist / setup-payoff) always come with ticks=[] — that
  // is NOT an empty book. Only the backend's has_content decides.
  it('shows on a coverage lens with no ticks on a written book', async () => {
    renderButton(coverage);
    expect(await screen.findByRole('button', { name: /^Read my story/ })).toBeTruthy();
  });
});

const coverage = { type: 'checklist', data_style: 'coverage', y_items: [], ticks: [], data_points: [], has_content: true };

describe('unread lens copy', () => {
  it('says not read yet, never "reading" (nothing runs on attach)', () => {
    expect(chartToVerdict(unread).headline).toBe('Not read yet.');
  });
  it('says there is nothing to read on an empty book', () => {
    const v = chartToVerdict({ ...unread, ticks: [], has_content: false });
    expect(v.empty).toBe(true);
    expect(v.headline).toMatch(/Nothing to read yet/);
  });
  it('a coverage lens with ticks=[] on a written book is not "empty"', () => {
    const v = chartToVerdict(coverage);
    expect(v.empty).toBe(false);
    expect(v.headline).toBe('Not read yet.');
    expect(v.headline).not.toMatch(/Write a scene first/);
  });
  it('a chart without the flag is never assumed empty', () => {
    expect(chartToVerdict({ ...unread, ticks: [] }).empty).toBe(false);
  });
});

import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { qk } from '../../../queries';
import { StudioPresence } from './StudioPresence';

const resolved = (id: number, n: number) => ({
  resolve_nouns: { mentions: Array.from({ length: n }, () => ({ entity_type: 'character', entity_id: id })) },
});

/** Render the band for character 7 over one chapter holding `scenes`. */
function renderBand(scenes: any[]) {
  const qc = new QueryClient();
  qc.setQueryData(qk.outline('1'), { acts: [{ chapters: [{ scenes }] }] });
  return render(
    <QueryClientProvider client={qc}>
      <StudioPresence projectId="1" character={{ id: 7 }} />
    </QueryClientProvider>,
  );
}

describe('StudioPresence (SA-138)', () => {
  it('draws bars from the stored @mention counts, without the resolver', () => {
    const { container } = renderBand([
      { id: 'sc-1', mention_counts: { character: { '7': 2, '8': 5 } } },
      { id: 'sc-2', mention_counts: { world: { '7': 9 } } }, // a world entry with the same id
      { id: 'sc-3' },
    ]);
    expect(container.textContent).toContain('3 scenes of prose · 2 mentions');
    expect(screen.getByTitle('scene 1: 2 mentions')).toBeTruthy();
    expect(screen.getByTitle('scene 2: 0 mentions')).toBeTruthy();
    expect(screen.queryByText('no mentions yet')).toBeNull();
  });

  it('takes the larger of @mentions and the optional resolver, never the sum', () => {
    renderBand([
      { id: 'sc-1', mention_counts: { character: { '7': 2 } }, analysis: resolved(7, 4) },
      { id: 'sc-2', mention_counts: { character: { '7': 3 } }, analysis: resolved(7, 1) },
    ]);
    expect(screen.getByTitle('scene 1: 4 mentions')).toBeTruthy();
    expect(screen.getByTitle('scene 2: 3 mentions')).toBeTruthy();
  });

  it('says how to fill it when nothing is mentioned yet', () => {
    renderBand([{ id: 'sc-1' }]);
    expect(screen.getByText('no mentions yet')).toBeTruthy();
  });
});

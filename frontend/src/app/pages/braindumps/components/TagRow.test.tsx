// wrt-119: every entity the AI found gets a chip, and where its topics go shows
// without a click (they used to hide behind '+N'). wrt-141: the chip says the
// sections ("Ada → Backstory · World"), and one editor replaces the row of ×.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '../../../ui';
import { TagRow } from './TagRow';

const wrap = (ui: React.ReactElement) => render(<TooltipProvider>{ui}</TooltipProvider>);

// An idea from an app walk: "Ada is an orphan who sleeps in the attic
// of her aunt and uncle's inn."
const tags = ['backstory', 'setting', 'relationship', 'char[Ada]', 'char[aunt]', 'char[uncle]'];
const aiData = {
  status: 'ok',
  tags: ['backstory', 'setting', 'relationship'],
  entities: [
    { kind: 'char', name: 'Ada', tags: ['backstory', 'setting'] },
    { kind: 'char', name: 'aunt', tags: ['relationship'] },
    { kind: 'char', name: 'uncle', tags: ['relationship'] },
  ],
};

describe('TagRow', () => {
  it('shows every entity and where its topics go, without clicking', () => {
    wrap(<TagRow tags={tags} aiData={aiData} />);
    for (const name of ['Ada', 'aunt', 'uncle']) {
      expect(screen.getByText(name)).toBeTruthy();
    }
    expect(screen.getByText('→ Backstory · World')).toBeTruthy();
    expect(screen.getAllByText('→ Relationships')).toHaveLength(2);
    expect(screen.queryByText(/^\+\d/)).toBeNull();
  });

  it('has no × in the row; clicking a chip opens one editor', () => {
    const removed: string[] = [];
    wrap(<TagRow tags={tags} aiData={aiData} onRemove={(t) => removed.push(t)} />);
    expect(screen.queryByText('×')).toBeNull();
    fireEvent.click(screen.getByText('Ada'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove topic backstory from Ada' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Ada' }));
    expect(removed).toEqual(['backstory', 'char[Ada]']);
  });
});

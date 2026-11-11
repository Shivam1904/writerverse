import { describe, it, expect } from 'vitest';
import { normalizeWorldPending } from './pendingSections';
import type { PendingProposal } from '../../modules/proposal/useProposalStore';

let idSeq = 0;
function prop(capability: string, result: any): PendingProposal {
  return {
    proposalId: ++idSeq,
    capability,
    result,
    onAccept: () => {},
    onCancel: () => {},
  };
}

const addWb = (result: any) => prop('add_worldbuilding', result);
const initEl = (result: any) => prop('run_init_elements', result);

describe('normalizeWorldPending — section bucketing', () => {
  it('files an extracted item into Things and a rule into Rules', () => {
    const items = normalizeWorldPending([], [
      initEl({ type: 'item', name: 'Sunstone', item: { name: 'Sunstone', description: 'glows at dawn' } }),
      initEl({ type: 'rule', text: 'Magic costs memory', rule: { text: 'Magic costs memory', scope: 'all mages' } }),
    ]);
    expect(items).toHaveLength(2);
    const thing = items.find((i) => i.kind === 'things')!;
    expect(thing.sectionKey).toBe('things');
    expect(thing.title).toBe('Sunstone');
    expect(thing.line).toBe('glows at dawn');
    const rule = items.find((i) => i.kind === 'rules')!;
    expect(rule.sectionKey).toBe('rules');
    expect(rule.title).toBe('Magic costs memory');
    expect(rule.from).toBe('all mages');
  });

  it('ignores extracted character / story elements (they file elsewhere)', () => {
    const items = normalizeWorldPending([], [
      initEl({ type: 'character', name: 'Jane', character: {} }),
      initEl({ type: 'story', story: { title: 'A tale' } }),
    ]);
    expect(items).toHaveLength(0);
  });

  it('maps add_worldbuilding by its tag — structural and custom', () => {
    const items = normalizeWorldPending([
      addWb({ title: 'The Harbor', content: 'a busy port', tags: ['place'] }),
      addWb({ title: 'The Guilds', content: 'trade factions', tags: ['Factions'] }),
    ], []);
    const place = items.find((i) => i.title === 'The Harbor')!;
    expect(place.kind).toBe('places');
    expect(place.sectionKey).toBe('places');
    const custom = items.find((i) => i.title === 'The Guilds')!;
    expect(custom.kind).toBe('bullets');
    expect(custom.sectionKey).toBe('factions'); // block_key lowercases
    expect(custom.sectionTitle).toBe('Factions');
  });

  it('falls back to a Notes bucket when an add has no tag', () => {
    const items = normalizeWorldPending([
      addWb({ title: 'Loose note', content: '', tags: [] }),
    ], []);
    expect(items[0].sectionKey).toBe('notes');
    expect(items[0].kind).toBe('bullets');
  });

  it('drops empty / unnamed entries', () => {
    const items = normalizeWorldPending(
      [addWb({ title: '', content: 'x', tags: ['place'] })],
      [initEl({ type: 'item', name: '', item: {} })],
    );
    expect(items).toHaveLength(0);
  });
});

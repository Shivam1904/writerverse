import { describe, it, expect } from 'vitest';
import { buildRailItems, groupKindOf, groupSentence, isLensSuggestion, isInventedLensCap } from './grouping';
import type { PendingProposal } from './useProposalStore';

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

const char = (name?: string) => prop('add_character', name ? { name } : {});
const initChar = (name?: string) =>
  prop('run_init_elements', { type: 'character', ...(name ? { name } : {}) });
const charEdit = (
  capability: 'enrich_promoted_character' | 'propose_character_edit',
  name?: string,
  character_id?: number,
) => prop(capability, { name: name ?? 'Mara', ...(character_id != null ? { character_id } : {}) });

describe('buildRailItems — grouping', () => {
  it('keeps fewer than 3 same-kind proposals as singles', () => {
    const items = buildRailItems([char('Jane'), char('Tina')]);
    expect(items.map((i) => i.type)).toEqual(['single', 'single']);
  });

  it('collapses 3+ same-kind proposals into one group', () => {
    const items = buildRailItems([char('Jane'), char('Tina'), char('Rex')]);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('group');
    if (items[0].type === 'group') expect(items[0].items).toHaveLength(3);
  });

  it('emits the group at the first member position, then later singles', () => {
    // 3 characters (group) interleaved with 1 outline item (single)
    const items = buildRailItems([
      char('Jane'),
      prop('add_outline_item', { title: 'Act I' }),
      char('Tina'),
      char('Rex'),
    ]);
    expect(items.map((i) => i.type)).toEqual(['group', 'single']);
  });

  it('groups by kind, not raw capability — add_character + run_init_elements(character) share a kind', () => {
    const items = buildRailItems([char('Jane'), initChar('Tina'), initChar('Rex')]);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('group');
  });

  it('groups a mixed pair of character-edit proposals at threshold 2', () => {
    const items = buildRailItems([
      charEdit('enrich_promoted_character', 'Mara', 1),
      charEdit('propose_character_edit', 'Joren', 2),
    ]);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.type)).toEqual(['single', 'single']);
  });

  it('groups character-edit proposals by target character, not one global pool', () => {
    const items = buildRailItems([
      prop('propose_character_edit', { name: 'pepper', character_id: 168 }),
      prop('propose_character_edit', { name: 'Tony Stark', character_id: 164 }),
      prop('propose_character_edit', { name: 'pepper', character_id: 168 }),
      prop('enrich_promoted_character', { name: 'pepper', character_id: 168 }),
      prop('propose_character_edit', { name: 'Tony Stark', character_id: 164 }),
      prop('propose_character_edit', { name: 'Tony Stark', character_id: 164 }),
      prop('enrich_promoted_character', { name: 'Tony Stark', character_id: 164 }),
      prop('propose_character_edit', { name: 'pepper', character_id: 168 }),
    ]);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.type === 'group')).toBe(true);
    if (items[0].type === 'group') {
      expect(items[0].kind.key).toBe('character-edits');
      expect(items[0].items).toHaveLength(4);
    }
    if (items[1].type === 'group') {
      expect(items[1].kind.key).toBe('character-edits');
      expect(items[1].items).toHaveLength(4);
    }
  });

  it('keeps character births on their original 3-card threshold', () => {
    const items = buildRailItems([char('Jane'), char('Tina')]);
    expect(items.map((i) => i.type)).toEqual(['single', 'single']);
  });

  it('never groups ungroupable capabilities, even 3+', () => {
    const items = buildRailItems([
      prop('generate_title', {}),
      prop('generate_title', {}),
      prop('generate_title', {}),
    ]);
    expect(items.every((i) => i.type === 'single')).toBe(true);
  });

  it('run_init_elements story counts as the thread kind', () => {
    expect(groupKindOf('run_init_elements', { type: 'story' })?.key).toBe('thread');
    expect(groupKindOf('run_init_elements', { type: 'character' })?.key).toBe('character-birth');
  });
});

describe('lens suggestions — grouping by subject type, at threshold 2', () => {
  const lens = (subject_type: string, template_id: string, subject_name?: string) =>
    prop('suggest_gauges', {
      template_id,
      subject_type,
      fit_score: 0.8,
      reason: 'fits',
      ...(subject_name ? { subject_name } : {}),
    });

  it('needs a template id — a nested payload is NOT a single lens', () => {
    expect(isLensSuggestion('suggest_gauges', { suggestions: { story: [] } })).toBe(false);
    expect(isLensSuggestion('suggest_gauges', { template_id: 'three_act' })).toBe(true);
  });

  it('buckets by subject type, not template', () => {
    expect(groupKindOf('suggest_gauges', { template_id: 'three_act', subject_type: 'story' })?.key).toBe('lens-story');
    expect(groupKindOf('suggest_gauges', { template_id: 'power_corrupts', subject_type: 'character' })?.key).toBe('lens-people');
    expect(groupKindOf('suggest_gauges', { template_id: 'item_custody', subject_type: 'item' })?.key).toBe('lens-world');
  });

  it('groups a PAIR of same-type lenses (threshold 2, not 3)', () => {
    const items = buildRailItems([
      lens('character', 'power_corrupts', 'Wren Halloway'),
      lens('character', 'emotional_journey', 'Ilse Marrow'),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('group');
    if (items[0].type === 'group') expect(items[0].kind.key).toBe('lens-people');
  });

  it('keeps a lone lens as a single card', () => {
    const items = buildRailItems([lens('item', 'item_custody', 'Living Ink')]);
    expect(items.map((i) => i.type)).toEqual(['single']);
  });

  it('splits the rail into one group per subject type', () => {
    const items = buildRailItems([
      lens('story', 'three_act'),
      lens('story', 'hero_journey'),
      lens('character', 'power_corrupts', 'Wren Halloway'),
      lens('character', 'tragic_fall', 'Wren Halloway'),
      lens('item', 'item_custody', 'Living Ink'), // lone item → stays single
    ]);
    expect(items.map((i) => (i.type === 'group' ? i.kind.key : 'single'))).toEqual([
      'lens-story',
      'lens-people',
      'single',
    ]);
  });
});

describe('invented gauges (suggest_custom_gauges) — no template id', () => {
  // The bespoke gauge preview: a display type + name + scope, but NO lens/template id.
  const invented = (scope_type: string, name: string, scope_name?: string) =>
    prop('suggest_custom_gauges', {
      name,
      display: 'ladder_line',
      scope_type,
      scope_name: scope_name ?? (scope_type === 'story' ? 'the whole story' : ''),
      watches: 'how it moves across the story',
      reason: 'grounded in: the opening scene',
    });

  it('flags the invented cap, not the template fits', () => {
    expect(isInventedLensCap('suggest_custom_gauges')).toBe(true);
    expect(isInventedLensCap('suggest_gauges')).toBe(false);
  });

  it('is recognised as a lens suggestion despite having no template/lens id', () => {
    expect(isLensSuggestion('suggest_custom_gauges', { name: 'Loyalty', display: 'state_lanes' })).toBe(true);
    // …but only when the spec fields are present.
    expect(isLensSuggestion('suggest_custom_gauges', { name: 'Loyalty' })).toBe(false);
  });

  it('buckets into its OWN invented scope-type group, mapping object → world', () => {
    expect(groupKindOf('suggest_custom_gauges', { name: 'A', display: 'ladder_line', scope_type: 'story' })?.key).toBe('lens-invented-story');
    expect(groupKindOf('suggest_custom_gauges', { name: 'B', display: 'state_lanes', scope_type: 'character' })?.key).toBe('lens-invented-people');
    expect(groupKindOf('suggest_custom_gauges', { name: 'C', display: 'payoff_arcs', scope_type: 'object' })?.key).toBe('lens-invented-world');
  });

  it('groups a pair of same-scope-type invented gauges (threshold 2)', () => {
    const items = buildRailItems([
      invented('character', 'Loyalty under pressure', 'Mara'),
      invented('character', 'Grief, slow then fast', 'Joren'),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('group');
    if (items[0].type === 'group') expect(items[0].kind.key).toBe('lens-invented-people');
  });

  it('keeps invented gauges in a SEPARATE group from template fits of the same scope', () => {
    const fit = prop('suggest_gauges', { lens_id: 'three_act', scope_type: 'story', fit_score: 0.9, reason: 'fits' });
    const fit2 = prop('suggest_gauges', { lens_id: 'hero_journey', scope_type: 'story', fit_score: 0.8, reason: 'fits' });
    const items = buildRailItems([fit, fit2, invented('story', 'Hope vs dread'), invented('story', 'Dread vs hope')]);
    const groupKeys = items.filter((i) => i.type === 'group').map((i) => (i.type === 'group' ? i.kind.key : ''));
    expect(groupKeys).toEqual(['lens-story', 'lens-invented-story']);
  });
});

describe('groupSentence', () => {
  const charBirth = groupKindOf('add_character', {})!;
  const charEditKind = groupKindOf('propose_character_edit', { character_id: 1 })!;

  it('matches the canonical example: two names + one more', () => {
    expect(groupSentence(charBirth, ['Jane', 'Tina'], 3)).toBe(
      'Jane and Tina and one more character are ready to be born.',
    );
  });

  it('pluralises the overflow noun when more than one remains', () => {
    expect(groupSentence(charBirth, ['Jane', 'Tina'], 5)).toBe(
      'Jane and Tina and 3 more characters are ready to be born.',
    );
  });

  it('falls back to a bare count when no names are known', () => {
    expect(groupSentence(charBirth, [], 4)).toBe('4 characters are ready to be born.');
  });

  it('uses a singular-subject sentence for repeated edits to one character', () => {
    expect(groupSentence(charEditKind, ['Tony Stark', 'Tony Stark', 'Tony Stark'], 3)).toBe(
      'Tony Stark has 3 character updates ready to review.',
    );
  });
});

import { describe, it, expect } from 'vitest';
import { resolveLanding, findContext, NAV_GROUPS, type ShellState } from './nav';

// Mirror the shell's derivation (ProjectShell.tsx) so a bare counts object
// produces the same ShellState the rail actually sees.
function state(counts: Record<string, number> = {}): ShellState {
  const n = (k: string) => counts[k] ?? 0;
  return {
    hasMaterial: n('braindumps') > 0 || n('threads') > 0 || n('outline') > 0 || n('chapters') > 0,
    hasOutline: n('outline') > 0 || n('chapters') > 0,
    hasChapter: n('chapters') > 0,
    counts,
  };
}

// The sections listed under one rail group.
const sectionsInGroup = (label: string) =>
  NAV_GROUPS.filter((g) => g.label === label).flatMap((g) => g.items.map((i) => i.id));

describe('resolveLanding — the counts ladder', () => {
  it('lands on braindumps for an empty project', () => {
    expect(resolveLanding(state({}))).toBe('braindumps');
  });

  it('stays on braindumps with only braindumps', () => {
    expect(resolveLanding(state({ braindumps: 5 }))).toBe('braindumps');
  });

  it('climbs to plot-threads once threads exist', () => {
    expect(resolveLanding(state({ braindumps: 5, threads: 2 }))).toBe('plot-threads');
  });

  it('climbs to grand-outline once an outline exists', () => {
    expect(resolveLanding(state({ threads: 2, outline: 3 }))).toBe('outline');
  });

  it('lands on manuscript once chapters exist', () => {
    expect(resolveLanding(state({ chapters: 1 }))).toBe('chapters');
  });

  it('once writing begins, manuscript is home regardless of planning counts', () => {
    expect(resolveLanding(state({ braindumps: 9, threads: 9, outline: 9, chapters: 1 }))).toBe(
      'chapters',
    );
  });

  it('outline outranks threads', () => {
    expect(resolveLanding(state({ threads: 4, outline: 1 }))).toBe('outline');
  });
});

describe('rail sections per group', () => {
  it('Imagine lists Ideas / Characters / World', () => {
    expect(sectionsInGroup('Imagine')).toEqual(['braindumps', 'characters', 'world']);
  });

  it('Plan lists Threads / Outline / Lenses', () => {
    expect(sectionsInGroup('Plan')).toEqual(['plot-threads', 'outline', 'walks']);
  });

  it('Write lists Manuscript / Preview', () => {
    expect(sectionsInGroup('Write')).toEqual(['chapters', 'preview']);
  });
});

describe('invariant — every nav section resolves to a group', () => {
  const allSections = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id));
  it.each(allSections)('section %s has a context', (id) => {
    expect(findContext(id)).toBeDefined();
  });
});

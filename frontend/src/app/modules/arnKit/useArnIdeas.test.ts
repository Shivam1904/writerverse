import { describe, expect, it } from 'vitest';
import { resolveArnIdeas } from './useArnIdeas';

// "Milo falls for Rosa…" — v3 ideas tag each person on their own.
const miloFallsForRosa = {
  id: 1,
  aiData: {
    phrases: [{
      text: 'Milo falls for Rosa',
      tags: ['relationship', 'emotion'],
      entities: [
        { kind: 'char', name: 'Milo', tags: ['relationship', 'emotion'] },
        { kind: 'char', name: 'Rosa', tags: ['relationship'] },
      ],
    }],
  },
};

describe('resolveArnIdeas — per-person tags', () => {
  it("shows a phrase on the character whose own tags match", () => {
    const out = resolveArnIdeas([miloFallsForRosa], ['emotion'], [], { name: 'Milo' }, false);
    expect(out.map((p) => p.text)).toEqual(['Milo falls for Rosa']);
  });

  it("doesn't show it on another character in the same phrase", () => {
    const out = resolveArnIdeas([miloFallsForRosa], ['emotion'], [], { name: 'Rosa' }, false);
    expect(out).toEqual([]);
  });

  it('falls back to the phrase tags for older ideas', () => {
    const old = {
      id: 2,
      aiData: { phrases: [{ text: 'Rosa waits tables', tags: ['backstory'], entities: [{ kind: 'char', name: 'Rosa' }] }] },
    };
    const out = resolveArnIdeas([old], ['backstory'], [], { name: 'Rosa' }, false);
    expect(out.map((p) => p.text)).toEqual(['Rosa waits tables']);
  });
});

import { describe, expect, it } from 'vitest';
import { pickCurrentSceneId } from './currentScene';

// One definition of "the current scene" on the Write page, shared by the
// margin highlight and Night Eyes.
describe('pickCurrentSceneId', () => {
  it('the scene last scrolled to or clicked wins over a stale ?sc', () => {
    expect(pickCurrentSceneId('sc_5', 'sc_1')).toBe('sc_5');
  });

  it('falls back to ?sc when nothing was scrolled to yet', () => {
    expect(pickCurrentSceneId(null, 'sc_1')).toBe('sc_1');
  });

  it('is null when there is neither', () => {
    expect(pickCurrentSceneId(null, null)).toBeNull();
  });
});

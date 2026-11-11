// wrt-123: each tag category has its own dot colour, so the colour alone says
// which category a tag is in (Character/Dialogue and Plot/Theme used to share).
import { describe, expect, it } from 'vitest';
import { braindumpTagCategories } from './tagCategories';

describe('tag category colours', () => {
  it('gives every category a different colour', () => {
    const colors = Object.values(braindumpTagCategories).map((c) => c.color);
    expect(new Set(colors).size).toBe(colors.length);
  });
});

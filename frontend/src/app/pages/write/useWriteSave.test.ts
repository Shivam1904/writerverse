import { describe, expect, it } from 'vitest';
import { buildSaveArgs } from './useWriteSave';

describe('buildSaveArgs', () => {
  it('omits content when no prose is loaded for the scene', () => {
    const args = buildSaveArgs('sc-1', {}, 'New title');
    expect(args).not.toHaveProperty('content');
    expect(args).not.toHaveProperty('allow_empty');
    expect(args).toMatchObject({ scene_id: 'sc-1', text: 'New title' });
  });

  it('sends the loaded content', () => {
    const doc = { type: 'doc', content: [] };
    expect(buildSaveArgs('sc-1', { 'sc-1': doc }, undefined)).toMatchObject({
      content: doc,
      allow_empty: true,
    });
  });
});

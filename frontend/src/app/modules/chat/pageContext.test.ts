import { describe, expect, it } from 'vitest';
import { buildPageContext } from './pageContext';

// Night Eyes on the Write page must be told which scene is open, or it answers
// "who is in this scene?" with "I can't tell" (the server only loads the open
// scene's prose when the turn carries `scene_id`).

describe('buildPageContext', () => {
  it('Write page sends the open chapter and scene ids', () => {
    expect(buildPageContext({ page: 'chapters', chap: 'ch_1', sceneId: 'sc_9' }))
      .toEqual({ chapter_id: 'ch_1', scene_id: 'sc_9' });
  });

  it('Write page with no scene focused sends just the chapter', () => {
    expect(buildPageContext({ page: 'chapters', chap: 'ch_1', sceneId: null }))
      .toEqual({ chapter_id: 'ch_1' });
  });

  it('character studio sends the character', () => {
    expect(buildPageContext({ page: 'character-studio', character: { id: 7, name: 'Mira' } }))
      .toEqual({ character_id: 7, character_name: 'Mira' });
  });

  it('other pages send nothing, even with write params in the URL', () => {
    expect(buildPageContext({ page: 'outline', chap: 'ch_1', sceneId: 'sc_9' })).toEqual({});
  });
});

// The page part of Night Eyes' hidden turn context: WHICH thing the author has
// open, so "this scene" / "this character" resolve without them naming it.
// The backend frame for the page reads these keys (chat_frames.yml
// `context_params`), and on the Write page the server loads the open scene's
// saved prose from `scene_id` (night_eyes/context_blocks.py). Only ids go over
// the wire; the server reads the one scene itself.

export type PageContextInput = {
  page: string;
  /** Write page: the open chapter (`?chap=<id>`). */
  chap?: string | null;
  /** Write page: the current scene, from `useCurrentSceneId`
   * (pages/write/currentScene.ts), the same one the margin highlights. */
  sceneId?: string | null;
  /** Character studio: the character the author is looking at, if found. */
  character?: { id: unknown; name: string } | null;
};

export function buildPageContext({ page, chap, sceneId, character }: PageContextInput): Record<string, any> {
  if (page === 'character-studio') {
    return character ? { character_id: character.id, character_name: character.name } : {};
  }
  if (page === 'chapters') {
    const ctx: Record<string, any> = {};
    if (chap) ctx.chapter_id = chap;
    if (sceneId) ctx.scene_id = sceneId;
    return ctx;
  }
  return {};
}

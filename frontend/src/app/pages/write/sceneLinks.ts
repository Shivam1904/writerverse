import { callOp } from '../../gateway';
import { useWriteStore } from './writeStore';
import type { EntityLink } from './data';

// Ideas / world entries the author attaches to a scene (the "attached" notes in
// the Write margin). They live on the scene in the grand outline as
// `entity_links`, so get_grand_outline brings them back on reload.
export type SceneLinkKind = 'braindump' | 'worldbuilding';

// The screen only changes once the server saved the link. A failure throws, and
// callOp already shows the author a red toast for it. setSceneLinks never marks
// the scene's prose dirty, so a link change can't trigger a prose save.
async function run(
  op: 'link_scene_entity' | 'unlink_scene_entity',
  projectId: string,
  sceneId: string | number,
  kind: SceneLinkKind,
  id: number,
): Promise<void> {
  const res = await callOp(projectId, op, {
    scene_id: String(sceneId),
    link_type: kind,
    link_id: id,
  });
  if (!Array.isArray(res?.entity_links)) return;
  useWriteStore.getState().setSceneLinks(sceneId, res.entity_links as EntityLink[]);
}

export const linkSceneEntity = (
  projectId: string, sceneId: string | number, kind: SceneLinkKind, id: number,
) => run('link_scene_entity', projectId, sceneId, kind, id);

export const unlinkSceneEntity = (
  projectId: string, sceneId: string | number, kind: SceneLinkKind, id: number,
) => run('unlink_scene_entity', projectId, sceneId, kind, id);

import { loadWriteData, type WriteLoadResult } from './data';
import { addOutlineItem, updateOutlineItem } from '../outline/data';
import { useWriteStore } from './writeStore';
import { receipt } from '../../modules/receipt/receiptStore';

const UNDONE_MSG = "Couldn't save that change — undone";

/**
 * A Write-page outline write (new scene, chapter/scene title) failed after the
 * screen already showed it. Tell the author, then re-pull the server's outline
 * so the change that never saved drops off the screen. Scenes with unsaved
 * prose keep their text (mergeServerOutline leaves dirty scenes alone).
 */
export function undoFromServer(
  projectId: string,
  onLoaded?: (result: WriteLoadResult) => void,
) {
  receipt(UNDONE_MSG);
  return loadWriteData(projectId)
    .then((result) => {
      useWriteStore.getState().mergeServerOutline(result.data);
      onLoaded?.(result);
    })
    .catch(() => {}); // a read: the next outline invalidation retries
}

// The Write pages' outline writes. Each one is already on screen when it's
// sent; on failure it is undone via undoFromServer.
export function addSceneOrUndo(
  projectId: string, chapterId: string, sceneId: string,
  onLoaded?: (result: WriteLoadResult) => void,
) {
  return addOutlineItem(projectId, 'scene', chapterId, undefined, sceneId)
    .catch(() => undoFromServer(projectId, onLoaded));
}

export function renameOrUndo(
  projectId: string, level: 'chapter' | 'scene', id: string, text: string,
  onLoaded?: (result: WriteLoadResult) => void,
) {
  return updateOutlineItem(projectId, level, id, { text })
    .catch(() => undoFromServer(projectId, onLoaded));
}

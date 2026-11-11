import type { TipTapDoc } from './data';

// When the session dies (refresh token rejected) the app hard-redirects to
// /login, which wipes the in-memory editor. Dirty scene prose is parked here
// first and put back by `initContent` once the author is logged in again.
const KEY = 'wv:unsaved-prose';

type Stash = Record<number, TipTapDoc>;

// Set once prose is safely parked and the page is about to be sent to /login.
// The "Leave site?" guard (useWriteSave) skips itself then: nothing is lost.
let parkedForRedirect = false;
export const isProseParkedForRedirect = () => parkedForRedirect;
export const resetProseParkedForRedirect = () => {
  parkedForRedirect = false;
};

export function stashUnsavedProse(
  contentById: Record<number, TipTapDoc>,
  dirtySceneIds: Iterable<number>,
): void {
  const stash: Stash = {};
  for (const id of dirtySceneIds) {
    if (contentById[id]) stash[id] = contentById[id];
  }
  if (!Object.keys(stash).length) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(stash));
    parkedForRedirect = true;
  } catch {
    // storage full or blocked — nothing more we can do
  }
}

// Scene ids are typed as numbers but are strings at runtime ("sc_41e5c549"), so
// keys are used exactly as stored, never converted. Only the scenes found in
// this project (`sceneIds`) are taken; the rest stay stashed for when their project opens.
export function restoreStashedProse(
  contentById: Record<number, TipTapDoc>,
  sceneIds: Iterable<string>,
): {
  merged: Record<number, TipTapDoc>;
  restored: Set<number>;
} {
  const merged: Record<string, TipTapDoc> = { ...contentById };
  const restored = new Set<number>();
  let stash: Record<string, TipTapDoc>;
  try {
    stash = JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return { merged, restored };
  }
  const inProject = new Set(sceneIds);
  const left: Record<string, TipTapDoc> = {};
  for (const [id, doc] of Object.entries(stash)) {
    if (inProject.has(id)) {
      merged[id] = doc;
      restored.add(id as unknown as number);
    } else {
      left[id] = doc;
    }
  }
  try {
    if (Object.keys(left).length) localStorage.setItem(KEY, JSON.stringify(left));
    else localStorage.removeItem(KEY);
  } catch {
    // storage blocked — the restored scenes are already back in the editor
  }
  return { merged, restored };
}

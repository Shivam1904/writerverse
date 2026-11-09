// Write-page (chapter/scene editor) UI copy.
// Edit strings here — don't inline them in SceneBlock.tsx or the write store.
// Add new keys as you go; don't backfill old inline strings unless you're
// already editing that file.

// Per-scene Night Eyes shortcuts. Each button drops a starter prompt into the
// Night Eyes composer (prefill only — the author can edit before sending) and
// pops the panel open. Seeds reference the scene by its live chapter/scene
// numbers.
export const SCENE_NIGHT_EYES = {
  discuss: {
    label: 'Discuss',
    seed: (chapter: number, scene: number) =>
      `I'm looking at Chapter ${chapter}, Scene ${scene}. Let's discuss.`,
  },
  buildOn: {
    label: 'Build on this',
    seed: (chapter: number, scene: number) =>
      `I'm looking at Chapter ${chapter}, Scene ${scene} — let's build on it.`,
  },
} as const;

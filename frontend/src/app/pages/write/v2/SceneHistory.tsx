import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { callOp } from '../../../gateway';
import { Button, Dialog, Spinner } from '../../../ui';
import type { TipTapDoc } from '../data';
import { useWriteStore } from '../writeStore';

interface Revision {
  id: number;
  created_at: string;
  words: number;
}

interface Props {
  projectId?: string;
  sceneId: any;
  title: string;
  onSaveScene: (sceneId: any) => unknown;
}

const revisionsKey = (projectId: string | undefined, sceneId: any) =>
  ['scene-revisions', projectId, String(sceneId)] as const;

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// One string per top-level block (paragraph, heading…), for a read-only preview.
function docParagraphs(doc: TipTapDoc | null | undefined): string[] {
  const textOf = (n: any): string =>
    n?.type === 'text' ? (n.text ?? '') : (n?.content ?? []).map(textOf).join('');
  return ((doc as any)?.content ?? []).map(textOf).filter((t: string) => t.trim());
}

/**
 * History for one scene: earlier versions of its prose (time, word count), a
 * preview of the picked one, and Restore with a confirm. Before restoring, any
 * unsaved typing is saved first, so the text being replaced is in history too
 * and the restore can be undone from this same list.
 */
export function SceneHistory({ projectId, sceneId, title, onSaveScene }: Props) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery({
    queryKey: revisionsKey(projectId, sceneId),
    queryFn: () => callOp(projectId, 'list_scene_revisions', { scene_id: String(sceneId) }),
    enabled: open && !!projectId,
    staleTime: 0,
  });
  const revisions: Revision[] = (list.data as any)?.revisions ?? [];

  const preview = useQuery({
    queryKey: [...revisionsKey(projectId, sceneId), pickedId],
    queryFn: () =>
      callOp(projectId, 'get_scene_revision', {
        scene_id: String(sceneId),
        revision_id: pickedId,
      }),
    enabled: open && !!projectId && pickedId != null,
  });
  const previewParas = docParagraphs((preview.data as any)?.content);

  const close = (next: boolean) => {
    if (restoring) return;
    setOpen(next);
    if (!next) {
      setPickedId(null);
      setConfirming(false);
      setError(null);
    }
  };

  const pick = (id: number) => {
    setPickedId(id);
    setConfirming(false);
    setError(null);
  };

  const restore = async () => {
    if (pickedId == null || !projectId) return;
    setRestoring(true);
    setError(null);
    try {
      // Save unsaved typing first, so the restore keeps it as a version.
      if (useWriteStore.getState().dirtySceneIds.has(sceneId)) await onSaveScene(sceneId);
      if (useWriteStore.getState().dirtySceneIds.has(sceneId)) {
        setError('Your latest typing is still saving. Try again in a moment.');
        return;
      }
      const out: any = await callOp(projectId, 'restore_scene_revision', {
        scene_id: String(sceneId),
        revision_id: pickedId,
      });
      useWriteStore.getState().applyRestoredContent(sceneId, out.content, out.scene?.words);
      queryClient.invalidateQueries({ queryKey: revisionsKey(projectId, sceneId) });
      setOpen(false);
      setPickedId(null);
      setConfirming(false);
    } catch {
      setError('Could not restore this version. Your current text is unchanged.');
    } finally {
      setRestoring(false);
    }
  };

  const picked = revisions.find((r) => r.id === pickedId);

  return (
    <>
      <Button
        variant="ghost"
        size="xs"
        onClick={() => setOpen(true)}
        tooltip="Earlier versions of this scene's text"
      >
        <History size={11} strokeWidth={2} />
        History
      </Button>

      <Dialog open={open} onOpenChange={close} title={`History · ${title || 'untitled'}`} width={680}>
        {list.isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : list.isError ? (
          <p className="text-sm text-muted-foreground">Could not load this scene's history.</p>
        ) : revisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No earlier versions yet. They appear here as you rewrite this scene.
          </p>
        ) : (
          <div className="flex gap-4">
            <ul className="flex w-48 shrink-0 flex-col gap-1" aria-label="Versions">
              {revisions.map((r) => (
                <li key={r.id}>
                  <Button
                    variant={r.id === pickedId ? 'secondary' : 'ghost'}
                    size="sm"
                    className="w-full justify-between"
                    onClick={() => pick(r.id)}
                    aria-pressed={r.id === pickedId}
                  >
                    <span>{formatWhen(r.created_at)}</span>
                    <span className="text-muted-foreground">{r.words.toLocaleString()} w</span>
                  </Button>
                </li>
              ))}
            </ul>

            <div className="flex min-w-0 flex-1 flex-col gap-3">
              {picked == null ? (
                <p className="text-sm text-muted-foreground">Pick a version to preview it.</p>
              ) : preview.isLoading ? (
                <div className="flex justify-center py-6">
                  <Spinner />
                </div>
              ) : preview.isError ? (
                <p className="text-sm text-muted-foreground">Could not load this version.</p>
              ) : (
                <>
                  <div
                    className="max-h-[50vh] overflow-y-auto rounded-[var(--r-md)] border border-border p-3 text-sm"
                    aria-label="Version preview"
                  >
                    {previewParas.length ? (
                      previewParas.map((t, i) => (
                        <p key={i} className="mb-2 last:mb-0">
                          {t}
                        </p>
                      ))
                    ) : (
                      <p className="text-muted-foreground">(This version was empty.)</p>
                    )}
                  </div>

                  {confirming ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-sm">
                        Replace the scene's current text with this version? Your current text
                        stays in History, so you can undo this.
                      </p>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirming(false)}
                          disabled={restoring}
                        >
                          Cancel
                        </Button>
                        <Button variant="primary" size="sm" onClick={restore} disabled={restoring}>
                          {restoring ? 'Restoring…' : 'Yes, restore'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-end">
                      <Button variant="primary" size="sm" onClick={() => setConfirming(true)}>
                        Restore this version
                      </Button>
                    </div>
                  )}
                </>
              )}
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}

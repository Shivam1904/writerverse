import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ThreadBlock } from './ThreadBlock';
import { MarginBlock } from '../margin';
import './thread-list.css';

/* ThreadsList — a reusable thread view. Fed a thread list (this character now;
 * the whole cast on the Threads page, or any filter, later). Presentational +
 * view-state: the parent owns the data/query; this owns which thread is focused.
 *
 * focusedId is controlled when the prop is passed, else internal. Merging a
 * thread into the grand outline happens on the dedicated merge page (each
 * block's weave button, shown with `showMerge`). */
export type ThreadListMode = 'list' | 'merge';

export function ThreadsList({
  projectId,
  threads = [],
  loading = false,
  showMerge = false,
  focusedId: focusedIdProp,
  onFocusChange,
  onRenameThread,
  onEditThread,
  onDeleteThread,
  onColorThread,
  expandedIds,
  onToggleThread,
  renderGutter,
  markerSection,
}: {
  projectId?: string;
  threads?: any[];
  loading?: boolean;
  /** Show each block's weave button, which opens the dedicated merge page. */
  showMerge?: boolean;
  focusedId?: string | null;
  onFocusChange?: (id: string | null) => void;
  onRenameThread?: (id: string, name: string) => void;
  /** Open the Edit-storyline dialog (name + scope) from a block's menu. */
  onEditThread?: (id: string) => void;
  onDeleteThread?: (id: string) => void;
  onColorThread?: (id: string, color: string) => void;
  expandedIds?: string[];
  onToggleThread?: (id: string) => void;
  renderGutter?: (thread: any, index: number) => ReactNode;
  markerSection?: string;
}) {
  const navigate = useNavigate();
  // The weave button opens the dedicated merge workspace (its own page now).
  const goMerge = () => { if (projectId) navigate(`/project/${projectId}/merge`); };

  // NOTE: the beat-proposal → plotThreads refetch lives in `useBeatProposalRefetch`,
  // called at the PAGE level (ThreadsPage / CharacterStudioPage). It can't live here:
  // the studio's Outline StudioSection unmounts <ThreadsList> when collapsed, so a
  // beat proposed while it's closed would never refetch the overlay.

  // One thread opens at a time, accordion-style: the first is open by default
  // (focusInner === undefined), but a header click can collapse it (→ null) so
  // the list can read as all-closed headers. `undefined` = "not chosen yet".
  const [focusInner, setFocusInner] = useState<string | null | undefined>(undefined);
  const autoFocus = threads[0]?.id ?? null;
  const focusedId = focusedIdProp ?? (focusInner === undefined ? autoFocus : focusInner);
  // Header click: open the clicked thread, or collapse it if it's already open.
  const toggleFocus = (id: string) => {
    const next = focusedId === id ? null : id;
    if (onFocusChange) onFocusChange(next); else setFocusInner(next);
  };

  // Multi-open mode (opt-in via expandedIds): each thread expands independently
  // (the Threads page). Without it, the single-open accordion above stays in
  // effect (the character studio's mode).
  const multi = expandedIds !== undefined;
  const isOpen = (id: string) => (multi ? expandedIds!.includes(id) : id === focusedId);
  const handleBlockClick = (id: string) => (multi ? onToggleThread?.(id) : toggleFocus(id));

  const listBlocks = threads.map((t, i) => {
    const block = (
      <ThreadBlock
        key={t.id}
        projectId={projectId}
        thread={t}
        focused={isOpen(t.id)}
        onFocus={() => handleBlockClick(t.id)}
        onRename={onRenameThread}
        onEdit={onEditThread}
        onDelete={onDeleteThread}
        onColor={onColorThread}
        markerSection={markerSection}
        externalExpand={multi}
        onWeave={showMerge ? goMerge : undefined}
      />
    );
    if (!renderGutter) return (<>
      {block}
    </>);
    // Gutter mode (Threads page): each block carries a sticky margin heading in
    // its own gutter (MarginBlock), and the page's <MarginOverlay> tracks it.
    return (
      <MarginBlock id={t.id} gutter={renderGutter(t, i)} key={t.id}>

        {block}
      </MarginBlock>
    );
  });

  return (
    <div className="tl-root">
      {loading ? (
        <div className="tl-loading">Loading threads…</div>
      ) : threads.length === 0 ? (
        <div className="tl-empty">No threads yet — draft a scaffold to start the outline.</div>
      ) : (
        <div className="tl-list">{listBlocks}</div>
      )}
    </div>
  );
}



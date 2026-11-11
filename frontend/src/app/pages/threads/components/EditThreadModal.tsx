import { useEffect, useMemo, useState } from 'react';
import { THREAD_SCOPE_TYPES, type ThreadScopeType } from '../data';
import { loadCharacters } from '../../characters/data';
import { ScopePicker } from './ScopePicker';

export interface EditThreadPatch {
  name: string;
  scopeType: string;
  /** Empty for the whole-story scope. */
  scopeName: string;
}

interface Props {
  projectId?: string;
  /** The thread being edited — needs `name` and `scope` ({ type, name } | null). */
  thread: { id: string; name: string; scope?: { type?: string; name?: string } | null };
  onClose: () => void;
  onSave: (threadId: string, patch: EditThreadPatch) => void;
}

/**
 * EditThreadModal — change a storyline's name and scope after it's been created.
 * Reuses the shared <ScopePicker> (the same who/what grid the New-thread modal
 * uses) and the `.thr-modal*` chrome. Pre-filled from the thread's current scope
 * — switching to Story drops any attached name; switching to a character/item/…
 * reveals the name picker. Saves through `update_plot_thread` (a direct WRITE,
 * like the inline rename — no proposal).
 */
export function EditThreadModal({ projectId, thread, onClose, onSave }: Props) {
  const [title, setTitle] = useState(thread.name ?? '');
  const [scopeType, setScopeType] = useState(thread.scope?.type || 'story');
  const [scopeName, setScopeName] = useState(thread.scope?.name ?? '');
  const [characters, setCharacters] = useState<any[]>([]);
  const [showMorePeople, setShowMorePeople] = useState(false);

  const scopeDef = useMemo<ThreadScopeType | undefined>(
    () => THREAD_SCOPE_TYPES.find((s) => s.value === scopeType),
    [scopeType],
  );
  const needsName = !!scopeDef?.needsName;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    loadCharacters(projectId)
      .then((res: any) => !cancelled && setCharacters(res?.characters ?? []))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Switching to a *different* scope kind drops the old name (a character name
  // shouldn't carry to a location); re-picking the same kind is a no-op so an
  // already-attached name survives an accidental re-click.
  const pickScope = (value: string) => {
    if (value === scopeType) return;
    setScopeType(value);
    setScopeName('');
    setShowMorePeople(false);
  };

  const canSave = title.trim().length > 0 && (!needsName || scopeName.trim().length > 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    onSave(thread.id, {
      name: title.trim(),
      scopeType,
      scopeName: needsName ? scopeName.trim() : '',
    });
  };

  return (
    <div className="thr-modal-backdrop" onClick={onClose}>
      <form className="thr-modal thr-modal--edit" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="thr-modal-head">
          <div className="thr-modal-head-main">
            <span className="thr-modal-kicker">Edit storyline</span>
            <h2 className="thr-modal-title">Rename or re-scope this thread</h2>
          </div>
          <button type="button" className="thr-modal-close" onClick={onClose} aria-label="close">
            ×
          </button>
        </div>

        <div className="thr-modal-body">
          <div className="thr-edit-field">
            <label className="thr-edit-label">Name</label>
            <input
              className="thr-field-input"
              type="text"
              value={title}
              autoFocus
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Name this storyline…"
            />
          </div>

          <div className="thr-edit-field">
            <label className="thr-edit-label">Who is this thread for?</label>
            <ScopePicker
              scopeType={scopeType}
              scopeName={scopeName}
              characters={characters}
              showMorePeople={showMorePeople}
              onPickScope={pickScope}
              onPickCharacter={setScopeName}
              onSetName={setScopeName}
              onShowMore={() => setShowMorePeople(true)}
            />
          </div>
        </div>

        <div className="thr-modal-foot">
          <span className="thr-modal-foot-note">Changes apply to this storyline right away.</span>
          <div className="thr-modal-foot-btns">
            <button type="button" className="wv2-btn wv2-btn-subtle wv2-btn-sm" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="wv2-btn wv2-btn-primary wv2-btn-sm" disabled={!canSave}>
              Save changes
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

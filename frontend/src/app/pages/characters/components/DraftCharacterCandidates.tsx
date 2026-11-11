import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { qk, queries } from '../../../queries';
import { candidateCharNames, useEntityTagIndex } from '../../braindumps/components/entityTags';
import { formatTag } from '../../braindumps/components/typedTags';
import { callOp } from '../../../gateway';
import { Spinner } from '../../../ui/marks';

/**
 * DraftCharacterCandidates — names the AI tagged as characters in the braindump
 * idea tree that aren't real cast members yet. Uses the same proposal-card
 * visual system as CharacterSuggestions / ThreadSuggestions (chr-suggest-*
 * classes) so it has the same visual weight and "Make real" affordance.
 */
export function DraftCharacterCandidates({ projectId, onAddNew, onInvent }: { projectId?: string; onAddNew?: () => void; onInvent?: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: braindumps = [] } = useQuery({ ...queries.braindumps(projectId), enabled: !!projectId });
  const { data: cast } = useQuery({ ...queries.characters(projectId), enabled: !!projectId });
  const idx = useEntityTagIndex(projectId);
  const [drafting, setDrafting] = useState<Set<string>>(new Set());

  const candidates = useMemo(() => {
    const realNames = ((cast as any)?.characters ?? []).map((c: any) => c?.name);
    return candidateCharNames(braindumps, realNames)
      .filter((name) => !idx.aliasOf(formatTag('char', name)));
  }, [braindumps, cast, idx]);

  if (candidates.length === 0)
    return (
      <div className="chr-suggest">
        <div className="chr-suggest-head">
          <span className="chr-suggest-spark" aria-hidden="true">✦</span>
          <span className="chr-suggest-ttl">Make souls exist</span>
        </div>
        <div className="chr-suggest-list">
          <div className="flex flex-wrap gap-2">
            {onAddNew && (
              <button type="button" className="chr-cand-chip" onClick={onAddNew}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
                Add new
              </button>
            )}
            {onInvent && (
              <button type="button" className="chr-cand-chip chr-cand-chip-ai" onClick={onInvent}>
                <span className="wv2-spark" aria-hidden="true">✦</span>
                Invent with Night Eyes
              </button>
            )}
          </div>
        </div>
      </div>
    );

  const draft = async (name: string) => {
    if (drafting.has(name)) return;
    setDrafting((s) => new Set(s).add(name));
    try {
      const res = await callOp(projectId, 'promote_to_character', { name }, 'characters');
      const charId = res?.character_id;
      if (charId && projectId) {
        navigate(`/project/${projectId}/characters/${charId}`);
        queryClient.invalidateQueries({ queryKey: qk.characters(projectId) });
      }
    } finally {
      setDrafting((s) => { const n = new Set(s); n.delete(name); return n; });
    }
  };

  return (
    <div className="chr-suggest">
      <div className="chr-suggest-head">
        <span className="chr-suggest-spark" aria-hidden="true">✦</span>
        <span className="chr-suggest-ttl">Spotted in your braindumps</span>
        <span className="chr-suggest-meta">
          not in your cast · <b>{candidates.length} {candidates.length === 1 ? 'name' : 'names'}</b>
        </span>
      </div>

      <div className="chr-suggest-list">
        {candidates.map((name) => {
          const isPending = drafting.has(name);
          return (
            <div key={name} className="chr-sug">
              <span className="chr-sug-face" aria-hidden="true">
                <span
                  style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: idx.colorOf(formatTag('char', name)) || 'var(--terra)',
                    boxShadow: `0 0 0 3px color-mix(in srgb, ${idx.colorOf(formatTag('char', name)) || 'var(--terra)'} 20%, transparent)`,
                  }}
                />
              </span>

              <span className="chr-sug-main">
                <span className="chr-sug-name">{name}</span>
              </span>

              <span className="chr-sug-acts">
                {isPending ? (
                  <span className="flex items-center gap-1.5" style={{ fontFamily: 'var(--ui)', fontSize: '11.5px', fontWeight: 700, color: 'var(--sug-deep, var(--ink-3))' }}>
                    <Spinner className="h-3 w-3" />
                    Drafting…
                  </span>
                ) : (
                  <button
                    type="button"
                    className="chr-sug-accept"
                    onClick={() => draft(name)}
                  >
                    <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
                    Make real
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <div className="chr-suggest-foot">
        <div className="flex flex-wrap gap-2">
          {onAddNew && (
            <button type="button" className="chr-cand-chip" onClick={onAddNew}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
              Add new
            </button>
          )}
          {onInvent && (
            <button type="button" className="chr-cand-chip chr-cand-chip-ai" onClick={onInvent}>
              <span className="wv2-spark" aria-hidden="true">✦</span>
              Invent with Night Eyes
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

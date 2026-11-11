import { useMemo } from 'react';
import { usePendingByCapability } from '../../../modules/proposal';

const ARC_KEYS: Array<[string, string]> = [
  ['want', 'wants'],
  ['need', 'needs'],
  ['misbelief', 'believes'],
  ['story', 'arc'],
  // promote_to_character carries these two; extract/add proposals don't (filtered out).
  ['external_arc', 'outer arc'],
  ['internal_arc', 'inner arc'],
];

// Two shapes feed this block:
//  • run_init_elements (extract): { type:'character', character:{ name, role, … } }
//  • enrich_promoted_character:   { type:'character_edit', name, fields:{ <column>:value } }
// Both normalise to a flat { name, type, description, want, need, misbelief, story,
// internal_arc } the compact arc preview renders. (The enrich card here is the
// accept-ALL surface; per-field accept lives in the Studio.)
function normaliseResult(capability: string, raw: any): any {
  if (capability === 'enrich_promoted_character') {
    if (raw?.type !== 'character_edit') return null;
    const f = raw?.fields && typeof raw.fields === 'object' ? raw.fields : {};
    return {
      name: raw.name,
      type: f.type,
      description: f.description,
      want: f.want, need: f.need, misbelief: f.misbelief,
      story: f.story, internal_arc: f.internal_arc,
    };
  }
  if (capability === 'run_init_elements') {
    if (raw?.type !== 'character') return null;
    const inner = raw?.character && typeof raw.character === 'object' ? raw.character : {};
    return {
      name: inner.name ?? raw.name,
      type: inner.role,
      description: inner.description,
      external_arc: inner.external_arc,
      internal_arc: inner.internal_arc,
    };
  }
  return raw;
}

/**
 * CharacterSuggestions — the green "make real" block that sits at the TOP of
 * both the People init page AND the populated cast page (people-init.html ·
 * block 1). One shared component, one source of truth: it reads pending
 * character proposals straight from `useProposalStore` (via
 * `usePendingByCapability`), so a suggestion proposed by chat, a button, or the
 * cron engine all surface here, and accepting on any surface dismisses it
 * everywhere (the proposal-subsystem invariant).
 *
 * Sources are the extract (`run_init_elements`) and promote
 * (`promote_to_character`) proposals — each shows a compact arc preview
 * (wants / needs / believes) under the name. Renders nothing when there are no
 * pending suggestions, so it's invisible on a fresh project until the engine
 * actually finds someone. (Plain `add_character` is a direct write, not a
 * proposal, so it never surfaces here.)
 *
 * NOTE (data-model gap): the design mocks richer provenance — "named 4× in
 * Outline · Act I & two ideas". Our proposal `result` only carries
 * {name, type, description, …arc}, so we show type/description instead; the
 * mention-counting metadata isn't in the model yet.
 */
export function CharacterSuggestions() {
  const extracted = usePendingByCapability('run_init_elements');
  const promoted = usePendingByCapability('enrich_promoted_character');
  const pending = useMemo(() => {
    const lift = (list: typeof extracted) =>
      list
        .map((p) => {
          const result = normaliseResult(p.capability, p.result);
          return result ? { ...p, result } : null;
        })
        .filter((p): p is NonNullable<typeof p> => p !== null);
    return [...lift(extracted), ...lift(promoted)];
  }, [extracted, promoted]);

  if (pending.length === 0) return null;

  const acceptAll = () => pending.forEach((p) => p.onAccept());

  return (
    <div className="chr-suggest">
      <div className="chr-suggest-head">
        <span className="chr-suggest-spark" aria-hidden="true">✦</span>
        <span className="chr-suggest-ttl">Suggested for your cast</span>
        <span className="chr-suggest-meta">
          generated · <b>{pending.length} {pending.length === 1 ? 'character' : 'characters'}</b>
        </span>
      </div>

      <div className="chr-suggest-list">
        {pending.map((p) => {
          const r = p.result ?? {};
          const arc = ARC_KEYS
            .map(([key, label]) => [label, r[key]] as const)
            .filter(([, v]) => v && String(v).trim().length > 0);

          return (
            <div key={p.proposalId} className="chr-sug">
              <span className="chr-sug-face" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="8.5" r="4" />
                  <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
                </svg>
              </span>

              <span className="chr-sug-main">
                <span className="chr-sug-name">{r.name || 'unnamed character'}</span>
                {(r.type || r.description) && (
                  <span className="chr-sug-where">
                    {r.type && <span className="chr-sug-src">{r.type}</span>}
                    {r.type && r.description && <span className="chr-sug-dot">·</span>}
                    {r.description && <span className="chr-sug-desc">{r.description}</span>}
                  </span>
                )}
                {arc.length > 0 && (
                  <span className="chr-sug-arc">
                    {arc.map(([label, v]) => (
                      <span key={label} className="chr-sug-arc-item">
                        <em>{label}</em> {v}
                      </span>
                    ))}
                  </span>
                )}
                {Array.isArray(r.relationships) && r.relationships.length > 0 && (
                  <span className="chr-sug-rels">
                    {r.relationships.map((rel: any, i: number) => (
                      <span key={i} className="chr-sug-rel" title={rel?.description || undefined}>
                        {rel?.name || 'someone'}
                        {rel?.relationship_type && (
                          <span className="chr-sug-rel-kind"> · {rel.relationship_type}</span>
                        )}
                      </span>
                    ))}
                  </span>
                )}
              </span>

              <span className="chr-sug-acts">
                <button type="button" className="chr-sug-dismiss" title="Dismiss" onClick={p.onCancel}>
                  <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
                <button type="button" className="chr-sug-accept" onClick={p.onAccept}>
                  <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
                  Make real
                </button>
              </span>
            </div>
          );
        })}
      </div>

      {pending.length > 1 && (
        <div className="chr-suggest-foot">
          <button type="button" className="chr-suggest-all" onClick={acceptAll}>
            Make all real
          </button>
        </div>
      )}
    </div>
  );
}

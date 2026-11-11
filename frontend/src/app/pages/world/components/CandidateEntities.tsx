import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import '../../characters/characters.css'; // .chr-suggest / .chr-sug card styles

/**
 * CandidateEntities — the "make real" block inside a world section. Lists the
 * entities of this section's kind that the braindumps mention but that aren't
 * real Worldbuilding rows yet (from worldIdeas.buildWorldCandidates). Clicking
 * "Make real" promotes one: the row is created NOW in this section + an AI
 * description draft is proposed (promote_to_world_entity). Renders nothing when
 * there are no candidates.
 *
 * Visually this is the World twin of the cast's CharacterSuggestions — it reuses
 * the same `.chr-suggest` / `.chr-sug` card treatment (those classes are
 * `.wv2-root`-scoped, not character-specific). World candidates are bare names
 * with no arc/description and aren't dismissable proposals, so the card carries
 * just the name + a "Make real" accept button.
 *
 * Pending indicator: a clicked candidate shows a spinner and stays in place
 * until it disappears from `names`. That only happens once the promote round-trip
 * has reloaded and the new real entity is in the world data (buildWorldCandidates
 * filters out names that are now real rows) — so the spinner spans exactly "until
 * the real item loads". On failure we clear the pending flag so it's retryable.
 */
export function CandidateEntities({
  names,
  onMakeReal,
}: {
  names: string[];
  onMakeReal: (name: string) => void | Promise<void>;
}) {
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const make = async (n: string) => {
    if (pending[n]) return;
    setPending((p) => ({ ...p, [n]: true }));
    try {
      await onMakeReal(n);
      // On success the name drops out of `names` after reload → row unmounts;
      // we deliberately leave the pending flag set so the spinner persists across
      // that gap rather than flashing back to the button before the row vanishes.
    } catch {
      setPending((p) => ({ ...p, [n]: false }));
    }
  };

  if (!names || names.length === 0) return null;
  return (
    <div className="chr-suggest mt-2.5">
      <div className="chr-suggest-head">
        <span className="chr-suggest-spark" aria-hidden="true">✦</span>
        <span className="chr-suggest-ttl">Mentioned in your ideas, not added yet</span>
        <span className="chr-suggest-meta">
          <b>{names.length} {names.length === 1 ? 'entry' : 'entries'}</b>
        </span>
      </div>

      <div className="chr-suggest-list">
        {names.map((n) => {
          const busy = !!pending[n];
          return (
            <div key={n} className="chr-sug">
              <span className="chr-sug-face" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="7.5" />
                  <path d="M12 4.5v15M4.5 12h15" />
                </svg>
              </span>

              <span className="chr-sug-main">
                <span className="chr-sug-name">{n}</span>
              </span>

              <span className="chr-sug-acts">
                <button
                  type="button"
                  className="chr-sug-accept"
                  disabled={busy}
                  title={`Make “${n}” a real entry and draft its description from your ideas`}
                  onClick={() => make(n)}
                >
                  {busy ? (
                    <>
                      <Loader2 size={12} className="animate-spin" /> Making real…
                    </>
                  ) : (
                    <>
                      <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
                      Make real
                    </>
                  )}
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

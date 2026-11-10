import { Scroll } from 'lucide-react';
import { avatarColor, initial } from '../avatar';

/**
 * Rules box — default view. Clean entity rows. Each rule is typed by what its
 * scope applies to (set in data.ts: character / item / world). A **character**
 * rule wears that character's avatar (same colour as the People box — visually
 * attached); thing / world rules use a **ghost scroll** icon (faint, borderless —
 * the "this is a rule" mark). Rule text is the line, the subject the sub-label.
 * From get_rules.
 */
export function RulesSmall({ data }) {
  return (
    <div className="wv2-rules">
      {data.map((r, i) => {
        const sub = r.scopeType === 'world' ? r.scopeName || 'world' : r.scopeName || r.scopeType;
        return (
          <div className="wv2-rule" key={i}>
            {r.scopeType === 'character' ? (
              <span className="wv2-av" style={{ background: avatarColor(r.scopeName) }}>
                {initial(r.scopeName)}
              </span>
            ) : (
              <span className="wv2-rule-ghost">
                <Scroll size={20} strokeWidth={1.5} />
              </span>
            )}
            <div className="wv2-entity-info">
              <div className="wv2-rule-text">{r.text}</div>
              <div className="wv2-role">{sub}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

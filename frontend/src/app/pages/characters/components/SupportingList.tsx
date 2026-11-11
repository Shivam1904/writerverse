/**
 * SupportingList — one-line rows for the "supporting" tier (extras with names).
 * Tighter than main cards: sm portrait + name (+ italic tag) + role + mention
 * count + a ⋯ overflow. Dashed dividers between rows; hover lifts the row.
 */
import { Portrait } from './Portrait';
import { TierHead } from './ProtagonistSpread';

export function SupportingList({ characters, num = 'iii.', onEdit, onOpen, onDelete }) {
  return (
    <section className="chr-tier-section">
      <TierHead
        num={num}
        title="Supporting"
        tail="— extras with names"
      />
      <div className="chr-supp-list">
        {characters.map((c) => (
          <div key={c.id} className="chr-supp-row-wrap">
            <div className="chr-supp-row">
              <Portrait name={c.name.split(' ')[0]} size="sm" src={c.portrait_url} />
              <div className="chr-supp-name chr-clickable" onClick={() => onOpen(c)}>
                {c.name}
                {c.tag && <em> — {c.tag}</em>}
              </div>
              <div className="chr-supp-desc">{c.role}</div>
              <div className="chr-supp-meta">
                {typeof c.mentions === 'number' ? `${c.mentions} mentions` : ''}
                {c.first ? ` · ${c.first}` : ''}
              </div>
              <span />
              <button type="button" className="chr-supp-more" aria-label="edit" onClick={() => onEdit(c)}>⋯</button>
              <button type="button" className="chr-supp-more chr-del-btn" aria-label="delete" onClick={() => onDelete(c.id)}>×</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

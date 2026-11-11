/**
 * MainGrid — 2-up half-spreads for the "main" tier (the weather around the
 * protagonist). Each card: lg portrait + name + role + three mini-facets
 * (need · misbelief · voice) + a footer with the mention pill and open arrow.
 *
 * The misbelief mini-facet is the page's most surfaced empty state — when it's
 * null we render the "+ misbelief — no misbelief yet" prompt with a terra
 * sparkle, so the gap reads as a soft invitation rather than a hole.
 */
import { Portrait } from './Portrait';
import { TierHead } from './ProtagonistSpread';

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

export function MainGrid({ characters, num = 'ii.', onEdit, onOpen, onDelete }) {
  return (
    <section className="chr-tier-section">
      <TierHead
        num={num}
        title="Main"
        tail="— the weather around the protagonist"
      />
      <div className="chr-main-grid">
        {characters.map((c) => (
          <MainCard key={c.id} character={c} onEdit={onEdit} onOpen={onOpen} onDelete={onDelete} />
        ))}
      </div>
    </section>
  );
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </svg>
  );
}

function MainCard({ character: c, onEdit, onOpen, onDelete }) {
  return (
    <article className="chr-card">
      <div className="chr-card-head">
        <Portrait name={`portrait · ${c.name.split(' ').pop()}`} size="sm" src={c.portrait_url} />
        <div className="chr-card-head-text">
          <h3 className="chr-card-name chr-clickable" onClick={() => onOpen(c)}>{c.name}</h3>
          <div className="chr-card-role">{c.role}</div>
        </div>
        <button type="button" className="chr-edit-btn" onClick={() => onEdit(c)} aria-label="edit character">
          <EditIcon />
        </button>
        <button type="button" className="chr-edit-btn chr-del-btn" onClick={() => onDelete(c.id)} aria-label="delete character">
          <DeleteIcon />
        </button>
      </div>

      <div className="chr-mini-list">
        <Mini label="identity">
          {c.description ? c.description : <span className="chr-mini-empty">+ add identity</span>}
        </Mini>
        <Mini label="emotional journey">
          {c.internal_arc ? c.internal_arc : <span className="chr-mini-empty">+ add emotional journey</span>}
        </Mini>
        <Mini label="plot">
          {c.story ? c.story : <span className="chr-mini-empty">+ add plot</span>}
        </Mini>
      </div>

      <div className="chr-card-footer">
        <span className="chr-mention-pill">
          {typeof c.mentions === 'number' && (
            <>
              <span className="chr-dot" />
              <b>{c.mentions}</b>&nbsp;mentions
            </>
          )}
          {c.first && (
            <>
              {typeof c.mentions === 'number' ? ' · first in ' : 'first in '}
              <i>{c.first}</i>
            </>
          )}
        </span>
        <button type="button" className="chr-open" onClick={() => onOpen(c)}>open &rarr;</button>
      </div>
    </article>
  );
}

function Mini({ label, empty, children }: { label: string; empty?: boolean; children: React.ReactNode }) {
  return (
    <div className={`chr-mini ${empty ? 'is-empty' : ''}`}>
      <span className="chr-mini-lbl">{label}</span>
      <span className="chr-mini-body">{children}</span>
    </div>
  );
}

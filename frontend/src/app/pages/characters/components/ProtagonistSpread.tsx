/**
 * ProtagonistSpread — the hero "full spread" at the top of the Dossier.
 *
 * Two-column grid: xl portrait on the left; name / role +
 * 2×2 facets grid (outer need · inner need · misbelief · voice w/ waveform) +
 * the signature line on the right. Corner tag marks it as the protagonist.
 *
 * Facets render their **empty state inline** (the "+ add inner need" prompt)
 * — the page is about *what the protagonist is missing*, not just what they
 * have. Voice waveform is the original 8-bar SVG-free stylesheet pattern.
 */
import { Portrait } from './Portrait';
import { clickableProps } from '../../../lib/utils';

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </svg>
  );
}

export function ProtagonistSpread({ character: p, num = 'i.', onEdit, onOpen, onDelete }) {
  return (
    <section className="chr-tier-section">
      <TierHead num={num} title="Protagonist" tail="— the one the book follows" />

      <div className="chr-proto">
        <div className="chr-proto-corner">
          <button type="button" className="chr-edit-btn" onClick={() => onEdit(p)} aria-label="edit character">
            <EditIcon />
          </button>
          <button type="button" className="chr-edit-btn chr-del-btn" onClick={() => onDelete(p.id)} aria-label="delete character">
            <DeleteIcon />
          </button>
          <span className="chr-star" aria-hidden="true">✦</span>protagonist
        </div>

        <div className="chr-proto-left">
          <Portrait name={`portrait · ${p.name}`} size="xl" tone="proto" src={p.portrait_url} />
        </div>

        <div className="chr-proto-body">
          <h3 className="chr-proto-name chr-clickable" onClick={() => onOpen(p)}>{p.name}</h3>
          <div className="chr-facets">
            <Facet label="identity" mark="○">
              {p.description ? p.description : <EmptyFacet kind="identity" onClick={() => onEdit(p)} />}
            </Facet>
            <Facet label="emotional journey" mark="●">
              {p.internal_arc ? p.internal_arc : <EmptyFacet kind="emotional journey" onClick={() => onEdit(p)} />}
            </Facet>
            <Facet label="plot" mark="◇">
              {p.story ? p.story : <EmptyFacet kind="plot" onClick={() => onEdit(p)} />}
            </Facet>
          </div>

          {p.signature && (
            <div className="chr-signature">
              {p.signature}
              <span className="chr-sig-att">signature line{p.first ? ` · ${p.first}` : ''}</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function TierHead({ num, title, tail, count }: { num: string; title: string; tail?: string; count?: string }) {
  return (
    <div className="chr-tier-head">
      <span className="chr-tier-num">{num}</span>
      <h2 className="chr-tier-title">
        {title} {tail && <em>{tail}</em>}
      </h2>
      {count && <span className="chr-tier-count">{count}</span>}
      <span className="chr-tier-rule" />
    </div>
  );
}

function Facet({
  label,
  mark,
  markTone,
  rule,
  children,
}: {
  label: string;
  mark: string;
  markTone?: 'clay';
  rule?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`chr-facet ${rule ? 'chr-facet-rule' : ''}`}>
      <div className="chr-facet-lbl">
        <span className={`chr-facet-mk ${markTone ? `is-${markTone}` : ''}`}>{mark}</span>
        {label}
      </div>
      <div className="chr-facet-body">{children}</div>
    </div>
  );
}

/** "+ add …" prompt (the "+" comes from CSS). Clicking it opens the editor. */
function EmptyFacet({ kind, onClick }: { kind: string; onClick: () => void }) {
  return <span className="chr-facet-empty" {...clickableProps(onClick)}>add {kind}</span>;
}

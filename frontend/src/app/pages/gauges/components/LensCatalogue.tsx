import { KINDS, KIND_ORDER } from '../fixtures';
import { LensGlyph } from './LensGlyph';
import { SCOPE_WORDS } from './LensCard';

/**
 * The full shelf — every catalogue lens, grouped by kind (refined handoff
 * layout). Each group leads with the plain braindump, the textbook term tag, and a
 * one-line meaning. Flat rows: a tinted glyph + the plain name + the term tag.
 * Honours the name search: a group with no matches drops out; if every group is
 * empty, the section shows a "no matches" line (per behavior/10-lenses.md E3).
 */
export function LensCatalogue({ catalogue, query, onOpen, watching, boundScopes }) {
  const q = query.trim().toLowerCase();
  const match = (l) => !q || `${l.question || ''} ${l.name || ''}`.toLowerCase().includes(q);

  const groups = KIND_ORDER
    .map((k) => ({ kind: k, meta: KINDS[k], lenses: catalogue.filter((l) => l.kind === k && match(l)) }))
    .filter((g) => g.lenses.length > 0);

  const total = catalogue.length;

  return (
    <section className="lens-sec">
      <div className="lens-sec-head">
        <span className="lens-sec-t">Everything else</span>
        <span className="lens-sec-c">the full shelf · {total} more</span>
      </div>

      {groups.length === 0 ? (
        <p className="lens-nomatch">no matches in this section</p>
      ) : (
        groups.map(({ kind, meta, lenses }) => (
          <div key={kind} className="lens-cat">
            <div className="lens-cat-h">
              <span className="lens-cat-d" style={{ background: meta.color }} />
              <span className="lens-cat-w">{meta.catTitle}</span>
              <span className="lens-cat-term">{meta.catTerm}</span>
              <span className="lens-cat-desc">{meta.catDesc}</span>
            </div>
            <div className="lens-cat-grid">
              {lenses.map((lens) => {
                const pro = lens.state === 'pro';
                const isBound = !!watching?.has?.(lens.id);
                const tid = lens.template_id || lens.id;
                const scopes = boundScopes?.[tid] || [];
                return (
                  <div
                    key={lens.id}
                    role={pro ? undefined : 'button'}
                    tabIndex={pro ? undefined : 0}
                    className={`lens-card lens-flat t-${lens.kind}${isBound ? ' is-watching' : ''}${pro ? '' : ' is-clickable'}`}
                    onClick={pro ? undefined : () => onOpen(lens)}
                    onKeyDown={pro ? undefined : (e) => (e.key === 'Enter' || e.key === ' ') && onOpen(lens)}
                  >
                    <LensGlyph id={lens.id} kind={lens.kind} flat />
                    <div className="lens-card-body">
                      <div className="lens-flat-nm">
                        {lens.question || lens.name || lens.label}
                        {lens.foundational && <span className="gz-foundational" title="a great place to start">★ start here</span>}
                      </div>
                      {lens.term && <div className="lens-term">{lens.term}</div>}
                      {scopes.length > 0 ? (
                        <div className="gz-scope gz-scope-bound gz-scope-flat">
                          <span className="gz-scope-lbl">bound on</span>
                          {scopes.map((s, i) => (
                            <span key={i} className="gz-scope-name">{s?.type && s.type !== 'story' ? s?.name : 'the whole story'}</span>
                          ))}
                        </div>
                      ) : (
                        <div className="gz-scope gz-scope-possible gz-scope-flat">
                          <span className="gz-scope-lbl">watches</span>
                          <span className="gz-scope-can">{SCOPE_WORDS[lens.scope_type] || lens.scope_type || 'the whole story'}</span>
                        </div>
                      )}
                    </div>
                    {pro ? (
                      <span className="lens-state-pro lens-flat-pro">Pro</span>
                    ) : isBound ? (
                      // Bound state only — removal is scoped, handled in the
                      // configure modal (one delete per bound scope).
                      <div className="lens-flat-actions">
                        <span className="lens-state-tracking" title="this lens is bound — open to manage scopes">Bound</span>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </section>
  );
}

/**
 * Shared box chrome — the panel + header (label + count) + empty state. The body
 * (a view) is delegated. `prominence` ('primary' | 'secondary') sets the visual
 * weight via a class; the layout decides placement. Loose props / any.
 */
export function BoxShell({ label, count, isEmpty, emptyText, children, prominence, width }) {
  return (
    <section className={`wv2-panel wv2-box is-${prominence || 'secondary'} wv2-box-${width || 'half'}`}>
      <h3 className="wv2-panel-h">
        {label} {count != null && <span className="wv2-ct">{count}</span>}
      </h3>
      {isEmpty ? <p className="wv2-empty">{emptyText}</p> : children}
    </section>
  );
}

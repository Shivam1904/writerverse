/**
 * Suggestions module — the expanded-notification view (the mockup card). A
 * heading, a line of text, then a primary / secondary / dismiss button. Loose
 * props (any), no contracts.
 */
function btnClass(kind) {
  if (kind === 'primary') return 'wv2-btn wv2-btn-primary wv2-btn-sm';
  if (kind === 'secondary') return 'wv2-btn wv2-btn-subtle wv2-btn-sm';
  return 'wv2-btn wv2-btn-ghost wv2-btn-sm';
}

export function ExpandedNotification({ suggestion, onAction }) {
  const s = suggestion;
  return (
    <section className="wv2-noticed">
      <span className="wv2-noticed-quote" aria-hidden="true" />
      <div className="wv2-noticed-body">
        <div className="wv2-noticed-heading">{s.heading}</div>
        {s.text && <div className="wv2-noticed-text">{s.text}</div>}
        <div className="wv2-noticed-actions">
          {(s.actions ?? []).map((a) => (
            <button key={a.id} className={btnClass(a.kind)} onClick={() => onAction(s, a)}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

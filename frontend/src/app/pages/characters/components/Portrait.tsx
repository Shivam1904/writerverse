import '../characters.css'; // .chr-port-*: other pages show portraits too (WorldCast)

/**
 * Portrait — striped paper placeholder with a monospace explainer caption,
 * or (when `src` is set) a bust portrait: circular frame with the head
 * jutting above the ring and the bottom clipped to the circle's curve.
 *
 *   size:  'xl' | 'lg' | 'md' | 'sm' | 'round'
 *   tone:  'plain' | 'proto' | 'ghost'
 *   src:   optional AI portrait URL
 *
 * The `round` size keeps the old frameless circular crop (used by WorldCast).
 */
export function Portrait({ name = '', size = 'md', tone = 'plain', src = '' }: any) {
  const cap = (name || '?').toLowerCase();

  if (src && size !== 'round') {
    const toneClass = tone !== 'plain' ? ` chr-bust-${tone}` : '';
    return (
      <span className={`chr-bust chr-bust-${size}${toneClass}`} aria-hidden="true">
        <span
          className="chr-bust-fig"
          style={{ ['--port-src' as any]: `url("${src}")` }}
        >
          <span className="chr-port-shine" />
        </span>
        <span className="chr-bust-ring" />
      </span>
    );
  }

  if (src) {
    return (
      <span
        className={`chr-port chr-port-${size} chr-port-img`}
        style={{ ['--port-src' as any]: `url("${src}")` }}
        aria-hidden="true"
      >
        <span className="chr-port-shine" />
      </span>
    );
  }

  return (
    <span
      className={`chr-port chr-port-${size} ${tone !== 'plain' ? `chr-port-${tone}` : ''}`}
      data-name={cap}
      aria-hidden="true"
    />
  );
}

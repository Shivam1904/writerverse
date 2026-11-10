import type { PackLens } from './lensLibrary';

/* LensAttach — only the illustrative chart preview survives here. The attach panel
 * itself was retired (2026-06-21): both surfaces now use the kit's unified
 * LensAttachContainer (modules/lensKit/AttachBox). ExpectedChart stays because the
 * container shows it as the "what you'll see" teaser. */

/* a quick, illustrative preview of the chart this lens produces (no data yet) */
export function ExpectedChart({ type }: { type: PackLens['type'] }) {
  if (type === 'checklist') {
    return (
      <div style={{ display: 'flex', gap: 7, alignItems: 'center', height: 44, padding: '4px 0' }}>
        {[1, 1, 1, 0, 0].map((on, i) => (
          <span key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 99,
            fontSize: 11, fontFamily: 'var(--lens-sans)',
            background: on ? 'var(--lens-green-wash)' : 'transparent', color: on ? 'var(--lens-green-deep)' : 'var(--lens-muted)',
            border: '1px solid ' + (on ? 'transparent' : 'var(--lens-line-2)')
          }}>
            {on ? '✓' : '○'} beat
          </span>
        ))}
      </div>
    );
  }
  const bars = type === 'arc' ? [10, 15, 21, 27, 33, 39, 44] : type === 'payoff' ? [22, 0, 30, 0, 26, 18, 0] : [18, 30, 14, 26, 20, 36, 24];
  const col = type === 'arc' ? 'rgba(109,87,166,.42)' : type === 'payoff' ? 'rgba(176,134,47,.42)' : 'rgba(95,134,191,.4)';
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 44, padding: '4px 0' }}>
      {bars.map((v, i) => (
        <span key={i} style={{
          width: 26, borderRadius: '4px 4px 0 0', height: v === 0 ? 4 : v,
          background: v === 0 ? 'var(--lens-gold-wash)' : col, border: v === 0 ? '1px solid var(--lens-gold-soft)' : '1px solid transparent'
        }} />
      ))}
    </div>
  );
}

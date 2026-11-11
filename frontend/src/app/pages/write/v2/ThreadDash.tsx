/**
 * A thread mark — a small dash colored by its narrative thread. Full color
 * when the beat is written ("on"), muted when not, neutral grey when ghost.
 * Shared by the scene margin and the story rail.
 */
export function ThreadDash({
  color,
  on,
  ghost,
}: {
  color?: string;
  on?: boolean;
  ghost?: boolean;
}) {
  return (
    <span
      className={`thread-dash${on ? ' is-on' : ''}${ghost ? ' is-ghost' : ''}`}
      style={{ ['--dot' as any]: color || 'var(--ink-4)' }}
    />
  );
}

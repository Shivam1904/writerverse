/**
 * Lens search — the 280px input in the page header. Case-insensitive substring
 * match on lens name across all three sections (behavior/10-lenses.md E3). The
 * ⌘K hint is decorative for now.
 */
export function SearchBar({ value, onChange, count }) {
  return (
    <div className="lens-search">
      <svg viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="6.5" />
        <path d="M20 20l-4-4" />
      </svg>
      <input
        value={value}
        placeholder={`Search ${count} lenses…`}
        onChange={(e) => onChange(e.target.value)}
        aria-label="search lenses"
      />
      <span className="lens-kbd">⌘K</span>
    </div>
  );
}

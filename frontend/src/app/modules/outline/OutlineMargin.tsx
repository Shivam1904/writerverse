import { BookText } from 'lucide-react';

/* ChapterMarginEntry — the outline's CHAPTER sub-margin heading. Rendered in BOTH
 * the in-flow gutter traveler (inside each chapter's <MarginBlock>) and the
 * off-screen overlay dock, indented/scaled by the caller so it reads as nested
 * under the "Grand outline" section — the same pattern threads use under the
 * Outline section in the Character Studio.
 *
 * Composed from the shared kit atoms (kit-head-box + ty-system-label/caption) the
 * other margin entries use (WorldSectionEntry / StudioMarginEntry) — no new CSS. */
export function ChapterMarginEntry({
  n,
  title,
  onClick,
}: {
  n: number;
  title?: string;
  onClick?: () => void;
}) {
  const sub = title?.trim();
  return (
    <div
      className={`flex items-start gap-2 rounded-[var(--r-md)] px-1 py-1${onClick ? ' cursor-pointer' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <span className="kit-head-box"><BookText size={15} strokeWidth={1.8} /></span>
      <div className="min-w-0 pt-0.5">
        <div className="ty-system-label truncate">Ch {n}</div>
        {sub && <div className="ty-system-caption truncate">{sub}</div>}
      </div>
    </div>
  );
}

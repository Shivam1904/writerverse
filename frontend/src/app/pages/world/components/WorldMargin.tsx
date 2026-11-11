import { useEffect, useRef, useState } from 'react';
import { EntityMark, type EntityKind } from '../../../components/EntityMark';
import { SectionMark } from '../../../components/SectionMark';
import { resolveSectionVisual, type SectionGlyph } from '../sectionMeta';
import { GlyphColorPicker } from './GlyphColorPicker';
import type { WorldSection } from '../data';

/* World's own margin-entry components. They're rendered in BOTH the gutter
 * (via <MarginBlock>) and the off-screen <MarginOverlay> — the overlay/block
 * machinery itself is the reusable library in modules/margin/. This file only
 * owns how a World heading LOOKS (kit typography + Tailwind, no world.css). */

/** A section-heading edit — rename / hint / glyph / color. Applied as a direct
 *  WRITE (update_world_block). */
export interface SectionHeadingPatch {
  label?: string;
  hint?: string;
  glyph?: string;
  color?: string;
}

/* ── SECTION entry (top level: Story / Characters / Worldbuilding) ──
 * The plain icon-box + heading + subheading style shared with Character Studio
 * (kit-head-box + ty-system-label/caption). These are the ONLY entries fed to
 * the overlay — they dock. Subsections below use the glossy SectionMarginEntry
 * and never dock. */
export function WorldSectionEntry({
  icon,
  label,
  sub,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={`flex items-start gap-2 rounded-[var(--r-md)] px-1 py-1${onClick ? ' cursor-pointer' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <span className="kit-head-box">{icon}</span>
      <div className="min-w-0 pt-0.5">
        <div className="ty-system-label truncate">{label}</div>
        {sub && <div className="ty-system-caption">{sub}</div>}
      </div>
    </div>
  );
}

/* ── single entry visual ── */
interface EntryProps {
  label: string;
  sub?: string;
  count?: number;
  color: string;
  mark: React.ReactNode;
  onClick?: () => void;
}

export function WorldMarginEntry({ label, sub, mark, onClick }: EntryProps) {
  return (
    <aside
      className={`flex items-start gap-2 rounded-lg px-2 py-[7px] ${onClick ? 'cursor-pointer hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <span className="grid h-6 w-6 shrink-0 place-items-center">{mark}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-px pt-px">
        <span className="truncate text-[13.5px] font-semibold tracking-[-0.005em] text-[var(--ink-2)]">{label}</span>
        {sub && <span className="font-[family-name:var(--serif)] text-[12px] italic text-[var(--ink-4)]">{sub}</span>}
      </span>
    </aside>
  );
}

export function SectionMarginEntry({
  section,
  onSave,
  onClick,
}: {
  section: WorldSection;
  /** When provided, the entry becomes editable in place (rename / hint /
   *  glyph+color). Editable entries live ONLY in the gutter; the overlay uses the
   *  read-only (onClick) form. */
  onSave?: (patch: SectionHeadingPatch) => void;
  onClick?: () => void;
}) {
  const vis = resolveSectionVisual(section);
  if (onSave) return <EditableMarginEntry section={section} vis={vis} onSave={onSave} />;

  const count = section.items?.length ?? 0;
  const isEntity = ['location', 'item', 'rule', 'person'].includes(vis.glyph);
  return (
    <WorldMarginEntry
      label={section.title}
      sub={section.hint}
      count={count || undefined}
      color={vis.color}
      onClick={onClick}
      mark={
        isEntity
          ? <EntityMark kind={vis.glyph as EntityKind} color={vis.color} size={20} />
          : <SectionMark glyph={vis.glyph} color={vis.color} size={20} />
      }
    />
  );
}

/* ── editable margin entry ──
 * The per-block gutter mark, made editable in place:
 *   · the mark is a button → opens the glyph/colour picker popover
 *   · the label (title) and sub (hint) are click-to-edit inputs
 * Every change is a direct WRITE (update_world_block) via `onSave`. */
function EditableMarginEntry({
  section,
  vis,
  onSave,
}: {
  section: WorldSection;
  vis: { glyph: SectionGlyph; color: string };
  onSave: (patch: SectionHeadingPatch) => void;
}) {
  const title = section.title;
  const hint = section.hint;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingHint, setEditingHint] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftHint, setDraftHint] = useState(hint || '');
  const ref = useRef<HTMLElement>(null);

  useEffect(() => { setDraftTitle(title); }, [title]);
  useEffect(() => { setDraftHint(hint || ''); }, [hint]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [pickerOpen]);

  const commitTitle = () => {
    setEditingTitle(false);
    const v = draftTitle.trim();
    if (v && v !== title) onSave({ label: v });
    else setDraftTitle(title);
  };
  const commitHint = () => {
    setEditingHint(false);
    const v = draftHint.trim();
    if (v !== (hint || '')) onSave({ hint: v });
  };

  const titleInput = 'w-full min-w-0 border-0 border-b-[1.5px] border-[var(--terra)] bg-transparent px-0.5 text-[13.5px] font-semibold tracking-[-0.005em] text-[var(--ink-2)] outline-none';
  const hintInput = 'w-full min-w-0 border-0 border-b border-[var(--terra-soft)] bg-transparent px-0.5 font-[family-name:var(--serif)] text-[12px] italic text-[var(--ink-4)] outline-none';

  return (
    <aside className="group/wm relative flex items-start gap-2 rounded-lg px-2 py-[7px]" ref={ref}>
      <button
        type="button"
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md transition-[filter] hover:brightness-105 active:translate-y-px"
        onClick={() => setPickerOpen((v) => !v)}
        title="Change icon & colour"
      >
        <SectionMark glyph={vis.glyph} color={vis.color} label={title} size={20} />
      </button>
      <span className="flex min-w-0 flex-1 flex-col gap-px pt-px">
        {editingTitle ? (
          <input
            className={titleInput}
            value={draftTitle}
            autoFocus
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTitle();
              if (e.key === 'Escape') { setDraftTitle(title); setEditingTitle(false); }
            }}
          />
        ) : (
          <span
            className="-mx-0.5 cursor-text truncate rounded-[var(--r-xs)] px-0.5 text-[13.5px] font-semibold tracking-[-0.005em] text-[var(--ink-2)] hover:bg-[color-mix(in_srgb,var(--terra)_8%,transparent)]"
            title="Click to rename"
            onClick={() => { setDraftTitle(title); setEditingTitle(true); }}
          >
            {title}
          </span>
        )}
        {editingHint ? (
          <input
            className={hintInput}
            value={draftHint}
            autoFocus
            placeholder="a short subtitle…"
            onChange={(e) => setDraftHint(e.target.value)}
            onBlur={commitHint}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitHint();
              if (e.key === 'Escape') { setDraftHint(hint || ''); setEditingHint(false); }
            }}
          />
        ) : hint ? (
          <span
            className="-mx-0.5 cursor-text rounded-[var(--r-xs)] px-0.5 font-[family-name:var(--serif)] text-[12px] italic text-[var(--ink-4)] hover:bg-[color-mix(in_srgb,var(--terra)_8%,transparent)]"
            title="Click to edit"
            onClick={() => { setDraftHint(hint); setEditingHint(true); }}
          >
            {hint}
          </span>
        ) : (
          <button
            type="button"
            className="w-fit rounded-full border border-dashed border-[var(--terra-soft)] px-2 text-[10px] text-[var(--ink-4)] opacity-0 transition-opacity hover:border-[var(--terra)] hover:text-[var(--terra)] group-hover/wm:opacity-100"
            onClick={() => { setDraftHint(''); setEditingHint(true); }}
          >
            + hint
          </button>
        )}
      </span>

      {pickerOpen && (
        <div className="absolute left-0 top-full z-20 mt-2 rounded-[var(--r-lg)] border border-[var(--terra-soft)] bg-[var(--surface)] p-3 shadow-[0_12px_32px_-14px_rgba(40,30,20,.45)]">
          <GlyphColorPicker
            glyph={vis.glyph}
            color={vis.color}
            label={title}
            onPickGlyph={(g: SectionGlyph) => onSave({ glyph: g })}
            onPickColor={(c: string) => onSave({ color: c })}
          />
        </div>
      )}
    </aside>
  );
}

/** Plain text glyph in a tinted box — for character studio sections etc. */
export function GlyphMark({ glyph, color, size = 22 }: { glyph: string; color: string; size?: number }) {
  return (
    <span
      style={{
        width: size, height: size,
        display: 'grid', placeItems: 'center',
        borderRadius: 7,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        color,
        fontSize: size * 0.55,
        lineHeight: 1,
      }}
    >
      {glyph}
    </span>
  );
}

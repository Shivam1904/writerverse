import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams } from 'react-router-dom';
import { useDevMarkers } from './useDevMarkers';
import { useArnLocation } from './arnLocation';
import { resolveMarker, type ResolvedMarker } from './registry';
// import the specific file (not the lensKit barrel) — the barrel pulls resolve.ts,
// which imports back into sectionMarker → a runtime import cycle.
import { useSectionLensCatalogue } from '../lensKit/catalogue';
import './sectionMarker.css';

/**
 * SectionMarker — a hidden dev affordance dropped beside a section/subsection
 * heading. Renders nothing until the navbar "§ markers" toggle is on; then shows
 * a faint `§` glyph. Clicking it opens a popover with that heading's identity
 * (ARN code + copy button + description/fields pulled from the marker registry).
 *
 * Call sites name only their keys — `page`/`id` come from the URL (useArnLocation),
 * and the label/description/fields come from the registry, so the config stays the
 * one source of truth.
 */
export function SectionMarker({
  section,
  sub,
  item,
  label,
}: {
  section: string;
  sub?: string;
  /** dynamic trailing segment, e.g. a thread id — appended after `sub` */
  item?: string;
  /** overrides the registry label (for dynamic items like a thread's name) */
  label?: string;
}) {
  const enabled = useDevMarkers((s) => s.enabled);
  const { page, id } = useArnLocation();
  const [open, setOpen] = useState(false);
  // span[role=button] (not <button>) so a marker can nest inside button chips/rows
  // without invalid button-in-button DOM.
  const btnRef = useRef<HTMLSpanElement>(null);

  // No page from the URL → no meaningful ARN; stay hidden (keeps markers off shared
  // components like ThreadBlock when they render outside a registered ARN page).
  if (!enabled || !page) return null;

  const resolved = resolveMarker(page, id, section, sub, item);
  const marker = label ? { ...resolved, label } : resolved;

  const toggle = (e: React.SyntheticEvent) => { e.stopPropagation(); setOpen((o) => !o); };

  return (
    <span className="sm-wrap">
      <span
        ref={btnRef}
        role="button"
        tabIndex={0}
        className={`sm-mark${open ? ' is-open' : ''}`}
        title={marker.arn}
        aria-label={`section marker ${marker.arn}`}
        onClick={toggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(e); } }}
      >
        §
      </span>
      {open && <MarkerPopover anchorRef={btnRef} marker={marker} onClose={() => setOpen(false)} />}
    </span>
  );
}

const POPOVER_WIDTH = 320;

function MarkerPopover({
  anchorRef,
  marker,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLElement>;
  marker: ResolvedMarker;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [copied, setCopied] = useState(false);

  // Portaled to <body> (so no scroll/overflow ancestor clips it), positioned next
  // to the glyph, flipped above when it would overflow the bottom. Mirrors the
  // shared GenerateIdeasPopover placement logic.
  useLayoutEffect(() => {
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const left = Math.max(8, Math.min(r.left, window.innerWidth - POPOVER_WIDTH - 8));
      const GAP = 6;
      const ph = ref.current?.offsetHeight ?? 0;
      const placeAbove = window.innerHeight - r.bottom < ph + GAP + 8 && r.top > window.innerHeight - r.bottom;
      const top = placeAbove ? r.top - ph - GAP : r.bottom + GAP;
      setPos({ top: Math.max(8, Math.min(top, window.innerHeight - ph - 8)), left });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorRef]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchorRef, onClose]);

  const copy = () => {
    try {
      navigator.clipboard?.writeText(marker.arn);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* ignore */ }
  };

  return createPortal(
    <div
      className="sm-pop"
      ref={ref}
      style={pos ? { top: pos.top, left: pos.left, width: POPOVER_WIDTH } : { visibility: 'hidden', width: POPOVER_WIDTH }}
    >
      <div className="sm-pop-head">
        <span className="sm-pop-sigil">§</span>
        <span className="sm-pop-title">{marker.label}</span>
        <button type="button" className="sm-pop-x" onClick={onClose} aria-label="close">×</button>
      </div>

      <div className="sm-pop-arn-row">
        <code className="sm-pop-arn">{marker.arn}</code>
        <button type="button" className="sm-pop-copy" onClick={copy}>
          {copied ? 'copied' : 'copy'}
        </button>
      </div>

      {/* identity detail, all sourced from the marker registry. Shows a
          placeholder line for description so the slot stays visible while empty. */}
      <div className="sm-pop-desc">
        {marker.description
          ? <p className="sm-pop-desc-text">{marker.description}</p>
          : <p className="sm-pop-desc-empty">— no description yet —</p>}
      </div>

      <div className="sm-pop-block">
        <div className="sm-pop-block-kicker">Fields</div>
        {marker.fields && marker.fields.length > 0
          ? marker.fields.map((f) => (
              <div key={f.name} className="sm-pop-field">
                <span className="sm-pop-field-k">{f.label}</span>
                <code className="sm-pop-field-v">{f.name}</code>
              </div>
            ))
          : <p className="sm-pop-desc-empty">— none —</p>}
      </div>

      <div className="sm-pop-block">
        <div className="sm-pop-block-kicker">Lens questions</div>
        {marker.lensQuestions && marker.lensQuestions.length > 0
          ? marker.lensQuestions.map((q) => <LensQuestionRow key={q} slug={q} />)
          : <p className="sm-pop-desc-empty">— none yet —</p>}
      </div>
    </div>,
    document.body,
  );
}

/**
 * One lens question inside the marker popover. Resolves the slug to its full entry
 * from the BACKEND section-lens bank (get_section_lenses) — the source of truth now
 * that the static frontend questions moved server-side. An unknown slug falls back
 * to the bare-slug chip so gaps stay visible.
 */
function LensQuestionRow({ slug }: { slug: string }) {
  const { projectId } = useParams();
  const lq = useSectionLensCatalogue(projectId).find((l) => l.slug === slug);
  if (!lq) return <code className="sm-pop-lens">{slug}</code>;
  return (
    <div className="sm-lq">
      <div className="sm-lq-q">{lq.question}</div>
      <code className="sm-lq-slug">{slug}</code>
      <p className="sm-lq-desc">{lq.description}</p>
      <p className="sm-lq-intent">{lq.intent}</p>
      <div className="sm-lq-signal sm-lq-good"><span>good</span>{lq.good}</div>
      <div className="sm-lq-signal sm-lq-problem"><span>problem</span>{lq.problem}</div>
      <div className="sm-lq-scope">
        <span className="sm-lq-scope-tag">{lq.scopeType || '—'}</span>
      </div>
    </div>
  );
}

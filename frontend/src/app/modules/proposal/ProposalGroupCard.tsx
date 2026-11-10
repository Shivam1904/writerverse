import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { ProposalRailCard, sectionForProposal, proposalEntityMark } from './ProposalRailCard';
import {
  groupSentence,
  proposalName,
  lensGlyphId,
  type GroupKind,
  type LensSubjectType,
} from './grouping';
import { pageGlyph } from '../../pageGlyphs';
import { glyphFor } from '../../pages/gauges/components/glyphs';
import { Avatar } from '../../components/Avatar';
import { EntityMark, ItemMark } from '../../components/EntityMark';
import type { PendingProposal } from './useProposalStore';

/**
 * ProposalGroupCard — the view for a collapsed group of same-kind proposals.
 *
 * Grouping logic (when to collapse, the summary sentence) lives in `grouping.ts`;
 * this is purely the rail rendering. Collapsed, it shows a count badge + a
 * one-line summary. Clicking the header EXPANDS the group in place to reveal the
 * real individual <ProposalRailCard>s — each with its own accept/dismiss. The
 * group itself never accepts: its only actions are "Show me" (navigate to the
 * page) and "Dismiss all", so the one-store / accept-in-lockstep invariant holds.
 *
 * Two flavours share this chrome:
 *   • the DEFAULT group — a count badge + a "<names> are <predicate>." sentence
 *     (character births, world entries, threads…), and
 *   • the LENS group (kind.lens set) — suggested lenses, grouped by the subject
 *     TYPE they watch. Its face is the lens GLYPHS it carries plus a type badge:
 *     a glossy avatar stack for your cast, a glossy item mark for the world, a
 *     flat book mark for the whole story. Lenses navigate (never accept), so the
 *     expanded cards' primary is "Show me" too.
 */

const STORY_BOOK = (
  <>
    <path d="M12 6.5C10.4 5.1 7.6 4.7 5.2 4.85 4.5 4.9 4 5.45 4 6.15v10.8c0 .7.6 1.2 1.3 1.15C7.5 17.85 10.4 18.3 12 19.6" />
    <path d="M12 6.5c1.6-1.4 4.4-1.8 6.8-1.65.7.05 1.2.6 1.2 1.3v10.8c0 .7-.6 1.2-1.3 1.15C16.5 17.85 13.6 18.3 12 19.6" />
    <path d="M12 6.5V19.6" />
  </>
);

/** The leading type badge — entity tier for cast (glossy avatars) and world
 *  (glossy item mark), concept tier for the whole story (flat book). */
function LensGroupBadge({ type, subjects }: { type: LensSubjectType; subjects: string[] }) {
  if (type === 'character') {
    const shown = subjects.length ? subjects.slice(0, 3) : ['?'];
    return (
      <span className="wv2-prop-avastack" aria-hidden="true">
        {shown.map((nm) => (
          <Avatar key={nm} name={nm} size="xs" className="wv2-prop-avastack-i" />
        ))}
      </span>
    );
  }
  if (type === 'item') {
    return (
      <span className="wv2-prop-lens-badge" aria-hidden="true">
        <ItemMark color="var(--terra)" size={20} />
      </span>
    );
  }
  return (
    <span className="wv2-prop-lens-badge wv2-prop-lens-concept" aria-hidden="true">
      <svg viewBox="0 0 24 24" width={18} height={18}>{STORY_BOOK}</svg>
    </span>
  );
}

// A glossy entity span — mirrors <Ent> in ProposalRailCard (same em-ent classes)
// so a subject name in a group title reads with the same metallic, kind-tinted
// 3D look as it does on a single card.
function entSpan(tint: 'person' | 'item' | 'story', label: string): ReactNode {
  return <span className={`wv2-prop-em-ent wv2-prop-em-ent--${tint}`}>{label}</span>;
}

function lensGroupTitle(kind: GroupKind, count: number, subjects: string[]): ReactNode {
  const type = kind.lens!;
  const lensWord = `${count} ${count === 1 ? kind.noun : kind.nounPlural}`;
  const tint = type === 'item' ? 'item' : type === 'character' ? 'person' : 'story';
  const ent = (label: string) => entSpan(tint, label);
  // Invented (bespoke) gauges wear a "made for …" voice (echoes the bank's "Made
  // for your story"); suggested fits aren't watching yet, so they read "to watch
  // …", never the active "watching …". Connectives stay flat; the SUBJECT is the
  // glossy entity.
  const verb = kind.invented ? 'made for' : 'to watch';
  if (type === 'story') return <>{lensWord} {verb} {ent('your story')}</>;
  if (type === 'item') {
    return subjects.length === 1
      ? <>{lensWord} {verb} {ent(subjects[0])}</>
      : <>{lensWord} {verb} your world</>;
  }
  if (subjects.length === 1) return <>{lensWord} {verb} {ent(subjects[0])}</>;
  if (subjects.length === 2) return <>{lensWord} {verb} {ent(subjects[0])} &amp; {ent(subjects[1])}</>;
  return <>{lensWord} {verb} your cast</>;
}

export function ProposalGroupCard({ kind, items }: { kind: GroupKind; items: PendingProposal[] }) {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [expanded, setExpanded] = useState(false);
  const section = sectionForProposal(items[0].capability, items[0].result);
  const names = items
    .map((p) => proposalName(p.result))
    .filter((n): n is string => !!n);
  const glyph = pageGlyph(section);
  const DestIcon = glyph?.icon;
  // All grouped proposals share one kind → lead with that entity's glossy mark.
  const mark = proposalEntityMark(items[0].capability, items[0].result);

  const goToPage = () => {
    if (projectId && section) navigate(`/project/${projectId}/${section}`);
  };
  const dismissAll = () => items.forEach((p) => p.onCancel());
  const toggle = () => setExpanded((v) => !v);

  // Lens group: subjects (distinct who/what) + the distinct lens glyphs.
  const isLens = !!kind.lens;
  const subjects = [...new Set(names)];
  const glyphIds = [
    ...new Set(items.map((p) => lensGlyphId(p.capability, p.result)).filter(Boolean)),
  ].slice(0, 6);
  const lensTitle = isLens ? lensGroupTitle(kind, items.length, subjects) : '';
  // Name them inline up to two; past that the subline carries the roll-call.
  const subline = isLens && kind.lens !== 'story' && subjects.length > 2 ? subjects.join(' · ') : '';

  // "Dismiss all" smokes the whole group out before clearing it (same exit as a
  // single card's dismiss); reduced-motion skips straight to the clear. "Show me"
  // only navigates, so it needs no exit. ("Birth them" lives on the inner cards.)
  const [rejecting, setRejecting] = useState(false);
  const reducedMotion =
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const beginDismissAll = () => {
    if (rejecting) return;
    if (reducedMotion) { dismissAll(); return; }
    setRejecting(true);
  };

  return (
    <article
      className={`wv2-prop-card wv2-prop-group-card${isLens ? ' wv2-prop-lens-group' : ''}${expanded ? ' is-expanded' : ''}${
        rejecting ? ' is-rejecting' : ''
      }`}
      onAnimationEnd={(e) => {
        if (e.target !== e.currentTarget || !rejecting) return;
        dismissAll();
      }}
    >
      <header
        className="wv2-prop-card-head wv2-prop-group-head"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
      >
        {isLens ? (
          <>
            <LensGroupBadge type={kind.lens!} subjects={subjects} />
            <span className="wv2-prop-group-main">
              <span className="wv2-prop-lens-kicker">
                {kind.invented ? <><span className="wv2-prop-kicker-spark" aria-hidden="true">✦</span>Invented</> : 'Suggested'}
              </span>
              <span className="wv2-prop-title">{lensTitle}</span>
              {subline && <span className="wv2-prop-lens-subjects">{subline}</span>}
              {glyphIds.length > 0 && (
                <span className="wv2-prop-lens-glyphs">
                  {glyphIds.map((g) => (
                    <span key={g} className="wv2-prop-lensglyph">
                      <svg viewBox="0 0 24 24">{glyphFor(g)}</svg>
                    </span>
                  ))}
                </span>
              )}
            </span>
            <span className="wv2-prop-group-count" aria-hidden="true">{items.length}</span>
            <span className="wv2-prop-group-chevron" aria-hidden="true">
              <ChevronRight size={15} strokeWidth={2} />
            </span>
          </>
        ) : (
          <>
            {mark && <EntityMark kind={mark.kind} color={mark.color} size={20} className="wv2-prop-mark" />}
            <span className="wv2-prop-group-count" aria-hidden="true">{items.length}</span>
            <span className="wv2-prop-title">{groupSentence(kind, names, items.length)}</span>
            <span className="wv2-prop-group-chevron" aria-hidden="true">
              <ChevronRight size={15} strokeWidth={2} />
            </span>
          </>
        )}
      </header>

      {expanded && (
        <div className="wv2-prop-group-children">
          {items.map((p) => (
            <ProposalRailCard
              key={p.proposalId}
              capability={p.capability}
              result={p.result}
              onAccept={p.onAccept}
              onCancel={p.onCancel}
              error={p.error}
              conflicts={p.conflicts}
              onForceAccept={p.onForceAccept}
            />
          ))}
        </div>
      )}

      <div className="wv2-prop-actions">
        {DestIcon && glyph && (
          <span
            className="wv2-prop-dest"
            title={`Opens ${glyph.label}`}
            aria-label={`Opens ${glyph.label}`}
          >
            <DestIcon size={14} strokeWidth={1.8} />
          </span>
        )}
        <button
          type="button"
          className="wv2-prop-btn"
          onClick={(e) => { e.stopPropagation(); beginDismissAll(); }}
        >
          Dismiss all
        </button>
        <button
          type="button"
          className="wv2-prop-btn wv2-prop-btn--primary"
          onClick={(e) => { e.stopPropagation(); goToPage(); }}
        >
          Show me
        </button>
      </div>
    </article>
  );
}

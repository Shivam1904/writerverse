import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { pageGlyph } from '../../pageGlyphs';
import { hintTemplateFor } from './templates';
import type { Hint } from './types';
import './hint.css';

/**
 * HintRailCard — a lighter, borderless cousin of <ProposalRailCard>.
 *
 * Same header → body → footer rhythm as the proposal card, but with the
 * accept-weight stripped: a hint carries no mutation, so there's no Accept. Its
 * one commitment is to point the author at a page — the whole card navigates
 * there on click (Enter / Space too), exactly like the proposal card.
 *
 * The page drives everything page-specific:
 *   • the header glyph + destination come from `pageGlyph(section)` (the same
 *     registry the nav and proposal cards read), and
 *   • the body + default title come from HINT_TEMPLATE_BY_PAGE.
 *
 * `intent` only tints the accent and decides the footer affordance:
 *   • 'start' → terracotta + a CTA pill ("Add a character →")
 *   • 'tip'   → gold + a quiet "Open <page> →" that brightens on hover
 */
export function HintRailCard({ hint, onDismiss }: { hint: Hint; onDismiss?: () => void }) {
  const navigate = useNavigate();
  const { projectId, section: currentSection } = useParams();

  const intent = hint.intent ?? 'tip';
  const section = (hint.page || '').split('.')[0];
  const glyph = pageGlyph(section);
  const Glyph = glyph?.icon;
  const tpl = hintTemplateFor(hint.page);
  const title = hint.title ?? tpl.title(hint);
  const ctaLabel = hint.cta ?? tpl.cta;

  const accent = intent === 'start' ? 'var(--terra)' : 'var(--gold)';

  // A hint pointing at the page you're already on shouldn't offer to take you
  // there — it reads as a quiet, non-navigating note instead (this preserves the
  // old what-to-do-next behaviour where the project nudge on the World page had no
  // button). Navigation + CTA + go-affordance all switch off in that case.
  const onOwnPage = !!currentSection && currentSection === section;
  const navigable = !!section && !onOwnPage;

  const showGo = navigable && intent === 'tip' && !!glyph;
  const showCta = navigable && intent === 'start';
  const showFoot = showGo || showCta || !!onDismiss;
  // A page-less ambient tip carries no glyph and no title — skip the empty header
  // row and let the body line stand on its own.
  const showHead = !!Glyph || (title != null && title !== '');

  const goToPage = () => {
    if (projectId && navigable) navigate(`/project/${projectId}/${section}`);
  };

  return (
    <article
      className="wv2-hint-card"
      data-intent={intent}
      data-page={section}
      style={{ ['--hint-accent' as any]: accent }}
      role={navigable ? 'button' : undefined}
      tabIndex={navigable ? 0 : undefined}
      onClick={navigable ? goToPage : undefined}
      onKeyDown={
        navigable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                goToPage();
              }
            }
          : undefined
      }
    >
      {showHead && (
        <header className="wv2-hint-head">
          {Glyph && (
            <span className="wv2-hint-ic" aria-hidden="true">
              <Glyph size={12} strokeWidth={2} />
            </span>
          )}
          {title != null && title !== '' && <span className="wv2-hint-title">{title}</span>}
        </header>
      )}

      <div className="wv2-hint-body">
        <tpl.Body hint={hint} />
      </div>

      {showFoot && (
        <div className="wv2-hint-foot">
          {showGo && glyph && (
            <span className="wv2-hint-go">
              Open {glyph.label}
              <ArrowRight size={11} strokeWidth={2.5} />
            </span>
          )}
          <div className="wv2-hint-actions">
            {showCta && (
              <button
                type="button"
                className="wv2-hint-cta"
                onClick={(e) => {
                  e.stopPropagation();
                  goToPage();
                }}
              >
                {ctaLabel}
                <ArrowRight size={11} strokeWidth={2.5} />
              </button>
            )}
            {onDismiss && (
              <button
                type="button"
                className="wv2-hint-dismiss"
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss();
                }}
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

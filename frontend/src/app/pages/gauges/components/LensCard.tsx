import { KINDS } from '../fixtures';
import { LensGlyph } from './LensGlyph';

// plain words for the scope a lens CAN watch (shown when it isn't bound yet).
export const SCOPE_WORDS: Record<string, string> = {
  story: 'the whole story', character: 'a character', relationship: 'two characters',
  object: 'an item', place: 'a place', rule: 'a rule', thread: 'a thread',
};

/**
 * A featured lens card (the "made for you" and "likely to fit" rows), styled
 * per the refined handoff: a tinted glyph, the plain-language name + question,
 * an optional "↳ why it fits" line, and the small term tag. The right column
 * carries the kind label and the state — a Watch button, a live "Watching"
 * pill, or a Pro lock.
 *
 * Clicking the card body or its "Configure →" button opens the configure modal
 * (kept from the chart-based build, per the user's call). `variant`: 'special'
 * (made-for-you) | 'ai' (likely to fit) | 'suggested' | 'invented'.
 */
/** A lens as the gauges pages pass it around: normalized server data, loosely typed. */
type GaugeLens = { id: string; [field: string]: any };

interface LensCardProps {
  lens: GaugeLens;
  variant?: string;
  watching: boolean;
  /** Open the configure modal for this lens. */
  onOpen: (lens: GaugeLens) => void;
  onBindings?: (lens: GaugeLens) => void;
  /** template id → the scopes a saved preset is bound on. */
  boundScopes?: Record<string, { type?: string; name?: string }[]>;
  onDelete?: (lens: GaugeLens) => void;
}

export function LensCard({ lens, variant = 'ai', watching, onOpen, onBindings, boundScopes, onDelete }: LensCardProps) {
  const meta = KINDS[lens.kind] ?? KINDS.feeling;
  const pro = lens.state === 'pro';
  const isWatching = watching;
  const tid = lens.template_id || lens.id;
  const scopes = boundScopes?.[tid] || [];
  // the scope line is the entry to bindings — saved presets only (binding needs a preset).
  const canBind = !!(onBindings && (isWatching || lens.source === 'preset' || lens.preset_id));
  const bindProps = canBind ? {
    role: 'button' as const,
    tabIndex: 0,
    title: 'manage which scopes this watches',
    onClick: (e: any) => { e.stopPropagation(); onBindings(lens); },
    onKeyDown: (e: any) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onBindings(lens); } },
  } : {};

  return (
    <div
      className={`lens-card lens-card-${variant} t-${lens.kind}${pro ? '' : ' is-clickable'}${isWatching ? ' is-watching' : ''}`}
      onClick={pro ? undefined : () => onOpen(lens)}
      role={pro ? undefined : 'button'}
      tabIndex={pro ? undefined : 0}
      onKeyDown={pro ? undefined : (e) => (e.key === 'Enter' || e.key === ' ') && onOpen(lens)}
    >
      {onDelete && lens.source === 'preset' && (
        <button type="button" className="gz-preset-del" title="delete this preset"
          onClick={(e) => { e.stopPropagation(); onDelete(lens); }}>×</button>
      )}
      <LensGlyph id={lens.id} kind={lens.kind} />

      <div className="lens-card-body">
        <div className="lens-card-nm">
          {lens.question || lens.name}
          {/* the short noun name survives as a small nickname once the question leads */}
          {lens.question && lens.name && lens.name !== lens.question && (
            <span className="gz-kindword">{lens.name}</span>
          )}
          {lens.kind_word && <span className="gz-kindword">{lens.kind_word}</span>}
        </div>
        {/* `ask` is just an alias of `watches` (see normalizeLens) — render the
            description once, not twice (LANGUAGE.md §8 double-description bug). */}
        {(lens.watches || lens.ask) && <div className="gz-card-watches">{lens.watches || lens.ask}</div>}
        {lens.why && <div className="lens-card-why">{lens.why}</div>}

        {/* scope line — click (on a saved preset) to manage bindings. BOUND shows
            the scopes; otherwise the scope this type CAN watch. */}
        {scopes.length > 0 ? (
          <div className={`gz-scope gz-scope-bound${canBind ? ' gz-scope-link' : ''}`} {...bindProps}>
            <span className="gz-scope-lbl">bound on</span>
            {scopes.map((s, i) => (
              <span key={i} className="gz-scope-name">{s?.type && s.type !== 'story' ? s?.name : 'the whole story'}</span>
            ))}
          </div>
        ) : (
          <div className={`gz-scope gz-scope-possible${canBind ? ' gz-scope-link' : ''}`} {...bindProps}>
            <span className="gz-scope-lbl">{canBind ? 'attach to' : 'watches'}</span>
            <span className="gz-scope-can">{SCOPE_WORDS[lens.scope_type] || lens.scope_type || 'the whole story'}</span>
          </div>
        )}

        <div className="gz-card-tags">
          {lens.foundational && <span className="gz-foundational" title="a great place to start">★ start here</span>}
          {lens.term && <span className="lens-term">{lens.term}</span>}
        </div>
      </div>

      <div className="lens-card-right">
        {variant === 'suggested' && <span className="gz-suggested-mark">suggested</span>}
        <span className="lens-ctype">
          <span className="lens-ctype-d" style={{ background: meta.color }} />
          {meta.label}
        </span>

        {pro ? (
          <span className="lens-state-pro">Pro</span>
        ) : (
          <button
            type="button"
            className="gz-watch-hint"
            title={isWatching ? 'tune this config' : 'set it up first'}
            onClick={(e) => { e.stopPropagation(); onOpen(lens); }}
          >
            Configure →
          </button>
        )}
      </div>
    </div>
  );
}

import { PageHeader } from '../../../components/PageHeader';
import { Button } from '../../../ui/button';

/**
 * CastHead — the page-head pattern shared across the design's three variants
 * (we ship the Dossier only). Eyebrow · serif title · italic sub · action
 * cluster, then the tier-filter strip with per-tier counts + sort hint.
 *
 * The tier strip is a local filter — clicking a chip narrows what the page
 * renders. Create just calls `onGenerateClick` — it sends the author down to the
 * "describe one" field at the foot of the page. That field saves the author's
 * own words as a new character; it runs no AI, so the button carries no AI mark
 * (SA-151).
 */
type Tier = 'all' | 'protagonist' | 'main' | 'supporting';

/**
 * CastPageHeader — just the <PageHeader> (eyebrow · serif title · suffix count ·
 * action cluster). Lifted out so PageShell can render it through the gutter grid
 * (body-aligned). The tier-filter strip is a sibling component (`CastTierStrip`)
 * rendered as a PageShell child.
 */
export function CastPageHeader({
  totalNamed,
  onAddClick,
  onGenerateClick,
}: {
  totalNamed: number;
  onAddClick?: () => void;
  onGenerateClick?: () => void;
}) {
  return (
    <PageHeader
      section="characters"
      eyebrow="Imagine · characters"
      title="Characters"
      suffix={totalNamed ? `· ${totalNamed}` : undefined}
      actions={
        <>
          <Button variant="secondary" size="sm" onClick={onGenerateClick}>
            Create
          </Button>
          <button type="button" className="wv2-btn wv2-btn-primary wv2-btn-sm" onClick={onAddClick}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            Add character
          </button>
        </>
      }
    />
  );
}

/**
 * CastTierStrip — the tier-filter strip (Protagonist/Main/Supporting/
 * All toggle that drives the `tier` state). Clicking a chip narrows what the
 * page renders. Same markup as before; pulled out of CastHead so it can be a
 * plain PageShell child (auto-aligned to the body column).
 */
export function CastTierStrip({
  totalNamed,
  counts,
  activeTier,
  onTierChange,
}: {
  totalNamed: number;
  counts: { protagonist: number; main: number; supporting: number };
  activeTier: Tier;
  onTierChange: (t: Tier) => void;
}) {
  return (
    <div className="chr-tier-strip" role="tablist" aria-label="filter by tier">
      <TierChip kind="all" label="All" count={totalNamed} active={activeTier} onChange={onTierChange} />
      {counts.protagonist > 0 && (
        <TierChip
          kind="protagonist"
          label="Protagonist"
          count={counts.protagonist}
          swatch="var(--terra)"
          active={activeTier}
          onChange={onTierChange}
        />
      )}
      {counts.main > 0 && (
        <TierChip
          kind="main"
          label="Main"
          count={counts.main}
          swatch="var(--gold)"
          active={activeTier}
          onChange={onTierChange}
        />
      )}
      {counts.supporting > 0 && (
        <TierChip
          kind="supporting"
          label="Supporting"
          count={counts.supporting}
          swatch="var(--sage)"
          active={activeTier}
          onChange={onTierChange}
        />
      )}
    </div>
  );
}

function TierChip({
  kind,
  label,
  count,
  swatch,
  ghost,
  active,
  onChange,
}: {
  kind: Tier;
  label: string;
  count: number;
  swatch?: string;
  ghost?: boolean;
  active: Tier;
  onChange: (t: Tier) => void;
}) {
  const on = active === kind;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      className={`chr-tier-chip ${on ? 'is-on' : ''}`}
      onClick={() => onChange(kind)}
    >
      {swatch && (
        <span
          className={`chr-tier-sw ${ghost ? 'is-ghost' : ''}`}
          style={ghost ? undefined : { background: swatch }}
        />
      )}
      {label}
      <span className="chr-tier-ct">{count}</span>
    </button>
  );
}

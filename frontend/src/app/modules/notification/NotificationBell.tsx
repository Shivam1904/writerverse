import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useNotifications } from './useNotifications';
import { notificationGlyph } from './slugs';
import { resolveTarget } from './NotificationCard';
import { NotifMarkdown } from './NotifMarkdown';
import {
  useProposalStore,
  ProposalRailCard,
  ProposalGroupCard,
  buildRailItems,
  isRecent,
  sortNewestFirst,
  suggestedAgo,
} from '../proposal';
import type { RailItem } from '../proposal';
import { Label } from '../../ui';
import './notification.css';
import '../../rightRail/rightRail.css'; // .wv2-prop-em-* card emphasis treatments

/**
 * The topbar bell — the single home for things that want the author's eye.
 * Two sections:
 *   1. PROPOSALS — every pending proposal from the global store (the universal
 *      surface the old floating toast used to be), rendered as the same
 *      <ProposalRailCard>/<ProposalGroupCard> the drawer used; accept/reject on
 *      any surface is the same `accept_proposal` / `reject_proposal` op call
 *      (`callOp` drops the card when it lands). Page surfaces still repaint
 *      their own artifacts in place — this is the always-available fallback.
 *      Newest first; each card says how long ago it was suggested ("2 days
 *      ago"), so weeks-old ones sit at the bottom. Nothing is dismissed for age.
 *   2. NOTIFICATIONS — archived informational pings (active ones live in the
 *      Night Eyes rail; once dismissed they're archived and only visible here).
 * Badge = count of proposals from the last RECENT_DAYS (old ones don't light it up).
 */
export function NotificationBell() {
  const { projectId, archived } = useNotifications();
  const pending = useProposalStore((s) => s.pending);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const sorted = sortNewestFirst(pending);
  const propCount = pending.length;
  const recentCount = sorted.filter((p) => isRecent(p)).length;
  const hasArchived = archived.length > 0;

  return (
    <div className="wv2-notif-bell-wrap" ref={ref}>
      <button
        className="wv2-notif-bell"
        onClick={() => setOpen((o) => !o)}
        aria-label="proposals and notifications"
      >
        <Bell size={18} strokeWidth={1.8} />
        {recentCount > 0 && (
          <span className="wv2-notif-bell-badge">{recentCount > 9 ? '9+' : recentCount}</span>
        )}
      </button>

      {open && (
        <div className="wv2-notif-panel">
          {propCount === 0 && !hasArchived ? (
            <div className="wv2-notif-panel-empty">Nothing here yet.</div>
          ) : (
            <>
              {propCount > 0 && (
                <>
                  <div className="wv2-notif-panel-head">Proposals</div>
                  <div className="wv2-notif-panel-list flex flex-col gap-2">
                    {buildRailItems(sorted).map(renderRailItem)}
                  </div>
                </>
              )}

              {hasArchived && (
                <>
                  <div className="wv2-notif-panel-head">Notifications</div>
                  <div className="wv2-notif-panel-list">
                    {archived.map((n) => {
                      const { icon: Glyph, accent } = notificationGlyph(n.slug);
                      const url = resolveTarget(projectId, n.target_url);
                      return (
                        <div
                          key={n.id}
                          className="wv2-notif-panel-item"
                          style={{ ['--notif-accent' as any]: accent }}
                          role={url ? 'button' : undefined}
                          onClick={url ? () => { setOpen(false); navigate(url); } : undefined}
                        >
                          <span className="wv2-notif-ic" aria-hidden="true">
                            <Glyph size={12} />
                          </span>
                          <div className="wv2-notif-main">
                            {n.title && <div className="wv2-notif-title">{n.title}</div>}
                            <NotifMarkdown>{n.content}</NotifMarkdown>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** One card plus a small "2 days ago" line. A group shows its newest member's
 *  age (items keep the newest-first order they were built from). */
function renderRailItem(item: RailItem) {
  const key = item.type === 'group' ? `group:${item.key}` : String(item.proposal.proposalId);
  const createdAt = item.type === 'group' ? item.items[0]?.createdAt : item.proposal.createdAt;
  const card = item.type === 'group' ? (
    <ProposalGroupCard kind={item.kind} items={item.items} />
  ) : (
    <ProposalRailCard
      capability={item.proposal.capability}
      result={item.proposal.result}
      onAccept={item.proposal.onAccept}
      onCancel={item.proposal.onCancel}
      error={item.proposal.error}
      conflicts={item.proposal.conflicts}
      onForceAccept={item.proposal.onForceAccept}
    />
  );
  return (
    <div key={key} className="flex flex-col gap-1">
      {createdAt != null && <Label muted className="px-1.5">{suggestedAgo(createdAt)}</Label>}
      {card}
    </div>
  );
}

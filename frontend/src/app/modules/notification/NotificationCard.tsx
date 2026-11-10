import type { MouseEvent, KeyboardEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { notificationGlyph } from './slugs';
import { NotifMarkdown } from './NotifMarkdown';
import type { AppNotification } from './types';
import './notification.css';

/** Resolve a sender's target into a router path. A leading "/" is treated as a
 *  full path; anything else is a section slug (+params) under the project. */
export function resolveTarget(projectId: any, target?: string): string {
  if (!target) return '';
  if (target.startsWith('/')) return target;
  return `/project/${projectId}/${target}`;
}

/**
 * A subtle rail card forked from the proposal/hint design — smaller, quieter.
 * Whole card click → navigate AND archive. The × dismisses (archive) WITHOUT
 * navigating. Archived cards then live only behind the topbar bell.
 */
export function NotificationCard({
  n,
  onArchive,
}: {
  n: AppNotification;
  onArchive: (id: number) => void;
}) {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { icon: Glyph, accent } = notificationGlyph(n.slug);
  const navigable = !!n.target_url;

  const go = () => {
    const url = resolveTarget(projectId, n.target_url);
    onArchive(n.id);
    if (url) navigate(url);
  };

  const dismiss = (e: MouseEvent) => {
    e.stopPropagation();
    onArchive(n.id);
  };

  return (
    <article
      className="wv2-notif-card"
      style={{ ['--notif-accent' as any]: accent }}
      role={navigable ? 'button' : undefined}
      tabIndex={navigable ? 0 : undefined}
      onClick={navigable ? go : undefined}
      onKeyDown={
        navigable
          ? (e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                go();
              }
            }
          : undefined
      }
    >
      <span className="wv2-notif-ic" aria-hidden="true">
        <Glyph size={12} />
      </span>
      <div className="wv2-notif-main">
        {n.title && <div className="wv2-notif-title">{n.title}</div>}
        <NotifMarkdown>{n.content}</NotifMarkdown>
      </div>
      <button className="wv2-notif-x" onClick={dismiss} aria-label="Dismiss">
        <X size={12} />
      </button>
    </article>
  );
}

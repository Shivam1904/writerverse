import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import { BrandMark, Card } from './ui';
import { useDevMarkers } from './modules/sectionMarker';
import { queries } from './queries';
import { extensions } from './extensions';
import { NotificationBell } from './modules/notification';

interface TopbarProps {
  projectId: string;
}

export function Topbar({ projectId }: TopbarProps) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Dev-only: show/hide the section markers (ARN inspectors) on page headings.
  const markersOn = useDevMarkers((s) => s.enabled);
  const toggleMarkers = useDevMarkers((s) => s.toggle);

  // Project meta drives the title. Refetched automatically whenever
  // a metered AI call invalidates the `project_meta` staleness domain.
  const { data: meta } = useQuery({ ...queries.projectMeta(projectId), enabled: !!projectId });
  const project: any = meta ?? null;

  useEffect(() => {
    if (!menuOpen) return;
    function close(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const handleLogout = useCallback(async () => {
    setMenuOpen(false);
    await logout();
    navigate('/');
  }, [logout, navigate]);

  const initial = user?.first_name?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? '?';
  const displayName = user?.first_name
    ? `${user.first_name}${user.last_name ? ` ${user.last_name}` : ''}`
    : user?.email ?? '';
  const scenes = project?.total_scenes ?? 0;
  const words = project?.total_word_count ?? 0;
  const _metaLine = project
    ? `${scenes} scene${scenes !== 1 ? 's' : ''} · ${words.toLocaleString()} words`
    : '';

  return (
    <Card className="wv2-topbar">
      <button className="wv2-topbar-brand" onClick={() => navigate('/')}>
        <BrandMark size="sm" />
      </button>

      <span className="wv2-topbar-sep" />

      <div className="wv2-topbar-proj">
        <span className="wv2-topbar-title">{project?.title ?? 'Loading...'}</span>
        {/* {metaLine && <span className="wv2-topbar-meta">{metaLine}</span>} */}
      </div>


      <span className="wv2-topbar-spacer" />

      {/* Extension items, e.g. a usage meter (app/extensions.ts) */}
      {extensions.topbarItems?.map((Item, i) => <Item key={i} projectId={projectId} />)}

      {import.meta.env.DEV && (
        <button
          type="button"
          className={`wv2-topbar-watch wv2-topbar-markers${markersOn ? ' is-on' : ''}`}
          onClick={toggleMarkers}
          title={markersOn
            ? 'Section markers are on — click a § beside a heading to see its ARN. Click to hide.'
            : 'Show dev section markers (§ ARN inspectors) on headings.'}
          aria-pressed={markersOn}
        >
          {/* "Dev" so a walkthrough never mistakes it for an author feature (wrt-113) */}
          <span className="wv2-topbar-markers-sigil">§</span>
          Dev · Markers
        </button>
      )}

      <NotificationBell />

      <div className="wv2-topbar-avatar-wrap" ref={menuRef}>
        <button
          className="wv2-topbar-avatar"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="user menu"
        >
          {initial}
        </button>

        {menuOpen && (
          <div className="wv2-topbar-menu">
            <div className="wv2-topbar-menu-user">
              <span className="wv2-topbar-menu-name">{displayName}</span>
              {user?.email && <span className="wv2-topbar-menu-email">{user.email}</span>}
            </div>
            <div className="wv2-topbar-menu-sep" />
            <button className="wv2-topbar-menu-item" onClick={() => { setMenuOpen(false); navigate('/library'); }}>
              Library
            </button>
            {extensions.userMenuItems?.map((item) => (
              <button key={item.to} className="wv2-topbar-menu-item" onClick={() => { setMenuOpen(false); navigate(item.to); }}>
                {item.label}
              </button>
            ))}
            <div className="wv2-topbar-menu-sep" />
            <button className="wv2-topbar-menu-item wv2-topbar-menu-danger" onClick={handleLogout}>
              Log out
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

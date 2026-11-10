import { useQuery } from '@tanstack/react-query';
import { NavLink, useSearchParams } from 'react-router-dom';
import { queries } from '../queries';
import { groupThreads, threadMetric, ThreadRowContent, scopeMeta } from '../pages/threads/components/ThreadRow';
import { Avatar } from '../components/Avatar';
import { EntityMark } from '../components/EntityMark';

/* ── threads: same instrument rows as lenses, tinted per thread, with gaps
 * as the attention signal. Open gaps float to the top. Row markup is the
 * shared <ThreadRowContent> — reused by the Grand-outline threads panel. ── */

export function ThreadSubList({ projectId, variant = 'rail' }: { projectId: string; variant?: 'rail' | 'nav' }) {
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get('tab');
  // Shares the ['plot_threads', pid] cache with ThreadsPage + useCounts, so any
  // thread write (page CRUD, chat accept, another tab) refetches here too — the
  // rail list stays in sync with the page instead of being a one-shot snapshot.
  const { data, isLoading } = useQuery({
    ...queries.plotThreads(projectId),
    enabled: !!projectId,
    staleTime: 60_000,
  });
  const threads = (data as any)?.threads ?? [];

  if (isLoading) return <div className="wv2-sublist"><span className="wv2-sublist-loading">loading…</span></div>;
  if (!threads.length) return <div className="wv2-sublist"><span className="wv2-sublist-empty">no threads yet</span></div>;

  const groups = groupThreads(threads);

  return (
    // `nav` drops the second-rail indent wrapper (26px left margin + border)
    // so popover rows fill the panel width instead of squeezing/truncating.
    <div className={variant === 'nav' ? 'flex flex-col' : 'wv2-sublist wv2-lenses'}>
      {groups.map((g) => (
        <div className="wv2-cast-group" key={g.key}>
          <div className={`wv2-role-head wv2-role-head--${g.key}`}>
            <span className="wv2-role-dot" />
            <span className="wv2-role-lbl">{g.label}</span>
            <span className="wv2-role-rule" />
            <span className="wv2-role-count">{g.items.length}</span>
          </div>
          {g.items.map((t) => {
            // `nav` variant — rows match the primary sidebar items (same
            // wv2-nav-item pill/hover/active), keeping the thread's scope mark
            // (person avatar / glossy entity mark) as the icon.
            if (variant === 'nav') {
              const sm = scopeMeta(t.scope);
              const mark = sm?.mark ?? 'thread';
              return (
                <NavLink
                  key={t.id}
                  to={`/project/${projectId}/plot-threads?tab=${encodeURIComponent(t.id)}`}
                  className={`wv2-nav-item wv2-nav-item--secondary${t.id === activeTab ? ' is-active' : ''}`}
                  style={{ '--thr-c': t.color } as React.CSSProperties}
                  title={`${t.name} · ${threadMetric(t)}`}
                >
                  <span className="grid place-items-center shrink-0 w-[22px] h-[22px]">
                    {mark === 'person'
                      ? <Avatar name={sm?.label || t.name} size="sm" />
                      : <EntityMark kind={mark} color="var(--thr-c)" size={22} title={sm?.label} />}
                  </span>
                  <span className="wv2-nav-label">{t.name}</span>
                </NavLink>
              );
            }
            return (
              <NavLink
                key={t.id}
                to={`/project/${projectId}/plot-threads?tab=${encodeURIComponent(t.id)}`}
                className={`wv2-thr${t.id === activeTab ? ' is-active' : ''}`}
                style={{ '--thr-c': t.color } as React.CSSProperties}
                title={`${t.name} · ${threadMetric(t)}`}
              >
                <ThreadRowContent thread={t} />
              </NavLink>
            );
          })}
        </div>
      ))}
    </div>
  );
}

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Spline } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { queries } from '../queries';

/* Role buckets for the cast — protagonist & antagonist get their own spotlight,
 * everyone else falls to main / supporting. Derived from the explicit flags
 * first, then the free-text `type` (the tier heuristic folds antagonist into
 * "main", so we can't lean on it here). */
type RoleKind = 'protagonist' | 'antagonist' | 'main' | 'supporting';

const ROLE_ORDER: RoleKind[] = ['protagonist', 'antagonist', 'main', 'supporting'];
const ROLE_LABEL: Record<RoleKind, string> = {
  protagonist: 'Protagonist',
  antagonist: 'Antagonist',
  main: 'Main cast',
  supporting: 'Supporting',
};

function roleKind(c: any): RoleKind {
  const t = String(c?.type || c?.role || '').toLowerCase();
  if (c?.is_protagonist || c?.tier === 'protagonist' || t.includes('protagonist') || t.includes('hero')) return 'protagonist';
  if (c?.is_antagonist || t.includes('antagonist') || t.includes('villain')) return 'antagonist';
  if (c?.is_main_character || c?.tier === 'main' || t.includes('main') || t.includes('lead')) return 'main';
  return 'supporting';
}

const GENERIC_ROLE_WORDS = new Set([
  'protagonist', 'antagonist', 'main', 'supporting', 'hero', 'villain', 'lead', 'main character',
]);

// The per-row subtitle is the character's own `type` — but only when it adds
// something beyond the group header it already sits under.
function roleSubtitle(c: any): string {
  const s = String(c?.type || '').trim();
  if (!s || GENERIC_ROLE_WORDS.has(s.toLowerCase())) return '';
  return s;
}

// Key a character name for matching against a thread's `scope.name`.
function castKey(name: any): string {
  return String(name ?? '').trim().toLowerCase();
}

export function CharacterSubList({ projectId, variant = 'rail' }: { projectId: string; variant?: 'rail' | 'nav' }) {
  // Both reads share the page/useCounts caches (['characters'] + ['plot_threads']),
  // so the cast list and the per-row thread-count badge refetch in lockstep with
  // any character/thread write — no one-shot snapshot. Characters drive the list;
  // character-scope plot threads feed the badge.
  const charsQ = useQuery({
    ...queries.characters(projectId),
    enabled: !!projectId,
    staleTime: 60_000,
  });
  const threadsQ = useQuery({
    ...queries.plotThreads(projectId),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const people = (charsQ.data as any)?.characters ?? [];
  const threadCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    // ThreadsPage's loader normalises to `threads` (with `scope`); fall back to
    // the raw `plot_threads` shape just in case.
    const list = (threadsQ.data as any)?.threads ?? (threadsQ.data as any)?.plot_threads ?? [];
    for (const t of list) {
      if (t?.scope?.type === 'character') {
        const key = castKey(t.scope.name);
        if (key) counts[key] = (counts[key] ?? 0) + 1;
      }
    }
    return counts;
  }, [threadsQ.data]);

  if (charsQ.isLoading) return <div className="wv2-sublist"><span className="wv2-sublist-loading">loading…</span></div>;
  if (!people.length) return <div className="wv2-sublist"><span className="wv2-sublist-empty">no characters yet</span></div>;

  const groups = ROLE_ORDER
    .map((kind) => ({ kind, label: ROLE_LABEL[kind], items: people.filter((p) => roleKind(p) === kind) }))
    .filter((g) => g.items.length > 0);

  return (
    // `nav` drops the second-rail indent wrapper (26px left margin + border)
    // so popover rows fill the panel width instead of squeezing/truncating.
    <div className={variant === 'nav' ? 'flex flex-col' : 'wv2-sublist wv2-cast'}>
      {groups.map((g) => (
        <div className="wv2-cast-group" key={g.kind}>
          <div className={`wv2-role-head wv2-role-head--${g.kind}`}>
            <span className="wv2-role-dot" />
            <span className="wv2-role-lbl">{g.label}</span>
            <span className="wv2-role-rule" />
            <span className="wv2-role-count">{g.items.length}</span>
          </div>
          {g.items.map((c) => {
            const sub = roleSubtitle(c);
            const threads = threadCounts[castKey(c.name)] ?? 0;
            const threadTitle = threads > 0
              ? `${threads} plot thread${threads === 1 ? '' : 's'} attached`
              : 'No plot threads attached';
            // `nav` variant — rows match the primary sidebar items (same
            // wv2-nav-item pill/hover/active), keeping the avatar as the icon.
            if (variant === 'nav') {
              return (
                <NavLink
                  key={c.id}
                  to={`/project/${projectId}/characters/${c.id}`}
                  className={({ isActive }) => `wv2-nav-item wv2-nav-item--secondary${isActive ? ' is-active' : ''}`}
                  title={`${c.name}${sub ? ` · ${sub}` : ` · ${g.label}`} · ${threadTitle}`}
                >
                  <span className="grid place-items-center shrink-0 w-[22px] h-[22px]">
                    <Avatar name={c.name} size="sm" />
                  </span>
                  <span className="wv2-nav-label">{c.name}</span>
                </NavLink>
              );
            }
            return (
              <NavLink
                key={c.id}
                to={`/project/${projectId}/characters/${c.id}`}
                className={({ isActive }) => `wv2-prow wv2-prow--${g.kind}${isActive ? ' is-active' : ''}`}
                title={`${c.name}${sub ? ` · ${sub}` : ` · ${g.label}`} · ${threadTitle}`}
              >
                <span className="wv2-prow-av">
                  <Avatar name={c.name} size={`${g.kind === 'protagonist' ? 'md' : 'sm'}`} />
                  {/* {g.kind === 'protagonist' && <span className="wv2-prow-badge wv2-prow-badge--protagonist">★</span>}
                  {g.kind === 'antagonist' && <span className="wv2-prow-badge wv2-prow-badge--antagonist" />} */}
                </span>
                <span className="wv2-prow-text">
                  <span className={`wv2-prow-nm${g.kind === 'protagonist' ? ' text-14px' : ' text-13px'}`}>{c.name}</span>
                  {sub && <span className="wv2-prow-role">{sub}</span>}
                </span>
                <span
                  className={`wv2-prow-threads${threads > 0 ? ' has-threads' : ' is-none'}`}
                  aria-label={threadTitle}
                >
                  <Spline size={12} strokeWidth={1.9} />
                  <span className="wv2-prow-threads-n">{threads}</span>
                </span>
              </NavLink>
            );
          })}
        </div>
      ))}
    </div>
  );
}

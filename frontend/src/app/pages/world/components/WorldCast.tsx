/**
 * WorldCast — a small "who lives in this world" peek for the World page.
 *
 * Shows up to 5 characters as a rail of portrait tiles (protagonist first), or
 * just an "add character" placeholder when the cast is empty. It's a summary,
 * not a manager: each tile links to that character's page; the overflow and
 * "add" placeholder link to the People page. Reuses the People page's <Portrait>
 * atom and its data seam (same TanStack query key). Layout is Tailwind; the
 * portrait chrome stays on the shared characters component.
 */
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { Portrait } from '../../characters/components/Portrait';
import { EMPTY_CAST, partitionByTier } from '../../characters/data';
import { queries } from '../../../queries';

const MAX = 5;

export function WorldCast() {
  const { projectId } = useParams();
  const peopleHref = `/project/${projectId}/characters`;

  const { data: cast = EMPTY_CAST } = useQuery({
    ...queries.characters(projectId),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  // Most-important-first: protagonist → main → supporting, then cap at 5.
  const { protagonist, main, supporting } = partitionByTier(cast.characters);
  const ordered = [...protagonist, ...main, ...supporting];
  const shown = ordered.slice(0, MAX);
  const overflow = ordered.length - shown.length;

  const tile = 'flex w-16 flex-col items-center gap-[7px] no-underline';
  const name = 'max-w-16 truncate text-center font-[family-name:var(--serif)] text-[12px] text-foreground';
  const disc = 'grid h-12 w-12 place-items-center rounded-full border-[1.5px] border-dashed border-[var(--line-3)] font-[family-name:var(--serif)] text-[var(--ink-3)]';

  return (
    <section className="mb-[26px]">
      <div className="mb-3 flex items-baseline">
        <Link className="ml-auto whitespace-nowrap text-[11px] font-semibold text-[var(--ink-3)] no-underline hover:text-[var(--terra-deep)]" to={peopleHref}>
          All people&nbsp;→
        </Link>
      </div>

      <div className="flex flex-wrap items-start gap-x-[18px] gap-y-2">
        {shown.map((c) => (
          <Link key={c.id} className={`${tile} group`} to={`${peopleHref}/${c.id}`} title={c.role || c.name}>
            <Portrait
              name={c.name.split(' ')[0]}
              size="round"
              tone={c.tier === 'protagonist' ? 'proto' : 'plain'}
              src={c.portrait_url}
            />
            <span className={`${name} group-hover:text-[var(--terra-deep)]`}>{c.name}</span>
          </Link>
        ))}

        {overflow > 0 && (
          <Link className={`${tile} group`} to={peopleHref}>
            <span className={`${disc} text-[15px] font-medium group-hover:border-[var(--terra-soft)] group-hover:text-[var(--terra-deep)]`}>+{overflow}</span>
            <span className={name}>more</span>
          </Link>
        )}

        {/* Wider than a portrait tile so "add character" isn't cut to "add chara…". */}
        <Link className="group flex min-w-16 flex-col items-center gap-[7px] no-underline" to={peopleHref}>
          <span className={`${disc} text-[26px] font-light group-hover:border-[var(--terra-soft)] group-hover:text-[var(--terra-deep)]`}>+</span>
          <span className="whitespace-nowrap text-center font-[family-name:var(--serif)] text-[12px] italic text-[var(--ink-3)]">add character</span>
        </Link>
      </div>
    </section>
  );
}

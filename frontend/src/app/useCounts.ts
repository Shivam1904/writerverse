/**
 * useCounts — the single, LIVE source of per-domain item counts.
 *
 * Replaces the shell's one-shot `Promise.all` snapshot (the old `presence`
 * useState + `usePresence` Zustand store). A count is NOT stored anywhere — it
 * is DERIVED from the same TanStack query caches the pages already hold. So:
 *
 *   • One source of truth per domain (the `[domain, pid]` cache line).
 *   • Counts can't drift from their lists — a count IS `list.length`.
 *   • Any write that invalidates a domain (chat / cron / button / another tab,
 *     via queryInvalidator) refetches the cache → every `useCounts` consumer
 *     re-renders together. Optimistic `setQueryData` writes update it instantly.
 *
 * The query keys + loaders here MATCH the pages' own queries, so TanStack
 * dedupes: the rail and the page share ONE fetch + ONE cache line. The two
 * domains no page subscribes to yet (outline, project_meta) are fetched fresh
 * here — cheap, and they become shared the moment those pages adopt useQuery.
 */
import { useQuery } from '@tanstack/react-query';
import { queries } from './queries';
import { candidateCharNames } from './pages/braindumps/components/entityTags';

export interface Counts {
  characters: number;
  threads: number;
  /** act count */
  outline: number;
  /** chapter count (derived from the same outline tree) */
  chapters: number;
  /** total beats across every scene in the outline tree */
  beats: number;
  braindumps: number;
  /** total characters of author text across every idea (body + subtext) — lets a
   *  few long ideas weigh as much as many short ones in the sort/add nudges */
  braindumpChars: number;
  /** total tags across every idea (labels + colour tags) — 0 means nothing
   *  has been categorised yet */
  ideaTags: number;
  /** char[Name] entities mentioned in braindump phrases that aren't a real
   *  Character yet — the candidates the "make your characters real" walk-along
   *  hint walks through one at a time. 0 ⇒ the hint retires. */
  candidateChars: number;
  /** 1 if a premise/synopsis has been written, else 0 */
  projectMeta: number;
  /** story-craft meta presence — each is how many are filled (0 = still missing).
   *  Drive the World "fill in your details" Night-Eyes hint's progressive
   *  checklist. genres/tones are arrays; perspective/tense/audience are 0|1. */
  genres: number;
  tones: number;
  perspective: number;
  tense: number;
  audience: number;
  /** world-rail gate: >0 when the World section has any substance — worldbuilding
   *  entries, a premise, or a cast (the rail shows all three). */
  world: number;
  /** worldbuilding rows ALONE (the `world` count above is an OR-gate that also
   *  folds in premise + cast). Gates the "flesh out your world" Night-Eyes hint. */
  worldEntries: number;
  /** gauges bound on the board (charts) — 0 means nothing's watching the story
   *  yet. Gates the "put a gauge on your story" onboarding nudges. */
  gaugesBound: number;
}

const ZERO: Counts = {
  characters: 0,
  threads: 0,
  outline: 0,
  chapters: 0,
  beats: 0,
  braindumps: 0,
  braindumpChars: 0,
  ideaTags: 0,
  candidateChars: 0,
  projectMeta: 0,
  genres: 0,
  tones: 0,
  perspective: 0,
  tense: 0,
  audience: 0,
  world: 0,
  worldEntries: 0,
  gaugesBound: 0,
};

/** Shared options — invalidation-driven, not polling. */
function opts(projectId: string | undefined) {
  return { enabled: !!projectId, staleTime: 60_000 } as const;
}

export function useCounts(projectId: string | undefined): { counts: Counts; loaded: boolean } {
  // Every query's key + fn comes from the central `queries` registry, so the
  // shell, pages, and rails share ONE cache line + ONE shape per domain (TanStack
  // dedupes). `opts` adds only per-consumer caching policy (enabled/staleTime).
  const characters = useQuery({ ...queries.characters(projectId), ...opts(projectId) });
  const threads = useQuery({ ...queries.plotThreads(projectId), ...opts(projectId) });
  const outline = useQuery({ ...queries.outline(projectId), ...opts(projectId) });
  const braindumps = useQuery({ ...queries.braindumps(projectId), ...opts(projectId) });
  const projectMeta = useQuery({ ...queries.projectMeta(projectId), ...opts(projectId) });
  const world = useQuery({ ...queries.world(projectId), ...opts(projectId) });
  // Gauge board — shares the gauge pages' ['gauges', pid, 'board'] cache, so the
  // "nothing's being gauged yet" onboarding nudges stay live with any bind/unbind.
  const gaugesBoard = useQuery({ ...queries.gaugesBoard(projectId), ...opts(projectId) });

  if (!projectId) return { counts: ZERO, loaded: true };

  const acts = (outline.data as any)?.acts ?? [];
  const chapters = acts.reduce((n: number, a: any) => n + (a?.chapters ?? []).length, 0);
  const beats = acts.reduce(
    (n: number, a: any) =>
      n +
      (a?.chapters ?? []).reduce(
        (m: number, c: any) =>
          m + (c?.scenes ?? []).reduce((k: number, s: any) => k + (s?.beats ?? []).length, 0),
        0,
      ),
    0,
  );
  const meta = (projectMeta.data as any) ?? {};

  const bdList = (braindumps.data as any[]) ?? [];
  const ideaTags = bdList.reduce((n: number, b: any) => n + (b?.tags ?? []).length, 0);
  const braindumpChars = bdList.reduce(
    (n: number, b: any) => n + String(b?.body ?? '').length + String(b?.subtext ?? '').length,
    0,
  );
  const charactersCount = ((characters.data as any)?.characters ?? []).length;
  const premise = (meta.synopsis || '').trim() ? 1 : 0;
  // Story-craft details — presence only (the hint's checklist just needs filled
  // vs missing per field, not the values).
  const genres = (meta.genres ?? []).length;
  const tones = (meta.tones ?? []).length;
  const perspective = (meta.perspective || '').trim() ? 1 : 0;
  const tense = (meta.tense || '').trim() ? 1 : 0;
  const audience = (meta.audience || '').trim() ? 1 : 0;
  const worldEntries = ((world.data as any)?.sections ?? []).reduce(
    (n: number, s: any) => n + ((s?.items ?? []).length), 0,
  );
  // Bound gauges = instances on the board. 0 ⇒ nothing's watching the story yet.
  const gaugesBound = ((gaugesBoard.data as any)?.charts ?? []).length;
  // Candidate chars = char[Name] entities in braindump phrases with no real
  // Character yet. Shares its derivation with the make-real hint card so the
  // gate and the name it offers can't drift.
  const candidateChars = candidateCharNames(
    bdList,
    ((characters.data as any)?.characters ?? []).map((c: any) => c?.name),
  ).length;

  const counts: Counts = {
    characters: charactersCount,
    threads: ((threads.data as any)?.threads ?? []).length,
    outline: acts.length,
    chapters,
    beats,
    braindumps: bdList.length,
    braindumpChars,
    ideaTags,
    candidateChars,
    projectMeta: premise,
    genres,
    tones,
    perspective,
    tense,
    audience,
    // OR-gate (see Counts.world): worldbuilding + premise + cast.
    world: worldEntries + premise + charactersCount,
    worldEntries,
    gaugesBound,
  };

  // "Loaded" = every domain has resolved at least once. Gates hint flashing +
  // the landing redirect, exactly like the old `presence.loaded`.
  const loaded =
    !characters.isLoading &&
    !threads.isLoading &&
    !outline.isLoading &&
    !braindumps.isLoading &&
    !projectMeta.isLoading;

  return { counts, loaded };
}

/**
 * Counts shaped as the `Record<string, number>` the existing consumers (hint
 * predicates, nav `ShellState`) read. Keeps their `counts[key]` lookups working
 * unchanged while the source moves from the snapshot to the live cache.
 */
export function useCountsRecord(
  projectId: string | undefined,
): { counts: Record<string, number>; loaded: boolean } {
  const { counts, loaded } = useCounts(projectId);
  return { counts: counts as unknown as Record<string, number>, loaded };
}

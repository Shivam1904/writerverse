/**
 * queries.ts — the ONE place every app domain's queryKey + queryFn is
 * defined. Pages, rails, and useCounts all import from here so they can't drift.
 *
 * Why this exists: TanStack keeps exactly ONE cache entry per key, and the first
 * observer to mount wins the stored SHAPE — so two `useQuery`s on the same key
 * with different queryFns (different return shapes) silently corrupt each other.
 * That bug hid the outline rail (useCounts stored loadOutline's wrapper, the rail
 * expected the bare tree). Sharing the loader, not just the key, makes that class
 * of bug structurally impossible: same import → same key → same fn → same shape.
 *
 * Two layers:
 *   • `qk.<domain>(pid)` — the KEY ALONE. Use at write sites (invalidateQueries,
 *     setQueryData, cancelQueries) that need the key but not the fetch.
 *   • `queries.<domain>(pid)` — `{ queryKey, queryFn }`, BUILT ON TOP of `qk` so
 *     the key can't disagree. Spread into useQuery: `useQuery({ ...queries.x(pid) })`.
 *
 * Deliberately NOT here: `enabled` / `staleTime` and other caching POLICY — that
 * is each consumer's call (different surfaces want different cadences). The
 * exceptions are the gauge reads (board, catalogue, presets): see below. This file
 * owns only the shape contract (key + fn). The keys match the backend staleness
 * domain names so queryInvalidator's domain→key mapping stays identity-ish.
 */
import { queryOptions } from '@tanstack/react-query';
import { loadCharacters } from './pages/characters/data';
import { loadThreads } from './pages/threads/data';
import { loadOutline } from './pages/outline/data';
import { loadBraindumps, loadBraindumpTagCategories } from './pages/braindumps/data';
import { loadWorld } from './pages/world/data';
import { loadCatalogue, loadPresets, loadRawBoard, normalizeBoard } from './pages/gauges/api';
import { callOp } from './gateway';

const pidStr = (projectId: unknown) => String(projectId ?? '');

const GAUGE_BOARD_STALE_MS = 60_000;

/** Keys only — for invalidateQueries / setQueryData / cancelQueries call sites. */
export const qk = {
  characters: (projectId?: unknown) => ['characters', pidStr(projectId)] as const,
  plotThreads: (projectId?: unknown) => ['plot_threads', pidStr(projectId)] as const,
  outline: (projectId?: unknown) => ['outline', pidStr(projectId)] as const,
  braindumps: (projectId?: unknown) => ['braindumps', pidStr(projectId)] as const,
  projectMeta: (projectId?: unknown) => ['project_meta', pidStr(projectId)] as const,
  world: (projectId?: unknown) => ['world', pidStr(projectId)] as const,
  // Project-independent config (the tag taxonomy) — one global cache entry.
  braindumpTagCategories: () => ['braindump_tag_categories'] as const,
  // The gauge board (bound gauges), stored RAW. The ONE key for it: every page,
  // lens kit and useCounts share this entry (SA-263).
  gaugesBoard: (projectId?: unknown) => ['gauges', pidStr(projectId), 'board'] as const,
  // The author's lens presets (the per-project half of the bank).
  gaugesPresets: (projectId?: unknown) => ['gauges', pidStr(projectId), 'presets'] as const,
  // The shared lens catalogue — static config, the same for every project, so ONE
  // global entry. Deliberately outside ['gauges', pid]: a `gauges` restale (every
  // bind, every World edit) must not refetch it (SA-261).
  gaugeCatalogue: () => ['gauge_catalogue'] as const,
};

/**
 * `{ queryKey, queryFn }` per domain. The queryFn defines the CANONICAL shape
 * stored under that key — every consumer of the key gets exactly this shape.
 *
 *   outline    → the bare grand-outline tree ({ acts }), NOT loadOutline's
 *                wrapper. useOutlineModel mutates this tree optimistically.
 *                It has NO scene prose (`scene.content`, SA-306): never read
 *                prose from this key. Write/Preview load it via loadWriteData.
 *   braindumps → the braindumps array (not the { braindumps } envelope).
 *   others     → their loader's full return.
 */
// Wrapped in `queryOptions` so the queryFn's return type flows through a spread
// into useQuery — `useQuery({ ...queries.x(pid) })` infers `data` correctly.
// (A plain object literal would widen and `data` would land as `unknown`.)
export const queries = {
  characters: (projectId?: unknown) =>
    queryOptions({ queryKey: qk.characters(projectId), queryFn: () => loadCharacters(projectId as any) }),
  plotThreads: (projectId?: unknown) =>
    queryOptions({ queryKey: qk.plotThreads(projectId), queryFn: () => loadThreads(projectId as any) }),
  outline: (projectId?: unknown) =>
    queryOptions({ queryKey: qk.outline(projectId), queryFn: () => loadOutline(projectId as any).then((d) => d.grandOutline) }),
  braindumps: (projectId?: unknown) =>
    queryOptions({ queryKey: qk.braindumps(projectId), queryFn: () => loadBraindumps(projectId as any).then((d) => d.braindumps ?? []) }),
  // Static key (same for every project) — the queryFn needs a projectId only
  // because the op route is project-scoped; the data is global.
  braindumpTagCategories: (projectId?: unknown) =>
    queryOptions({ queryKey: qk.braindumpTagCategories(), queryFn: () => loadBraindumpTagCategories(projectId as any) }),
  projectMeta: (projectId?: unknown) =>
    // A failed read is an error, not `{}`: the World page shows the story details
    // from here and must say "Couldn't load", not show them blank (SA-132).
    queryOptions({ queryKey: qk.projectMeta(projectId), queryFn: () => callOp(projectId as any, 'get_project_meta') }),
  // The world entries grouped into sections ({ sections }), no story details:
  // those come from `projectMeta`, so each refetches only on its own writes (SA-82).
  world: (projectId?: unknown) =>
    queryOptions({ queryKey: qk.world(projectId), queryFn: () => loadWorld(projectId as any) }),
  // The gauge board is read on almost every page (lens kit, threads, drawer,
  // counts). Its freshness lives HERE, not per consumer: one observer with
  // staleTime 0 refetches on every mount, and mixed policies on one key turned a
  // page load into 4–10 board reads (SA-263). Board changes still show up at
  // once — every bind/unbind/analysis invalidates the `gauges` domain.
  //   gaugesBoard     → the raw board (lens kit, threads, drawer, counts).
  //   gaugesBoardView → the same entry, normalized for the gauge chart pages.
  gaugesBoard: (projectId?: unknown) =>
    queryOptions({ queryKey: qk.gaugesBoard(projectId), queryFn: () => loadRawBoard(projectId as any), staleTime: GAUGE_BOARD_STALE_MS }),
  gaugesBoardView: (projectId?: unknown) =>
    queryOptions({ queryKey: qk.gaugesBoard(projectId), queryFn: () => loadRawBoard(projectId as any), staleTime: GAUGE_BOARD_STALE_MS, select: normalizeBoard }),
  // The lens bank, in two halves (SA-261). The catalogue is static config, so it
  // is fetched once per session and never goes stale. The presets are small and
  // follow the board's policy: a preset/bind write restales the `gauges` domain.
  // Join them with `useGaugeBank` (pages/gauges/hooks.ts).
  gaugeCatalogue: (projectId?: unknown) =>
    queryOptions({ queryKey: qk.gaugeCatalogue(), queryFn: () => loadCatalogue(projectId as any), staleTime: Infinity }),
  gaugesPresets: (projectId?: unknown) =>
    queryOptions({ queryKey: qk.gaugesPresets(projectId), queryFn: () => loadPresets(projectId as any), staleTime: GAUGE_BOARD_STALE_MS }),
};

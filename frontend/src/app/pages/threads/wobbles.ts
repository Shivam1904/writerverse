/**
 * Per-beat "wobble" (contradiction) index for a thread's beats.
 *
 * A lens analysis flags problem ticks in `chart.offending` — for a thread-walk
 * lens each offending `scene_id`/`tick_id` IS a thread beat's backend id
 * (ai_engine/gauges.py `_leaf_beats` → `b.id`). The lens's per-tick reading note
 * lives in `chart.data_points` (keyed by the same tick id). We fold every
 * watching lens into one map so a beat dot can light up red and its hover can
 * list the reasons from ANY lens.
 *
 * Pure + frontend-only: no backend change — the gauge board already carries it.
 */

export interface WobbleEntry {
  /** The lens that flagged this beat. */
  lensName: string;
  /** The lens's short reading note for this beat (≤15 words), if any. */
  reasoning?: string;
  /** Why the rule flagged it, e.g. "swings off the level", if any. */
  detail?: string;
}

const idOf = (x: any): string | null => {
  const v = x?.scene_id ?? x?.tick_id ?? x?.id;
  return v == null ? null : String(v);
};

/**
 * Fold the charts watching a thread into `beatId → WobbleEntry[]`. Only beats a
 * lens actually flagged appear as keys; a beat with no key has no wobble.
 */
export function wobblesByBeat(charts: any[]): Map<string, WobbleEntry[]> {
  const map = new Map<string, WobbleEntry[]>();
  for (const c of charts || []) {
    const offending = Array.isArray(c?.offending) ? c.offending : [];
    if (offending.length === 0) continue;
    const lensName = c?.name || c?.ref?.id || 'a lens';

    // index the lens's per-tick notes so a flagged beat can show its reasoning
    const noteById = new Map<string, any>();
    for (const d of c?.data_points || []) {
      const id = d?.tick_id ?? d?.scene_id;
      if (id != null) noteById.set(String(id), d);
    }

    for (const o of offending) {
      const beatId = idOf(o);
      if (!beatId) continue;
      const note = noteById.get(beatId);
      const entry: WobbleEntry = {
        lensName,
        reasoning: String(note?.reasoning || '').trim() || undefined,
        detail: String(o?.detail || o?.reason || '').trim() || undefined,
      };
      const arr = map.get(beatId);
      if (arr) arr.push(entry);
      else map.set(beatId, [entry]);
    }
  }
  return map;
}

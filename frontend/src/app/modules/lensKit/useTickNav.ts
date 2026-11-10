/* useTickNav — resolve a chart tick id (a chapter or scene id, as carried by an
 * offending finding's tick_id/scene_id) against the cached outline tree into a
 * human label + a /chapters?chap=&sc= deep-link.
 *
 *   · scene tick   → { label: scene text, crumb: chapter text, href: ?chap=<ch>&sc=<sc> }
 *   · chapter tick → { label: chapter text, crumb: act text,   href: ?chap=<ch> }
 *   · anything else (e.g. a thread beat tick) → null  (no chapters URL target)
 *
 * The outline tree is already cached (qk.outline) by the chapters / write pages,
 * so this rides that one query — no extra fetch in the common case. */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queries } from '../../queries';

export interface TickTarget {
  label: string;
  crumb?: string;
  href: string;
  kind: 'chapter' | 'scene';
}

export function useTickNav(projectId?: string) {
  const { data: outline } = useQuery({ ...queries.outline(projectId), enabled: !!projectId });

  const index = useMemo(() => {
    const map = new Map<string, TickTarget>();
    const pid = String(projectId ?? '');
    const base = `/project/${pid}/chapters`;
    for (const act of (outline as any)?.acts ?? []) {
      const actLabel = (act?.text || 'Untitled act').trim();
      for (const ch of act?.chapters ?? []) {
        const chId = String(ch?.id ?? '');
        if (!chId) continue;
        const chLabel = (ch?.text || 'Untitled chapter').trim();
        map.set(chId, {
          label: chLabel, crumb: actLabel, kind: 'chapter',
          href: `${base}?chap=${encodeURIComponent(chId)}`,
        });
        for (const sc of ch?.scenes ?? []) {
          const scId = String(sc?.id ?? '');
          if (!scId) continue;
          map.set(scId, {
            label: (sc?.text || 'Untitled scene').trim(), crumb: chLabel, kind: 'scene',
            href: `${base}?chap=${encodeURIComponent(chId)}&sc=${encodeURIComponent(scId)}`,
          });
        }
      }
    }
    return map;
  }, [outline, projectId]);

  return (tickId?: string | null): TickTarget | null =>
    tickId == null || tickId === '' ? null : index.get(String(tickId)) ?? null;
}

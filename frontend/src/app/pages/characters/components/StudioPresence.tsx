import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queries } from '../../../queries';

/**
 * StudioPresence — band ③. This character's presence along the manuscript.
 *
 * One bar per scene of prose, walking the grand outline in reading order
 * (act → chapter → scene). Bar HEIGHTS are REAL: how often this character is
 * referenced in that scene (see mentionsInScene). A scene with no recorded
 * mentions shows a thin sliver.
 */
const MAX_BARS = 120;

/** This character's references in one scene, from two sources:
 *  • `scene.mention_counts` — the author's @mentions in the prose, counted by the
 *    backend each time the scene's prose is saved (free, always on).
 *  • `scene.analysis.resolve_nouns` — names + pronouns the optional resolver tied
 *    back to them (off unless the author turns it on).
 *  The resolver also sees the @mentioned names, so adding the two would count
 *  them twice: take whichever source found more. */
function mentionsInScene(sc: any, charId: number): number {
  const explicit = Number(sc?.mention_counts?.character?.[String(charId)]) || 0;
  const rn = sc?.analysis?.resolve_nouns;
  if (!rn) return explicit;
  const hit = (m: any) => m?.entity_type === 'character' && Number(m?.entity_id) === charId;
  const resolved = (rn.mentions || []).filter(hit).length + (rn.resolved || []).filter(hit).length;
  return Math.max(explicit, resolved);
}

/** Per-scene mention counts, in the SAME order as the bars. The array length IS
 *  the real scene count. Empty when there's no character to read for. */
function presenceCounts(go: any, charId: number): number[] {
  if (!Number.isFinite(charId)) return [];
  const out: number[] = [];
  for (const a of go?.acts || []) for (const ch of a?.chapters || []) {
    for (const sc of ch?.scenes || []) out.push(mentionsInScene(sc, charId));
  }
  return out;
}

interface Props {
  projectId?: string;
  character: any;
}

export function StudioPresence({ projectId, character }: Props) {
  const { data: outline } = useQuery({
    ...queries.outline(projectId),
    enabled: !!projectId,
    staleTime: 60_000,
  });

  // Each scene's value is this character's REAL mention count (@mentions, or
  // names + resolved pronouns); the array length is the true scene count.
  const charId = Number(character?.id);
  const presence = useMemo(() => presenceCounts(outline, charId), [outline, charId]);
  const count = presence.length;
  const maxMentions = useMemo(() => presence.reduce((m, c) => Math.max(m, c), 0), [presence]);
  const totalMentions = useMemo(() => presence.reduce((m, c) => m + c, 0), [presence]);

  // Heights scale to the busiest scene; a 0-mention scene keeps a thin sliver so the
  // spine still reads as a full walk. Each bar carries its real count on hover.
  const bars = useMemo(
    () => presence.slice(0, MAX_BARS).map((c) => ({
      count: c,
      h: c === 0 ? 2 : 6 + Math.round((c / Math.max(1, maxMentions)) * 60),
    })),
    [presence, maxMentions],
  );

  return (
    <div className="cst-band">
      {/* "Across the manuscript" header — the Analysis / More mode tabs are hidden
          (per the Tony-page design); this band shows the presence bar graph only. */}
      <div className="cst-pres-head">
        {/* <span className="cst-band-lbl">Across the manuscript</span> */}
        {totalMentions === 0 && <span className="cst-fixture-tag">no mentions yet</span>}
        {/* <span className="cst-pres-rule" /> */}
      </div>

      {(
        <div className="cst-pres-row">
          <div className="cst-pres-main">
            {count > 0 ? (
              <>
                <div className="cst-pres-stat">
                  <b>{count}</b> scene{count !== 1 ? 's' : ''} of prose
                  {' · '}<b>{totalMentions}</b> mention{totalMentions !== 1 ? 's' : ''}
                </div>
                <div className={`cst-pres-wave${count <= 30 ? ' has-nums' : ''}`}>
                  {bars.map((b, i) => (
                    <div key={i} className="cst-pres-col">
                      <span
                        className={`cst-pres-bar${b.count === 0 ? ' is-empty' : ''}`}
                        style={{ height: b.h }}
                        title={`scene ${i + 1}: ${b.count} mention${b.count !== 1 ? 's' : ''}`}
                      />
                      {count <= 30 && <span className="cst-pres-num">{i + 1}</span>}
                    </div>
                  ))}
                  {count > MAX_BARS && <span className="cst-pres-more">+{count - MAX_BARS} more</span>}
                </div>
                {totalMentions === 0 && (
                  <div className="cst-band-note">
                    No mentions recorded yet — type <b>@</b> and their name in a scene on the Write page
                    and this fills in. (Turning on <b>Resolve nouns &amp; pronouns</b> also counts plain
                    names and pronouns.)
                  </div>
                )}
              </>
            ) : (
              <div className="cst-band-stub">
                No scenes in the outline yet.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

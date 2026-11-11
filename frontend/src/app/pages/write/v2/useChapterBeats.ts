import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queries } from '../../../queries';
import { aspectColor } from '../../../theme/aspects';
import { updateOutlineItem } from '../../outline/data';
import { receipt } from '../../../modules/receipt/receiptStore';
import type { OutlineActNode, WriteBeat } from '../data';

const UNDONE_MSG = "Couldn't save that change — undone";

export type BeatState = 'done' | 'todo' | 'suggested';

export interface ThreadMeta {
  id: string;
  name: string;
  color: string;
}

// Beat display-state seeds from the outline: a pending AI edit → "suggested";
// the persisted `written` flag → "done" (written into the chapter prose);
// everything else → "todo". The "done" tick is author-toggled and PERSISTED via
// update_outline_item's `written` field (see cycleBeat).
function deriveState(b: WriteBeat): BeatState {
  if (b.proposal) return 'suggested';
  if (b.written) return 'done';
  return 'todo';
}

/**
 * Lifts beat display-state and thread colors to the page so the scene margin
 * and the story rail render the same state and toggle in lockstep.
 */
export function useChapterBeats(
  projectId: string | undefined,
  acts: OutlineActNode[],
) {
  const [beatStates, setBeatStates] = useState<Record<string, BeatState>>({});

  // Thread colours come from the SAME resolved source the outline page reads
  // (queries.plotThreads → loadThreads → threadColor: explicit override →
  // character mirror → story default). The story rail + scene-margin beats then
  // carry each beat's owning-thread colour, identical to the outline.
  const { data: threadsData } = useQuery(queries.plotThreads(projectId));
  const loadedThreads = useMemo(
    () => ((threadsData as any)?.threads ?? []) as any[],
    [threadsData],
  );

  const allBeats = useMemo(() => {
    const out: WriteBeat[] = [];
    for (const a of acts)
      for (const c of a.chapters)
        for (const s of c.scenes) for (const b of s.beats) out.push(b);
    return out;
  }, [acts]);

  // Seed / merge display-states from the loaded outline, preserving any local
  // toggles the author made this session.
  useEffect(() => {
    setBeatStates((prev) => {
      const next = { ...prev };
      for (const b of allBeats) if (!(b.id in next)) next[b.id] = deriveState(b);
      return next;
    });
  }, [allBeats]);

  // id → {name, colour}. Threads from the resolved fetch keep their REAL colour;
  // a thread referenced by a beat but absent from the fetch falls back to the
  // story default (what threadColor() returns for an unknown thread) so a dash is
  // never left grey.
  const threadsById = useMemo(() => {
    const map: Record<string, ThreadMeta> = {};
    let i = loadedThreads.length;
    for (const t of loadedThreads) {
      const id = String(t.id);
      map[id] = { id, name: t.name || '', color: t.color || aspectColor('story') };
    }
    for (const b of allBeats) {
      if (b.thread) {
        const id = String(b.thread);
        if (!map[id]) { map[id] = { id, name: `Thread ${i + 1}`, color: aspectColor('story') }; i++; }
      }
    }
    return map;
  }, [loadedThreads, allBeats]);

  const colorFor = useCallback(
    (threadId?: string | null) =>
      threadId ? threadsById[String(threadId)]?.color || 'var(--ink-4)' : 'var(--ink-4)',
    [threadsById],
  );

  // Only threads actually referenced by a beat appear in the legend.
  const threads = useMemo(() => {
    const used = new Set(allBeats.map((b) => (b.thread ? String(b.thread) : '')).filter(Boolean));
    return Object.values(threadsById).filter((t) => used.has(t.id));
  }, [threadsById, allBeats]);

  // Toggle the "written into prose" tick. Optimistic local flip + persist the
  // `written` flag on the beat so it survives reload and surfaces on the grand
  // outline's beat marker.
  const cycleBeat = useCallback((id: string) => {
    setBeatStates((m) => {
      const prev = m[id];
      const written = prev !== 'done';
      // On failure, flip the tick back (unless it was toggled again meanwhile).
      if (projectId) updateOutlineItem(projectId, 'beat', id, { written }).catch(() => {
        receipt(UNDONE_MSG);
        setBeatStates((cur) => (cur[id] === (written ? 'done' : 'todo') ? { ...cur, [id]: prev } : cur));
      });
      return { ...m, [id]: written ? 'done' : 'todo' };
    });
  }, [projectId]);

  return { threadsById, threads, beatStates, cycleBeat, colorFor };
}

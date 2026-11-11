import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queries } from '../../queries';

/* ================================================================
 * D18 — Outline hash snapshots for change detection
 *
 * Two hashes per scene: text (title) and beats (concatenated beat
 * texts). On each visit we snapshot the hash map; on return we diff
 * current vs snapshot to derive added / edited / unchanged.
 * ================================================================ */

// ---- simple string hash (djb2) --------------------------------

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

// ---- types -----------------------------------------------------

interface SceneHash {
  textHash: string;
  beatsHash: string;
  words: number;
  title: string;
}

export interface OutlineSnapshot {
  timestamp: number;
  scenes: Record<string, SceneHash>;
  actCount: number;
  chapterCount: number;
  sceneCount: number;
}

export interface SceneDelta {
  id: string;
  title: string;
  words: number;
  kind: 'added' | 'text-edited' | 'beats-edited' | 'both-edited';
}

export interface OutlineDiff {
  lastVisit: Date;
  added: SceneDelta[];
  textEdited: SceneDelta[];
  beatsEdited: SceneDelta[];
  unchanged: number;
  wordsDelta: number;
}

// ---- extract hashes from live outline data ---------------------

function extractSceneHashes(outline: any): Record<string, SceneHash> {
  const out: Record<string, SceneHash> = {};
  if (!outline?.acts) return out;
  for (const act of outline.acts) {
    for (const ch of act.chapters ?? []) {
      for (const sc of ch.scenes ?? []) {
        // Pending AI proposals arrive as `insert` ghost beats. They aren't the
        // author's edits yet, so they don't count until accepted.
        const beats = (sc.beats ?? [])
          .filter((b: any) => !b.insert)
          .map((b: any) => `${b.id}:${b.kind}:${b.text ?? ''}`)
          .join('\n');
        out[sc.id] = {
          textHash: hash(sc.text ?? ''),
          beatsHash: hash(beats),
          words: sc.words ?? 0,
          title: sc.text ?? '(untitled)',
        };
      }
    }
  }
  return out;
}

function countStructure(outline: any): { acts: number; chapters: number; scenes: number } {
  let acts = 0, chapters = 0, scenes = 0;
  for (const act of outline?.acts ?? []) {
    acts++;
    for (const ch of act.chapters ?? []) {
      chapters++;
      scenes += (ch.scenes ?? []).length;
    }
  }
  return { acts, chapters, scenes };
}

// ---- localStorage persistence ----------------------------------

const STORAGE_KEY = (pid: string) => `wv:outline-snapshot:${pid}`;

const _prevCache: Record<string, OutlineSnapshot | null> = {};

function loadSnapshot(projectId: string): OutlineSnapshot | null {
  if (projectId in _prevCache) return _prevCache[projectId];
  try {
    const raw = localStorage.getItem(STORAGE_KEY(projectId));
    if (!raw) {
      _prevCache[projectId] = null;
      return null;
    }
    const snap = JSON.parse(raw);
    _prevCache[projectId] = snap;
    return snap;
  } catch {
    _prevCache[projectId] = null;
    return null;
  }
}

function saveSnapshot(projectId: string, snapshot: OutlineSnapshot) {
  try {
    localStorage.setItem(STORAGE_KEY(projectId), JSON.stringify(snapshot));
  } catch { /* quota exceeded — silent */ }
}

// ---- diff computation ------------------------------------------

function computeDiff(prev: OutlineSnapshot, current: Record<string, SceneHash>, currentWords: number): OutlineDiff {
  const added: SceneDelta[] = [];
  const textEdited: SceneDelta[] = [];
  const beatsEdited: SceneDelta[] = [];
  let unchanged = 0;
  const prevTotalWords = Object.values(prev.scenes).reduce((s, h) => s + h.words, 0);

  for (const [id, cur] of Object.entries(current)) {
    const old = prev.scenes[id];
    if (!old) {
      added.push({ id, title: cur.title, words: cur.words, kind: 'added' });
      continue;
    }
    const tChanged = cur.textHash !== old.textHash;
    const bChanged = cur.beatsHash !== old.beatsHash;
    if (tChanged && bChanged) {
      textEdited.push({ id, title: cur.title, words: cur.words, kind: 'both-edited' });
    } else if (tChanged) {
      textEdited.push({ id, title: cur.title, words: cur.words, kind: 'text-edited' });
    } else if (bChanged) {
      beatsEdited.push({ id, title: cur.title, words: cur.words, kind: 'beats-edited' });
    } else {
      unchanged++;
    }
  }

  return {
    lastVisit: new Date(prev.timestamp),
    added,
    textEdited,
    beatsEdited,
    unchanged,
    wordsDelta: currentWords - prevTotalWords,
  };
}

// ---- public API ------------------------------------------------

/**
 * Diff `outline` (the grand-outline tree) against the snapshot from the last
 * visit. `commitSnapshot` saves the current state as the new baseline; on a
 * first visit it has already been saved.
 */
export function diffOutline(projectId: string, outline: any): {
  diff: OutlineDiff | null;
  isFirstVisit: boolean;
  commitSnapshot: () => void;
} {
  const noop = () => {};
  if (!outline?.acts) return { diff: null, isFirstVisit: true, commitSnapshot: noop };

  const currentHashes = extractSceneHashes(outline);
  const currentWords = Object.values(currentHashes).reduce((s, h) => s + h.words, 0);
  const { acts, chapters, scenes } = countStructure(outline);
  const prev = loadSnapshot(projectId);

  const newSnapshot: OutlineSnapshot = {
    timestamp: Date.now(),
    scenes: currentHashes,
    actCount: acts,
    chapterCount: chapters,
    sceneCount: scenes,
  };

  const commit = () => saveSnapshot(projectId, newSnapshot);

  if (!prev) {
    commit();
    return { diff: null, isFirstVisit: true, commitSnapshot: noop };
  }

  const diff = computeDiff(prev, currentHashes, currentWords);

  return { diff, isFirstVisit: false, commitSnapshot: commit };
}

/**
 * The "welcome back — here's what changed" banner for a lens page. Reads the
 * SHARED outline cache (`queries.outline`), so it adds no outline fetch of its
 * own. Diffs once per visit, as soon as the outline is there, then saves the new
 * snapshot — later refetches during the same visit don't re-diff.
 */
export function useWelcomeBack(projectId: string | undefined): {
  welcomeCopy: WelcomeBackCopy | null;
  isFirstVisit: boolean;
} {
  const { data: outline } = useQuery({ ...queries.outline(projectId), enabled: !!projectId });
  const [state, setState] = useState<{ welcomeCopy: WelcomeBackCopy | null; isFirstVisit: boolean }>(
    { welcomeCopy: null, isFirstVisit: true },
  );
  const diffedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!projectId || !outline || diffedFor.current === projectId) return;
    diffedFor.current = projectId;
    const { diff, isFirstVisit, commitSnapshot } = diffOutline(projectId, outline);
    setState({ welcomeCopy: diff ? buildWelcomeCopy(diff) : null, isFirstVisit });
    commitSnapshot();
  }, [projectId, outline]);

  return state;
}

// ---- prose helpers for the welcome-back banner ------------------

/** When the author last left, as it reads after "You left …":
 *  "just now", "5 minutes ago", "yesterday at 8:41 pm", "on Monday at 8:41 pm",
 *  "on Oct 3 at 8:41 pm". (Fixes "You left on 2 minutes ago at …".) */
export function leftWhen(d: Date, now: Date = new Date()): string {
  const min = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} minute${min !== 1 ? 's' : ''} ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  const days = Math.floor(hrs / 24);
  if (days === 1) return `yesterday at ${time}`;
  if (days < 7) return `on ${d.toLocaleDateString('en-US', { weekday: 'long' })} at ${time}`;
  return `on ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${time}`;
}

/** The headline as HTML: the "when" in italics, the counts in bold. Scene
 *  titles inside it are the author's text, so it is escaped first. */
export function formatWelcomeHeadline(raw: string): string {
  return raw
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/You left (on )?([^.]+?)\./, (_, on = '', when) => `You left ${on}<em>${when}</em>.`)
    .replace(/you added (\w+ scenes?)/g, 'you added <b>$1</b>')
    .replace(/edited (\w+)/g, 'edited <b>$1</b>');
}

function numberWord(n: number): string {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  return n <= 10 ? words[n] : String(n);
}

function sceneNames(deltas: SceneDelta[], max: number): string {
  // Untitled scenes carry an empty title; joining them produced a leading-comma
  // artifact ("—, and 18 more"). Drop the blanks and only name real titles — the
  // count already lives in the "you added N scenes" clause, so an empty result
  // just omits the illustrative "— name, name" tail entirely.
  const names = deltas.map((d) => (d.title || '').trim()).filter(Boolean);
  if (names.length === 0) return '';
  if (names.length <= max) return names.join(' and ');
  return names.slice(0, max).join(', ') + ` and ${names.length - max} more`;
}

export interface WelcomeBackCopy {
  headline: string;
  addedCount: number;
  editedCount: number;
  wordsDelta: number;
  addedNames: string;
  editedNames: string;
}

export function buildWelcomeCopy(diff: OutlineDiff): WelcomeBackCopy {
  const when = leftWhen(diff.lastVisit);

  const addedN = diff.added.length;
  const editedN = diff.textEdited.length + diff.beatsEdited.length;

  let headline: string;
  if (addedN === 0 && editedN === 0) {
    headline = `You left ${when}. Nothing changed since then.`;
  } else {
    const parts: string[] = [];
    if (addedN > 0) {
      parts.push(`you added ${numberWord(addedN)} scene${addedN !== 1 ? 's' : ''}`);
    }
    if (editedN > 0) {
      parts.push(`edited ${numberWord(editedN)} scene${editedN !== 1 ? 's' : ''}`);
    }
    const changesStr = parts.join(' and ');

    const allChanged = [...diff.added, ...diff.textEdited, ...diff.beatsEdited];
    const nameStr = allChanged.length > 0 ? ` — ${sceneNames(allChanged, 2)}` : '';

    headline = `You left ${when}. Since then, ${changesStr}${nameStr}.`;
  }

  return {
    headline,
    addedCount: addedN,
    editedCount: editedN,
    wordsDelta: diff.wordsDelta,
    addedNames: sceneNames(diff.added, 3),
    editedNames: sceneNames([...diff.textEdited, ...diff.beatsEdited], 3),
  };
}

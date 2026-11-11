import { Avatar } from '../../../components/Avatar';
import { EntityMark, type EntityKind } from '../../../components/EntityMark';
import { GlossyStoryIcon } from '../../../components/StoryIconsRegistry';
import { ThreadedStoryIcon } from '../../../components/ThreadedStoryIcon';

/**
 * Shared plot-thread row — the collapsed thread mark used by BOTH the
 * Plot-threads secondary rail and the Grand-outline threads panel:
 * a scope mark + the thread name + a subtle scope label + a beat rail
 * (solid = covered, hollow-dashed = gap). Styling lives in app.css
 * (.wv2-thr*, .wv2-beat*).
 *
 * The lead mark is an ENTITY mark (glossy = a story thing, flat = a concept): the glossy
 * <Avatar> for a character scope, a glossy <EntityMark> (location / item /
 * thread) tinted in the thread colour for the rest — so a thread list never
 * mixes a glossy avatar with a flat line icon.
 */

// Beat rail — dots, capped at 10 with an ellipsis.
export function BeatRail({ beats }: { beats: any[] }) {
  // Headings are structure, not beats — skip them in the dot rail.
  const list = (beats ?? []).filter((b) => b?.kind !== 'heading');
  if (!list.length) return <span className="wv2-beats wv2-beats-empty">no beats yet</span>;
  const shown = list.slice(0, 10);
  const more = list.length - shown.length;
  return (
    <span className="wv2-beats" aria-hidden>
      {shown.map((b, i) => <i key={i} className={`wv2-beat${b?.covered ? '' : ' gap'}`} />)}
      {more > 0 && <span className="wv2-beats-more">…</span>}
    </span>
  );
}

export type ThreadVerdict = 'warn' | 'holds' | 'noting';

export function threadVerdict(t: any): ThreadVerdict {
  if (t.gaps > 0) return 'warn';
  if (t.total > 0) return 'holds';
  return 'noting';
}

export const THREAD_GROUPS: { key: string; verds: ThreadVerdict[]; label: string }[] = [
  { key: 'attention', verds: ['warn'], label: 'Open gaps' },
  { key: 'holding', verds: ['holds'], label: 'On track' },
  { key: 'noting', verds: ['noting'], label: 'Unplotted' },
];

// Group threads attention-first; only non-empty groups.
export function groupThreads(threads: any[]) {
  const withV = threads.map((t) => ({ t, v: threadVerdict(t) }));
  return THREAD_GROUPS
    .map((g) => ({ ...g, items: withV.filter((x) => g.verds.includes(x.v)).map((x) => x.t) }))
    .filter((g) => g.items.length > 0);
}

export function threadMetric(t: any): string {
  return t.total
    ? `${t.covered}/${t.total} beats${t.gaps > 0 ? ` · ${t.gaps} gap${t.gaps === 1 ? '' : 's'}` : ''}`
    : 'no beats yet';
}

// A thread's scope type → which glossy entity mark leads the row.
const SCOPE_MARK: Record<string, EntityKind> = {
  object: 'item', item: 'item', prop: 'item',
  location: 'location', place: 'location', setting: 'location',
  rule: 'rule', law: 'rule', constraint: 'rule',
  relationship: 'thread', theme: 'thread', motif: 'thread',
};

// A thread's scope → an entity-mark kind + a subtle label. `person` routes to
// the name-tinted <Avatar>; every other kind to a thread-tinted <EntityMark>.
export function scopeMeta(scope: any): { mark: EntityKind | 'story'; label: string } | null {
  if (!scope) return null;
  const type = String(scope.type || '').toLowerCase();
  const pair = Array.isArray(scope.pair) ? scope.pair.filter(Boolean) : null;
  const name = (pair && pair.length ? pair.join(' & ') : String(scope.name || '')).trim();
  if (!type && !name) return null;
  if (type === 'character') return { mark: 'person', label: name };
  if (type === 'story') {
    const low = name.toLowerCase();
    const label = (!name || low === 'story' || low === 'the whole story') ? 'Whole story' : name;
    return { mark: 'story', label };
  }
  if (pair && pair.length) return { mark: 'thread', label: name };
  return { mark: SCOPE_MARK[type] ?? 'thread', label: name || type };
}

// Resolve a scope to a thread HEADING — the lead entity mark + the connective
// shown before the title: "{Name}'s plot thread" for a named scope, "Story plot
// thread" for the whole story. null when the thread is unscoped (no prefix).
export function threadHeading(scope: any): { mark: EntityKind | 'story'; label: string; possessive: boolean } | null {
  const sm = scopeMeta(scope);
  if (!sm) return null;
  const type = String(scope?.type || '').toLowerCase();
  if (type === 'story') return { mark: sm.mark, label: 'Story', possessive: false };
  return { mark: sm.mark, label: sm.label, possessive: true };
}

// The thread "squiggle" — the flat thread mark used as the icon right before a
// thread's title in its heading. (ThreadBlock keeps its own copy that swaps to an
// eye in the analysis view; this is the plain shared one for previews + headings.)
export function ThreadGlyphMark({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M4 18c5 0 5-12 10-12 M4 6c5 0 5 12 10 12 M18 5v.01 M18 19v.01" />
    </svg>
  );
}



// The scope prefix shown before a thread's title: the glossy scope mark + a muted
// "{Name}'s plot thread" connective (the name emphasised). Renders nothing for an
// unscoped thread. `color` tints the non-person entity mark (defaults neutral).
export function ThreadScopePrefix({ thread, scope }: { thread?: any; scope?: any }) {
  const actualScope = scope || thread?.scope;
  const actualName = thread?.name || '';
  const actualColor = thread?.color;
  const h = threadHeading(actualScope);
  if (!h) return null;
  const isStory = String(actualScope?.type || '').toLowerCase() === 'story';
  return (
    <span className="">
      {!isStory ? (
        <ThreadedStoryIcon
          className="inline-flex align-middle"
          iconKey={h.mark}
          title={h.label}
          color={actualColor}
        />) : (
        <GlossyStoryIcon
          className="relative inline-flex shrink-0 align-middle"
          iconKey={'thread'}
          title={h.label}
          color={actualColor} />)
      }
      {actualName && (
        <span className="ml-1 ty-story-caption" style={{ color: actualColor, fontWeight: 'bold' }}>
          {actualName}
        </span>
      )}

      {!actualName && (
        <span className="ml-1 ty-story-caption" style={{ color: 'gray', fontWeight: 'bold' }}>
          Untitiled
        </span>
      )}
      {!isStory && (
        <div className="ml-1 ty-story-caption">
          {h.label.split(" ")[0]}'s thread
          <br />
        </div>
      )}
      {isStory && (
        <div className="ml-1 ty-story-caption">
          story thread
          <br />
        </div>
      )}

    </span>
  );
}

// The inner content of a thread row (lead mark + text + beat rail). The caller
// supplies the wrapper (a NavLink in the rail, a button in the outline panel)
// and sets `--thr-c` on it.
export function ThreadRowContent({ thread }: { thread: any }) {
  const sm = scopeMeta(thread.scope);
  const mark = sm?.mark ?? 'thread';
  return (
    <>
      <span className="wv2-thr-lead">
        {mark === 'person'
          ? <Avatar name={sm?.label || thread.name} size="sm" />
          : <EntityMark kind={mark} color="var(--thr-c)" size={22} title={sm?.label} />}
      </span>
      <span className="wv2-thr-text">
        <span className="wv2-thr-nm">{thread.name}</span>
        {sm?.label && <span className="wv2-thr-scope">{sm.label}</span>}
        <BeatRail beats={thread.beats} />
      </span>
    </>
  );
}

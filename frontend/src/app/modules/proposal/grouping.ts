import type { PendingProposal } from './useProposalStore';

/**
 * Pure grouping logic for the suggestions rail — no React, no CSS, so it's
 * trivially testable. The <ProposalGroupCard> component is the view over this.
 *
 * When a braindump extract (or a chat run) fans out into many same-kind
 * proposals, the rail shouldn't drown the author in a dozen identical "Birth
 * them" cards. At GROUP_THRESHOLD or more of one kind, those cards collapse into
 * a single grouped card summarising them ("Jane and Tina and one more character
 * are ready to be born."). Below the threshold they stay individual cards.
 */
export const GROUP_THRESHOLD = 3;

export interface GroupKind {
  key: string;
  noun: string;
  nounPlural: string;
  /** Plural-subject predicate — reads as "<subject> are <predicate>." */
  predicate: string;
  /** Optional singular-subject sentence override for repeated proposals aimed
   *  at one named thing (for example, many edits to one character). */
  singleSubjectSentence?: (name: string, count: number) => string;
  /** Collapse threshold for THIS kind. Defaults to GROUP_THRESHOLD (3). Lens
   *  suggestions group at 2 — a single pair is already worth folding. */
  threshold?: number;
  /** Present → this is a lens-suggestion group; the value is the subject TYPE
   *  the group covers, which drives the bespoke <ProposalGroupCard> design
   *  (a story-concept badge vs. a glossy avatar stack vs. a glossy item mark). */
  lens?: LensSubjectType;
  /** A lens group of INVENTED (bespoke) gauges — kept in its own bucket, apart
   *  from the template-fit suggestions, and titled "made for your …". */
  invented?: boolean;
}

const CHAR_BIRTH: GroupKind = { key: 'character-birth', noun: 'character', nounPlural: 'characters', predicate: 'ready to be born' };
const CHAR_EDITS: GroupKind = {
  key: 'character-edits',
  noun: 'character update',
  nounPlural: 'character updates',
  predicate: 'ready to review',
  threshold: 2,
  singleSubjectSentence: (name, count) =>
    `${name} has ${count} ${count === 1 ? 'character update' : 'character updates'} ready to review.`,
};
const WORLD: GroupKind = { key: 'world', noun: 'entry', nounPlural: 'entries', predicate: 'waiting to join your world' };
const THREAD: GroupKind = { key: 'thread', noun: 'thread', nounPlural: 'threads', predicate: 'ready to weave in' };
const OUTLINE: GroupKind = { key: 'outline', noun: 'beat', nounPlural: 'beats', predicate: 'ready to slot into your outline' };
// A batch of scene-prose paragraph edits — one AI turn fans into one proposal per
// paragraph; a pair already reads as one revision, so they fold at 2.
const SCENE_EDITS: GroupKind = { key: 'scene-edits', noun: 'prose change', nounPlural: 'prose changes', predicate: 'ready to apply', threshold: 2 };

// ── Lens suggestions ────────────────────────────────────────────────────────
// Each suggested lens is its OWN proposal (one row per recommendation). They group
// like the rest, but BY SUBJECT TYPE (the story / a character / a world item)
// and at a lower threshold (2) — and the group's face is the lens GLYPHS it
// carries, so the bespoke <ProposalGroupCard> renders a glyph row + a
// type-specific badge. Accepting a lens is "go look at it on the page", so the
// card navigates instead of running an op (see ProposalRailCard).

export type LensSubjectType = 'story' | 'character' | 'item';

// Capabilities known to be lens suggestions. We also sniff the payload (below)
// so a renamed/per-lens capability still groups without a code change.
export const LENS_SUGGEST_CAPS = new Set([
  // `suggest_gauges` fans into per-template fits (each
  // carries a lens_id + reason/fit_score, so it sniffs like the others), while
  // `suggest_custom_gauges` fans into bespoke INVENTED lenses — no template/lens
  // id at all, so isLensSuggestion recognises those by capability below.
  'suggest_gauges',
  'suggest_custom_gauges',
]);

// Gauge suggestions live on the `gauges` route (not the old `lenses` page); both
// caps navigate there. The invented one carries no template id — it wears the
// bespoke sparkle glyph and is named by its own `name` field.
export const GAUGE_SUGGEST_CAPS = new Set(['suggest_gauges', 'suggest_custom_gauges']);
export const GAUGE_INVENT_CAP = 'suggest_custom_gauges';

// An INVENTED (bespoke) lens vs a library-template fit the engine SUGGESTED.
// suggest_custom_gauges invents; every other lens-suggestion cap is a
// suggested fit. Drives the "Invented"/"Suggested" kicker AND the invented-only
// groups (so the label and the bucket always agree).
const LENS_INVENT_CAPS = new Set<string>([GAUGE_INVENT_CAP]);
export function isInventedLensCap(capability: string): boolean {
  return LENS_INVENT_CAPS.has(capability);
}

/** Is this proposal a single suggested lens? It must carry a template id (one
 *  lens per proposal) — that guard also keeps a nested payload
 *  (`{suggestions: {...}}`, no top-level template id) on the generic rendering. Given a template id, it counts if
 *  the capability is known OR the payload reads like a recommendation (reason /
 *  fit) — robust to the exact capability name the backend lands on. */
export function isLensSuggestion(capability: string, result: any): boolean {
  if (!result || typeof result !== 'object') return false;
  // An invented gauge (suggest_custom_gauges) is a bespoke spec with NO template
  // or lens id — recognise it by capability + the fields it always carries (its
  // display type and name). Everything else still requires a template/lens id.
  if (capability === GAUGE_INVENT_CAP) return !!(result.name && result.display);
  if (!result.template_id && !result.lens_id) return false;
  return (
    LENS_SUGGEST_CAPS.has(capability) ||
    result.fit_score != null ||
    !!result.reason ||
    !!result.why
  );
}

/** The lens's template id — drives the glyph (`glyphFor`). Empty for an invented
 *  gauge, which has no template (see `lensGlyphId`). */
export function lensTemplateId(result: any): string {
  return (result?.template_id || result?.lens_id || '') as string;
}

/** The glyph key for a suggested lens's leading mark. A template/library lens
 *  resolves to its bespoke metaphor glyph via the template id; an invented gauge
 *  has no template, so it wears the sparkle (`glyphFor('custom')`). */
export function lensGlyphId(capability: string, result: any): string {
  const tid = lensTemplateId(result);
  if (tid) return tid;
  return capability === GAUGE_INVENT_CAP ? 'custom' : '';
}

/** Display name for the lens. The original payload carried only a template id,
 *  so we humanise the slug when no explicit name is given (`power_corrupts` →
 *  "Power corrupts"). */
export function lensName(result: any): string {
  const explicit = pickStr(result, 'lens_name', 'title', 'heading');
  if (explicit) return explicit;
  const tid = lensTemplateId(result);
  // An invented gauge has no template slug to humanise — its display name is `name`.
  if (!tid) return pickStr(result, 'name') ?? 'Lens';
  const s = tid.replace(/[_.]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The thing this lens watches (a character / item name). Undefined for a
 *  whole-story lens. */
export function lensSubjectName(result: any): string | undefined {
  return pickStr(result, 'subject_name', 'scope_name', 'subject', 'character_name', 'name');
}

/** Which kind of subject the lens watches — drives both the group bucket and
 *  the bespoke group badge. Reads an explicit type field; falls back to "a named
 *  subject ⇒ character, else the whole story". */
export function lensSubjectType(result: any): LensSubjectType {
  const raw = (pickStr(result, 'subject_type', 'target', 'scope_type', 'lens_target') || '').toLowerCase();
  if (raw.startsWith('char') || raw === 'person' || raw === 'people') return 'character';
  if (raw === 'item' || raw === 'object' || raw === 'world' || raw === 'thing') return 'item';
  if (raw === 'story' || raw === 'plot' || raw === 'whole' || raw === 'overall') return 'story';
  return lensSubjectName(result) ? 'character' : 'story';
}

const LENS_STORY: GroupKind = { key: 'lens-story', noun: 'lens', nounPlural: 'lenses', predicate: 'watching your story', threshold: 2, lens: 'story' };
const LENS_PEOPLE: GroupKind = { key: 'lens-people', noun: 'lens', nounPlural: 'lenses', predicate: 'watching your cast', threshold: 2, lens: 'character' };
const LENS_WORLD: GroupKind = { key: 'lens-world', noun: 'lens', nounPlural: 'lenses', predicate: 'watching your world', threshold: 2, lens: 'item' };

// Invented (bespoke) gauges keep their OWN buckets — never folded in with the
// template-fit suggestions above. Same subject-type split + threshold; distinct
// keys so they never merge, and a "made for your …" voice (see lensGroupTitle).
const LENS_INVENTED_STORY: GroupKind = { key: 'lens-invented-story', noun: 'lens', nounPlural: 'lenses', predicate: 'made for your story', threshold: 2, lens: 'story', invented: true };
const LENS_INVENTED_PEOPLE: GroupKind = { key: 'lens-invented-people', noun: 'lens', nounPlural: 'lenses', predicate: 'made for your cast', threshold: 2, lens: 'character', invented: true };
const LENS_INVENTED_WORLD: GroupKind = { key: 'lens-invented-world', noun: 'lens', nounPlural: 'lenses', predicate: 'made for your world', threshold: 2, lens: 'item', invented: true };

/** The grouping kind for a proposal, or null if it should never group. Mirrors
 *  the per-capability/type logic the single card uses for its titles + labels. */
export function groupKindOf(capability: string, result: any): GroupKind | null {
  if (isLensSuggestion(capability, result)) {
    const invented = isInventedLensCap(capability);
    switch (lensSubjectType(result)) {
      case 'character': return invented ? LENS_INVENTED_PEOPLE : LENS_PEOPLE;
      case 'item': return invented ? LENS_INVENTED_WORLD : LENS_WORLD;
      default: return invented ? LENS_INVENTED_STORY : LENS_STORY;
    }
  }
  if (capability === 'run_init_elements') {
    switch (result?.type) {
      case 'character': return CHAR_BIRTH;
      case 'story': return THREAD;
      case 'item':
      case 'rule': return WORLD;
      default: return null;
    }
  }
  if (capability === 'add_character') return CHAR_BIRTH;
  // enrich_promoted_character (the enrichment after promote) and propose_character_edit
  // (Night Eyes' edit) both carry the character_edit shape, so they share a
  // dedicated character-update group in the rail.
  if (capability === 'enrich_promoted_character' || capability === 'propose_character_edit') {
    return CHAR_EDITS;
  }
  if (capability === 'add_worldbuilding') return WORLD;
  if (capability === 'generate_thread' || capability === 'generate_thread_from_description' || capability === 'run_user_wishes_rough') return THREAD;
  if (capability === 'add_outline_item') return OUTLINE;
  if (capability === 'propose_scene_edits') return SCENE_EDITS;
  return null;
}

function pickStr(obj: any, ...keys: string[]): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

/** Best display name for a proposal — the subject of the group sentence. For a
 *  lens suggestion that's WHO/WHAT it watches (a character or item name); the
 *  lens's own name lives in the card title instead. */
export function proposalName(result: any): string | undefined {
  if (!result || typeof result !== 'object') return undefined;
  // A lens suggestion's group subject is WHO/WHAT it watches — its scope, not its
  // own name. A template fit carries template_id/lens_id; an invented gauge is a
  // bespoke spec (display + scope_type) with neither.
  if (result.template_id || result.lens_id || (result.display && result.scope_type))
    return lensSubjectName(result);
  const t = result.type;
  const inner = t && result[t] && typeof result[t] === 'object' ? result[t] : null;
  return (
    pickStr(result, 'name', 'character_name', 'title', 'rough_title') ??
    (inner ? pickStr(inner, 'name', 'title') : undefined)
  );
}

/** "Jane and Tina and one more character are ready to be born." — named members
 *  lead, the overflow collapses to "and N more <noun>", unnamed members count. */
export function groupSentence(kind: GroupKind, names: string[], count: number): string {
  const unique = [...new Set(names)];
  if (kind.singleSubjectSentence && unique.length === 1) {
    return kind.singleSubjectSentence(unique[0], count);
  }
  const shown = names.slice(0, 2);
  const remaining = count - shown.length;
  let subject: string;
  if (shown.length === 0) {
    subject = `${count} ${kind.nounPlural}`;
  } else if (remaining > 0) {
    const moreNum = remaining === 1 ? 'one' : String(remaining);
    const moreNoun = remaining === 1 ? kind.noun : kind.nounPlural;
    subject = `${shown.join(' and ')} and ${moreNum} more ${moreNoun}`;
  } else {
    subject = shown.join(' and ');
  }
  return `${subject} are ${kind.predicate}.`;
}

// ── Rail item model — the rail renders a flat list of singles + groups ──────
export type RailItem =
  | { type: 'single'; proposal: PendingProposal }
  | { type: 'group'; key: string; kind: GroupKind; items: PendingProposal[] };

function groupBucketKey(capability: string, result: any): string | null {
  const kind = groupKindOf(capability, result);
  if (!kind) return null;
  if (kind.key === 'character-edits') {
    const characterId = result?.character_id;
    if (characterId != null) return `${kind.key}:${characterId}`;
  }
  return kind.key;
}

/** Collapse 3+ same-kind proposals into group items; everything else stays a
 *  single. Output order follows each kind's first appearance in `pending`. */
export function buildRailItems(pending: PendingProposal[]): RailItem[] {
  const buckets = new Map<string, { kind: GroupKind; items: PendingProposal[] }>();
  for (const p of pending) {
    const kind = groupKindOf(p.capability, p.result);
    const bucketKey = groupBucketKey(p.capability, p.result);
    if (!kind || !bucketKey) continue;
    const b = buckets.get(bucketKey) ?? { kind, items: [] };
    b.items.push(p);
    buckets.set(bucketKey, b);
  }
  const grouped = new Set(
    [...buckets.entries()]
      .filter(([, b]) => b.items.length >= (b.kind.threshold ?? GROUP_THRESHOLD))
      .map(([k]) => k),
  );

  const emitted = new Set<string>();
  const out: RailItem[] = [];
  for (const p of pending) {
    const key = groupBucketKey(p.capability, p.result);
    if (key && grouped.has(key)) {
      if (emitted.has(key)) continue;
      emitted.add(key);
      const b = buckets.get(key)!;
      out.push({ type: 'group', key, kind: b.kind, items: b.items });
    } else {
      out.push({ type: 'single', proposal: p });
    }
  }
  return out;
}

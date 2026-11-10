import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { PROPOSAL_SURFACES } from './registry';
import type { ProposalConflict } from './useProposalStore';
import {
  isLensSuggestion,
  isInventedLensCap,
  lensName,
  lensSubjectName,
  lensSubjectType,
  lensGlyphId,
  GAUGE_SUGGEST_CAPS,
} from './grouping';
import { glyphFor } from '../../pages/gauges/components/glyphs';
import { pageGlyph } from '../../pageGlyphs';
import { EntityMark, type EntityKind } from '../../components/EntityMark';

// ── Sentence-title emphasis grammar ───────────────────────────────────────
// Every proposal title is built from four kinds of word so the sentence parses
// at a glance — the treatments live in rightRail.css (.wv2-prop-em-*):
//   <Act>   the ACTION the AI proposes (watch / welcome / weave…) — gold shimmer
//   <Ent>   a glossy story ENTITY (person/item/place/rule/thread) — metallic, tinted
//           to its kind so the name matches its leading EntityMark
//   <Name>  the proper NAME of a flat concept artifact (a lens, a beat, the story)
//   <Tag>   a quiet TYPE/role qualifier (protagonist, section…)
// Connective words (on / across / for / into) stay plain card-ink.
type EntTint = EntityKind | 'story';
const Act = ({ children }: { children: ReactNode }) => (
  <span className="wv2-prop-em-act">{children}</span>
);
const Ent = ({ kind, children }: { kind: EntTint; children: ReactNode }) => (
  <span className={`wv2-prop-em-ent wv2-prop-em-ent--${kind}`}>{children}</span>
);
const Name = ({ children }: { children: ReactNode }) => (
  <span className="wv2-prop-em-name">{children}</span>
);
const Tag = ({ children }: { children: ReactNode }) => (
  <span className="wv2-prop-em-tag">{children}</span>
);

function pickStr(obj: any, ...keys: string[]): string | undefined {
  if (!obj) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return undefined;
}
function nested(result: any, key: string): any {
  const v = result?.[key];
  return v && typeof v === 'object' ? v : null;
}

function collectFieldLeaves(
  obj: any,
  prefix = '',
): Array<{ path: string; value: string | number | boolean }> {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [];
  const out: Array<{ path: string; value: string | number | boolean }> = [];
  for (const [key, raw] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      out.push(...collectFieldLeaves(raw, path));
      continue;
    }
    if (
      typeof raw === 'string' ||
      typeof raw === 'number' ||
      typeof raw === 'boolean'
    ) {
      out.push({ path, value: raw });
    }
  }
  return out;
}

const CHARACTER_FIELD_LABELS: Record<string, string> = {
  type: 'role',
  description: 'description',
  summary: 'summary',
  story: 'story arc',
  want: 'want',
  need: 'need',
  misbelief: 'misbelief',
  internal_arc: 'inner arc',
  external_arc: 'outer arc',
  pnote: 'private notes',
  status: 'status',
  relationship_notes: 'relationship notes',
  relationships: 'relationships',
  backstory: 'backstory',
  name: 'name',
  appearance: 'appearance',
  age: 'age',
  gender: 'gender',
  clothing: 'clothing',
  eyes: 'eyes',
  hair: 'hair',
  build: 'build',
  overall_style: 'overall style',
  home: 'home',
  worlditem: 'world detail',
  voice_profile: 'voice',
  tone: 'tone',
  style: 'style',
  lexicon: 'lexicon',
  pet_phrases: 'pet phrases',
  taboo_words: 'taboo words',
  sentence_length: 'sentence length',
};

function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function humanizeCharacterFieldKey(key: string): string {
  return CHARACTER_FIELD_LABELS[key] ?? key.replace(/_/g, ' ');
}

function humanizeCharacterFieldPath(path: string): string {
  const parts = path.split('.').filter(Boolean);
  if (parts.length === 0) return 'field';
  if (parts.length === 1) return humanizeCharacterFieldKey(parts[0]);
  return `${titleCase(humanizeCharacterFieldKey(parts[0]))} · ${humanizeCharacterFieldKey(parts[1])}`;
}

function summarizeCharacterFieldPaths(paths: string[]): string | undefined {
  const labels = [...new Set(paths.map(humanizeCharacterFieldPath).filter(Boolean))];
  if (labels.length === 0) return undefined;
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} & ${labels[1]}`;
  return `${labels[0]}, ${labels[1]} +${labels.length - 2} more`;
}

// surface.page like "characters.suggestions" → app section route segment.
// First segment names the domain; map any drift to the actual nav section id.
const PAGE_TO_SECTION: Record<string, string> = {
  characters: 'characters',
  outline: 'outline',
  threads: 'plot-threads',
  // The old lens/charts pages were removed; their proposals now land on the
  // gauges route (the lens/charts replacement).
  lenses: 'gauges',
  braindumps: 'braindumps',
  world: 'world',
  charts: 'gauges',
};

export function sectionForPage(page?: string): string | undefined {
  const head = page?.split('.')[0];
  return head ? PAGE_TO_SECTION[head] : undefined;
}

// run_init_elements fans out per element type — the destination is the element's
// real home (characters/threads/world), not the braindumps page that triggered it.
const INIT_ELEMENT_SECTION: Record<string, string> = {
  character: 'characters',
  story: 'plot-threads',
  item: 'world',
  rule: 'world',
};

/** Effective section for a proposal — accounts for fan-out capabilities whose
 *  target depends on the payload (run_init_elements) rather than just the
 *  registry's static page. */
export function sectionForProposal(capability: string, result: any): string | undefined {
  if (capability === 'run_init_elements') {
    const t = result?.type;
    if (t && INIT_ELEMENT_SECTION[t]) return INIT_ELEMENT_SECTION[t];
  }
  // A suggested lens always opens its bank/watching page instead of accepting —
  // the NEW gauge suggestions (incl. invented ones) live on the `gauges` route,
  // every other lens suggestion on the old `lenses` page.
  if (GAUGE_SUGGEST_CAPS.has(capability)) return 'gauges';
  if (isLensSuggestion(capability, result)) return 'lenses';
  return sectionForPage(PROPOSAL_SURFACES[capability]?.page);
}

// ── Entity mark ───────────────────────────────────────────────────────────
// The glossy 3D mark a proposal wears, drawn from the EntityMark family with
// a signature tint per entity type. A proposal about a story entity (a character / item / rule /
// thread / place) shows that entity's mark instead of the generic AI spark, so
// the card reads at a glance as "a character" vs "a thread". Proposals that
// aren't about an instance in the story (an outline beat, a multi-type extract)
// resolve to null and keep the spark.

/** Per-kind signature tint — mirrors the world rail's GROUP_COLOR so a proposal
 *  card and the rail show the same entity in the same colour. */
const MARK_TINT: Record<EntityKind, string> = {
  person: 'var(--terra)',
  item: 'var(--teal)',
  location: 'var(--teal)',
  rule: 'var(--sage)',
  thread: 'var(--mauve)',
};

/** A worldbuilding entry's kind, sniffed from its section/category — places get
 *  the location pin, rules the shield, everything else the gem. */
function worldbuildingKind(result: any): EntityKind {
  const s = (pickStr(result, 'section', 'category', 'block', 'type') ?? '').toLowerCase();
  if (/rule|law|magic/.test(s)) return 'rule';
  if (/place|location|realm|setting|region|land/.test(s)) return 'location';
  return 'item';
}

export function proposalEntityMark(
  capability: string,
  result: any,
): { kind: EntityKind; color: string } | null {
  let kind: EntityKind | null = null;
  if (capability === 'run_init_elements') {
    switch (result?.type) {
      case 'character': kind = 'person'; break;
      case 'story': kind = 'thread'; break; // an extracted "story" element is a plot thread
      case 'item': kind = 'item'; break;
      case 'rule': kind = 'rule'; break;
    }
  } else if (/character/.test(capability)) {
    kind = 'person';
  } else if (
    capability === 'add_worldbuilding' || capability === 'delete_worldbuilding'
    || capability === 'draft_world_entity'
  ) {
    kind = worldbuildingKind(result);
  } else if (/thread|rough/.test(capability)) {
    kind = 'thread';
  }
  return kind ? { kind, color: MARK_TINT[kind] } : null;
}

/**
 * ProposalRailCard — the rich, in-rail rendering of a pending proposal.
 *
 * Replaces the old floating bottom-right toast: pending proposals now live at
 * the top of the right rail's Suggestions section (proposals ARE suggestions —
 * NIGHT_EYES.md § "Suggestions are proposals"). Each card shows MORE than a bare
 * heading: a capability-specific detail block telling the author what's actually
 * being proposed, plus the accept/dismiss actions.
 *
 * Detail rendering is a small registry: a handful of CUSTOM blocks for the
 * capabilities whose payloads have a clear shape (generate-thread, add-mutation, cost),
 * and ONE GENERIC block that key/value-dumps anything else. Add a custom block
 * by dropping a renderer into DETAIL_BY_CAPABILITY; everything unmapped falls
 * through to <GenericDetail> automatically.
 */

interface ProposalCardData {
  capability: string;
  result: any;
  onAccept: () => void;
  onCancel: () => void;
  /** Last accept/reject failed: show a message + Retry instead of leaving. */
  error?: 'accept' | 'reject';
  /** Accept was refused: the author changed these fields after the AI suggested
   *  them (SA-209). Shows theirs vs the AI's with Use AI's / Keep mine. */
  conflicts?: ProposalConflict[];
  /** "Use AI's" — accept anyway, overwriting the author's newer value. */
  onForceAccept?: () => void;
}

function conflictText(v: unknown): string {
  if (v == null || v === '') return '(empty)';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.join(', ');
  return JSON.stringify(v);
}

/** The stale-accept panel: the author's current value next to the AI's, per
 *  changed field. Nothing was written; the author picks. */
function ConflictPanel({ conflicts, onUseAi, onKeepMine }: {
  conflicts: ProposalConflict[];
  onUseAi?: () => void;
  onKeepMine: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 py-1 text-xs" role="alert">
      <p className="font-medium">You changed this after the AI suggested it.</p>
      {conflicts.map((c) => (
        <div key={c.field} className="flex flex-col gap-1">
          <span className="capitalize text-muted-foreground">{c.field.replace(/[._]/g, ' ')}</span>
          <span><span className="font-medium">Yours: </span>{conflictText(c.current)}</span>
          <span><span className="font-medium">AI's: </span>{conflictText(c.proposed)}</span>
        </div>
      ))}
      <div className="flex justify-end gap-2">
        <button type="button" className="wv2-prop-btn"
          onClick={(e) => { e.stopPropagation(); onKeepMine(); }}>
          Keep mine
        </button>
        {onUseAi && (
          <button type="button" className="wv2-prop-btn wv2-prop-btn--primary"
            onClick={(e) => { e.stopPropagation(); onUseAi(); }}>
            Use AI's
          </button>
        )}
      </div>
    </div>
  );
}

// ── Title nodes ───────────────────────────────────────────────────────────
// Each function turns a proposal payload into a one-sentence title with the
// iconic fields (name + role/section/scope/etc) emphasised. The body of the
// card then just shows the description — the title carries the "what". When a
// title node returns null, the card falls back to the static inlineLabel.

function characterTitleNode(result: any): ReactNode | null {
  const inner = nested(result, 'character') ?? result;
  const fields = nested(result, 'fields') ?? {};
  const name = pickStr(result, 'name') ?? pickStr(inner, 'name');
  const role = pickStr(inner, 'role') ?? pickStr(fields, 'type') ?? pickStr(result, 'role');
  if (!name) return null;
  // character_edit = the promote enrichment (the cast row already exists).
  if (result?.type === 'character_edit') {
    return (
      <>
        <Act>Enriching</Act> <Ent kind="person">{name}</Ent>
        {role ? <> as a <Tag>{role}</Tag>.</> : <>.</>}
      </>
    );
  }
  return (
    <>
      <Act>Adding</Act> <Ent kind="person">{name}</Ent>
      {role ? <> as a <Tag>{role}</Tag>.</> : <> to your cast.</>}
    </>
  );
}

function addCharacterTitleNode(result: any): ReactNode | null {
  const name = pickStr(result, 'name');
  const role = pickStr(result, 'role');
  if (!name) return null;
  return (
    <>
      <Act>Inviting</Act> <Ent kind="person">{name}</Ent>
      {role ? <> as a <Tag>{role}</Tag>.</> : <> to your cast.</>}
    </>
  );
}

function addWorldbuildingTitleNode(result: any): ReactNode | null {
  const title = pickStr(result, 'name', 'title');
  const section = pickStr(result, 'section', 'category');
  if (!title) return null;
  return (
    <>
      <Act>Pinning</Act> <Ent kind={worldbuildingKind(result)}>{title}</Ent>
      {section ? <> into <Tag>{section}</Tag>.</> : <> to your world.</>}
    </>
  );
}

function deleteWorldbuildingTitleNode(result: any): ReactNode | null {
  const title = pickStr(result, 'name', 'title');
  if (!title) return null;
  return (
    <>
      <Act>Letting go of</Act> <Ent kind={worldbuildingKind(result)}>{title}</Ent>.
    </>
  );
}

/** "Make real" follow-up: an AI-drafted description for an existing world entry. */
function draftWorldEntityTitleNode(result: any): ReactNode | null {
  const name = pickStr(result, 'name');
  if (!name) return null;
  const block = pickStr(result, 'block');
  return (
    <>
      <Act>Describing</Act> <Ent kind={worldbuildingKind(result)}>{name}</Ent>
      {block ? <> in <Tag>{block}</Tag>.</> : <>.</>}
    </>
  );
}

function addOutlineItemTitleNode(result: any): ReactNode | null {
  const title = pickStr(result, 'name', 'title', 'text');
  if (!title) return null;
  return (
    <>
      <Act>Slotting</Act> <Name>{title}</Name> into your outline.
    </>
  );
}

function generateThreadTitleNode(result: any): ReactNode | null {
  const inner = nested(result, 'plot_thread') ?? result;
  const title = pickStr(inner, 'title') ?? pickStr(result, 'title');
  if (!title) return null;
  return (
    <>
      <Act>Drafting</Act> a plot thread: <Ent kind="thread">{title}</Ent>.
    </>
  );
}

function userWishesRoughTitleNode(result: any): ReactNode | null {
  const inner = nested(result, 'rough_outline') ?? result;
  const title = pickStr(inner, 'title') ?? pickStr(result, 'title');
  return (
    <>
      <Act>Sketching</Act> a rough plot{title ? <>: <Ent kind="thread">{title}</Ent></> : null}.
    </>
  );
}

function initStoryTitleNode(result: any): ReactNode | null {
  const inner = nested(result, 'story') ?? result;
  const title = pickStr(inner, 'title') ?? pickStr(result, 'title');
  if (!title) return null;
  return (
    <>
      <Act>Sketching</Act> your story: <Ent kind="thread">{title}</Ent>.
    </>
  );
}

function initItemTitleNode(result: any): ReactNode | null {
  const inner = nested(result, 'item') ?? result;
  const name = pickStr(result, 'name') ?? pickStr(inner, 'name');
  if (!name) return null;
  return (
    <>
      <Act>Adding</Act> <Ent kind="item">{name}</Ent> to your world.
    </>
  );
}

function initRuleTitleNode(result: any): ReactNode | null {
  const inner = nested(result, 'rule') ?? result;
  const scope = pickStr(inner, 'scope') ?? pickStr(result, 'scope');
  return (
    <>
      <Act>Adding</Act> a <Tag>rule</Tag>{scope ? <> for <Ent kind="rule">{scope}</Ent></> : null}.
    </>
  );
}

function mergeRoughTitleNode(result: any): ReactNode | null {
  // Fan-out: one proposal per placed beat — `{type:'outline_beat_insert',
  // scene_id, fields:{text, kind, …}}`. Render the single proposed beat.
  if (result?.type === 'outline_beat_insert') {
    const text = (result?.fields?.text || '').trim();
    if (!text) return null;
    return (<><Act>Place beat</Act>{' '}“{text}” into your outline.</>);
  }
  // Legacy whole-merge shape (kept defensively).
  const title = pickStr(result, 'rough_title');
  const count = result?.placed_count;
  if (!title || typeof count !== 'number') return null;
  const beatLabel = count === 1 ? 'beat' : 'beats';
  return (
    <>
      <Act>Sprinkled</Act>{' '}
      <span className="wv2-prop-merge-count">
        {count} {beatLabel}
      </span>{' '}
      from <Ent kind="thread">{title}</Ent> into your outline.
    </>
  );
}

/** A Night Eyes beat add/edit on a plot thread (`beat_insert` / `beat_edit`
 *  preview) — "Adding a beat to <thread>." / "Editing a beat in <thread>." */
function beatTitleNode(result: any): ReactNode | null {
  const thread = pickStr(result, 'thread_title');
  const where = thread ? <Ent kind="thread">{thread}</Ent> : <>a plot thread</>;
  if (result?.type === 'beat_insert') return <><Act>Adding</Act> a beat to {where}.</>;
  if (result?.type === 'beat_edit') return <><Act>Editing</Act> a beat in {where}.</>;
  return null;
}

/** A single suggested lens — "Watch <lens> on <subject>." The lens name is the
 *  iconic noun; the subject (a character/item) is the tag. A whole-story lens has
 *  no subject, so it reads "across your story". */
function lensSuggestTitleNode(result: any): ReactNode | null {
  const name = lensName(result);
  const subject = lensSubjectName(result);
  const stype = lensSubjectType(result);
  if (stype === 'story' || !subject) {
    return (
      <>
        <Act>Watch</Act> <Name>{name}</Name> across <Ent kind="story">your story</Ent>.
      </>
    );
  }
  return (
    <>
      <Act>Watch</Act> <Name>{name}</Name> on <Ent kind={stype === 'item' ? 'item' : 'person'}>{subject}</Ent>.
    </>
  );
}

/** A scene paragraph edit/insert — "Rewriting paragraph 3." / "Adding a
 *  paragraph." The index is 1-based for the author (the payload's is 0-based). */
function sceneEditTitleNode(result: any): ReactNode | null {
  const mode = result?.mode;
  const idx = typeof result?.index === 'number' ? result.index + 1 : null;
  if (mode === 'insert') {
    return (
      <>
        <Act>Adding</Act> a paragraph
        {idx ? <> at <Tag>position {idx}</Tag></> : null}.
      </>
    );
  }
  if (mode === 'edit') {
    return (
      <>
        <Act>Rewriting</Act> {idx ? <>paragraph <Tag>{idx}</Tag></> : <>a paragraph</>}.
      </>
    );
  }
  return null;
}

/** Per-capability custom title nodes — when present, replaces the static
 *  inlineLabel from the registry (and the title's `capitalize` transform). */
function titleNodeFor(capability: string, result: any): ReactNode | null {
  if (capability === 'propose_scene_edits') return sceneEditTitleNode(result);
  if (capability === 'run_init_elements') {
    const t = result?.type;
    if (t === 'character') return characterTitleNode(result);
    if (t === 'story') return initStoryTitleNode(result);
    if (t === 'item') return initItemTitleNode(result);
    if (t === 'rule') return initRuleTitleNode(result);
    return null;
  }
  // Single-character sibling of run_init_elements — same { type:'character', … }
  // shape, so it wears the same character title node + card body (below). Both the
  // promote enrichment and Night Eyes' edit-character land the character_edit shape.
  if (capability === 'enrich_promoted_character' || capability === 'propose_character_edit') {
    return characterTitleNode(result);
  }
  if (capability === 'add_character') return addCharacterTitleNode(result);
  if (capability === 'add_worldbuilding') return addWorldbuildingTitleNode(result);
  if (capability === 'delete_worldbuilding') return deleteWorldbuildingTitleNode(result);
  if (capability === 'draft_world_entity') return draftWorldEntityTitleNode(result);
  if (capability === 'add_outline_item') return addOutlineItemTitleNode(result);
  if (capability === 'generate_thread' || capability === 'generate_thread_from_description') return generateThreadTitleNode(result);
  if (capability === 'run_user_wishes_rough') return userWishesRoughTitleNode(result);
  if (capability === 'run_merge_rough_into_grand') return mergeRoughTitleNode(result);
  if (capability === 'propose_insert_beat' || capability === 'propose_update_beat') return beatTitleNode(result);
  return null;
}

/** Per-capability custom accept-button labels. Like titleNodeFor, this lets a
 *  fan-out capability whose target depends on the payload match its button to
 *  the element's actual type — run_init_elements produces story / character /
 *  item / rule from one capability, so a single static "Add to story" would
 *  mislabel three of the four. Returns undefined to fall back to the registry's
 *  static acceptLabel. */
function acceptLabelFor(capability: string, result: any): string | undefined {
  if (capability === 'run_init_elements') {
    switch (result?.type) {
      case 'character': return 'Birth them';
      case 'story': return 'Explore';
      case 'item': return 'Add to world';
      case 'rule': return 'Add the rule';
      default: return undefined;
    }
  }
  return undefined;
}

/** An "explore" proposal invites the author to OPEN and develop the result
 *  rather than silently commit it — today, the plot thread extracted from a
 *  braindump (run_init_elements type=story). These cards wear a distinct
 *  accent CTA ("Explore →"), tinted to the thread mark's mauve, instead of the
 *  plain flat accept text-button. */
export function isExploreProposal(capability: string, result: any): boolean {
  return capability === 'run_init_elements' && result?.type === 'story';
}

/** A navigate-only proposal's primary button does NOT commit — it just opens the
 *  page where the result already lives, leaving the proposal pending (Dismiss
 *  clears it). `explore` is one (a braindump's plot thread, inviting development). */
export function isNavigateOnlyProposal(capability: string, result: any): boolean {
  return isExploreProposal(capability, result);
}

// ── Detail blocks ─────────────────────────────────────────────────────────
// With title nodes carrying the iconic "what", these blocks now focus on
// the description / structured body content only.

/** Description / content snippet only — name + section live in the title. */
function MutationDetail({ result }: { result: any }) {
  const body = pickStr(result, 'description', 'content', 'summary', 'role');
  if (!body) return null;
  return (
    <div className="wv2-prop-detail">
      <p className="wv2-prop-snippet">{String(body)}</p>
    </div>
  );
}

/** Cost-confirm: says an AI run will happen. The "what" lives in the title now. */
function CostDetail({ result: _result }: { result: any }) {
  return (
    <div className="wv2-prop-detail">
      <p className="wv2-prop-cost">
        <span className="wv2-prop-cost-dot" aria-hidden="true">●</span>
        Runs an AI analysis.
      </p>
    </div>
  );
}

/** Merge: title carries the full sentence; body is empty. */
function MergeDetail(_: { result: any }) {
  return null;
}

// Beat-list display thresholds. A small thread shows every beat; a full rough
// outline (many phases + beats) would blow the rail card out, so past
// BEATS_FULL_MAX items we show a DIGEST instead and let the author click the
// card through to the page to review every beat.
const BEATS_FULL_MAX = 8; // ≤ this many beat items → render the full list
const BEATS_DIGEST_LEAD = 4; // flat (heading-less) digest → beats shown before "+N more"

/** One beat/heading <li>. Headings are small section labels; placeholders are
 *  italic-muted; everything else is a dot-bulleted beat. */
function beatRow(it: any, i: number) {
  const key = it?.id ?? i;
  const text = String(it?.text ?? '').trim();
  if (!text) return null;
  if (it?.kind === 'heading') {
    return <li key={key} className="wv2-prop-beat-head">{text}</li>;
  }
  const cls =
    it?.kind === 'placeholder' ? 'wv2-prop-beat wv2-prop-beat--ph' : 'wv2-prop-beat';
  return <li key={key} className={cls}>{text}</li>;
}

/** Group a flat item list into phases — beats counted under their preceding
 *  heading. Beats before the first heading fall under a blank-headed group. */
function beatPhases(items: any[]): Array<{ heading: string; count: number }> {
  const phases: Array<{ heading: string; count: number }> = [];
  let cur: { heading: string; count: number } | null = null;
  for (const it of items) {
    const text = String(it?.text ?? '').trim();
    if (it?.kind === 'heading') {
      cur = { heading: text, count: 0 };
      phases.push(cur);
    } else if (text) {
      if (!cur) {
        cur = { heading: '', count: 0 };
        phases.push(cur);
      }
      cur.count += 1;
    }
  }
  return phases;
}

/** Beat list for generate_thread / run_user_wishes_rough — both produce a flat
 *  items array of {kind: heading|text|placeholder, text}. Small payloads render
 *  in full as a lightly-bulleted list. Larger ones collapse to a DIGEST: the
 *  phase skeleton + per-phase beat counts (or the first few beats when the
 *  outline is flat), keeping the card glanceable — full review happens on the
 *  destination page the whole card already navigates to. */
function BeatsDetail({ result }: { result: any }) {
  const container =
    nested(result, 'plot_thread') ?? nested(result, 'rough_outline') ?? result;
  const items: any[] | undefined = container?.items;
  if (!Array.isArray(items)) return null;
  const clean = items.filter((it) => String(it?.text ?? '').trim().length > 0);
  if (clean.length === 0) return null;

  // Small enough — show every beat.
  if (clean.length <= BEATS_FULL_MAX) {
    return (
      <div className="wv2-prop-detail">
        <ul className="wv2-prop-beats">{clean.map(beatRow)}</ul>
      </div>
    );
  }

  // Digest. Prefer a phase skeleton; fall back to first-few beats when flat.
  const phases = beatPhases(clean);
  const headingCount = phases.filter((p) => p.heading).length;
  const beatCount = clean.filter((it) => it?.kind !== 'heading').length;

  if (headingCount === 0) {
    const lead = clean.slice(0, BEATS_DIGEST_LEAD);
    return (
      <div className="wv2-prop-detail">
        <ul className="wv2-prop-beats">{lead.map(beatRow)}</ul>
        <p className="wv2-prop-beats-more">
          +{clean.length - lead.length} more beats — open to review
        </p>
      </div>
    );
  }

  return (
    <div className="wv2-prop-detail">
      <ul className="wv2-prop-beats wv2-prop-beats--digest">
        {phases.map((p, i) => (
          <li key={i} className="wv2-prop-beat-head wv2-prop-beat-head--digest">
            <span className="wv2-prop-beat-head-text">{p.heading || 'Opening'}</span>
            {p.count > 0 && <span className="wv2-prop-beat-ct">{p.count}</span>}
          </li>
        ))}
      </ul>
      <p className="wv2-prop-beats-more">
        {headingCount} {headingCount === 1 ? 'phase' : 'phases'} · {beatCount} beats — open to review
      </p>
    </div>
  );
}

/** A SINGLE extracted element (story / character / item / rule) — the per-type
 *  fan-out of run_init_elements. Title carries the name; body is description. */
function ElementDetail({ result }: { result: any }) {
  const type: string = result?.type || '';
  let description: string | undefined;
  let fieldSummary: string | undefined;
  if (type === 'character') {
    const inner = nested(result, 'character') ?? result;
    description = pickStr(inner, 'description') ?? pickStr(result, 'description');
  } else if (type === 'character_edit') {
    const fields = nested(result, 'fields') ?? {};
    const leaves = collectFieldLeaves(fields);
    fieldSummary = summarizeCharacterFieldPaths(leaves.map((leaf) => leaf.path));
    description = pickStr(fields, 'description') ?? pickStr(fields, 'story');
    if (!description && leaves.length > 0) {
      const first = leaves.find((leaf) => typeof leaf.value === 'string' && String(leaf.value).trim())
        ?? leaves[0];
      description = String(first.value);
    }
  } else if (type === 'story') {
    const inner = nested(result, 'story') ?? result;
    description = pickStr(inner, 'summary');
  } else if (type === 'rule') {
    const inner = nested(result, 'rule') ?? result;
    description = pickStr(result, 'text') ?? pickStr(inner, 'text');
  } else if (type === 'item') {
    const inner = nested(result, 'item') ?? result;
    description = pickStr(inner, 'description');
  }
  if (!description && !fieldSummary) return null;
  return (
    <div className="wv2-prop-detail">
      {fieldSummary && (
        <p className="wv2-prop-lede wv2-prop-lede--field">
          <span className="wv2-prop-field-verb">Updating</span>{' '}
          <span className="wv2-prop-field-name">{fieldSummary}</span>
        </p>
      )}
      {description && <p className="wv2-prop-snippet wv2-prop-snippet--proposal">{String(description)}</p>}
    </div>
  );
}

/** A single suggested lens — why it fits, plus a quiet fit-strength bar. The
 *  lens name + subject live in the title; the glyph leads the header. */
function LensSuggestDetail({ result }: { result: any }) {
  // `reason` is the grounded "why it fits"; an invented gauge's `watches` line is
  // the fallback when no reason came back.
  const why = pickStr(result, 'reason', 'why', 'description', 'watches');
  const fit = typeof result?.fit_score === 'number' ? result.fit_score : null;
  if (!why && fit == null) return null;
  const pct = fit == null ? null : Math.max(0, Math.min(100, Math.round(fit * 100)));
  return (
    <div className="wv2-prop-detail">
      {why && <p className="wv2-prop-snippet">{why}</p>}
      {pct != null && (
        <div className="wv2-prop-fit" title={`fit ${pct}%`}>
          <span className="wv2-prop-fit-track">
            <span className="wv2-prop-fit-fill" style={{ width: `${Math.max(6, pct)}%` }} />
          </span>
          <span className="wv2-prop-fit-num">
            {pct}
            <small>% fit</small>
          </span>
        </div>
      )}
    </div>
  );
}

/** Scene prose edit — the paragraph's old text struck through above the new
 *  prose. An insert has no old text, so it shows just the new paragraph. */
function ProseDetail({ result }: { result: any }) {
  const oldText = typeof result?.old_text === 'string' ? result.old_text.trim() : '';
  const newText = typeof result?.new_text === 'string' ? result.new_text.trim() : '';
  if (!newText && !oldText) return null;
  return (
    <div className="wv2-prop-detail wv2-prop-prose">
      {oldText && <p className="wv2-prop-prose-old">{oldText}</p>}
      {newText && <p className="wv2-prop-prose-new">{newText}</p>}
    </div>
  );
}

/** A beat add/edit — the proposed beat text (the thread lives in the title). A
 *  kind-only edit has no text, so it says what the beat becomes instead. */
function BeatChangeDetail({ result }: { result: any }) {
  const fields = nested(result, 'fields') ?? {};
  const text = pickStr(fields, 'text');
  const kind = pickStr(fields, 'kind');
  const body = text ?? (kind ? `Turn it into a ${kind}.` : undefined);
  if (!body) return null;
  return (
    <div className="wv2-prop-detail">
      <p className="wv2-prop-snippet wv2-prop-snippet--proposal">{body}</p>
    </div>
  );
}

/** The words an author sees for a payload field. A card only ever labels a
 *  field from this list: payloads also carry envelope keys (`type`, ids) whose
 *  names are internal, so an unlisted key is never shown. */
const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  title: 'Title',
  description: 'Description',
  content: 'Description',
  summary: 'Summary',
  synopsis: 'Synopsis',
  logline: 'Logline',
  text: 'Text',
  role: 'Role',
  section: 'Section',
  block: 'Section',
  category: 'Category',
  genres: 'Genres',
  themes: 'Themes',
  tones: 'Tones',
  perspective: 'Point of view',
  tense: 'Tense',
  audience: 'Audience',
};

function FieldList({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="wv2-prop-detail">
      <dl className="wv2-prop-fields">
        {rows.map(([k, v]) => (
          <div key={k} className="wv2-prop-field">
            <dt>{FIELD_LABELS[k]}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Labelled, non-empty rows for the fields an author can read; anything else
 *  (envelope `type`, ids, unknown keys) is dropped. */
function labelledRows(obj: Record<string, unknown>, max: number): Array<[string, string]> {
  return Object.entries(obj)
    .filter(([k]) => k in FIELD_LABELS)
    .map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v] as [string, unknown])
    .filter((row): row is [string, string] => typeof row[1] === 'string' && row[1].trim().length > 0)
    .slice(0, max);
}

const NOTHING_TO_SHOW = <p className="wv2-prop-snippet">A change is ready for your review.</p>;

/** Story-details edit (meta_edit) — the proposed fields themselves, not the
 *  envelope. Without this the card degrades to the generic dump and shows
 *  `type: meta_edit / project id: 8` — developer keys — while the actual
 *  premise text stays hidden (UX_FINDINGS 2026-07-02 F1.1). */
function MetaEditDetail({ result }: { result: any }) {
  const fields = nested(result, 'fields');
  const rows = fields ? labelledRows(fields, 6) : [];
  return rows.length ? <FieldList rows={rows} /> : NOTHING_TO_SHOW;
}

/** Fallback — the payload's readable fields under plain labels. */
function GenericDetail({ result }: { result: any }) {
  const rows = result && typeof result === 'object' ? labelledRows(result, 4) : [];
  return rows.length ? <FieldList rows={rows} /> : NOTHING_TO_SHOW;
}

// capability → custom detail block. Anything unmapped uses <GenericDetail>.
const DETAIL_BY_CAPABILITY: Record<string, (p: { result: any }) => ReactNode> = {
  add_character: MutationDetail,
  add_worldbuilding: MutationDetail,
  add_outline_item: MutationDetail,
  delete_worldbuilding: MutationDetail,
  draft_world_entity: MutationDetail,
  run_init_elements: ElementDetail,
  enrich_promoted_character: ElementDetail,
  propose_character_edit: ElementDetail,
  run_merge_rough_into_grand: MergeDetail,
  generate_thread: BeatsDetail,
  generate_thread_from_description: BeatsDetail,
  run_user_wishes_rough: BeatsDetail,
  propose_scene_edits: ProseDetail,
  update_project_meta: MetaEditDetail,
  propose_insert_beat: BeatChangeDetail,
  propose_update_beat: BeatChangeDetail,
};

// confirmType → fallback detail block when the capability isn't custom-mapped.
function detailForConfirmType(confirmType?: string) {
  if (confirmType === 'cost_confirm') return CostDetail;
  if (confirmType === 'mutation_confirm') return MutationDetail;
  return GenericDetail;
}

// run_init_elements fans out per element — each card is titled by its element's
// own kind (story → "thread") rather than the generic "Extracted elements".
const INIT_ELEMENT_LABEL: Record<string, string> = {
  story: 'Extracted thread',
  character: 'Extracted character',
  item: 'Extracted item',
  rule: 'Extracted rule',
};

export function ProposalRailCard({
  capability, result, onAccept, onCancel, error, conflicts, onForceAccept,
}: ProposalCardData) {
  const surface = PROPOSAL_SURFACES[capability];
  // Never the raw capability name: an unmapped one reads as a plain suggestion.
  let label = surface?.inlineLabel ?? 'AI suggestion';
  if (capability === 'run_init_elements' && INIT_ELEMENT_LABEL[result?.type]) {
    label = INIT_ELEMENT_LABEL[result.type];
  }
  const acceptLabel = acceptLabelFor(capability, result) ?? surface?.acceptLabel ?? 'Accept';
  const mark = proposalEntityMark(capability, result);
  const explore = isExploreProposal(capability, result);
  const navigateOnly = isNavigateOnlyProposal(capability, result);

  // A suggested lens isn't a write — "accepting" it means going to look at it on
  // the page. So the card NAVIGATES instead of running an op: the primary button
  // (and the whole card) just opens the lenses page, the lens glyph leads the
  // header, and the body becomes why-it-fits + a fit bar.
  const isLens = isLensSuggestion(capability, result);

  const Detail = isLens
    ? LensSuggestDetail
    : (DETAIL_BY_CAPABILITY[capability] ?? detailForConfirmType(surface?.confirmType));
  const titleNode = isLens ? lensSuggestTitleNode(result) : titleNodeFor(capability, result);

  const navigate = useNavigate();
  const { projectId } = useParams();
  const section = sectionForProposal(capability, result);
  // The page this card opens, drawn from the global page-glyph config — shown as
  // a quiet indicator in the card's bottom-left so the destination reads at a
  // glance (the whole card already navigates there on click).
  const glyph = pageGlyph(section);
  const DestIcon = glyph?.icon;
  const goToPage = () => {
    if (projectId && section) navigate(`/project/${projectId}/${section}`);
  };

  // Exit choreography — the card plays its own animation BEFORE the store removes
  // it. Accept gives a confirming pop, then lifts away; the real onAccept +
  // navigate fire on animationend. Dismiss "smokes out" (blur + dissolve), then
  // onCancel. A navigate-only card (explore) is never an acceptance,
  // so it just navigates and the card stays pending — no exit. Reduced-motion
  // skips straight to the action so nothing stalls waiting on an animation that
  // won't play.
  const [exit, setExit] = useState<'accept' | 'reject' | null>(null);
  const reducedMotion =
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  // A failed call leaves the card in place: undo the exit animation.
  useEffect(() => { if (error || conflicts) setExit(null); }, [error, conflicts]);

  const beginAccept = () => {
    if (exit) return;
    if (reducedMotion) { onAccept(); goToPage(); return; }
    setExit('accept');
  };
  const beginReject = () => {
    if (exit) return;
    if (reducedMotion) { onCancel(); return; }
    setExit('reject');
  };

  const cls =
    `wv2-prop-card${explore ? ' wv2-prop-card--explore' : ''}` +
    (exit === 'accept' ? ' is-accepting' : exit === 'reject' ? ' is-rejecting' : '');

  return (
    <article
      className={cls}
      role={section ? 'button' : undefined}
      tabIndex={section ? 0 : undefined}
      onClick={section ? goToPage : undefined}
      onKeyDown={
        section
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                goToPage();
              }
            }
          : undefined
      }
      onAnimationEnd={(e) => {
        // Only react to the card's OWN exit animation (not a descendant's).
        if (e.target !== e.currentTarget || !exit) return;
        if (exit === 'accept') { onAccept(); goToPage(); }
        else onCancel();
      }}
      style={section ? { cursor: 'pointer' } : undefined}
    >
      <header className="wv2-prop-card-head">
        {isLens ? (
          <span className="wv2-prop-lensmark" aria-hidden="true">
            <svg viewBox="0 0 24 24">{glyphFor(lensGlyphId(capability, result))}</svg>
          </span>
        ) : mark ? (
          <EntityMark kind={mark.kind} color={mark.color} size={20} className="wv2-prop-mark" />
        ) : (
          <span className="wv2-prop-spark" aria-hidden="true">&#10022;</span>
        )}
        {isLens ? (
          <span className="wv2-prop-lens-headmain">
            <span className="wv2-prop-lens-kicker">
              {isInventedLensCap(capability)
                ? <><span className="wv2-prop-kicker-spark" aria-hidden="true">✦</span>Invented</>
                : 'Suggested'}
            </span>
            <span className="wv2-prop-title">{titleNode ?? label}</span>
          </span>
        ) : (
          <span className={titleNode ? 'wv2-prop-title' : 'wv2-prop-title capitalize'}>
            {titleNode ?? label}
          </span>
        )}
        {/* {typeChip && <span className="wv2-prop-kind">{typeChip}</span>} */}
      </header>

      <Detail result={result} />

      {error && (
        <div className="flex items-center justify-between gap-2 py-1 text-xs text-destructive" role="alert">
          {error === 'accept' ? "Couldn't accept this." : "Couldn't dismiss this."}
          <button
            type="button"
            className="wv2-prop-btn"
            onClick={(e) => { e.stopPropagation(); (error === 'accept' ? onAccept : onCancel)(); }}
          >
            Retry
          </button>
        </div>
      )}

      {conflicts && (
        <ConflictPanel conflicts={conflicts} onUseAi={onForceAccept} onKeepMine={onCancel} />
      )}

      {!conflicts && <div className="wv2-prop-actions">
        {DestIcon && glyph && (
          <span
            className="wv2-prop-dest"
            title={`Opens ${glyph.label}`}
            aria-label={`Opens ${glyph.label}`}
          >
            <DestIcon size={14} strokeWidth={1.8} />
          </span>
        )}
        <button
          type="button"
          className="wv2-prop-btn"
          onClick={(e) => { e.stopPropagation(); beginReject(); }}
        >
          Dismiss
        </button>
        <button
          type="button"
          className={
            explore
              ? 'wv2-prop-btn wv2-prop-btn--primary wv2-prop-btn--explore'
              : 'wv2-prop-btn wv2-prop-btn--primary'
          }
          onClick={(e) => {
            e.stopPropagation();
            // A navigate-only proposal (explore) or a lens suggestion is an
            // invitation, not an acceptance — just open the page and leave it
            // pending (no exit animation). Every other card plays its accept
            // animation, then accepts + navigates.
            if (navigateOnly || isLens) goToPage();
            else beginAccept();
          }}
        >
          {isLens ? 'Show me' : acceptLabel}
          {navigateOnly && <ArrowRight size={12} strokeWidth={2.2} aria-hidden="true" />}
        </button>
      </div>}
    </article>
  );
}

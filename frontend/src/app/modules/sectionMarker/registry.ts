import { buildArn } from './arn';

/**
 * Marker / ARN registry — THE single source of truth for every section node.
 *
 * Pure nested tree: a page, a section, and a subsection are all the same shape
 * (`MarkerNode`) — a section is just a node that happens to have `children`. The
 * ARN is the path of keys to a node (`page:id:section:sub:…`), derived at render
 * time, never hardcoded.
 *
 * This registry is THE ARN MAP: the one list of every ARN. Each node co-locates, in
 * one declaration, everything a section node owns — so chip ↔ heading ↔ fields ↔
 * REST ↔ lenses ↔ ideas never drift across four different files:
 *
 *   · label         — friendly name (chip / popover title)
 *   · description   — free-text note
 *   · intent        — desc split by author intent (`human`) vs what Night Eyes
 *                     does with it (`ai`) — the "intent — human, ai" layer
 *   · hints         — short authoring prompts shown under the heading
 *   · fields        — the data fields this node owns (name + label). The editable
 *                     form + per-field AI proposals render off these.
 *   · ideaTags      — braindump craft tags whose phrases feed this node's idea
 *                     box (absorbed from the old SECTION_TAGS in studioIdeas.ts,
 *                     which now derives FROM here).
 *   · lensQuestions — keys into `lensQuestions.ts`; the lenses a node can attach.
 *                     `sectionLens` already resolves its picker off these.
 *   · data          — the REST binding (read op, write path, propose/accept/reject
 *                     ops, field aliases). Declared once on the page node and
 *                     INHERITED by children; a child overrides only when it speaks
 *                     a different API (outline:thread → beats, lenses → gauges).
 *   · children      — nested nodes (recursive)
 *
 * To add markers to a new page: add a page node here, then drop <SectionMarker
 * section="…" sub="…" /> on its headings. Nothing else references ARN strings.
 */
export interface MarkerField {
  /** underlying data field path, e.g. "appearance.age" */
  name: string;
  label: string;
}

/**
 * REST binding for a node's fields — the "rest calls" layer of the ARN map.
 * Declared on the page node and inherited; children override for a different API.
 * Declarative ONLY — this records the contract so the map is self-documenting;
 * the live write path (useCharacterFields, ThreadBeats, sectionLens) is wired
 * separately and should be read against this, not duplicated from it.
 */
export interface ArnDataBinding {
  /** op that reads the node's values + pending proposals (wrapped cells). */
  read?: string;
  /** direct WRITE resource for surgical field patches (Route.WRITE), e.g. "characters/<id>/" via PATCH. */
  writeResource?: string;
  /** PROPOSE capability that drafts AI edits to these fields (Route.PROPOSE). */
  proposeCap?: string;
  /** ops the accept / reject / edit-pending-proposal flow calls. */
  acceptOp?: string;
  rejectOp?: string;
  updateProposedOp?: string;
  /** field name → the real read / patch path, when a field aliases a nested key. */
  aliases?: Record<string, { reads: string; patch: string }>;
  /** any extra named ops this node uses (beats, gauges) — keeps the binding general. */
  ops?: Record<string, string>;
}

export interface MarkerNode {
  label: string;
  description?: string;
  /** desc split by author intent vs what Night Eyes does with the node. */
  intent?: { human?: string; ai?: string };
  /** short authoring prompts (the "hints" layer). */
  hints?: string[];
  fields?: MarkerField[];
  /** braindump CRAFT tags whose phrases feed this node's idea box (character axis). */
  ideaTags?: string[];
  /** braindump ENTITY kinds whose phrases feed this node's idea box (World axis —
   *  loc / item / rule / …). A phrase matches on either ideaTags OR ideaKinds. */
  ideaKinds?: string[];
  /** keys into `lensQuestions.ts` — the lenses this node can attach. */
  lensQuestions?: string[];
  /** REST binding; inherited from the nearest ancestor that declares one. */
  data?: ArnDataBinding;
  children?: Record<string, MarkerNode>;
}

/** Registry keyed by page slug; each value is the page's root node. */
export type MarkerRegistry = Record<string, MarkerNode>;

export const MARKER_REGISTRY: MarkerRegistry = {
  'character-studio': {
    label: 'Character Studio',
    description: 'The character workspace — identity, arc, outline, presence.',
    intent: {
      human: 'One home for everything true about a character.',
      ai: 'Watches every facet for contradictions and gaps across the manuscript.',
    },
    // Shared character-field binding — INHERITED by every field-owning child below.
    // Surgical edits go direct (PATCH characters/<id>/, Route.WRITE); AI edits draft
    // a `propose_character_edit` proposal the author accepts per field.
    data: {
      read: 'get_character_full',
      writeResource: 'characters/<id>/',
      proposeCap: 'propose_character_edit',
      acceptOp: 'accept_character_field',
      rejectOp: 'reject_character_field',
      updateProposedOp: 'update_proposed_field',
      aliases: {
        // UI field key → real read path / patch path (see useCharacterFields).
        voice: { reads: 'voice_profile.tone', patch: 'voice_profile.tone' },
        signature: { reads: 'story', patch: 'story' },
      },
    },
    children: {
      identity: {
        label: 'Identity',
        description: 'Who they are — the stable core.',
        intent: {
          human: 'Pin down the essence — the one-line truth of this person.',
          ai: 'Checks every later mention stays true to this core.',
        },
        hints: ['What is the single truest thing about them?'],
        fields: [
          { name: 'description', label: 'Essence' },
        ],
        // the "essence" idea box: who they are, not plot.
        ideaTags: ['Character', 'motivation', 'flaw'],
        lensQuestions: ['identity-consistent'],
        children: {
          appearance: {
            label: 'Appearance',
            description: 'How they look and present on the page.',
            intent: {
              human: 'Lock the look so it reads the same every scene.',
              ai: 'Flags drift — hair, age, build that changes between chapters.',
            },
            hints: ['What do readers notice first about them?'],
            fields: [
              { name: 'appearance.description', label: 'Description' },
              { name: 'appearance.age', label: 'Age' },
              { name: 'appearance.gender', label: 'Gender' },
              { name: 'appearance.build', label: 'Build' },
              { name: 'appearance.hair', label: 'Hair' },
              { name: 'appearance.eyes', label: 'Eyes' },
              { name: 'appearance.clothing', label: 'Clothing' },
              { name: 'appearance.costumes', label: 'Costumes' },
              { name: 'appearance.features', label: 'Features' },
            ],
            ideaTags: ['appearance'],
            // e.g. "True to the Page?", "First Impression voice intact?"
            lensQuestions: ['true-to-the-page', 'first-impression-voice'],
          },
          world: {
            label: 'World',
            description: 'Where they live and the object that carries their story.',
            intent: {
              human: 'Ground them in a place and a thing that recurs.',
              ai: 'Checks the home and story-object stay consistent across scenes.',
            },
            fields: [
              { name: 'appearance.home', label: 'Home' },
              { name: 'appearance.worlditem', label: 'Story object' },
            ],
            ideaTags: ['setting', 'atmosphere', 'society', 'history', 'religion', 'magic_rule', 'tech_rule', 'World'],
            lensQuestions: ['home-consistent', 'object-recurs'],
          },
          backstory: {
            label: 'Backstory',
            description: 'What happened before page one.',
            intent: {
              human: 'Capture the wound that drives them.',
              ai: 'Watches that the wound surfaces and backstory leaks naturally.',
            },
            hints: ['What hurt them before the story starts?'],
            fields: [
              { name: 'backstory', label: 'Backstory' },
            ],
            ideaTags: ['backstory', 'flashback', 'history'],
            // e.g. "Does the Wound Surface?"
            lensQuestions: ['wound-surface', 'backstory-leaks-naturally'],
          },
          relationships: {
            label: 'Relationships',
            description: 'Who matters to them, and how.',
            intent: {
              human: 'Map who they love, owe, and clash with.',
              ai: 'Checks relationships evolve instead of standing still.',
            },
            fields: [
              { name: 'relationships', label: 'Relationships' },
              { name: 'relationship_notes', label: 'Relationship notes' },
            ],
            ideaTags: ['relationship'],
            lensQuestions: ['relationships-evolve'],
          },
          aliases: {
            label: 'Also known as',
            description: 'Other names they go by.',
            intent: {
              human: 'List every name, title, or handle they answer to.',
              ai: 'Tracks each alias so mentions resolve to one person.',
            },
            fields: [
              { name: 'aliases', label: 'Aliases' },
            ],
            lensQuestions: ['aliases-tracked'],
          },
        },
      },
      arc: {
        label: 'Arc',
        description: 'The shape of their change.',
        intent: {
          human: 'Decide how they end up different from how they began.',
          ai: 'Checks the arc actually completes by the last page.',
        },
        fields: [
          { name: 'want', label: 'Wants' },
          { name: 'need', label: 'Needs' },
          { name: 'misbelief', label: 'Misbelieves' },
          { name: 'story', label: 'Plot points' },
        ],
        // the whole arc idea box — plot events (not split to internal/external).
        ideaTags: ['goal', 'event', 'conflict_external', 'conflict_internal', 'turning_point', 'resolution', 'Plot'],
        lensQuestions: ['arc-completes'],
        children: {
          internal: {
            label: 'Internal arc',
            description: 'The emotional journey — want, need, the lie.',
            intent: {
              human: 'Name the want, the deeper need, and the lie between them.',
              ai: 'Tests that the misbelief gets challenged on the page.',
            },
            hints: ['What do they want vs. what do they need?'],
            fields: [
              { name: 'want', label: 'Wants' },
              { name: 'need', label: 'Needs' },
              { name: 'misbelief', label: 'Misbelieves' },
            ],
            ideaTags: ['conflict_internal', 'motivation', 'flaw', 'goal', 'emotion'],
            lensQuestions: ['want-vs-need', 'misbelief-challenged'],
          },
          external: {
            label: 'External arc',
            description: 'The plot points that force the story.',
            intent: {
              human: 'List the events that push them to change.',
              ai: 'Checks stakes escalate and plot pressures the arc.',
            },
            fields: [
              { name: 'story', label: 'Plot points' },
            ],
            ideaTags: ['event', 'conflict_external', 'turning_point', 'resolution', 'Plot'],
            lensQuestions: ['stakes-escalate', 'plot-pressures-arc'],
          },
        },
      },
      outline: {
        label: 'Outline',
        description: 'Their plot threads, woven into one outline.',
        intent: {
          human: 'See this character’s threads as one running outline.',
          ai: 'Checks the threads cohere into a single timeline.',
        },
        ideaTags: ['Plot', 'event', 'turning_point'],
        lensQuestions: ['outline-coheres'],
        children: {
          // dynamic: ARN ends in the thread id (`…:outline:thread:<id>`); the
          // marker's label is the thread's name at render time.
          thread: {
            label: 'Thread',
            description: 'One plot thread and its beats.',
            intent: {
              human: 'Order the beats of one thread until it pays off.',
              ai: 'Checks beats stay ordered and the thread resolves.',
            },
            fields: [
              { name: 'name', label: 'Name' },
              { name: 'scope', label: 'Scope' },
              { name: 'beats', label: 'Beats' },
            ],
            ideaTags: ['Plot', 'event', 'turning_point'],
            lensQuestions: ['thread-pays-off', 'beats-ordered'],
            // OVERRIDE: beats speak the thread API, not the character API.
            // AI beat edits draft per-beat proposals (propose_insert / propose_update_beat).
            data: {
              read: 'get_thread',
              proposeCap: 'propose_insert_beat',
              updateProposedOp: 'update_proposed_beat',
              ops: {
                insert: 'propose_insert_beat',
                updateProposed: 'propose_update_beat',
                addBeat: 'add_thread_beat',
                updateBeat: 'update_thread_beat',
                deleteBeat: 'delete_thread_beat',
                placeBeat: 'place_thread_beat',
              },
            },
          },
        },
      },
      voice: {
        label: 'Presence',
        description: 'How they sound, and how present they are across the manuscript.',
        intent: {
          human: 'Capture their voice and the line that is unmistakably them.',
          ai: 'Checks the voice stays distinct and consistent across scenes.',
        },
        fields: [
          { name: 'voice_profile.tone', label: 'Voice' },
          { name: 'sigline', label: 'Signature line' },
        ],
        // personality / dialogue idea box.
        ideaTags: ['dialogue', 'monologue', 'confrontation', 'catchphrase', 'Dialogue'],
        lensQuestions: ['voice-distinct', 'voice-consistent'],
      },
      lenses: {
        label: 'Lenses',
        description: 'Analysis lenses watching this character across threads & prose.',
        intent: {
          human: 'Pick the questions you want watched continuously.',
          ai: 'Runs each lens as a gauge and surfaces verdicts + drift.',
        },
        // story-level themes (the only story-scoped idea box).
        ideaTags: ['theme', 'motif', 'lesson', 'Theme'],
        lensQuestions: ['lens-coverage'],
        // OVERRIDE: lenses speak the gauge API. Attach reuses these via sectionLens.
        data: {
          read: 'get_gauge_board',
          ops: {
            suggest: 'suggest_gauges',
            getSuggestions: 'get_gauge_suggestions',
            createPreset: 'create_preset',
            bind: 'bind_gauge',
            analyse: 'analyse_gauge',
          },
        },
      },
    },
  },

  // Standalone Plot Threads page (URL /project/:projectId/plot-threads). Lists
  // EVERY thread in the project — no single character owner, so the ARN has no id
  // (`plot-threads:outline:thread:<id>`); a thread's owning character comes from
  // its own `scope.name` at render time. Reuses the character-studio thread lenses.
  'plot-threads': {
    label: 'Plot Threads',
    description: 'Every plot thread in the project, woven into one outline.',
    children: {
      outline: {
        label: 'Outline',
        description: 'All plot threads as one running outline.',
        lensQuestions: ['outline-coheres'],
        children: {
          thread: {
            label: 'Thread',
            description: 'One plot thread and its beats.',
            fields: [
              { name: 'name', label: 'Name' },
              { name: 'scope', label: 'Scope' },
              { name: 'beats', label: 'Beats' },
            ],
            lensQuestions: ['thread-pays-off', 'beats-ordered'],
          },
        },
      },
    },
  },

  // Manuscript / Chapters page (URL /project/:projectId/chapters). The writing
  // surface — each scene's left margin carries an ARN ai-rewrite button scoped to
  // that scene (`chapters:scene:<id>`). No lenses, no fields; the node exists only
  // so the ARN resolves a "Scene" label for the rewrite prompt.
  chapters: {
    label: 'Manuscript',
    description: 'The writing surface — chapters and their scenes.',
    children: {
      scene: {
        label: 'Scene',
        description: 'One scene in the manuscript.',
      },
    },
  },

  // Standalone World page (URL /project/:projectId/world). Its sections are
  // dynamic (author-created), so the registry can't enumerate every one — it
  // declares the braindump mapping per ENTITY KIND instead. The page resolves a
  // section to its kind (sectionKind = name → aspect → kind) and addresses the
  // matching node by that kind. Custom sections fall to the `world` catch-all.
  // World ideas are story-scoped (no character gate) and match by `ideaKinds`.
  world: {
    label: 'Worldbuilding',
    description: 'Places, things, rules and every author-made section of the world.',
    children: {
      // The Story section at the top (synopsis / logline / genre / themes / tone).
      // Matches by craft tag: plot tags feed the synopsis + logline, theme and
      // mood tags feed genre / themes / tone.
      story: {
        label: 'Story',
        ideaTags: [
          'Plot', 'event', 'goal', 'turning_point', 'resolution', 'conflict_external', 'conflict_internal',
          'theme', 'motif', 'lesson', 'Theme', 'atmosphere', 'emotion',
        ],
      },
      loc: { label: 'Places', ideaKinds: ['loc'] },
      item: { label: 'Things', ideaKinds: ['item'] },
      rule: { label: 'Rules', ideaKinds: ['rule'] },
      magic: { label: 'Magic', ideaKinds: ['magic'] },
      faction: { label: 'Factions', ideaKinds: ['faction'] },
      culture: { label: 'Culture', ideaKinds: ['culture'] },
      history: { label: 'History', ideaKinds: ['history'] },
      creature: { label: 'Creatures', ideaKinds: ['creature'] },
      // catch-all for author-invented sections (sectionKind → 'world').
      world: { label: 'World', ideaKinds: ['world'] },
    },
  },
};

export interface ResolvedMarker {
  arn: string;
  label: string;
  description?: string;
  fields?: MarkerField[];
  lensQuestions?: string[];
}

/**
 * Resolve a marker from the registry: walks the key path (section → sub) to the
 * node and builds the ARN. `item` is a dynamic trailing segment (e.g. a thread
 * id) — it has no node of its own, so it only extends the ARN. Unknown keys fall
 * back to the raw key as the label so a not-yet-registered marker still renders.
 */
export function resolveMarker(
  page: string,
  id: string | undefined,
  section: string,
  sub?: string,
  item?: string,
): ResolvedMarker {
  let node: MarkerNode | undefined = MARKER_REGISTRY[page];
  for (const key of [section, sub]) {
    if (!key) break;
    node = node?.children?.[key];
  }
  return {
    arn: buildArn(page, id, section, sub, item),
    label: node?.label ?? sub ?? section,
    description: node?.description,
    fields: node?.fields,
    lensQuestions: node?.lensQuestions,
  };
}

/* ───────────────────────── ARN bundle — the shared per-ARN data model ─────────
 * `resolveArn` is `resolveMarker` grown into the FULL bundle: it assembles, for a
 * single ARN, every layer the section node owns (identity, fields, lenses, ideas,
 * REST binding) plus the derived indicators. This is "the data model roughly
 * shared per ARN": chip, form, lens box and idea strip all read one object.
 *
 * No surface consumes it yet — the registry population is the map; wiring the
 * surfaces onto it is a later, mechanical step. The shape is here so that step is
 * obvious and drift-proof.
 * ───────────────────────────────────────────────────────────────────────────── */

/** A field plus its alias binding (if it reads/writes a nested key). */
export interface ArnField extends MarkerField {
  alias?: { reads: string; patch: string };
}

/** A lens a node offers — just its registry slug. The question CONTENT lives in the
 *  backend section-lens bank now (resolved by the kit / dev marker), not here. */
export interface ArnLens {
  slug: string;
}

/** Live state needed to derive the chip indicators. All optional. */
export interface ArnLive {
  /** any of the node's fields has a pending AI proposal → green dot. */
  hasProposal?: boolean;
  /** a lens is attached to this ARN. */
  lensAttached?: boolean;
  /** the attached lens verdict is older than its data → stale (re-scan). */
  lensStale?: boolean;
  /** the attached lens last read "ok". */
  checkedOk?: boolean;
}

export interface ResolvedArn {
  arn: string;
  page: string;
  id?: string;
  section: string;
  sub?: string;
  item?: string;
  label: string;
  description?: string;
  intent?: { human?: string; ai?: string };
  hints?: string[];
  fields: ArnField[];
  lenses: ArnLens[];
  ideaTags: string[];
  ideaKinds: string[];
  /** the REST binding, resolved by inheriting the nearest ancestor's `data`. */
  data?: ArnDataBinding;
  /** derived chip state (green / lens / stale / checked-ok). */
  indicators: {
    proposal: boolean;
    lensAttached: boolean;
    lensStale: boolean;
    checkedOk: boolean;
  };
  children?: Record<string, MarkerNode>;
}

/** Walk the registry to a node, collecting the nearest `data` binding on the way. */
function walkToNode(
  page: string,
  section: string,
  sub?: string,
): { node?: MarkerNode; inheritedData?: ArnDataBinding } {
  let node: MarkerNode | undefined = MARKER_REGISTRY[page];
  let inheritedData = node?.data;
  for (const key of [section, sub]) {
    if (!key) break;
    node = node?.children?.[key];
    if (node?.data) inheritedData = node.data;
  }
  return { node, inheritedData };
}

/**
 * Resolve an ARN to its full bundle. `live` (optional) supplies the runtime state
 * the indicators derive from; omit it and indicators read all-false.
 */
export function resolveArn(
  page: string,
  id: string | undefined,
  section: string,
  sub?: string,
  item?: string,
  live?: ArnLive,
): ResolvedArn {
  const { node, inheritedData } = walkToNode(page, section, sub);
  const aliases = inheritedData?.aliases ?? {};
  const fields: ArnField[] = (node?.fields ?? []).map((f) => ({
    ...f,
    alias: aliases[f.name],
  }));
  const lenses: ArnLens[] = (node?.lensQuestions ?? []).map((slug) => ({ slug }));
  return {
    arn: buildArn(page, id, section, sub, item),
    page,
    id,
    section,
    sub,
    item,
    label: node?.label ?? sub ?? section,
    description: node?.description,
    intent: node?.intent,
    hints: node?.hints,
    fields,
    lenses,
    ideaTags: node?.ideaTags ?? [],
    ideaKinds: node?.ideaKinds ?? [],
    data: inheritedData,
    indicators: {
      proposal: !!live?.hasProposal,
      lensAttached: !!live?.lensAttached,
      lensStale: !!live?.lensStale,
      checkedOk: !!live?.checkedOk,
    },
    children: node?.children,
  };
}

/** ideaTags (craft-tag axis) for a section node by registry path. */
export function ideaTagsFor(page: string, section: string, sub?: string): string[] {
  const { node } = walkToNode(page, section, sub);
  return node?.ideaTags ?? [];
}

/** ideaKinds (entity-kind axis — the World map) for a section node by path. */
export function ideaKindsFor(page: string, section: string, sub?: string): string[] {
  const { node } = walkToNode(page, section, sub);
  return node?.ideaKinds ?? [];
}

/** Where an idea's tags will show up: the character-page sections (for a person)
 *  or the World section (for a place, thing, …) whose idea box picks them up.
 *  Same table the idea boxes read, so the Ideas page and the character page
 *  always agree. One label per tag, from the deepest matching section (so
 *  "motivation" says Internal arc, not Identity); tags no section reads (theme,
 *  motif: story-level) are left out. Labels are deduped, in tag order. */
export function ideaDestinations(kind: string, tags: string[]): string[] {
  if (kind !== 'char') {
    const world = MARKER_REGISTRY.world.children ?? {};
    const node = world[kind] ?? world.world;
    return node ? [node.label] : [];
  }
  const nodes: { key: string; label: string; depth: number; tags: string[] }[] = [];
  const walk = (children: Record<string, MarkerNode> | undefined, depth: number) => {
    for (const [key, n] of Object.entries(children ?? {})) {
      if (key === 'lenses') continue; // story-scoped, not a section of this person
      nodes.push({ key, label: n.label, depth, tags: n.ideaTags ?? [] });
      walk(n.children, depth + 1);
    }
  };
  walk(MARKER_REGISTRY['character-studio'].children, 1);
  const out: string[] = [];
  for (const t of tags) {
    let best: (typeof nodes)[number] | undefined;
    for (const n of nodes) if (n.tags.includes(t) && (!best || n.depth > best.depth)) best = n;
    if (best && !out.includes(best.label)) out.push(best.label);
  }
  return out;
}

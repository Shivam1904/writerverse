/**
 * World — the data seam (loose; no contracts, per the phase-4 rule).
 *
 * Backend op: `get_worldbuildings` returns full Worldbuilding rows.
 * We also pull `get_items` and `get_rules` from the discovery blob to
 * assemble the merged world view. The page groups items by tags/kind:
 *   - items tagged "place" → Places section (big cards)
 *   - items tagged "thing" → Things section (side cards)
 *   - rules → Rules section (special list)
 *   - everything else → generic bullet sections
 *
 */
import { callOp } from '../../gateway';
import { normalizeGlyphKey } from '../../components/StoryIconsRegistry';


/** Canonical block key — mirrors the backend `block_key` (trim, lower, collapse
 *  whitespace) so the frontend and `world_blocks.py` agree on section identity. */
export function block_key(name: any): string {
  return String(name ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ');
}

export interface WorldRule {
  id: string;
  text: string;
  from?: string;
}

export interface WorldCard {
  id: string;
  name: string;
  line?: string;
  from?: string;
  /** Per-entity colour override ('' = derive from the block/kind aspect colour). */
  color?: string;
}

export interface WorldBullet {
  id: string;
  name?: string;
  text: string;
  from?: string;
  /** Per-entity colour override ('' = derive from the block/kind aspect colour). */
  color?: string;
}

export interface WorldSection {
  id: string;
  title: string;
  hint?: string;
  kind: 'rules' | 'places' | 'things' | 'bullets';
  addLabel: string;
  items: any[];
  /** Canonical block key (the tag rows carry to file into this section). */
  name?: string;
  /** Section mark — an EntityMark kind or 'generic'; see sectionMeta.ts. */
  glyph?: string;
  /** Section tint — a theme token or colour. */
  color?: string;
}

/** The story details shown at the top of the World page. They come from the
 *  project meta (`queries.projectMeta`), not from `loadWorld`, so editing the
 *  synopsis never re-reads the world entries and vice versa (SA-82). */
export interface WorldMeta {
  synopsis: string[];
  storyTitle: string;
  /** Story-craft metadata (the "more metadata" panel). tones = mood, themes = subject. */
  tones: string[];
  themes: string[];
  genres: string[];
  logline: string;
  perspective: string;
  tense: string;
  audience: string;
}

/** The world entries, grouped into sections — what `loadWorld` returns. */
export interface WorldEntries {
  sections: WorldSection[];
}

/** Everything the World page shows: story details + sections. */
export type WorldData = WorldMeta & WorldEntries;

export const EMPTY_WORLD: WorldData = {
  synopsis: [],
  storyTitle: '',
  tones: [],
  themes: [],
  genres: [],
  logline: '',
  perspective: '',
  tense: '',
  audience: '',
  sections: [],
};

/** The project meta (`get_project_meta`) → the World page's story details. */
export function worldMetaFrom(meta: any): WorldMeta {
  const m = meta ?? {};
  const text = (v: any) => String(v ?? '').trim();
  const synText = text(m.synopsis);
  return {
    synopsis: synText ? [synText] : [],
    storyTitle: text(m.title),
    tones: m.tones ?? [],
    themes: m.themes ?? [],
    genres: m.genres ?? [],
    logline: text(m.logline),
    perspective: text(m.perspective),
    tense: text(m.tense),
    audience: text(m.audience),
  };
}

/* Structural tags map a row onto one of the three special-layout sections
 * (places/things keep card layouts; rules keep the numbered list). Any OTHER
 * tag is a custom section heading — grouped by that tag (its block key). */

/** The structural section a row belongs to, or null if it's a custom-tag row. */
export function structuralCat(wb: any): 'places' | 'things' | 'rules' | null {
  const keys = [
    ...(Array.isArray(wb?.tags) ? wb.tags : []).map((t: any) => normalizeGlyphKey(t)),
    normalizeGlyphKey(wb?.category),
  ];
  if (keys.includes('location')) return 'places';
  if (keys.includes('item')) return 'things';
  if (keys.includes('rule')) return 'rules';
  return null;
}

/** First non-structural tag on a row — the custom section it files under. */
export function customTag(wb: any): string | undefined {
  const tags = Array.isArray(wb?.tags) ? wb.tags : [];
  return tags.map((t: any) => String(t)).find((t: string) => {
    const normKey = normalizeGlyphKey(t);
    return normKey && !['location', 'item', 'rule'].includes(normKey);
  });
}


/* Marks for the three structural sections (custom sections resolve via
 * sectionMeta at render). Tints match the world rail group colours. */
export const STRUCTURAL_VISUAL: Record<'places' | 'things' | 'rules', { glyph: string; color: string }> = {
  places: { glyph: 'location', color: 'var(--teal)' },
  things: { glyph: 'item', color: 'var(--mauve)' },
  rules: { glyph: 'rule', color: 'var(--sage)' },
};

export function groupTitle(cat: string): string {
  if (cat === 'places') return 'Places';
  if (cat === 'things') return 'Things';
  if (cat === 'rules') return 'How this world works';
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

export function groupHint(cat: string): string {
  if (cat === 'places') return 'where things happen';
  if (cat === 'things') return 'objects that matter';
  if (cat === 'rules') return 'the rules your writing keeps';
  return '';
}

export function groupKind(cat: string): 'rules' | 'places' | 'things' | 'bullets' {
  if (cat === 'places') return 'places';
  if (cat === 'things') return 'things';
  if (cat === 'rules') return 'rules';
  return 'bullets';
}

export function groupAddLabel(cat: string): string {
  if (cat === 'places') return 'place';
  if (cat === 'things') return 'thing';
  if (cat === 'rules') return 'rule';
  return 'item';
}

function toRule(wb: any): WorldRule {
  return {
    id: String(wb?.id ?? `wb-${Math.random().toString(36).slice(2, 8)}`),
    text: String(wb?.content || wb?.title || '').trim(),
    from: wb?.pnote || wb?.summary || undefined,
  };
}

function toCard(wb: any): WorldCard {
  return {
    id: String(wb?.id ?? `wb-${Math.random().toString(36).slice(2, 8)}`),
    name: String(wb?.title || '').trim(),
    line: String(wb?.content || '').trim() || undefined,
    from: wb?.pnote || wb?.summary || undefined,
    color: String(wb?.color || '').trim(),
  };
}

function toBullet(wb: any): WorldBullet {
  // `text` is the RAW content (description), NOT a title fallback — so a named
  // entity with no description yet shows just its name (not "Name — Name"), and
  // the edit view's description field starts empty.
  return {
    id: String(wb?.id ?? `wb-${Math.random().toString(36).slice(2, 8)}`),
    name: String(wb?.title || '').trim() || undefined,
    text: String(wb?.content || '').trim(),
    from: wb?.pnote || wb?.summary || undefined,
    color: String(wb?.color || '').trim(),
  };
}

export async function loadWorld(projectId: any): Promise<WorldEntries> {
  if (!projectId) return { sections: [] };

  // Every read is the author's content (entries, rules, items, their section
  // headings), so ANY failure rejects and the page shows "Couldn't load" +
  // Retry. Swallowing one would quietly drop a section or rules from the page,
  // which reads as lost work (SA-132, SA-77). The story details are NOT read
  // here: they live in the shared project-meta query (SA-82).
  const [wbRes, itemsRes, rulesRes, blocksRes] = await Promise.all([
    callOp(projectId, 'get_worldbuildings'),
    callOp(projectId, 'get_items'),
    callOp(projectId, 'get_rules'),
    callOp(projectId, 'get_world_blocks'),
  ]);

  const worldbuildings = wbRes.worldbuildings ?? [];
  const discoveryItems = itemsRes.items ?? [];
  const discoveryRules = rulesRes.rules ?? [];
  const blocks: any[] = blocksRes.blocks ?? [];

  // ── Structural buckets (special layouts) + custom buckets (by tag key). ──
  const structural: Record<'places' | 'things' | 'rules', any[]> = { places: [], things: [], rules: [] };
  const custom: Record<string, { label: string; rows: any[] }> = {};
  const customOrder: string[] = [];

  for (const wb of worldbuildings) {
    const cat = structuralCat(wb);
    if (cat) {
      structural[cat].push(wb);
      continue;
    }
    const tag = customTag(wb);
    if (tag) {
      const key = block_key(tag);
      if (!custom[key]) { custom[key] = { label: String(tag).trim(), rows: [] }; customOrder.push(key); }
      custom[key].rows.push(wb);
    } else {
      // No tag at all → keep visible under a catch-all so nothing disappears.
      const key = 'notes';
      if (!custom[key]) { custom[key] = { label: 'Notes', rows: [] }; customOrder.push(key); }
      custom[key].rows.push(wb);
    }
  }

  // Merge discovery rules / items not already represented (same as before).
  const existingRuleTexts = new Set(
    structural.rules.map((r: any) => String(r?.content || r?.title || '').toLowerCase().trim()),
  );
  for (const dr of discoveryRules) {
    const text = String(dr?.text || '').trim();
    if (text && !existingRuleTexts.has(text.toLowerCase())) {
      structural.rules.push({ title: text, content: text, pnote: dr?.scope });
    }
  }
  const existingItemNames = new Set(
    [...structural.things, ...structural.places].map((i: any) => String(i?.title || '').toLowerCase().trim()),
  );
  for (const di of discoveryItems) {
    const name = String(di?.name || '').trim();
    if (name && !existingItemNames.has(name.toLowerCase())) {
      structural.things.push({ title: name, content: di?.description || '' });
    }
  }

  // Author-added headings from the block registry. These give an empty section
  // a home below the items, and carry the picked glyph/color. The signal is
  // `added` (it's in the registry), NOT `custom` — a known-named add like
  // "Factions" is registered but reports custom=false, and must still surface.
  // Structural-aliased names ("Locations" → Places) fold into their built-in
  // section instead of spawning an empty bullet list.
  const blockByKey: Record<string, any> = {};
  for (const b of blocks) {
    const key = block_key(b?.name || b?.label);
    if (!key) continue;
    blockByKey[key] = b;
    const isStructural = ['location', 'item', 'rule'].includes(normalizeGlyphKey(key));
    if (b?.added && !isStructural && !custom[key]) {
      custom[key] = { label: (b.label || b.name || key), rows: [] };
      customOrder.push(key);
    }
  }

  const sections: WorldSection[] = [];

  // Structural sections first, in their established order, when non-empty. The
  // author's heading override (if any) overlays the built-in default — only the
  // fields they actually changed (label_override / hint_override are raw, null
  // when unset; glyph/color fall back to the structural visual).
  // Each structural kind ← the block-name aliases that fold into it (so adding
  // "Locations"/"Items"/"Rules" lands in the built-in section, not a duplicate).
  const STRUCT_GLYPH: Record<'rules' | 'places' | 'things', string> = {
    rules: 'rule', places: 'location', things: 'item',
  };
  (['rules', 'places', 'things'] as const).forEach((cat) => {
    // An author-registered heading whose name aliases to this structural kind.
    // It lets an explicitly-added but still-EMPTY structural section render so the
    // author can file its first item — without it, an empty "Places"/"Items"/
    // "Rules" add is dropped by the isStructural guard above AND skipped here for
    // having no rows, so the section vanishes the moment it's created.
    const addedReg = blocks.find(
      (b) => b?.added && normalizeGlyphKey(block_key(b?.name || b?.label)) === STRUCT_GLYPH[cat],
    );
    if (!structural[cat].length && !addedReg) return;
    const vis = STRUCTURAL_VISUAL[cat];
    const reg = addedReg || blockByKey[cat] || {};
    sections.push({
      id: cat,
      name: cat,
      title: reg.label_override || groupTitle(cat),
      hint: reg.hint_override ?? groupHint(cat),
      kind: groupKind(cat),
      addLabel: groupAddLabel(cat),
      glyph: reg.glyph || vis.glyph,
      color: reg.color || vis.color,
      items: structural[cat].map((wb) => (cat === 'rules' ? toRule(wb) : toCard(wb))),
    });
  });

  // Custom sections (render as bullet lists), in first-seen order. A heading the
  // author renamed (label_override) wins over the tag's natural label.
  for (const key of customOrder) {
    const g = custom[key];
    const reg = blockByKey[key] || {};
    sections.push({
      id: key,
      name: key,
      title: reg.label_override || g.label,
      hint: reg.hint || '',
      kind: 'bullets',
      addLabel: 'item',
      glyph: reg.glyph || undefined,   // resolved (with known/default fallback) at render
      color: reg.color || undefined,
      items: g.rows.map(toBullet),
    });
  }

  return { sections };
}

// ---- optimistic cache edits (the page shows a write before the refetch) ----

export type WorldItemPatch = { title?: string; content?: string; tags?: string[]; color?: string };

/** `entries` with one row's name / description / colour changed, in the shape
 *  that row has in its section (rule, card or bullet). A tag change moves the
 *  row to another section, so it is left to the refetch. Pure. */
export function patchWorldItem(entries: WorldEntries, id: string, patch: WorldItemPatch): WorldEntries {
  const fix = (kind: WorldSection['kind'], it: any) => {
    if (String(it?.id) !== String(id)) return it;
    const next = { ...it };
    const title = patch.title?.trim();
    const content = patch.content?.trim();
    if (kind === 'rules') {
      if (content !== undefined || title !== undefined) next.text = content || title || '';
      return next;
    }
    if (title !== undefined) next.name = kind === 'bullets' ? title || undefined : title;
    if (content !== undefined) {
      if (kind === 'bullets') next.text = content;
      else next.line = content || undefined;
    }
    if (patch.color !== undefined) next.color = patch.color.trim();
    return next;
  };
  return {
    ...entries,
    sections: entries.sections.map((sec) => ({ ...sec, items: sec.items.map((it) => fix(sec.kind, it)) })),
  };
}

/** `entries` without one row (an optimistic delete). Pure. */
export function removeWorldItem(entries: WorldEntries, id: string): WorldEntries {
  return {
    ...entries,
    sections: entries.sections.map((sec) => ({
      ...sec, items: sec.items.filter((it) => String(it?.id) !== String(id)),
    })),
  };
}

// ---- world blocks (sections) ----

/** Persist a (possibly empty) section heading + its picked glyph/color. */
export async function addWorldBlock(
  projectId: any,
  { name, glyph, color }: { name: string; glyph?: string; color?: string },
) {
  if (!projectId) throw new Error('no project');
  const res = await callOp(projectId, 'add_world_block', { name, glyph, color }, 'world');
  return res?.block ?? res;
}

/** Edit a section heading's look — label (rename), hint, glyph, color. Only the
 *  passed fields change; an empty string clears that override. Direct WRITE. */
export async function updateWorldBlock(
  projectId: any,
  { name, label, hint, glyph, color }: {
    name: string; label?: string; hint?: string; glyph?: string; color?: string;
  },
) {
  if (!projectId) throw new Error('no project');
  const args: any = { name };
  if (label !== undefined) args.label = label;
  if (hint !== undefined) args.hint = hint;
  if (glyph !== undefined) args.glyph = glyph;
  if (color !== undefined) args.color = color;
  const res = await callOp(projectId, 'update_world_block', args, 'world');
  return res?.block ?? res;
}

/** "Make real": promote a braindump candidate entity into a real Worldbuilding
 *  row in `block` (direct WRITE — appears instantly), which also queues an AI
 *  description-draft proposal on it. `kind` only tunes the draft prompt. */
export async function promoteWorldEntity(
  projectId: any, name: string, block: string, kind?: string,
) {
  if (!projectId) throw new Error('no project');
  return callOp(projectId, 'promote_to_world_entity', { name, block, kind: kind ?? '' }, 'world');
}

/** Blur-save an edited proposed description back into a pending draft proposal
 *  (still pending; reaches the row only on accept). */
export async function updateProposedWorldEntity(projectId: any, proposalId: any, value: string) {
  if (!projectId) throw new Error('no project');
  return callOp(projectId, 'update_proposed_world_entity',
    { proposal_id: String(proposalId), value }, 'world');
}

// ---- writes ----

export async function addWorldItem(
  projectId: any,
  { title, content, tags, pnote }: { title: string; content?: string; tags?: string[]; pnote?: string },
) {
  if (!projectId) throw new Error('no project');
  const res = await callOp(projectId, 'add_worldbuilding', {
    title,
    content: content ?? '',
    tags: tags ?? [],
    pnote: pnote ?? '',
  });
  if (!res?.worldbuilding) throw new Error('add failed');
  return res.worldbuilding;
}

export async function updateWorldItem(
  projectId: any,
  id: number | string,
  patch: { title?: string; content?: string; tags?: string[]; pnote?: string; status?: string; color?: string },
) {
  if (!projectId) throw new Error('no project');
  const args: any = { id: Number(id) };
  if (patch.title !== undefined) args.title = patch.title;
  if (patch.content !== undefined) args.content = patch.content;
  if (patch.tags !== undefined) args.tags = patch.tags;
  if (patch.pnote !== undefined) args.pnote = patch.pnote;
  if (patch.status !== undefined) args.status = patch.status;
  if (patch.color !== undefined) args.color = patch.color;
  const res = await callOp(projectId, 'update_worldbuilding', args);
  if (!res?.worldbuilding) throw new Error('update failed');
  return res.worldbuilding;
}

export async function deleteWorldItem(projectId: any, id: number | string) {
  if (!projectId) throw new Error('no project');
  await callOp(projectId, 'delete_worldbuilding', { id: Number(id) });
}

// Undo a delete (deletes are soft for 10s of Undo).
export async function undeleteWorldItem(projectId: any, id: number | string) {
  if (!projectId) throw new Error('no project');
  await callOp(projectId, 'undelete_worldbuilding', { id: Number(id) });
}

// ---- project metadata ----

export async function updateProjectMeta(
  projectId: any,
  patch: {
    title?: string; description?: string; synopsis?: string;
    genres?: string[]; tones?: string[]; themes?: string[];
    logline?: string; perspective?: string; tense?: string; audience?: string;
  },
) {
  if (!projectId) throw new Error('no project');
  return callOp(projectId, 'update_project_meta', patch, 'world');
}

// ---- World metadata: per-field AI proposals (the character-studio pattern) ----
// get_project_meta_full returns every metadata field wrapped as
//   { actual_value, proposal?, proposed_value? }
// so the World page can review a pending `meta_edit` field-by-field (green +
// accept/reject). The shared flat get_project_meta stays untouched.
export async function loadProjectMetaFull(projectId: any) {
  if (!projectId) return null;
  const res = await callOp(projectId, 'get_project_meta_full', {}, 'world');
  return res?.meta ?? null;
}

// Accept ONE proposed field with its final (possibly author-edited) value. The
// proposal id is stable; it closes server-side once no pending fields remain.
// If the author changed the field since the AI suggested it, the backend refuses
// with 409 `proposal_stale` (SA-209); `force` accepts anyway (the author chose
// the AI's value).
export async function acceptMetaField(projectId: any, proposalId: any, field: string, value: any, force = false) {
  if (!projectId) throw new Error('no project');
  return callOp(projectId, 'accept_project_meta_field',
    { proposal_id: String(proposalId), field, value, ...(force && { force: true }) }, 'world');
}

// Reject ONE proposed field — drops it from the proposal, writes nothing.
export async function rejectMetaField(projectId: any, proposalId: any, field: string) {
  if (!projectId) throw new Error('no project');
  return callOp(projectId, 'reject_project_meta_field',
    { proposal_id: String(proposalId), field }, 'world');
}

// Blur-save while in proposal mode: persist an edited proposed value back INTO
// the proposal (still pending). The value only moves to the actual field on accept.
export async function updateProposedMetaField(projectId: any, proposalId: any, field: string, value: any) {
  if (!projectId) throw new Error('no project');
  return callOp(projectId, 'update_proposed_meta_field',
    { proposal_id: String(proposalId), field, value }, 'world');
}


/**
 * Characters — the data seam (loose; no contracts, per the phase-4 rule).
 * The ONE place the page gets its data, scoped to the project in the URL.
 *
 * The Dossier organises the cast by **tier** (protagonist / main / supporting)
 * with rich per-character **facets** (outer/inner need, misbelief, voice,
 * signature line, mentions, first appearance).
 *
 * The backend's `get_characters` only returns `{ name, type, description, want,
 * need, misbelief, story }` today. We map what exists and leave the rest empty
 * (the page renders empty-state affordances for the gaps). Tier is a heuristic
 * on `type` (anything containing "protagonist" → protagonist; else → supporting,
 * with `main` reserved for explicit "main").
 */
import { callOp, callResource } from '../../gateway';

export const EMPTY_CAST = { characters: [] };

// Heuristic: backend `type` is a free string. Map to one of three tiers; the
// page hides any tier section that ends up empty (rather than fabricating one).
function inferTier(raw) {
  const t = String(raw || '').toLowerCase();
  if (!t) return 'supporting';
  if (t.includes('protagonist') || t.includes('hero')) return 'protagonist';
  if (t.includes('main') || t.includes('lead') || t.includes('antagonist')) return 'main';
  return 'supporting';
}

// The explicit role flags are the real signal for tiering; the `type` string is
// only a fallback heuristic for rows that predate them. is_protagonist wins
// (the cast page is anchored by the protagonist), then main/antagonist → main.
function tierOf(c) {
  if (c?.is_protagonist) return 'protagonist';
  if (c?.is_main_character || c?.is_antagonist) return 'main';
  return inferTier(c?.type);
}

// Backend → page shape. Fields the backend doesn't carry stay undefined; the
// page renders an empty-state affordance for each one (the "+ misbelief" prompt
// pattern from the design's mini-facets).
function fromBackend(c, i) {
  const tier = tierOf(c);
  return {
    id: c?.id ?? `c-${i}`,
    tier,
    name: c?.name ?? 'Unnamed',
    type: c?.type ?? '',
    role: c?.type || c?.description || '',
    description: c?.description ?? '',
    // Physical appearance — free `description` + structured slots (age, gender,
    // build, hair, eyes, clothing, home, costumes, features). Always a dict.
    appearance: c?.appearance ?? {},
    // Arc fields
    want: c?.want ?? '',
    need: c?.need ?? '',
    misbelief: c?.misbelief ?? '',
    story: c?.story ?? '',
    internal_arc: c?.internal_arc ?? '',
    backstory: c?.backstory ?? '',
    // Legacy aliases the page still uses
    needOuter: c?.want ?? undefined,
    needInner: c?.need ?? undefined,
    // Notes
    pnote: c?.pnote ?? '',
    summary: c?.summary ?? '',
    status: c?.status ?? '',
    relationship_notes: c?.relationship_notes ?? '',
    // Flags
    is_main_character: c?.is_main_character ?? false,
    is_protagonist: c?.is_protagonist ?? false,
    is_antagonist: c?.is_antagonist ?? false,
    // Profile
    voice_profile: c?.voice_profile ?? {},
    // Outgoing links this character owns ({id, character_id, name, label, note})
    // and the incoming ones other characters made to them (read-only here).
    relationships: c?.relationships ?? [],
    relationships_in: c?.relationships_in ?? [],
    // Other names this character goes by — each {name} (text) or {name, character_id} (ref).
    aliases: c?.aliases ?? [],
    // AI-generated transparent-background portrait URL ('' until generated).
    portrait_url: c?.portrait_url ?? '',
    // Identity colour — auto-assigned a blue-family shade on create; overridable.
    color: c?.color ?? '',
    // UI helpers
    voice: undefined,
    mentions: undefined,
    first: undefined,
    signature: c?.voice_profile?.signature || undefined, // the line only they could say
    gaps: c?.misbelief ? [] : ['misbelief'],
  };
}

export async function loadCharacters(projectId) {
  if (!projectId) return EMPTY_CAST;

  // Tier 2 — via the semantic facade (GET /characters/). Throws on failure so
  // the page shows "Couldn't load", not an empty cast (SA-132).
  const charsRes = await callResource(projectId, 'GET', 'characters/');
  const characters = (charsRes.characters ?? []).map(fromBackend);
  return { characters };
}

// ---- writes (add + edit) ----

export async function addCharacter(projectId, { name, type, description }: any) {
  if (!projectId) throw new Error('no project');
  const res = await callResource(projectId, 'POST', 'characters/', {
    name,
    type: type ?? undefined,
    description: description ?? undefined,
  });
  if (!res?.character) throw new Error('add failed');
  return fromBackend(res.character, 0);
}

// All fields the backend's update_character capability accepts (except `id`).
// Must match AUTHOR_EDITABLE in backend/actions/data/character_fields.py —
// a backend test reads this list and fails if a field here isn't accepted there.
export const UPDATE_FIELDS = [
  'name', 'type', 'description', 'appearance',
  'want', 'need', 'misbelief', 'story', 'internal_arc', 'backstory',
  'pnote', 'summary', 'status', 'relationship_notes',
  'is_main_character', 'is_protagonist', 'is_antagonist',
  'voice_profile', 'relationships', 'aliases', 'color',
];

export async function updateCharacter(projectId, id, patch) {
  if (!projectId) throw new Error('no project');
  // Tier 2 — id rides the path; only changed fields go in the body.
  const body: any = {};
  for (const f of UPDATE_FIELDS) {
    if (patch[f] !== undefined) body[f] = patch[f];
  }
  const res = await callResource(projectId, 'PATCH', `characters/${id}/`, body);
  if (!res?.character) throw new Error('update failed');
  return fromBackend(res.character, 0);
}

// ---- studio: per-field AI proposals ----
// get_character_full returns every field wrapped as
//   { actual_value, proposal?, proposed_value? }
// so the studio can show a pending enrichment field-by-field (green + accept/reject).
// The shared loadCharacters / get_characters stays flat.
export async function loadCharacterFull(projectId, characterId) {
  if (!projectId || !characterId) return null;
  const res = await callOp(projectId, 'get_character_full', { character_id: characterId }, 'Characters');
  return res?.character ?? null;
}

// Accept ONE proposed field with its final (possibly author-edited) value. The
// proposal id is stable; it closes server-side once no pending fields remain.
export async function acceptCharacterField(projectId, proposalId, field, value) {
  if (!projectId) throw new Error('no project');
  return callOp(projectId, 'accept_character_field',
    { proposal_id: String(proposalId), field, value }, 'Characters');
}

// Reject ONE proposed field — drops it from the proposal, writes nothing.
export async function rejectCharacterField(projectId, proposalId, field) {
  if (!projectId) throw new Error('no project');
  return callOp(projectId, 'reject_character_field',
    { proposal_id: String(proposalId), field }, 'Characters');
}

// Blur-save while in proposal mode: persist an edited proposed value back INTO the
// proposal (still pending). The value only moves to the actual field on accept.
export async function updateProposedField(projectId, proposalId, field, value) {
  if (!projectId) throw new Error('no project');
  return callOp(projectId, 'update_proposed_field',
    { proposal_id: String(proposalId), field, value }, 'Characters');
}

// AI portrait: type a description → generate a transparent-background image →
// save its URL on the character. Direct WRITE (op/<capability>/ → 200), so the
// portrait_url comes back on the next get_characters refetch.
export async function generateCharacterPortrait(projectId, characterId, description) {
  if (!projectId) throw new Error('no project');
  return callOp(projectId, 'generate_character_portrait', {
    character_id: characterId,
    description,
  }, 'Characters');
}

export async function deleteCharacter(projectId, characterId) {
  if (!projectId) throw new Error('no project');
  await callResource(projectId, 'DELETE', `characters/${characterId}/`);
}

// Undo a delete (deletes are soft for 10s of Undo) — returns {id, name}.
export async function undeleteCharacter(projectId, characterId) {
  if (!projectId) throw new Error('no project');
  const res = await callOp(projectId, 'undelete_character', { id: characterId }, 'Characters');
  if (!res?.character) throw new Error('undo delete failed');
  return res.character;
}

// ---- gauge (lens) suggestions — real data for the character studio ----
// `get_gauge_suggestions` (Route.READ) returns the candidate list from
// ConsistencySession.gauges.suggested, each item shaped by shape_suggestion_item:
//   { name, kind, term, glyph_id, …, source:'suggested', id, lens_id,
//     scope:{type,name}, scope_type, scope_name, reason, fit, visual }
// The studio lens band filters these by scope_type==='character'.
export async function loadGaugeSuggestions(projectId) {
  if (!projectId) return [];
  try {
    const res = await callOp(projectId, 'get_gauge_suggestions', {}, 'Gauges');
    return res?.lenses ?? [];
  } catch {
    return [];
  }
}

// Ask the engine which library lenses fit this story — appends to the `suggested`
// list (Route.WRITE, runs directly; no proposal). Needs story elements.
export async function suggestGauges(projectId) {
  if (!projectId) throw new Error('no project');
  return callOp(projectId, 'suggest_gauges', {}, 'Gauges');
}

// Canonical gauge-binding flow is: create a preset → bind it → analyse.
// `create_preset` takes the full lens config at the TOP LEVEL of the op args
// (the executor does config=<args>); apply_create_preset only requires `name`.
// Returns { preset_id }.
export async function createPreset(projectId, config) {
  if (!projectId) throw new Error('no project');
  return callOp(projectId, 'create_preset', config, 'Gauges');
}

// Bind a preset to a scope → an instance (Route.WRITE). scope_type MUST be passed
// for a preset bind — unlike a template bind it isn't inferred, so it would
// silently default to 'story' and the gauge wouldn't show under the character.
// `threadRef` is REQUIRED when the preset's axis.walk === 'thread' (it's a plot
// thread's id) — the binding then walks that thread, scope + thread together.
// Returns { binding_id }.
export async function bindPreset(projectId, presetId, scopeName, scopeType = 'character', threadRef) {
  if (!projectId) throw new Error('no project');
  const args: any = {
    ref: { kind: 'preset', id: presetId },
    scope_name: scopeName,
    scope_type: scopeType,
  };
  if (threadRef) args.thread_ref = threadRef;
  return callOp(projectId, 'bind_gauge', args, 'Gauges');
}

// Run the analysis for one bound instance (stores verdict/offending/…).
export async function analyseGauge(projectId, bindingId) {
  if (!projectId) throw new Error('no project');
  return callOp(projectId, 'analyse_gauge', { binding_id: bindingId }, 'Gauges');
}

// Bind an EXISTING ref (the preset/template a bound gauge already references) to
// another thread — "attach another" reuses the same preset, no new one. Returns
// { binding_id }.
export async function bindRef(projectId, ref, scopeName, scopeType = 'character', threadRef) {
  if (!projectId) throw new Error('no project');
  const args: any = { ref, scope_name: scopeName, scope_type: scopeType };
  if (threadRef) args.thread_ref = threadRef;
  return callOp(projectId, 'bind_gauge', args, 'Gauges');
}

// Split the flat list into the three tiers the Dossier renders. Order-stable.
export function partitionByTier(characters) {
  const protagonist = [];
  const main = [];
  const supporting = [];
  for (const c of characters || []) {
    if (c.tier === 'protagonist') protagonist.push(c);
    else if (c.tier === 'main') main.push(c);
    else supporting.push(c);
  }
  return { protagonist, main, supporting };
}

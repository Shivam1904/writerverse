/**
 * Story so far — the data seam (loose; no contracts, per the phase-4 rule).
 * The ONE place the page gets its data, scoped to the project in the URL.
 *
 * Shapes mirror the consistency lab sources (so the swap to real reads is 1:1):
 *   people  ← get_characters  → { id, name, type, description, want, need, misbelief, story }
 *   items   ← get_items       → { name, description }        (discovery.elements.items)
 *   rules   ← get_rules       → { text, scope }              (discovery.elements.rules)
 *   scenes  ← get_grand_outline → { id, label }              (flattened scenes)
 *
 * Real reads now go through the Gateway as USER_BUTTON (one Operation per box):
 * people=`get_characters`, items=`get_items`, rules=`get_rules`.
 * Nothing is fabricated: an empty read shows a gap.
 */
import { callOp } from '../../gateway';
import { getLeanGrandOutline } from '../outline/data';

export const EMPTY_STORY = { people: [], items: [], rules: [], scenes: [] };

// Tag each rule by what its scope applies to, and resolve the subject's real
// name. The engine asks for a bare entity name or "world", but the model also
// emits "character[Name]" / "object[Name]" — handle both. Resolving to the exact
// person/item name keeps a character rule's avatar matching the People box.
// → adds { scopeType: 'character' | 'item' | 'world', scopeName }.
function classifyRules(rules, people, items) {
  const mapOf = (xs, key) =>
    new Map(
      (xs || [])
        .map((x) => [(x?.[key] || '').toLowerCase().trim(), x?.[key]])
        .filter(([k]) => k),
    );
  const peopleByName = mapOf(people, 'name');
  const itemsByName = mapOf(items, 'name');
  const TYPED = /^(character|char|person|object|item|thing|location|place|world|story|global)\b[\s:[\]]*(.*?)[\s\]]*$/i;

  const classify = (scopeRaw) => {
    const raw = (scopeRaw || '').trim();
    if (!raw) return { scopeType: 'world', scopeName: '' };
    const lower = raw.toLowerCase();
    // 1) a bare entity name we know wins outright (even if it starts with a type word)
    if (peopleByName.has(lower)) return { scopeType: 'character', scopeName: peopleByName.get(lower) };
    if (itemsByName.has(lower)) return { scopeType: 'item', scopeName: itemsByName.get(lower) };
    if (['world', 'story', 'global'].includes(lower)) return { scopeType: 'world', scopeName: '' };
    // 2) "type[name]" / "type: name" variants the model sometimes emits
    const m = raw.match(TYPED);
    if (m) {
      const t = m[1].toLowerCase();
      const name = (m[2] || '').trim();
      if (['world', 'story', 'global', 'location', 'place'].includes(t))
        return { scopeType: 'world', scopeName: name };
      if (['object', 'item', 'thing'].includes(t))
        return { scopeType: 'item', scopeName: itemsByName.get(name.toLowerCase()) || name };
      return { scopeType: 'character', scopeName: peopleByName.get(name.toLowerCase()) || name };
    }
    // 3) an unrecognised scope is a world-level rule; keep the author's words
    return { scopeType: 'world', scopeName: raw };
  };

  return (rules || []).map((r) => ({ ...r, ...classify(r.scope) }));
}

// projectId scopes the data; no project in the URL → nothing to show. Each box's
// read is its own Operation; one failing read empties just that box, not the page.
export async function loadStorySoFar(projectId) {
  if (!projectId) return EMPTY_STORY;

  const safe = (p) => p.catch(() => ({}));
  const [charsRes, itemsRes, rulesRes, outlineRes] = await Promise.all([
    safe(callOp(projectId, 'get_characters')),
    safe(callOp(projectId, 'get_items')),
    safe(callOp(projectId, 'get_rules')),
    safe(getLeanGrandOutline(projectId)),
  ]);
  const people = charsRes.characters ?? [];
  const items = itemsRes.items ?? [];
  return {
    people,
    items,
    rules: classifyRules(rulesRes.rules ?? [], people, items),
    scenes: scenesFromOutline(outlineRes.grand_outline),
  };
}

// Flatten the grand outline into the {id,label,chapter…} shape the scenes strip
// wants. The chapter fields let the bracket overlay show real chapters instead of
// the hardcoded "Ch 1 · The Notebook" stub.
function scenesFromOutline(outline) {
  if (!outline?.acts) return [];
  const scenes = [];
  let chapterNumber = 0;
  for (const act of outline.acts) {
    for (const ch of act.chapters || []) {
      chapterNumber++;
      const chapterId = ch.id ?? `ch-${chapterNumber}`;
      const chapterTitle = ch.text || 'untitled';
      for (const sc of ch.scenes || []) {
        scenes.push({
          id: String(sc.id ?? `sc-${scenes.length + 1}`),
          label: sc.text || 'untitled',
          chapterId: String(chapterId),
          chapterNumber,
          chapterTitle,
        });
      }
    }
  }
  return scenes;
}

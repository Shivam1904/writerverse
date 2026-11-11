import { useCallback, useState } from 'react';
import { Eye, Home, Scroll, Users, Tags, Gem, Heart, Swords, type LucideIcon } from 'lucide-react';
import { Icon as KitIcon } from '../../../ui';
import { clickableProps } from '../../../lib/utils';
import { Avatar } from '../../../components/Avatar';
import { FieldEdit } from './FieldEdit';
import { useCharacterFields } from './useCharacterFields';
import { AppearanceProse } from './AppearanceProse';
import { ArcInternal, ArcExternal } from './ArcSection';
import { SectionMarker, ideaTagsFor } from '../../../modules/sectionMarker';
import { ArnLensButton, ArnLensReport, ArnAiRewrite, ArnIdeaButton, ArnIdeaBox } from '../../../modules/arnKit';
import { MarginBlock } from '../../../modules/margin';

const REL_KINDS = ['ally', 'rival', 'mentor', 'mentee', 'romantic', 'family', 'enemy', 'neutral'];

const FACETS = [
  { id: 'appearance', label: 'Appearance', Icon: Eye },
  { id: 'world', label: 'World', Icon: Home },
  { id: 'backstory', label: 'Backstory', Icon: Scroll },
  { id: 'relationships', label: 'Relationships', Icon: Users },
  { id: 'aliases', label: 'Also known as', Icon: Tags },
] as const;

/* The full ordered list of Identity sub-sections — Essence + the two arc halves
 * + the five facets. Shared so the page's MarginOverlay can render docked copies
 * keyed to the same `idsub-<id>` blocks this file renders. */
export const IDENTITY_SUBS: { id: string; Icon: LucideIcon; label: string }[] = [
  { id: 'essence', Icon: Gem, label: 'Essence' },
  { id: 'internal', Icon: Heart, label: 'Internal' },
  { id: 'external', Icon: Swords, label: 'External' },
  ...FACETS.map((f) => ({ id: f.id, Icon: f.Icon, label: f.label })),
];

/* The gutter/dock margin heading for one Identity sub-section — indented +
 * scaled so it reads as a child of Identity (the same treatment thread margins
 * get under Outline). Rendered in BOTH the block gutter (here) and the overlay.
 * The icon draws in `currentColor` (the `.cst-facet-glyph` span tints it). */
export function IdentitySubEntry({ Icon, label, onClick }: { Icon: LucideIcon; label: string; onClick?: () => void }) {
  return (
    <div
      className={`flex origin-left scale-[0.88] items-center gap-1.5 pl-3${onClick ? ' cursor-pointer' : ''}`}
      {...clickableProps(onClick)}
    >
      <span className="cst-facet-glyph inline-flex items-center"><KitIcon as={Icon} size={14} /></span>
      <span className="ty-system-label truncate">{label}</span>
    </div>
  );
}

/**
 * IdentitySection — body of step 1 (the StudioSection wrapper owns the header).
 *
 * Essence line (description) up top, then five facets that ALL start collapsed as
 * "+ Label" chips — Appearance included — and open inline on click. Every field
 * saves through `commitField` (update_character): backstory is its own column,
 * the world object is `appearance.worlditem`, relationships are rows (each one
 * points at another character by id). The green proposed-field flow is
 * preserved via FieldEdit.
 */
export function IdentitySection({
  projectId,
  character,
  siblings = [],
  showIdeas,
}: {
  projectId?: string;
  character: any;
  siblings?: any[];
  showIdeas: boolean;
  marginAware?: boolean;
}) {
  // facets whose registry node carries ideaTags get the AI-rewrite diamond
  // (aliases has none). The idea button/box self-hide on an empty set.
  const facetHasIdeas = (id: string) => ideaTagsFor('character-studio', 'identity', id).length > 0;
  const { commitField, fieldSaved, proposedFor, appearanceProposedFor } = useCharacterFields(projectId, character);

  const appearance: any = character?.appearance ?? {};
  const relationships: any[] = character?.relationships ?? [];
  const relationshipsIn: any[] = character?.relationships_in ?? [];
  const aliases: any[] = character?.aliases ?? [];

  // Which facets already hold data — used only to mark the chips (NOT to auto-open;
  // every facet starts closed and opens on click, per the load-calm requirement).
  const hasData = useCallback((id: string): boolean => {
    if (id === 'appearance') {
      if (String(appearance.description ?? '').trim()) return true;
      return ['age', 'gender', 'build', 'hair', 'eyes', 'clothing', 'costumes', 'features']
        .some((k) => String(appearance[k] ?? '').trim());
    }
    if (id === 'world') return !!String(appearance.home ?? '').trim();
    if (id === 'relationships') return relationships.length > 0 || !!String(character?.relationship_notes ?? '').trim();
    if (id === 'aliases') return aliases.length > 0;
    if (id === 'backstory') return !!String(character?.backstory ?? '').trim();
    return false;
  }, [appearance, relationships.length, aliases.length, character?.relationship_notes, character?.backstory]);

  const [facetsOpen, setFacetsOpen] = useState<Record<string, boolean>>({});
  const toggleFacet = (id: string) => setFacetsOpen((p) => ({ ...p, [id]: !p[id] }));

  // Whether a facet's field(s) currently have a pending AI proposal → a green dot.
  const APPEAR_PROP_KEYS = ['description', 'age', 'gender', 'build', 'hair', 'eyes', 'clothing', 'costumes', 'features'];
  const facetHasProposal = useCallback((id: string): boolean => {
    if (id === 'appearance') return APPEAR_PROP_KEYS.some((k) => !!appearanceProposedFor(k));
    if (id === 'world') return !!appearanceProposedFor('home') || !!appearanceProposedFor('worlditem');
    if (id === 'relationships') return !!proposedFor('relationships') || !!proposedFor('relationship_notes');
    if (id === 'aliases') return !!proposedFor('aliases');
    if (id === 'backstory') return !!proposedFor('backstory');
    return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appearanceProposedFor, proposedFor]);

  const worldItem = String(appearance.worlditem ?? '');
  const backstory = fieldSaved('backstory');

  /* ---- relationships add / remove ----
   * Each link points at another character BY ID (so a rename never breaks it).
   * The whole outgoing list is sent back; the backend replaces the rows. */
  const [relAdding, setRelAdding] = useState(false);
  const [relTargetId, setRelTargetId] = useState('');
  const [relKind, setRelKind] = useState('ally');
  const relPayload = (list: any[]) => list.map((r: any) => ({
    character_id: r.character_id, label: r.label, note: r.note ?? '',
  }));
  const resetRelForm = useCallback(() => {
    setRelAdding(false); setRelTargetId(''); setRelKind('ally');
  }, []);
  const addRelationship = useCallback(async () => {
    const target = siblings.find((c: any) => String(c.id) === String(relTargetId));
    const kind = relKind;
    resetRelForm();
    if (!target) return;
    await commitField({
      relationships: [...relPayload(relationships), { character_id: target.id, label: kind }],
    });
  }, [relTargetId, relKind, relationships, siblings, commitField, resetRelForm]);
  const removeRelationship = useCallback(async (idx: number) => {
    await commitField({ relationships: relPayload(relationships.filter((_: any, i: number) => i !== idx)) });
  }, [relationships, commitField]);

  /* ---- aliases add / remove ---- */
  const [aliasAdding, setAliasAdding] = useState(false);
  const [aliasText, setAliasText] = useState('');
  const [aliasRefId, setAliasRefId] = useState('');
  const aliasDisplay = useCallback((a: any) => {
    if (a?.character_id != null) {
      const live = siblings.find((c: any) => String(c.id) === String(a.character_id));
      return { name: live?.name ?? a?.name ?? 'Unknown', isRef: true };
    }
    return { name: a?.name ?? '', isRef: false };
  }, [siblings]);
  const resetAliasForm = useCallback(() => {
    setAliasAdding(false); setAliasText(''); setAliasRefId('');
  }, []);
  const addAlias = useCallback(async () => {
    let entry: any = null;
    if (aliasRefId) {
      const ref = siblings.find((c: any) => String(c.id) === String(aliasRefId));
      if (ref) entry = { name: ref.name, character_id: ref.id };
    } else {
      const t = aliasText.trim();
      if (t) entry = { name: t };
    }
    resetAliasForm();
    if (!entry) return;
    await commitField({ aliases: [...aliases, entry] });
  }, [aliasRefId, aliasText, siblings, aliases, commitField, resetAliasForm]);
  const removeAlias = useCallback(async (idx: number) => {
    await commitField({ aliases: aliases.filter((_: any, i: number) => i !== idx) });
  }, [aliases, commitField]);

  const name = character?.name || 'They';
  const descSaved = fieldSaved('description');

  const setAppearKey = useCallback((key: string, v: string) => {
    commitField({ appearance: { ...appearance, [key]: v } });
  }, [appearance, commitField]);

  /* ---- one facet card body ---- */
  const facetBody = (id: string) => {
    if (id === 'appearance') {
      return (
        <AppearanceProse
          characterName={character?.name}
          appearance={appearance}
          onCommit={(next) => commitField({ appearance: next })}
          proposedFor={appearanceProposedFor}
        />
      );
    }
    if (id === 'world') {
      const home = String(appearance.home ?? '');
      return (
        <div className="cst-facet-prose">
          <p className="cst-sent">
            Home is{' '}
            <FieldEdit
              value={home}
              restClassName={home.trim() ? 'cst-sent-val' : 'cst-sent-gap'}
              restNode={home.trim() || '— the place that shaped them'}
              editClassName="cst-fe-inline"
              placeholder="the place that shaped them"
              onCommit={(v) => setAppearKey('home', v)}
              proposed={appearanceProposedFor('home')}
            />.
          </p>
          <p className="cst-sent">
            The object that carries their story:{' '}
            <FieldEdit
              value={worldItem}
              restClassName={worldItem.trim() ? 'cst-sent-val' : 'cst-sent-gap'}
              restNode={worldItem.trim() || '— a thing that means more than itself'}
              editClassName="cst-fe-inline"
              placeholder="a thing that means more than itself"
              onCommit={(v) => setAppearKey('worlditem', v)}
              proposed={appearanceProposedFor('worlditem')}
            />.
          </p>
        </div>
      );
    }
    if (id === 'backstory') {
      return (
        <div className="cst-facet-prose">
          <FieldEdit
            value={backstory}
            multiline
            restTag="p"
            restClassName={`cst-desc${backstory.trim() ? '' : ' is-empty'}`}
            restNode={backstory.trim() || 'What happened before page one that the whole book is still answering?'}
            editClassName="cst-fe-block"
            placeholder="What happened before page one that the whole book is still answering?"
            onCommit={(v) => commitField({ backstory: v })}
            proposed={proposedFor('backstory')}
          />
        </div>
      );
    }
    if (id === 'relationships') {
      const relNotes = fieldSaved('relationship_notes');
      return (
        <>
          <div className="cst-rel">
            {relationships.map((r: any, i: number) => (
              <span key={r?.id ?? i} className="cst-rel-chip">
                <Avatar name={r?.name || '?'} size="xs" />
                {r?.name || 'Someone'}
                {r?.label && <span className="cst-rel-kind">· {r.label}</span>}
                <button
                  type="button"
                  className="cst-alias-x"
                  onClick={() => removeRelationship(i)}
                  aria-label={`Remove relationship with ${r?.name}`}
                  title="Remove"
                >×</button>
              </span>
            ))}
            {relAdding ? (
              <span className="cst-rel-form">
                <select
                  className="cst-rel-select"
                  autoFocus
                  value={relTargetId}
                  onChange={(e) => setRelTargetId(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Escape') resetRelForm(); }}
                >
                  <option value="">— pick a character —</option>
                  {siblings.map((c: any) => (
                    <option key={c.id} value={String(c.id)}>{c.name}</option>
                  ))}
                </select>
                <select className="cst-rel-select" value={relKind} onChange={(e) => setRelKind(e.target.value)}>
                  {REL_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
                <button type="button" className="wv2-btn wv2-btn-subtle wv2-btn-sm" onClick={addRelationship} disabled={!relTargetId}>Add</button>
                <button type="button" className="wv2-btn wv2-btn-subtle wv2-btn-sm" onClick={resetRelForm}>Cancel</button>
              </span>
            ) : siblings.length > 0 ? (
              <button type="button" className="cst-rel-add" onClick={() => setRelAdding(true)}>+ relationship</button>
            ) : (
              <span className="cst-rel-kind">Add another character first to link them.</span>
            )}
          </div>
          {relationshipsIn.length > 0 && (
            <div className="cst-rel mt-2">
              {relationshipsIn.map((r: any, i: number) => (
                <span key={r?.id ?? i} className="cst-rel-chip" title={`${r?.name} → ${name}: ${r?.label}`}>
                  <Avatar name={r?.name || '?'} size="xs" />
                  {r?.name || 'Someone'}
                  {r?.label && <span className="cst-rel-kind">· {r.label} → {name}</span>}
                </span>
              ))}
            </div>
          )}
          <div className="cst-facet-prose mt-2">
            <FieldEdit
              value={relNotes}
              multiline
              restTag="p"
              restClassName={`cst-desc${relNotes.trim() ? '' : ' is-empty'}`}
              restNode={relNotes.trim() || 'How these bonds pull on each other — the notes behind the names.'}
              editClassName="cst-fe-block"
              placeholder="How these bonds pull on each other — the notes behind the names."
              onCommit={(v) => commitField({ relationship_notes: v })}
              proposed={proposedFor('relationship_notes')}
            />
          </div>
        </>
      );
    }
    if (id === 'aliases') {
      return (
        <div className="cst-rel cst-alias-row">
          {aliases.map((a: any, i: number) => {
            const d = aliasDisplay(a);
            return (
              <span key={i} className={`cst-alias-chip${d.isRef ? ' is-ref' : ''}`}>
                {d.isRef && <Avatar name={d.name || '?'} size="xs" />}
                {d.name || 'Unnamed'}
                <button
                  type="button"
                  className="cst-alias-x"
                  onClick={() => removeAlias(i)}
                  aria-label={`Remove alias ${d.name}`}
                  title="Remove"
                >×</button>
              </span>
            );
          })}
          {aliasAdding ? (
            <span className="cst-rel-form">
              <input
                className="cst-rel-input"
                autoFocus
                placeholder="alias…"
                value={aliasText}
                disabled={!!aliasRefId}
                onChange={(e) => setAliasText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); addAlias(); }
                  if (e.key === 'Escape') { resetAliasForm(); }
                }}
              />
              {siblings.length > 0 && (
                <select
                  className="cst-rel-select"
                  value={aliasRefId}
                  onChange={(e) => setAliasRefId(e.target.value)}
                  title="…or link another character"
                >
                  <option value="">— or link a character —</option>
                  {siblings.map((c: any) => (
                    <option key={c.id} value={String(c.id)}>{c.name}</option>
                  ))}
                </select>
              )}
              <button type="button" className="wv2-btn wv2-btn-subtle wv2-btn-sm" onClick={addAlias}>Add</button>
              <button type="button" className="wv2-btn wv2-btn-subtle wv2-btn-sm" onClick={resetAliasForm}>Cancel</button>
            </span>
          ) : (
            <button type="button" className="cst-rel-add" onClick={() => setAliasAdding(true)}>+ alias</button>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <>
      {/* Essence — the spine line, carrying the bare `identity` ARN. */}
      <MarginBlock id="idsub-essence" gutter={<IdentitySubEntry Icon={Gem} label="Essence" />}>
        <div className="cst-arc-kicker flex items-center justify-between">
          <span className="cst-arc-verb">Essence<SectionMarker section="identity" /></span>
          <div className="flex items-center gap-1.5">
            <ArnAiRewrite section="identity" name={character?.name} revealOnHover={false} />
            <ArnLensButton section="identity" name={character?.name} filled={!!descSaved.trim()} revealOnHover={false} />
            <ArnIdeaButton section="identity" entity={character} hidden={!showIdeas} />
          </div>
        </div>
        <p className="cst-essence">
          <span className="cst-sent-subj">{name}</span> is{' '}
          <FieldEdit
            value={descSaved}
            multiline
            restClassName={descSaved.trim() ? 'cst-sent-val' : 'cst-sent-gap'}
            restNode={descSaved.trim() || '— who are they, in one breath?'}
            editClassName="cst-fe-inline"
            placeholder="who are they, in one breath?"
            onCommit={(v) => commitField({ description: v })}
            proposed={proposedFor('description')}
          />.
        </p>
        <ArnLensReport section="identity" name={character?.name} filled={!!descSaved.trim()} />
        <ArnIdeaBox section="identity" entity={character} hidden={!showIdeas} />
      </MarginBlock>

      {/* Internal arc — its own sibling section + margin. */}
      <MarginBlock id="idsub-internal" gutter={<IdentitySubEntry Icon={Heart} label="Internal" />}>
        <ArcInternal projectId={projectId} character={character} />
      </MarginBlock>

      {/* External arc — its own sibling section + margin; carries the shared arc idea box. */}
      <MarginBlock id="idsub-external" gutter={<IdentitySubEntry Icon={Swords} label="External" />}>
        <ArcExternal projectId={projectId} character={character} showIdeas={showIdeas} />
      </MarginBlock>

      {/* Facets — each its own margin block; the body collapses via its header
          (the compact "+ chip" row is gone — they behave like thread blocks). */}
      {FACETS.map((f) => (
        <MarginBlock
          key={f.id}
          id={`idsub-${f.id}`}
          gutter={<IdentitySubEntry Icon={f.Icon} label={f.label} onClick={() => toggleFacet(f.id)} />}
        >
          <div className="cst-facet">
            <div className="cst-facet-head">
              <span className="cst-facet-glyph inline-flex items-center"><KitIcon as={f.Icon} size={14} /></span>
              <span className="cst-facet-lbl">{f.label}</span>
              <SectionMarker section="identity" sub={f.id} />
              {facetHasProposal(f.id) && <span className="cst-facet-prop-dot" title="Has a pending suggestion" />}
              <span className="cst-sechead-spacer" />
              <div className="flex items-center gap-1.5">
                {/* canonical heading order: diamond before lens, then ideas */}
                {facetHasIdeas(f.id) && (
                  <ArnAiRewrite section="identity" sub={f.id} name={character?.name} revealOnHover={false} />
                )}
                <ArnLensButton section="identity" sub={f.id} name={character?.name} filled={hasData(f.id)} revealOnHover={false} />
                <ArnIdeaButton section="identity" sub={f.id} entity={character} hidden={!showIdeas} />
              </div>
              <button
                type="button"
                className="cst-facet-x"
                title={facetsOpen[f.id] ? 'Collapse' : 'Open'}
                onClick={() => toggleFacet(f.id)}
              >{facetsOpen[f.id] ? '×' : '+'}</button>
            </div>
            {facetsOpen[f.id] && (
              <>
                {facetBody(f.id)}
                <ArnLensReport section="identity" sub={f.id} name={character?.name} filled={hasData(f.id)} />
                <ArnIdeaBox section="identity" sub={f.id} entity={character} hidden={!showIdeas} />
              </>
            )}
          </div>
        </MarginBlock>
      ))}
    </>
  );
}



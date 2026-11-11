import { FieldEdit } from './FieldEdit';
import { useCharacterFields } from './useCharacterFields';
import { SectionMarker } from '../../../modules/sectionMarker';
import { ArnLensButton, ArnLensReport, ArnAiRewrite, ArnIdeaButton, ArnIdeaBox } from '../../../modules/arnKit';

/* internal arc — the emotional journey. want/need/misbelief map 1:1 to the
 * existing columns; `internal_arc` is the journey itself (how they change inside)
 * — the same field the create form's "Emotional journey" and the cast cards use. */
const INTERNAL: { key: string; verb: string; ph: string; soft?: boolean }[] = [
  { key: 'want', verb: 'Wants', ph: 'what they chase out loud' },
  { key: 'need', verb: 'Needs', ph: 'what would actually heal them' },
  { key: 'misbelief', verb: 'Misbelieves', ph: 'the lie that keeps them stuck' },
  { key: 'internal_arc', verb: 'Changes', ph: 'how they change inside, first page to last' },
];

/**
 * ArcInternal / ArcExternal — the two arc bodies. Once a single ArcCore inside a
 * shared 2-col block; split (2026-06-22) so each is its OWN identity sub-section
 * (section="identity", sub="internal"/"external"), each living in its own margin
 * block in the studio. They render only the kicker header + body + lens report;
 * the surrounding MarginBlock / idea strip is owned by IdentitySection.
 */
export function ArcInternal({ projectId, character }: { projectId?: string; character: any }) {
  const { commitField, fieldSaved, fieldPatch, proposedFor } = useCharacterFields(projectId, character);
  const internalFilled = INTERNAL.some(({ key }) => fieldSaved(key).trim());

  const arcLine = ({ key, verb, ph, soft }: typeof INTERNAL[number]) => {
    const val = fieldSaved(key).trim();
    return (
      <p key={key} className="cst-arc-line">
        <span className="cst-arc-verb">{verb}</span>
        <FieldEdit
          value={fieldSaved(key)}
          multiline
          restClassName={val ? 'cst-sent-val' : `cst-sent-gap${soft ? ' is-soft' : ''}`}
          restNode={val || `— ${ph}`}
          editClassName="cst-fe-inline"
          placeholder={ph}
          onCommit={(v) => commitField(fieldPatch(key, v))}
          proposed={proposedFor(key)}
        />
      </p>
    );
  };

  return (
    <>
      <div className="cst-arc-kicker flex items-center justify-between">
        <span className="cst-arc-verb">Internal · emotional journey<SectionMarker section="identity" sub="internal" /></span>
        <div className="flex items-center gap-1.5">
          <ArnAiRewrite section="identity" sub="internal" name={character?.name} revealOnHover={false} />
          <ArnLensButton section="identity" sub="internal" name={character?.name} filled={internalFilled} revealOnHover={false} />
        </div>
      </div>
      <div className="cst-arc-block">{INTERNAL.map(arcLine)}</div>
      <ArnLensReport section="identity" sub="internal" name={character?.name} filled={internalFilled} />
    </>
  );
}

export function ArcExternal({ projectId, character, showIdeas = true }: { projectId?: string; character: any; showIdeas?: boolean }) {
  const { commitField, fieldSaved, proposedFor } = useCharacterFields(projectId, character);
  const story = fieldSaved('story');
  const externalFilled = !!story.trim();

  return (
    <>
      <div className="cst-arc-kicker flex items-center justify-between">
        <span className="cst-arc-verb">External · the plot points<SectionMarker section="identity" sub="external" /></span>
        <div className="flex items-center gap-1.5">
          <ArnAiRewrite section="identity" sub="external" name={character?.name} revealOnHover={false} />
          <ArnLensButton section="identity" sub="external" name={character?.name} filled={externalFilled} revealOnHover={false} />
          {/* the shared arc idea box (registry `arc` node — the whole-arc tags). */}
          <ArnIdeaButton section="arc" entity={character} hidden={!showIdeas} />
        </div>
      </div>
      <div className="cst-arc-block">
        <ArnIdeaBox section="arc" entity={character} hidden={!showIdeas} />
        <ArnLensReport section="identity" sub="external" name={character?.name} filled={externalFilled} />
        <FieldEdit
          value={story}
          multiline
          restTag="p"
          restClassName={`cst-arc-ext${story.trim() ? '' : ' is-empty'}`}
          restNode={story.trim() || 'The plot points that force the story — what happens to them, in order. Click to write.'}
          editClassName="cst-fe-block cst-fe-block-tall"
          placeholder="The plot points that force the story — what happens to them, in order…"
          onCommit={(v) => commitField({ story: v })}
          proposed={proposedFor('story')}
        />
      </div>
    </>
  );
}

import { FieldEdit } from './FieldEdit';
import { useCharacterFields } from './useCharacterFields';
import { ArnIdeaButton, ArnIdeaBox } from '../../../modules/arnKit';

/**
 * VoiceBlock — body of step 4 (Voice). The StudioSection wrapper owns the header.
 * Two fields (per the Tony-page design): how they speak + the one line only they
 * could say, then the attached idea box. The presence bar graph that follows in
 * the design lives one level up (StudioPresence, mounted right after this block
 * inside the Voice section).
 *
 * Wiring: both save through `commitField` into the `voice_profile` dict —
 * voice → `voice_profile.tone`, the signature line → `voice_profile.signature`.
 * A failed save keeps the author's text open with an error (FieldEdit).
 */
export function VoiceBlock({
  projectId,
  character,
  showIdeas = true,
}: {
  projectId?: string;
  character: any;
  showIdeas?: boolean;
}) {
  const { commitField, fieldSaved, fieldPatch } = useCharacterFields(projectId, character);
  const voice = fieldSaved('voice');
  const signature = fieldSaved('signature');
  const saveSignature = (v: string) => commitField(fieldPatch('signature', v));

  return (
    <>
      <div className="cst-arc-block">
        <p className="cst-sent">
          They speak{' '}
          <FieldEdit
            value={voice}
            multiline
            restClassName={voice.trim() ? 'cst-sent-val' : 'cst-sent-gap'}
            restNode={voice.trim() || '— rhythm & register, and what they hide behind it'}
            editClassName="cst-fe-inline"
            placeholder="rhythm & register, and what they hide behind it"
            onCommit={(v) => commitField(fieldPatch('voice', v))}
          />.
        </p>
        {signature.trim() ? (
          <FieldEdit
            value={signature}
            multiline
            restTag="blockquote"
            restClassName="cst-sig"
            restNode={`“${signature}”`}
            editClassName="cst-fe-block"
            placeholder="The line only they could say…"
            onCommit={saveSignature}
          />
        ) : (
          <p className="cst-sent cst-sig-empty">
            The line only they could say:{' '}
            <FieldEdit
              value=""
              multiline
              restClassName="cst-sent-gap"
              restNode="— one unmistakable sentence"
              editClassName="cst-fe-inline"
              placeholder="one unmistakable sentence"
              onCommit={saveSignature}
            />
          </p>
        )}
      </div>

      <div className="mt-1 flex">
        <ArnIdeaButton section="voice" entity={character} hidden={!showIdeas} />
      </div>
      <ArnIdeaBox section="voice" entity={character} hidden={!showIdeas} />
    </>
  );
}

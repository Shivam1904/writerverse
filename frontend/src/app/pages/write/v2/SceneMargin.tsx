import { Check, Plus } from 'lucide-react';
import { SceneHistory } from './SceneHistory';
import { ThreadDash } from './ThreadDash';
import { ArnAiRewrite } from '../../../modules/arnKit';
import { Badge } from '../../../ui';
import type { WriteBeat } from '../data';
import type { BeatState } from './useChapterBeats';

interface Props {
  projectId?: string;
  sceneNumber: number;
  sceneId: any;
  title: string;
  beats: WriteBeat[];
  active: boolean;
  beatStates: Record<string, BeatState>;
  colorFor: (threadId?: string | null) => string;
  onCycleBeat: (id: string) => void;
  onSelect: () => void;
  onAddBeat?: () => void;
  onSaveScene: (sceneId: any) => unknown;
}

/**
 * The contextual scene margin in the manuscript's left gutter. Collapsed scenes
 * show a row of thread dashes + done/total; the scroll-active scene expands to
 * a terse beat checklist with an "Ask Night Eyes" spark and an "add beat" blank,
 * plus the scene's prose History (see SceneHistory).
 */
export function SceneMargin({
  projectId,
  sceneNumber,
  sceneId,
  title,
  beats,
  active,
  beatStates,
  colorFor,
  onCycleBeat,
  onSelect,
  onAddBeat,
  onSaveScene,
}: Props) {
  const stateOf = (b: WriteBeat): BeatState => beatStates[b.id] ?? 'todo';
  const done = beats.filter((b) => stateOf(b) === 'done').length;
  const total = beats.length;

  return (
    <aside className={`scm${active ? ' is-active' : ''}`}>
      <button
        type="button"
        className="scm-head"
        onClick={onSelect}
        title={active ? title : `Go to scene ${sceneNumber} · ${title}`}
      >
        <span className="scm-n">Scene {sceneNumber}</span>
        <em className="scm-title">{title || 'untitled'}</em>
      </button>

      {active ? (
        <>
          <ArnAiRewrite section="scene" item={String(sceneId)} name={title} revealOnHover={false} />
          <SceneHistory projectId={projectId} sceneId={sceneId} title={title} onSaveScene={onSaveScene} />
          <div className="scm-beats">
            {beats.map((b) => {
              const st = stateOf(b);
              const tc = colorFor(b.thread);
              return (
                <button
                  key={b.id}
                  type="button"
                  className={`scm-beat is-${st}`}
                  style={{ '--tc': tc } as any}
                  onClick={() => onCycleBeat(b.id)}
                  title={b.text}
                  aria-pressed={st === 'done'}
                >
                  <span className="scm-tick">
                    {st === 'done' || st === 'suggested' ? (
                      <Check size={10} strokeWidth={2.6} />
                    ) : null}
                  </span>
                  <span className="scm-beat-label">{b.text}</span>
                  {st === 'suggested' ? <Badge variant="status" tone="gold">AI</Badge> : null}
                </button>
              );
            })}
            {onAddBeat ? (
              <button type="button" className="scm-addbeat" title="Add a beat" onClick={onAddBeat}>
                <span className="scm-tick is-add">
                  <Plus size={9} strokeWidth={2.4} />
                </span>
                <span className="scm-beat-label">Add beat</span>
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <span className="scm-prog" title={`${done} of ${total} beats written`}>
          <span className="scm-prog-bar">
            {beats.map((b) => (
              <ThreadDash key={b.id} color={colorFor(b.thread)} on={stateOf(b) === 'done'} />
            ))}
          </span>
          {total > 0 ? (
            <b>
              {done}/{total}
            </b>
          ) : null}
        </span>
      )}
    </aside>
  );
}

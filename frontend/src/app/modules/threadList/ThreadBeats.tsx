import { BeatList } from '../../ui';
import { useThreadBeats } from './useThreadBeats';

/* ThreadBeats — the thread's beat editor. A thin adapter: it owns the thread's
 * beat state (useThreadBeats: local optimistic state + persistence + AI
 * proposals), then hands everything to the kit <BeatList>.
 *
 *   · list/normal → the everyday kit editor.
 *   · analysis    → kit rows + the red contradiction dot and reasoning list,
 *                   fed by useThreadBeats.contradictionsFor.
 *
 * (Merge/weave is a separate workspace now — see pages/merge/MergePage.) */

export function ThreadBeats({
  projectId,
  thread,
  view = 'normal',
}: {
  projectId?: string;
  thread: any;
  view?: 'normal' | 'analysis';
}) {
  const B = useThreadBeats(projectId, thread);
  const threadColor = thread?.color || 'var(--terra)';
  const kitView = view === 'analysis' ? 'analysis' : 'list';

  return (
    <BeatList
      view={kitView}
      beats={B.beats as any}
      focusId={B.openId}
      color={threadColor}
      contradictionsFor={kitView === 'analysis' ? B.contradictionsFor : undefined}
      onChangeText={(id, t) => B.changeText(id, t)}
      onAdd={(after) => B.addAfter(after)}
      onCycle={(id, d) => B.cycleKind(id, d)}
      onDeleteEmpty={(id) => B.removeAndFocusPrev(id)}
      onBlurField={(id) => B.flush(id)}
      onReorder={(a, o) => B.reorder(a, o)}
      onChangeProposedText={(b, t) => B.changeProposedText(b, t)}
      onAcceptProposal={(b) => B.acceptProposal(b)}
      onRejectProposal={(b) => B.rejectProposal(b)}
      onAcceptAll={() => B.beats.filter((x: any) => x.proposal).forEach((x: any) => B.acceptProposal(x))}
    />
  );
}

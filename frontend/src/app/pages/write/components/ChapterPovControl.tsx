import { useRef, useState } from 'react';
import { callOp } from '../../../gateway';
import { receipt } from '../../../modules/receipt/receiptStore';
import type { ChapterPov } from '../data';

const MODE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'POV…' },
  { value: 'first', label: 'First person' },
  { value: 'third-limited', label: 'Third — limited' },
  { value: 'third-omniscient', label: 'Third — omniscient' },
  { value: 'multiple', label: 'Multiple' },
];

interface Props {
  projectId: string;
  chapterId: any;
  pov: ChapterPov | null;
  characters: any[];
  onLocalUpdate: (pov: ChapterPov) => void;
}

export function ChapterPovControl({
  projectId, chapterId, pov, characters, onLocalUpdate,
}: Props) {
  const [mode, setMode] = useState(pov?.mode ?? '');
  const [character, setCharacter] = useState(pov?.character ?? '');
  const [savedDefault, setSavedDefault] = useState(false);
  const lastWrite = useRef(0);

  // Optimistic: show the new POV now; if the save fails (and no newer pick has
  // been made since), put the previous POV back.
  const persist = (nextMode: string, nextChar: string) => {
    const prev: ChapterPov = { mode, character };
    const next: ChapterPov = { mode: nextMode, character: nextChar };
    const write = ++lastWrite.current;
    onLocalUpdate(next);
    callOp(projectId, 'set_chapter_pov', {
      chapter_id: chapterId, mode: nextMode, character: nextChar,
    }).catch(() => {
      if (write !== lastWrite.current) return;
      receipt("Couldn't save that change — undone");
      setMode(prev.mode);
      setCharacter(prev.character);
      onLocalUpdate(prev);
    });
  };

  // omniscient / multiple don't pin a single POV character
  const needsCharacter = mode === 'first' || mode === 'third-limited';

  return (
    <div className="wr-pov-control" title="Point of view for this chapter">
      <select
        className="wr-pov-mode"
        value={mode}
        onChange={(e) => {
          const m = e.target.value;
          setMode(m);
          persist(m, needsCharacterFor(m) ? character : '');
          if (!needsCharacterFor(m)) setCharacter('');
        }}
      >
        {MODE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {needsCharacter && (
        <select
          className="wr-pov-char"
          value={character}
          onChange={(e) => { setCharacter(e.target.value); persist(mode, e.target.value); }}
        >
          <option value="">whose POV?</option>
          {characters.map((c) => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>
      )}

      {(mode || character) && (
        <button
          type="button"
          className="wr-pov-default-btn"
          title="Use this POV as the default for new chapters"
          onClick={() => {
            callOp(projectId, 'set_project_pov_default', { mode, character })
              .then(() => { setSavedDefault(true); setTimeout(() => setSavedDefault(false), 1500); })
              .catch(() => {}); // not optimistic: the tick shows only on success
          }}
        >
          {savedDefault ? '✓ default' : 'set default'}
        </button>
      )}
    </div>
  );
}

function needsCharacterFor(m: string): boolean {
  return m === 'first' || m === 'third-limited';
}

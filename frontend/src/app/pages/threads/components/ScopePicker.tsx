import { Avatar } from '../../../components/Avatar';
import { EntityMark } from '../../../components/EntityMark';
import { THREAD_SCOPE_TYPES, type ThreadScopeType } from '../data';

// How many cast members surface as one-tap chips before the rest fold into the
// "someone else" dropdown.
const TOP_CHARACTERS = 3;

interface Props {
  scopeType: string;
  scopeName: string;
  /** The cast, used for the character sub-picker (chips + dropdown). */
  characters: any[];
  /** When true the rest-of-cast dropdown shows instead of the "Someone else…" link. */
  showMorePeople: boolean;
  onPickScope: (value: string) => void;
  onPickCharacter: (name: string) => void;
  onSetName: (name: string) => void;
  onShowMore: () => void;
  /** Optional Enter-to-advance hook (the New-thread modal uses it to close the
   *  WHO phase; the edit dialog leaves it undefined). */
  onNameCommit?: () => void;
}

/**
 * ScopePicker — the "who/what is this thread for?" grid + character sub-picker.
 * Pure view: it owns no state and advances no phases; every selection routes
 * back through a callback so each parent (NewThreadModal, EditThreadModal) keeps
 * its own flow. Extracted from NewThreadModal so the create and edit dialogs
 * share one source for the picker and can't drift.
 *
 * Scope kinds are told apart by their glossy silhouette, not colour — `story`
 * leads with the whole-story thread mark, `character` routes to the name-tinted
 * <Avatar>, the rest to <EntityMark> (DESIGN_SYSTEM.md Part A).
 */
export function ScopePicker({
  scopeType,
  scopeName,
  characters,
  showMorePeople,
  onPickScope,
  onPickCharacter,
  onSetName,
  onShowMore,
  onNameCommit,
}: Props) {
  const scopeDef: ThreadScopeType | undefined = THREAD_SCOPE_TYPES.find((s) => s.value === scopeType);
  const needsName = !!scopeDef?.needsName;
  const isCharacterScope = scopeType === 'character';
  const topCharacters = characters.slice(0, TOP_CHARACTERS);
  const restCharacters = characters.slice(TOP_CHARACTERS);

  const commitOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && scopeName.trim()) {
      e.preventDefault();
      onNameCommit?.();
    }
  };

  return (
    <>
      <div className="thr-scope-grid">
        {THREAD_SCOPE_TYPES.map((s) => {
          const on = scopeType === s.value;
          return (
            <button
              key={s.value}
              type="button"
              className={`thr-scope-chip${on ? ' is-on' : ''}`}
              onClick={() => onPickScope(s.value)}
            >
              <EntityMark kind={s.mark} color={on ? 'var(--terra)' : 'var(--ink-3)'} size={18} />
              {s.label}
            </button>
          );
        })}
      </div>

      {isCharacterScope && (
        <div className="thr-scope-who">
          <div className="thr-scope-prompt">Which character?</div>
          {topCharacters.length > 0 && (
            <div className="thr-scope-people">
              {topCharacters.map((c) => {
                const on = scopeName === c.name;
                return (
                  <button
                    key={c.id ?? c.name}
                    type="button"
                    className={`thr-scope-chip thr-person-chip${on ? ' is-on' : ''}`}
                    onClick={() => onPickCharacter(c.name)}
                  >
                    <Avatar name={c.name} size="xs" />
                    {c.name}
                  </button>
                );
              })}
            </div>
          )}
          {restCharacters.length > 0 &&
            (showMorePeople ? (
              <select
                className="thr-field-input thr-select thr-scope-more"
                value={topCharacters.some((c) => c.name === scopeName) ? '' : scopeName}
                onChange={(e) => e.target.value && onPickCharacter(e.target.value)}
              >
                <option value="">Someone else…</option>
                {restCharacters.map((c) => (
                  <option key={c.id ?? c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <button type="button" className="thr-step-more" onClick={onShowMore}>
                Someone else…
              </button>
            ))}
          {characters.length === 0 && (
            <input
              className="thr-field-input thr-scope-name"
              type="text"
              value={scopeName}
              onChange={(e) => onSetName(e.target.value)}
              onKeyDown={commitOnEnter}
              placeholder="Type a character name…"
              autoFocus
            />
          )}
        </div>
      )}

      {needsName && !isCharacterScope && (
        <input
          className="thr-field-input thr-scope-name"
          type="text"
          value={scopeName}
          onChange={(e) => onSetName(e.target.value)}
          onKeyDown={commitOnEnter}
          placeholder={`Which ${scopeDef?.label?.toLowerCase() ?? 'one'}?`}
        />
      )}
    </>
  );
}

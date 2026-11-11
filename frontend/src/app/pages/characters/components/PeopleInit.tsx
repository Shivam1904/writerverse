import { useEffect, useRef, useState } from 'react';
import { CharacterSuggestions } from './CharacterSuggestions';
import { DraftCharacterCandidates } from './DraftCharacterCandidates';
import { ProfileForm, type ProfileFieldDef } from '../../../components/ProfileForm';
import { InitHead } from '../../../components/InitHead';
import { GenerateIdeasPopover } from '../../../components/GenerateIdeasPopover';
import { loadBraindumps, addBraindump } from '../../braindumps/data';
import '../people-init.css';

/** Role choices, rendered as single-select chips. `type` is a free string on
 *  the model; these are the common ones (Protagonist is the default). */
const ROLE_OPTIONS = ['Protagonist', 'Antagonist', 'Main', 'Supporting'];

const PROFILE_FIELDS: ProfileFieldDef[] = [
  { key: 'type', label: 'Role', options: ROLE_OPTIONS },
  { key: 'description', label: 'Identity', multiline: true, placeholder: 'Spends hours alone, inventing people. Talks to them. Files it under "work."' },
  { key: 'internal_arc', label: 'Emotional journey', multiline: true, placeholder: 'Slowly discovers that being right about everything isn\'t actually a personality.' },
  { key: 'story', label: 'Plot', multiline: true, placeholder: 'Gets what they wanted. Turns out it was the wrong thing. Classic.' },
];

const SEEDS = ['the sister no one mentions', 'a kindly villain'];

// "Borrow a shape" — unmistakable archetypes, no names. Tapping one appends its
// sentence to the describe field (multi-select; tap again to remove).
const SHAPES: Array<{ id: string; text: string; kicker: string; icon: React.ReactNode }> = [
  {
    id: 'chosen',
    text: 'the orphan with a lightning scar and a destiny',
    kicker: 'the chosen one',
    icon: <svg viewBox="0 0 24 24"><path d="M5 14l-2 7 9-4 9 4-2-7" /><path d="M12 3v8" /><path d="M9 7l3-3 3 3" /></svg>,
  },
  {
    id: 'fallen',
    text: 'the mild teacher who became a kingpin',
    kicker: 'the fallen man',
    icon: <svg viewBox="0 0 24 24"><path d="M3 19l5-12 4 7 4-9 5 14" /></svg>,
  },
  {
    id: 'vigilante',
    text: 'the billionaire orphan who fights crime by night',
    kicker: 'the masked vigilante',
    icon: <svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7" /><path d="M5 10v9h14v-9" /><circle cx="12" cy="14" r="2" /></svg>,
  },
  {
    id: 'bearer',
    text: 'the small one carrying a ring that wants to be lost',
    kicker: 'the reluctant bearer',
    icon: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><path d="M12 4v8l5 3" /></svg>,
  },
  {
    id: 'symbol',
    text: "the girl who volunteered in her sister's place",
    kicker: 'the unwilling symbol',
    icon: <svg viewBox="0 0 24 24"><path d="M5 4l3 8-3 8M19 4l-3 8 3 8M8 12h8" /></svg>,
  },
  {
    id: 'mind',
    text: 'the cold genius who solves what no one else can',
    kicker: 'the consulting mind',
    icon: <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M16 16l5 5" /></svg>,
  },
];

// A shape describes a person but never names them — so when one patches into an
// empty field we lead with a visible blank: an obvious slot the author fills with
// their own name. `splitNameDesc` peels that name back off before we generate.
const NAME_SLOT = '____';

/**
 * Pull a leading "<name>, the …" appositive off the description so a name the
 * author typed rides in the `name` field. An *unfilled* blank (still `____`) is
 * just stripped — we never send the placeholder to the engine.
 */
const splitNameDesc = (raw: string): { name: string; description: string } => {
  const noBlank = raw.trim().replace(/^_{2,}\s*,?\s*/, '').trim();
  const m = noBlank.match(/^([^,]{1,40}),\s+((?:the|a|an)\s.+)$/i);
  if (m) return { name: m[1].trim(), description: m[2].trim() };
  return { name: '', description: noBlank };
};

interface Props {
  projectId?: string;
  /** Persist a by-hand profile → create a character. Resolves when saved. */
  onCreate: (values: Record<string, string>) => Promise<void>;
  /**
   * Describe one. Creates the character directly via `add_character` from the
   * author's own words (the same plain write as the populated page; no AI).
   * Name is optional: if the author led with one ("Mara, the …") we peel it off
   * and send it. Resolves when the character has been created.
   */
  onGenerate?: (vals: { name: string; description: string }) => Promise<void> | void;
}

/**
 * PeopleInit — first touch of the People page, ported from
 * writerverse/people-init.html. Shown only while the project has no cast; the
 * moment the first person lands, CharactersPage falls through to the dossier.
 *
 * Three ways in, top to bottom:
 *   1 · Suggestions — the shared <CharacterSuggestions> block (renders only
 *       when the engine has proposed someone).
 *   2 · Describe one — the describe box holds the character's name + line;
 *       "Borrow a shape" lives inside it (a panel that reveals on focus, each tap
 *       appending an archetype sentence). The Create button opens the shared
 *       <GenerateIdeasPopover>: the project's braindumps as a pick-list of ideas
 *       (all ticked), plus an inline field to add a new one. Adding folds the
 *       picked ideas into the description as context and creates the character
 *       directly via `add_character`. New ideas typed in the popover are saved
 *       as braindumps.
 *   3 · Add a profile by hand — the reusable <ProfileForm>; name is the only
 *       required field, save creates the character.
 */
export function PeopleInit({ projectId, onGenerate, onCreate }: Props) {
  const [desc, setDesc] = useState('');
  const [focused, setFocused] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // Generate popover — the braindumps-as-ideas picker. Generation happens THERE;
  // the describe box above stays the character's identity, ideas ride as context.
  const [genOpen, setGenOpen] = useState(false);
  const [braindumps, setBraindumps] = useState<any[]>([]);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const genBtnRef = useRef<HTMLButtonElement>(null);
  // Set when a shape just dropped the name blank in, so the effect below can
  // select it once the new value has painted.
  const selectSlotRef = useRef(false);

  // Lazy-load braindumps the first time the popover opens (the ideas the writer
  // picks from). Cleared after new ones are saved so the next open re-fetches.
  useEffect(() => {
    if (genOpen && braindumps.length === 0 && projectId) {
      loadBraindumps(projectId).then((r) => setBraindumps(r.braindumps || [])).catch(() => {});
    }
  }, [genOpen, projectId, braindumps.length]);

  // The borrow-a-shape panel opens once the field is engaged and stays open
  // while anything is selected (so tapping a shape — which blurs the field —
  // doesn't collapse it out from under the click).
  const showShapes = focused || picked.size > 0;

  // After a shape leads with the name blank, highlight it so the first keystroke
  // becomes the character's name — making "this is yours to fill" unmistakable.
  useEffect(() => {
    if (!selectSlotRef.current) return;
    selectSlotRef.current = false;
    const ta = taRef.current;
    if (ta) { ta.focus(); ta.setSelectionRange(0, NAME_SLOT.length); }
  }, [desc]);

  // First shape into an empty field leads with the name blank; later shapes just
  // append after it (one blank, always at the front).
  const appendSentence = (d: string, t: string) =>
    d.trim() ? `${d.replace(/\s+$/, '')} ${t}` : `${NAME_SLOT}, ${t}`;
  const removeSentence = (d: string, t: string) => {
    const next = d.replace(t, '').replace(/\s{2,}/g, ' ').replace(/\s*,\s*$/, '').trim();
    return next === NAME_SLOT ? '' : next; // only the blank left → clear the field
  };

  const toggleShape = (s: (typeof SHAPES)[number]) => {
    // Derive once from this render's `picked`, then call both setters with PURE
    // updaters — never nest setDesc inside the setPicked updater (StrictMode
    // double-invokes updaters in dev, which would append the sentence twice).
    const isOn = picked.has(s.id);
    const justAddedName = !isOn && !desc.trim(); // first shape into an empty field
    setPicked((prev) => {
      const next = new Set(prev);
      if (isOn) next.delete(s.id);
      else next.add(s.id);
      return next;
    });
    setDesc((d) => (isOn ? removeSentence(d, s.text) : appendSentence(d, s.text)));
    if (justAddedName) selectSlotRef.current = true;
  };

  const applySeed = (seed: string) => {
    setDesc(seed);
    taRef.current?.focus();
  };

  // Generate (from the popover). The describe box is the character's identity:
  // peel a typed name off the front (and drop an unfilled `____` blank). The
  // picked braindumps + typed ideas fold into the description as context, then
  // we create the character directly via `add_character`. New ideas are saved
  // as braindumps.
  //
  // Throws on failure so the popover keeps itself open (it owns the spinner); we
  // only clear the field once the character has actually been created.
  const handleGenerate = async ({ focus, added }: { focus: string[]; all: string[]; added: string[] }) => {
    if (!onGenerate) return;
    const { name, description } = splitNameDesc(desc);
    const parts: string[] = [];
    if (description) parts.push(description);
    if (focus.length) parts.push('Ideas to weave in:\n' + focus.map((i) => `- ${i}`).join('\n'));
    const full = parts.join('\n\n');
    if (!full) return;

    await onGenerate({ name, description: full });
    if (added.length && projectId) {
      await Promise.allSettled(added.map((body) => addBraindump(projectId, { body })));
    }
    setDesc('');
    setPicked(new Set());
    setBraindumps([]); // the list may have grown — re-fetch on next open
  };

  return (
    <div className="wv2-init pi-field">
      <InitHead
        section="characters"
        eyebrow="Imagine · characters"
        title={<>Someone's about<br />to <em>exist.</em></>}
        sub="Describe someone in a line — or fill a blank profile by hand."
      />

      {/* 1 · suggestions (shared; null when nothing pending) — sits under the hero */}
      <CharacterSuggestions />

      {/* 1b · names the AI spotted in braindumps but not yet cast — draft them
          here without leaving for Braindumps (null when none). */}
      <DraftCharacterCandidates projectId={projectId} />

      {/* 2 · describe one (creates the character directly via add_character; no AI) */}
      <div className="wv2-init-seam">
        <span className="wv2-init-seam-lbl">Describe one in a line</span>
        <span className="wv2-init-seam-ln" />
      </div>

      <div className="pi-describe">
        <textarea
          ref={taRef}
          className="pi-dtext"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={'their name, then a line — "Mara, a retired diver who\'s afraid of the sea now"…'}
          rows={2}
          aria-label="describe a person"
        />

        <div className="pi-dfoot">
          <div className="pi-seeds">
            <span className="pi-seeds-lbl">try —</span>
            {SEEDS.map((s) => (
              <button key={s} type="button" className="pi-seed" onClick={() => applySeed(s)}>{s}</button>
            ))}
          </div>
          <button
            type="button"
            ref={genBtnRef}
            className="pi-generate"
            disabled={!onGenerate}
            onClick={() => setGenOpen((v) => !v)}
          >
            Create
          </button>
        </div>

        {/* borrow a shape — nested inside describe, revealed on focus */}
        {showShapes && (
          <div className="pi-shapes-wrap">
            <div className="pi-shapes-lead">borrow a shape — tap one; we leave their name blank for you</div>
            <div className="pi-shapes">
              {SHAPES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`pi-shape ${picked.has(s.id) ? 'is-on' : ''}`}
                  // keep the textarea focused so the panel doesn't collapse on click
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => toggleShape(s)}
                  aria-pressed={picked.has(s.id)}
                >
                  <span className="pi-shape-i">{s.icon}</span>
                  <span className="pi-shape-l">
                    {s.text}
                    <span className="pi-shape-k">{s.kicker}</span>
                  </span>
                  <span className="pi-shape-tick" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10" /></svg>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 3 · add a profile by hand */}
      <div className="wv2-init-seam">
        <span className="wv2-init-seam-lbl">Or add a profile, by hand</span>
        <span className="wv2-init-seam-ln" />
      </div>

      <ProfileForm
        fields={PROFILE_FIELDS}
        badge="No. 001"
        note="Placeholders are only a suggestion — overwrite every line."
        submitLabel="Add to cast"
        busyLabel="Adding…"
        // First character defaults to Protagonist — most authors start with theirs.
        initialValues={{ type: 'Protagonist' }}
        onSave={onCreate}
      />

      <GenerateIdeasPopover
        open={genOpen}
        onClose={() => setGenOpen(false)}
        anchorRef={genBtnRef}
        braindumps={braindumps}
        ai={false}
        title="Add a character"
        hint="Ticked ideas are added to their description as notes — untick any to leave out, or jot a new one. Your line above stays who they are."
        generateLabel="Add to cast"
        busyLabel="Adding…"
        addPlaceholder="add an idea…"
        saveNote="New ideas are saved to your braindumps."
        // The describe box can stand alone as the identity, so Add works
        // even with no idea ticked here.
        extraReady={!!desc.trim()}
        onGenerate={handleGenerate}
      />
    </div>
  );
}

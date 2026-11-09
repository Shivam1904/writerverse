import { useRef, useState } from 'react';
import './profile-form.css';

/**
 * One editable field on a {@link ProfileForm}. `key` is the value key handed
 * back to `onSave`; `label` is the small uppercase tag; `placeholder` is the
 * witty suggestion shown until the author overwrites it.
 */
export interface ProfileFieldDef {
  key: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  /** When set, the field renders as a row of single-select chips (a radio group)
   *  instead of a text input — e.g. Role → Protagonist / Antagonist / … */
  options?: string[];
}

interface ProfileFormProps {
  /** The fields BELOW the name, in render order. Caller picks which of our
   *  real model fields to expose + their placeholders — that's the whole point
   *  of the component being reusable. */
  fields: ProfileFieldDef[];
  /** Big italic title input. The ONLY required field. */
  namePlaceholder?: string;
  tabLabel?: string;
  badge?: string;
  note?: string;
  submitLabel?: string;
  busyLabel?: string;
  /** Pre-fill field values (keyed by field key) — e.g. default Role to
   *  "Protagonist". Blank fields still drop out on save. */
  initialValues?: Record<string, string>;
  /** Persist. Receives `{ name, ...filledFields }` (blank fields omitted). */
  onSave: (values: Record<string, string>) => Promise<void> | void;
}

/**
 * ProfileForm — the "blank profile, by hand" card from the people-init design
 * (writerverse/people-init.html · block 3), made into a real inline form.
 *
 * It's deliberately field-agnostic: the caller passes a `fields` config so the
 * same card can collect a character, a place, a faction — whatever — by naming
 * the model fields it wants and the placeholder copy to suggest. Right now only
 * the People init page uses it (character fields, name-required).
 *
 * Placeholders read as italic ghost text; the moment you type, the line turns
 * to solid ink. Submit is blocked until `name` has content.
 */
export function ProfileForm({
  fields,
  namePlaceholder = 'Name them yourself',
  tabLabel = 'Blank profile',
  badge,
  note,
  submitLabel = 'Add to cast',
  busyLabel = 'Saving…',
  initialValues,
  onSave,
}: ProfileFormProps) {
  const [name, setName] = useState('');
  const [values, setValues] = useState<Record<string, string>>(initialValues ?? {});
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const set = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));
  const canSave = name.trim().length > 0 && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setBusy(true);
    try {
      const out: Record<string, string> = { name: name.trim() };
      for (const f of fields) {
        const val = (values[f.key] ?? '').trim();
        if (val) out[f.key] = val;
      }
      await onSave(out);
      setName('');
      setValues(initialValues ?? {});
      nameRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="pf-card" onSubmit={submit}>
      <span className="pf-tab">● {tabLabel}</span>
      {badge && <span className="pf-badge">{badge}</span>}

      <div className="pf-portrait" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="8.5" r="4" />
          <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
        </svg>
      </div>

      <div className="pf-body">
        <input
          ref={nameRef}
          className="pf-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={namePlaceholder}
          aria-label="name"
        />

        <div className="pf-fields">
          {fields.map((f) => {
            // Chip fields can't sit in a <label> (a label binds to ONE control);
            // render them in a plain <div> instead.
            const Wrapper: any = f.options ? 'div' : 'label';
            return (
              <Wrapper className="pf-field" key={f.key}>
                <span className="pf-k">{f.label}</span>
                {f.options ? (
                  <div className="pf-chips" role="radiogroup" aria-label={f.label}>
                    {f.options.map((opt) => {
                      const on = (values[f.key] ?? '') === opt;
                      return (
                        <button
                          key={opt}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          className={`pf-chip${on ? ' is-on' : ''}`}
                          onClick={() => set(f.key, opt)}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                ) : f.multiline ? (
                  <textarea
                    className="pf-v"
                    rows={2}
                    value={values[f.key] ?? ''}
                    placeholder={f.placeholder}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                ) : (
                  <input
                    className="pf-v"
                    type="text"
                    value={values[f.key] ?? ''}
                    placeholder={f.placeholder}
                    onChange={(e) => set(f.key, e.target.value)}
                  />
                )}
              </Wrapper>
            );
          })}
        </div>

        <div className="pf-foot">
          {note && <span className="pf-note">{note}</span>}
          <button type="submit" className="wv2-btn wv2-btn-primary" disabled={!canSave}>
            <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
            {busy ? busyLabel : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}

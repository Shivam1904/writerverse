import { useEffect, useMemo, useRef, useState } from 'react';
import { SectionMark } from '../../../components/SectionMark';
import { Button, Card, Eyebrow } from '../../../ui';
import { GlyphColorPicker } from './GlyphColorPicker';
import {
  KNOWN_SECTIONS,
  knownSection,
  resolveSectionVisual,
  type SectionGlyph,
} from '../sectionMeta';

/**
 * AddSectionPanel — the inline "+ new section" affordance, simplified to a kit
 * picker Card: a row of known-section marks to start from, a name field with a
 * live mark preview, and the glyph/colour picker. (The glossy plinth shelf was
 * retired in the kit migration.) On submit it calls `onAdd(name, glyph, color)`.
 */

interface Props {
  /** Block keys already present, so known suggestions can show as "added". */
  existingKeys?: Set<string>;
  onAdd: (name: string, glyph: SectionGlyph, color: string) => void;
  onCancel: () => void;
}

export function AddSectionPanel({ existingKeys, onAdd, onCancel }: Props) {
  const [name, setName] = useState('');
  const [glyph, setGlyph] = useState<SectionGlyph | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const preview = useMemo(
    () => resolveSectionVisual({ name, label: name, glyph, color }),
    [name, glyph, color],
  );

  const pickKnown = (key: string) => {
    const k = knownSection(key);
    if (!k) return;
    setName(k.label);
    setGlyph(k.glyph);
    setColor(k.color);
    setTimeout(() => nameRef.current?.focus(), 0);
  };

  const canAdd = name.trim().length > 0;
  const submit = () => {
    if (!canAdd) return;
    onAdd(name.trim(), preview.glyph, preview.color);
  };

  return (
    <Card variant="container" className="mt-2 border border-border p-5">
      <Eyebrow className="mb-3 text-[var(--terra-deep)]">New section</Eyebrow>

      {/* ① known sections — a simple shelf of marks */}
      <div className="ty-system-caption mb-2 uppercase tracking-[0.11em]">Start from one we know</div>
      <div className="flex flex-wrap gap-2">
        {KNOWN_SECTIONS.map((s) => {
          const added = existingKeys?.has(s.key);
          const on = name.trim().toLowerCase() === s.label.toLowerCase();
          return (
            <button
              key={s.key}
              type="button"
              className={`flex w-[86px] flex-col items-center gap-1.5 rounded-[var(--r-lg)] border px-1.5 pb-2 pt-3 transition-colors ${
                on ? 'border-[var(--terra)] bg-[color-mix(in_srgb,var(--terra)_5%,var(--surface))]' : 'border-border hover:border-[var(--line-3)]'
              } ${added && !on ? 'opacity-55' : ''}`}
              onClick={() => pickKnown(s.key)}
              title={added ? `${s.label} — already in your world` : s.hint}
            >
              <SectionMark glyph={s.glyph} color={s.color} label={s.label} size={28} />
              <span className="ty-system-label">{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* ② name your own — live mark preview + field */}
      <div className="my-4 flex items-center gap-3 before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
        <span className="ty-system-caption uppercase tracking-[0.08em]">or name your own</span>
      </div>
      <div className="flex items-center gap-3 rounded-[var(--r-md)] border-[1.5px] border-[var(--terra-soft)] p-2 focus-within:border-[var(--terra)]">
        <span className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[var(--r-md)] bg-[var(--surface-2)]">
          <SectionMark glyph={preview.glyph} color={preview.color} label={name || '?'} size={30} />
        </span>
        <input
          ref={nameRef}
          className="ty-story-body flex-1 border-0 bg-transparent text-[17px] outline-none"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
          placeholder="Name this section — Factions, Magic, Calendar…"
        />
      </div>

      {/* ③ glyph + colour pickers */}
      <div className="mt-4">
        <GlyphColorPicker
          glyph={preview.glyph}
          color={preview.color}
          label={name}
          onPickGlyph={setGlyph}
          onPickColor={setColor}
        />
      </div>

      <div className="mt-[18px] flex items-center justify-between gap-3">
        <span className="ty-story-body text-[11.5px] italic text-[var(--ink-4)]">A section is just a heading — add things to it after.</span>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" size="sm" disabled={!canAdd} onClick={submit}>Add section</Button>
        </div>
      </div>
    </Card>
  );
}

import { SectionMark } from '../../../components/SectionMark';
import { ColorSwatches } from '../../../ui';
import { SECTION_COLORS, SECTION_GLYPHS, type SectionGlyph } from '../sectionMeta';

/**
 * GlyphColorPicker — the glyph (mark) + colour swatches shared by the
 * AddSectionPanel and the editable world-margin entry (WorldMargin). The glyph
 * cells preview the live colour; the colour dots are the shared aspect palette.
 */
export function GlyphColorPicker({
  glyph,
  color,
  label,
  onPickGlyph,
  onPickColor,
}: {
  glyph: SectionGlyph;
  color: string;
  /** A name to stamp on the generic lettered token preview. */
  label: string;
  onPickGlyph: (g: SectionGlyph) => void;
  onPickColor: (c: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-7">
      <div>
        <div className="ty-system-caption mb-2 uppercase tracking-[0.11em]">Glyph</div>
        <div className="flex max-w-[320px] flex-wrap gap-1.5">
          {SECTION_GLYPHS.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => onPickGlyph(g)}
              title={g === 'generic' ? 'Lettered token' : g}
              className={`grid h-9 w-9 place-items-center rounded-[var(--r-md)] border bg-[var(--surface)] transition-colors ${
                glyph === g
                  ? 'border-[var(--terra)] bg-[color-mix(in_srgb,var(--terra)_5%,var(--surface))]'
                  : 'border-border hover:border-[var(--line-3)]'
              }`}
            >
              <SectionMark glyph={g} color={color} label={label || '?'} size={20} />
            </button>
          ))}
        </div>
      </div>
      <div>
        <div className="ty-system-caption mb-2 uppercase tracking-[0.11em]">Color</div>
        <ColorSwatches value={color} palette={SECTION_COLORS} onPick={onPickColor} />
      </div>
    </div>
  );
}

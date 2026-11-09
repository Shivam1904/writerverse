import * as React from 'react';

import { Popover } from './overlays';

/**
 * ColorSwatches — the solid identity-colour dots, the selected one ringed. The
 * styling is lifted verbatim from the world GlyphColorPicker so the look is
 * shared (no new CSS). When `onReset`/`defaultColor` are given, a leading dashed
 * "Auto" dot clears the override back to the derived default.
 */
export function ColorSwatches({
  value, palette, onPick, defaultColor, onReset,
}: {
  /** The stored override (empty = on the derived default). */
  value?: string;
  palette: string[];
  onPick: (c: string) => void;
  /** The derived default colour, painted inside the Auto dot. */
  defaultColor?: string;
  onReset?: () => void;
}) {
  const isAuto = !(value || '').trim();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          aria-label="Reset to default colour"
          title="Auto — derived default"
          className={`grid h-[23px] w-[23px] place-items-center rounded-full border border-dashed transition-shadow ${
            isAuto
              ? 'border-[var(--ink)] shadow-[0_0_0_2px_var(--ink)]'
              : 'border-[var(--line-3)]'
          }`}
          style={{ background: defaultColor || 'transparent' }}
        >
          <span className="text-[8px] font-semibold leading-none text-[var(--surface)] mix-blend-difference">A</span>
        </button>
      )}
      {palette.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onPick(c)}
          aria-label={`colour ${c}`}
          className={`h-[23px] w-[23px] rounded-full transition-shadow ${
            !isAuto && value === c
              ? 'shadow-[inset_0_1px_1px_rgba(255,255,255,.5),0_0_0_2px_var(--ink)]'
              : 'shadow-[inset_0_1px_1px_rgba(255,255,255,.5),0_0_0_1px_rgba(0,0,0,.06)]'
          }`}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

/**
 * ColorDotPicker — a small colour dot that opens the swatch palette in a popover.
 * The dot paints the *resolved* colour (`color`); `value` is the stored override
 * used only for the selected-swatch ring. Drop it next to any entity heading.
 */
export function ColorDotPicker({
  color, value, palette, onPick, defaultColor, onReset, size = 13, title, align = 'start',
}: {
  /** Resolved colour shown on the trigger dot. */
  color: string;
  /** Stored override (drives swatch selection). */
  value?: string;
  palette: string[];
  onPick: (c: string) => void;
  defaultColor?: string;
  onReset?: () => void;
  size?: number;
  title?: string;
  align?: 'start' | 'end';
}) {
  return (
    <Popover
      align={align}
      trigger={
        <button
          type="button"
          title={title || 'Pick colour'}
          aria-label="Pick colour"
          className="inline-flex shrink-0 rounded-full transition-shadow hover:shadow-[0_0_0_3px_var(--line-2)]"
          style={{
            width: size,
            height: size,
            background: color,
            boxShadow: 'inset 0 1px 1px rgba(255,255,255,.5), 0 0 0 1px rgba(0,0,0,.18)',
          }}
        />
      }
    >
      <div className="p-1">
        <ColorSwatches
          value={value}
          palette={palette}
          onPick={onPick}
          defaultColor={defaultColor}
          onReset={onReset}
        />
      </div>
    </Popover>
  );
}

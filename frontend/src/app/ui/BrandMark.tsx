import { Book } from 'lucide-react'

/**
 * The single canonical WriterVerse brand — one source of truth, rendered
 * identically on the library bar, the in-app topbar, and the signup/login
 * header so the brand can't drift apart again. Pure visual — wrap it in a
 * Link/button at the call site for navigation.
 *
 * Three knobs, all controlled from here:
 *   - GLYPH  — swap this one constant to change the icon everywhere in-app.
 *   - size   — 'sm' | 'md' | 'lg' (box + icon + text scale together).
 *   - part   — 'full' (glyph + wordmark) | 'glyph' (icon only) | 'wordmark' (text only).
 *
 * NB: the browser-tab favicon (frontend/public/favicon.svg) is a separate
 * static file that loads before React, so it cannot import this component —
 * it hand-mirrors the same glyph. Keep the two in sync when changing GLYPH.
 */

/** The brand glyph. Swap for any lucide icon (or a custom SVG) to restyle the mark everywhere. */
const GLYPH = Book

type BrandSize = 'sm' | 'md' | 'lg'
type BrandPart = 'full' | 'glyph' | 'wordmark'

const SIZES: Record<BrandSize, { wrap: string; box: string; icon: string; text: string }> = {
  sm: { wrap: 'gap-2', box: 'h-[26px] w-[26px]', icon: 'h-[15px] w-[15px]', text: 'text-[16px]' },
  md: { wrap: 'gap-[11px]', box: 'h-[34px] w-[34px]', icon: 'h-[19px] w-[19px]', text: 'text-[21px]' },
  lg: { wrap: 'gap-3', box: 'h-11 w-11', icon: 'h-6 w-6', text: 'text-[30px]' },
}

export function BrandMark({
  size = 'md',
  part = 'full',
  className = '',
}: {
  size?: BrandSize
  part?: BrandPart
  className?: string
}) {
  const s = SIZES[size]

  const glyph = (
    <span
      className={`grid shrink-0 place-items-center rounded-[var(--r-md)] bg-[var(--terra-soft)] text-[var(--terra)] shadow-[inset_0_0_0_1px_var(--line-2)] ${s.box}`}
    >
      <GLYPH className={s.icon} />
    </span>
  )

  const wordmark = (
    <span className={`font-serif font-semibold leading-none tracking-[-0.01em] text-[var(--ink)] ${s.text}`}>
      Writer<span className="italic text-[var(--terra)]">Verse</span>
    </span>
  )

  if (part === 'glyph') return <span className={`inline-flex ${className}`}>{glyph}</span>
  if (part === 'wordmark') return <span className={`inline-flex ${className}`}>{wordmark}</span>

  return (
    <span className={`inline-flex items-center ${s.wrap} ${className}`}>
      {glyph}
      {wordmark}
    </span>
  )
}

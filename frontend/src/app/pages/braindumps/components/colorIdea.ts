/**
 * Idea colours — a special braindump tag that carries a single accent colour
 * for the IDEA itself, stored in the same JSON tags list as `color-idea[#766564]`.
 * **One per idea**: setting a colour replaces any existing one. It drives the
 * idea row's tint + left bar and a colour filter; everywhere else it's just
 * another tag string, but it's hidden from the visible tag chips.
 *
 * Independent of a tag's group dot-colour (see tagColor in tagCategories.ts).
 */

const COLOR_IDEA_RE = /^color-idea\[(#[0-9a-fA-F]{3,8})\]$/;

// A small, muted palette that reads well on the paper theme — deliberately
// desaturated so the row tint stays a whisper, not a highlighter.
export const IDEA_COLORS = [
  '#c2613f', // clay
  '#c79a3e', // ochre
  '#7a9a52', // olive
  '#4f8f9e', // teal
  '#5f7fb5', // blue
  '#9b6f9e', // mauve
  '#a8636f', // rose
  '#7a6a64', // taupe
];

export function isColorIdea(t: string): boolean {
  return COLOR_IDEA_RE.test(t);
}

/** The idea's colour (first color-idea tag found), or null. */
export function ideaColorOf(tags?: string[]): string | null {
  for (const t of tags || []) {
    const m = COLOR_IDEA_RE.exec(t);
    if (m) return m[1];
  }
  return null;
}

/** Tags with the idea colour stripped — what renders as ordinary chips. */
export function stripIdeaColor(tags?: string[]): string[] {
  return (tags || []).filter((t) => !isColorIdea(t));
}

/** Set (or clear, with null) the single idea colour, preserving every other tag. */
export function withIdeaColor(tags: string[] | undefined, color: string | null): string[] {
  const rest = stripIdeaColor(tags);
  return color ? [...rest, `color-idea[${color}]`] : rest;
}

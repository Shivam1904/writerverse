/**
 * ARN builder for dev section markers.
 *
 * Shape: `page:id:section:subsection[:subsection…]` — e.g.
 *   character-studio:42:identity:appearance
 *
 * Falsy parts (undefined / null / '') are dropped, so a page with no entity id
 * collapses to `page:section:…` cleanly.
 */
export function buildArn(...parts: (string | number | null | undefined)[]): string {
  return parts
    .filter((p) => p != null && String(p).trim() !== '')
    .map((p) => String(p).trim())
    .join(':');
}

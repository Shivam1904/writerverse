/**
 * Paragraph-level entity references — preserved through TipTap.
 *
 * When the AI rewrites a paragraph that carried the author's references
 * (`propose_scene_edits`), it can't re-place the inline phrase marks, so the
 * entity set is carried onto the WHOLE paragraph as `attrs.refs`
 * (`[{ entityType, id, label }]`). StarterKit's Paragraph node doesn't know this
 * attribute and would strip it on parse/serialize — losing the carry-forward the
 * moment the editor touches the doc. This declares `refs` on the paragraph node
 * so it survives load → edit → getJSON (and the discovery blob keeps it).
 *
 * Read-only data: the editor never sets it; the marginalia + backend index read
 * it. References stay the author's — the AI only preserves them.
 */
import { Extension } from '@tiptap/core'

export const ParagraphRefs = Extension.create({
  name: 'paragraphRefs',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          refs: {
            default: null,
            keepOnSplit: false,
            // JSON is the source of truth (getJSON keeps declared attrs); the
            // data-refs mirror is only for HTML round-trips.
            parseHTML: (el: HTMLElement) => {
              const raw = el.getAttribute('data-refs')
              if (!raw) return null
              try {
                return JSON.parse(raw)
              } catch {
                return null
              }
            },
            renderHTML: (attrs: Record<string, unknown>) =>
              attrs.refs ? { 'data-refs': JSON.stringify(attrs.refs) } : {},
          },
        },
      },
    ]
  },
})

export default ParagraphRefs

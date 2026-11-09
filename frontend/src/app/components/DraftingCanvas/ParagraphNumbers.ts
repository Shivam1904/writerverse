/**
 * Paragraph numbers in the editor margin.
 *
 * Adds a muted, right-aligned number in the left margin of every top-level
 * paragraph. The number is invisible by default and fades in only while the
 * author hovers that paragraph (see `.pm-para-num` in index.css).
 *
 * View-only: implemented purely with ProseMirror decorations, so it never
 * touches the stored doc JSON. A node decoration makes each paragraph a
 * positioning host; an inline widget carries the number itself.
 */
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'

const paragraphNumbersKey = new PluginKey('paragraphNumbers')

function numberWidget(n: number): HTMLElement {
  const span = document.createElement('span')
  span.className = 'pm-para-num'
  span.textContent = String(n)
  span.setAttribute('contenteditable', 'false')
  return span
}

function buildDecorations(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = []
  let n = 0
  // Top-level only — numbering follows the paragraphs the author sees.
  doc.forEach((node, offset) => {
    if (node.type.name !== 'paragraph') return
    n += 1
    const count = n
    decorations.push(
      Decoration.node(offset, offset + node.nodeSize, { class: 'pm-para-num-host' })
    )
    decorations.push(
      Decoration.widget(offset + 1, () => numberWidget(count), {
        side: -1,
        ignoreSelection: true,
        key: `pm-para-num-${count}`,
      })
    )
  })
  return DecorationSet.create(doc, decorations)
}

export const ParagraphNumbers = Extension.create({
  name: 'paragraphNumbers',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: paragraphNumbersKey,
        state: {
          init: (_config, { doc }) => buildDecorations(doc),
          apply: (tr, old) => (tr.docChanged ? buildDecorations(tr.doc) : old),
        },
        props: {
          decorations(state) {
            return paragraphNumbersKey.getState(state)
          },
        },
      }),
    ]
  },
})

export default ParagraphNumbers

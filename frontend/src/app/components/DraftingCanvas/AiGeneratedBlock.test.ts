import { afterEach, describe, expect, it } from 'vitest'
import { Editor, type JSONContent } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { ParagraphRefs } from './ParagraphRefs'
import { AiGeneratedBlock, dismissAiParagraph } from './AiGeneratedBlock'

const PEPPER = { entityType: 'character', id: 7, label: 'Pepper' }

function para(text: string, refs?: unknown[]): JSONContent {
  return {
    type: 'paragraph',
    ...(refs ? { attrs: { refs } } : {}),
    content: [{ type: 'text', text }],
  }
}

let editor: Editor | null = null

function makeEditor(content: JSONContent[]): Editor {
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit, ParagraphRefs, AiGeneratedBlock],
    content: { type: 'doc', content },
  })
  return editor
}

/** Doc position of the n-th top-level block. */
function posOf(ed: Editor, index: number): number {
  let pos = 0
  for (let i = 0; i < index; i++) pos += ed.state.doc.child(i).nodeSize
  return pos
}

function dismissAt(ed: Editor, index: number): void {
  const tr = dismissAiParagraph(ed.state, posOf(ed, index))
  expect(tr).not.toBeNull()
  ed.view.dispatch(tr!)
}

function texts(ed: Editor): string[] {
  const out: string[] = []
  ed.state.doc.forEach((n) => out.push(n.textContent))
  return out
}

afterEach(() => {
  editor?.destroy()
  editor = null
})

describe('AiGeneratedBlock dismiss', () => {
  it('restores a rewritten paragraph to the original text, keeping the author refs', () => {
    const ed = makeEditor([
      para('Tony watched Pepper leave.', [
        PEPPER,
        { entityType: 'ai-generated', original: 'Tony saw Pepper there.' },
      ]),
      para('The sun rose.'),
    ])
    dismissAt(ed, 0)

    expect(texts(ed)).toEqual(['Tony saw Pepper there.', 'The sun rose.'])
    // The marker is gone, the author's own reference stays.
    expect(ed.getJSON().content?.[0].attrs?.refs).toEqual([PEPPER])
  })

  it('restores an empty original as an empty paragraph with no refs', () => {
    const ed = makeEditor([para('Filled in.', [{ entityType: 'ai-generated', original: '' }])])
    dismissAt(ed, 0)

    expect(texts(ed)).toEqual([''])
    expect(ed.getJSON().content?.[0].attrs?.refs).toBeNull()
  })

  it('removes an inserted paragraph (no original)', () => {
    const ed = makeEditor([
      para('Before.'),
      para('AI added this.', [{ entityType: 'ai-generated' }]),
      para('After.'),
    ])
    dismissAt(ed, 1)

    expect(texts(ed)).toEqual(['Before.', 'After.'])
  })

  it('does nothing on a paragraph that is not pending AI', () => {
    const ed = makeEditor([para('Author prose.', [PEPPER])])
    expect(dismissAiParagraph(ed.state, 0)).toBeNull()
  })

  it('renders Dismiss and Accept on each pending paragraph only', () => {
    const ed = makeEditor([
      para('AI one.', [{ entityType: 'ai-generated' }]),
      para('Author prose.'),
      para('AI two.', [{ entityType: 'ai-generated', original: 'x' }]),
    ])
    const dom = ed.view.dom
    expect(dom.querySelectorAll('button[aria-label="Dismiss"]')).toHaveLength(2)
    expect(dom.querySelectorAll('button[aria-label="Accept"]')).toHaveLength(2)
  })

  it('the Dismiss button removes its paragraph when pressed', () => {
    const ed = makeEditor([
      para('Before.'),
      para('AI added this.', [{ entityType: 'ai-generated' }]),
    ])
    const btn = ed.view.dom.querySelector('button[aria-label="Dismiss"]')!
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))

    expect(texts(ed)).toEqual(['Before.'])
  })
})

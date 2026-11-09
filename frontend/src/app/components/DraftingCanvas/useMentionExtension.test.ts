// SA-193: picking a braindump or world entry from the @ menu used to delete the
// typed "@query" and insert nothing. Every entity type must insert a mention.
import { renderHook } from '@testing-library/react'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it } from 'vitest'
import { SpanRefMark } from './SpanRefMark'
import { useMentionExtension, type MentionItemInput } from './useMentionExtension'

const items: MentionItemInput[] = [
  { id: 1, label: 'Ana', entityType: 'character' },
  { id: 2, label: 'The fire', entityType: 'braindump' },
  { id: 3, label: 'Glass City', entityType: 'worldbuilding' },
]

let editor: Editor | null = null
afterEach(() => { editor?.destroy(); editor = null })

/** Type "She met @gla" and pick `item` from the @ menu, like the list's Enter key does. */
function pick(item: MentionItemInput) {
  const { result } = renderHook(() => useMentionExtension(items))
  const mention = result.current
  editor = new Editor({ extensions: [StarterKit, SpanRefMark, mention], content: '<p>She met @gla</p>' })
  // "@gla" sits at the end of the paragraph: doc pos 1 is the paragraph start.
  const text = 'She met @gla'
  const range = { from: 1 + text.indexOf('@'), to: 1 + text.length }
  mention.options.suggestion.command!({
    editor,
    range,
    // The @ list passes entityType too (MentionList's item), beyond the base attrs.
    props: { id: String(item.id), label: item.label, entityType: item.entityType } as { id: string; label: string },
  })
  return editor.getJSON().content?.[0]?.content ?? []
}

describe('@-mention inserts the picked entity', () => {
  it.each(items)('$entityType', (item) => {
    const nodes = pick(item)
    expect(nodes[0]).toMatchObject({ type: 'text', text: 'She met ' })
    expect(nodes[1]).toMatchObject({
      type: 'mention',
      attrs: { id: String(item.id), label: item.label, entityType: item.entityType },
    })
    // The typed "@gla" is gone, replaced by the mention.
    expect(JSON.stringify(nodes)).not.toContain('@gla')
  })
})

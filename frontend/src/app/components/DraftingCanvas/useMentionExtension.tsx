/**
 * Hook that builds the TipTap Mention extension with suggestion config
 * for Characters, Braindumps, and World Building.
 */
import { useMemo, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { SuggestionProps } from '@tiptap/suggestion'
import MentionList, { type MentionItem } from './MentionList'
import { EntityMention } from './EntityMentionExtension'

export type MentionItemInput = {
  id: number
  label: string
  entityType: 'character' | 'braindump' | 'worldbuilding'
}

function createMentionRenderer() {
  let container: HTMLDivElement | null = null
  let root: Root | null = null
  let selectedIndex = 0
  let currentProps: SuggestionProps<MentionItem> | null = null

  const updateList = () => {
    if (!root || !container || !currentProps) return
    const props = currentProps

    const handleSelect = (item: MentionItem) => {
      props.command({ id: String(item.id), label: item.label, entityType: item.entityType })
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        selectedIndex = Math.min(selectedIndex + 1, props.items.length - 1)
        updateList()
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        selectedIndex = Math.max(selectedIndex - 1, 0)
        updateList()
        return
      }
      if (event.key === 'Enter' && props.items[selectedIndex]) {
        event.preventDefault()
        handleSelect(props.items[selectedIndex])
        return
      }
    }

    root.render(
      <MentionList
        items={props.items}
        selectedIndex={selectedIndex}
        onSelect={handleSelect}
        clientRect={props.clientRect ?? null}
        onKeyDown={handleKeyDown}
      />
    )
  }

  return () => ({
    onStart: (props: SuggestionProps<MentionItem>) => {
      selectedIndex = 0
      currentProps = props
      container = document.createElement('div')
      container.className = 'mention-list-portal'
      document.body.appendChild(container)
      root = createRoot(container)
      updateList()
    },
    onUpdate: (props: SuggestionProps<MentionItem>) => {
      currentProps = props
      selectedIndex = Math.min(selectedIndex, Math.max(0, props.items.length - 1))
      updateList()
    },
    onExit: () => {
      currentProps = null
      if (root && container) {
        root.unmount()
        root = null
        container.remove()
        container = null
      }
    },
  })
}

export function useMentionExtension(
  mentionItems: MentionItemInput[],
  options?: {
    onMentionInsert?: (item: MentionItemInput) => void
  }
) {
  const itemsRef = useRef(mentionItems)
  itemsRef.current = mentionItems
  const optionsRef = useRef(options)
  optionsRef.current = options

  return useMemo(() => {
    const renderer = createMentionRenderer()

    return EntityMention.configure({
      HTMLAttributes: {
        class: 'mention rounded px-1 -mx-1 bg-amber-50 text-amber-800 border-b border-amber-200',
      },
      suggestion: {
        char: '@',
        items: ({ query }: { query: string }) => {
          const items = itemsRef.current
          const q = query.toLowerCase().trim()
          if (!q) return items.slice(0, 20)
          if (q === 'braindump' || q.startsWith('braindump'))
            return items.filter((i) => i.entityType === 'braindump').slice(0, 20)
          if (q === 'worldbuilding' || q === 'world' || q.startsWith('worldbuilding'))
            return items.filter((i) => i.entityType === 'worldbuilding').slice(0, 20)
          return items
            .filter((item) => item.label.toLowerCase().includes(q))
            .slice(0, 20)
        },
        render: renderer,
        // Every entity type (character, braindump, world entry) becomes the same
        // mention node, so the picked name replaces the typed "@query" (SA-193).
        // Tagging a selected passage with a braindump / world entry is the
        // selection menu's job (the spanRef mark), not @.
        command: ({ editor, range, props }) => {
          const { id, label, entityType } = props as MentionItem & { id: string }
          editor
            .chain()
            .focus()
            .insertContentAt(range, {
              type: 'mention',
              attrs: { id, label, entityType },
            })
            .run()
          optionsRef.current?.onMentionInsert?.({ id: parseInt(id, 10), label, entityType })
        },
      },
    })
  }, [])
}

/**
 * Searchable dropdown for @ mention suggestions.
 * Renders items from Characters, Braindumps, and World Building with type badges.
 */
import { useEffect, useRef } from 'react'

export type MentionItem = {
  id: number
  label: string
  entityType: 'character' | 'braindump' | 'worldbuilding'
}

interface MentionListProps {
  items: MentionItem[]
  selectedIndex: number
  onSelect: (item: MentionItem) => void
  clientRect: (() => DOMRect | null) | null
  onKeyDown?: (event: KeyboardEvent) => void
}

const ENTITY_TYPE_LABELS: Record<MentionItem['entityType'], string> = {
  character: 'Character',
  braindump: 'Idea',
  worldbuilding: 'World Building',
}

const ENTITY_TYPE_STYLES: Record<MentionItem['entityType'], string> = {
  character: 'bg-amber-100 text-amber-800',
  braindump: 'bg-blue-100 text-blue-800',
  worldbuilding: 'bg-emerald-100 text-emerald-800',
}

export default function MentionList({
  items,
  selectedIndex,
  onSelect,
  clientRect,
  onKeyDown,
}: MentionListProps) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!onKeyDown) return
    const handler = (e: KeyboardEvent) => {
      if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) {
        onKeyDown(e)
      }
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [onKeyDown])

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const selected = el.querySelector('[data-selected]')
    selected?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (items.length === 0) return null

  const rect = clientRect?.()
  if (!rect) return null

  return (
    <div
      ref={listRef}
      className="fixed z-50 max-h-64 w-72 overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
      style={{
        left: rect.left,
        top: rect.bottom + 4,
      }}
      role="listbox"
      aria-label="Mention suggestions"
    >
      {items.map((item, index) => (
        <button
          key={`${item.entityType}-${item.id}`}
          type="button"
          role="option"
          aria-selected={index === selectedIndex}
          data-selected={index === selectedIndex ? true : undefined}
          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
            index === selectedIndex ? 'bg-gray-100' : 'hover:bg-gray-50'
          }`}
          onMouseDown={(e) => {
            e.preventDefault()
            onSelect(item)
          }}
        >
          <span
            className={`rounded px-1.5 py-0.5 text-xs font-medium ${ENTITY_TYPE_STYLES[item.entityType]}`}
          >
            {ENTITY_TYPE_LABELS[item.entityType]}
          </span>
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </div>
  )
}

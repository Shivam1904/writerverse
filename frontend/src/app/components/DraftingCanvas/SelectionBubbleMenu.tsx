import { useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import type { Braindump, Worldbuilding } from './useLinkedItems'
import { useChatStore } from '../../modules/chat/useChatStore'
import { useWriteStore } from '../../pages/write/writeStore'
import { linkSceneEntity, type SceneLinkKind } from '../../pages/write/sceneLinks'

type LinkKind = SceneLinkKind
type SpanRefItem = { id: number; label: string; entityType: LinkKind }

interface SelectionBubbleMenuProps {
  editor: Editor
  projectId?: string
  sceneId?: number | null
  braindumps: Braindump[]
  worldbuildings: Worldbuilding[]
}

export default function SelectionBubbleMenu({
  editor,
  projectId,
  sceneId,
  braindumps,
  worldbuildings,
}: SelectionBubbleMenuProps) {
  const setAttachment = useChatStore((s) => s.setAttachment)
  const openChat = useChatStore((s) => s.open)
  const [expanded, setExpanded] = useState<LinkKind | null>(null)
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState(false)
  const toolbarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!expanded) return
    const handler = (e: MouseEvent) => {
      if (toolbarRef.current?.contains(e.target as Node)) return
      setExpanded(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [expanded])

  const selectedText = useMemo(() => {
    const { from, to } = editor.state.selection
    return from === to ? '' : editor.state.doc.textBetween(from, to).trim()
  }, [editor.state.selection])

  const activeTagKeys = useMemo(() => {
    const keys = new Set<string>()
    if (!editor.isActive('spanRef')) return keys
    const attrs = editor.getAttributes('spanRef')
    const raw = attrs.entitiesJson as string | null | undefined
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Array<{
          id: number | string
          entityType: LinkKind
        }>
        for (const entry of parsed) {
          keys.add(`${entry.entityType}-${entry.id}`)
        }
        return keys
      } catch {
        // Fall back to legacy attrs below.
      }
    }
    if (attrs.entityId && attrs.entityType) {
      keys.add(`${attrs.entityType}-${attrs.entityId}`)
    }
    return keys
  }, [editor.state.selection])

  const items = useMemo(() => {
    const list =
      expanded === 'braindump'
        ? braindumps.map((b) => ({
            id: b.id,
            label: b.title || b.content?.slice(0, 50) || `Idea ${b.id}`,
            entityType: 'braindump' as const,
          }))
        : expanded === 'worldbuilding'
          ? worldbuildings.map((w) => ({
              id: w.id,
              label: w.title || w.content?.slice(0, 50) || `World Building ${w.id}`,
              entityType: 'worldbuilding' as const,
            }))
          : []

    const q = query.trim().toLowerCase()
    return list.filter(
      (item) =>
        !activeTagKeys.has(`${item.entityType}-${item.id}`) &&
        (!q || item.label.toLowerCase().includes(q)),
    )
  }, [activeTagKeys, braindumps, expanded, query, worldbuildings])

  const ask = () => {
    if (!selectedText) return
    const quote = selectedText.length > 280 ? `${selectedText.slice(0, 280)}…` : selectedText
    setAttachment(quote)
    openChat()
  }

  const attachSceneLink = async (entityType: LinkKind, id: number) => {
    if (sceneId == null || !projectId) return
    const current = useWriteStore.getState().data.chapters
      .flatMap((ch) => ch.scenes)
      .find((sc) => sc.id === sceneId)
    const nextKey = `${entityType}-${id}`
    const existingKeys = new Set(
      (current?.entity_links ?? []).map((link) => `${link.link_type}-${link.link_id}`),
    )
    if (existingKeys.has(nextKey)) return

    // The scene link shows once the server saved it; a failure gets a toast
    // from callOp. The inline mark is prose, saved with the scene as usual.
    setPending(true)
    try {
      await linkSceneEntity(projectId, sceneId, entityType, id)
    } catch {
      // Already announced by callOp; keep the inline mark.
    } finally {
      setPending(false)
    }
  }

  const applyLink = async (item: SpanRefItem) => {
    const { to } = editor.state.selection
    editor
      .chain()
      .focus()
      .setSpanRef({
        entityId: String(item.id),
        entityType: item.entityType,
        entityLabel: item.label,
      })
      .setTextSelection(to)
      .unsetSpanRef()
      .run()

    await attachSceneLink(item.entityType, item.id)
    setExpanded(null)
    setQuery('')
  }

  const toggle = (kind: LinkKind) => {
    setExpanded((prev) => (prev === kind ? null : kind))
    setQuery('')
  }

  return (
    <div
      ref={toolbarRef}
      className="ne-seltool ne-seltool-bar"
      onMouseDown={(e) => e.preventDefault()}
    >
      <button className="ne-seltool-btn" type="button" onClick={ask}>
        <span className="ne-seltool-glyph">✦</span>
        <span className="ne-seltool-text">Ask Night Eyes</span>
      </button>
      <span className="ne-seltool-sep" />
      <button
        className={`ne-seltool-btn${expanded === 'braindump' ? ' is-open' : ''}`}
        type="button"
        onClick={() => toggle('braindump')}
        disabled={pending}
      >
        <span className="ne-seltool-text">Idea</span>
      </button>
      <span className="ne-seltool-sep" />
      <button
        className={`ne-seltool-btn${expanded === 'worldbuilding' ? ' is-open' : ''}`}
        type="button"
        onClick={() => toggle('worldbuilding')}
        disabled={pending}
      >
        <span className="ne-seltool-text">World Building</span>
      </button>

      {expanded && (
        <div className="ne-seltool-dropdown">
          <input
            autoFocus
            type="text"
            className="ne-seltool-search"
            placeholder={expanded === 'braindump' ? 'Search braindumps…' : 'Search worldbuilding…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="ne-seltool-list">
            {items.length === 0 ? (
              <div className="ne-seltool-empty">No matches</div>
            ) : (
              items.map((item) => (
                <button
                  key={`${item.entityType}-${item.id}`}
                  type="button"
                  className="ne-seltool-option"
                  onClick={() => void applyLink(item)}
                >
                  {item.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

import React from 'react'
/**
 * TipTap editor for DraftingCanvas with @ mention support.
 * Extends TipTapEditor with EntityMention for Characters, Braindumps, World Building.
 */
import { useEffect, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import type { Editor } from '@tiptap/core'
import type { EditorView } from 'prosemirror-view'
import { useMentionExtension, type MentionItemInput } from './useMentionExtension.tsx'
import { SpanRefMark } from './SpanRefMark'
import { ParagraphRefs } from './ParagraphRefs'
import { AiGeneratedBlock } from './AiGeneratedBlock'
import { ParagraphNumbers } from './ParagraphNumbers'
import SelectionBubbleMenu from './SelectionBubbleMenu'
import type { Braindump, Worldbuilding } from './useLinkedItems'

export type TipTapDoc = Record<string, unknown>

interface DraftingTipTapEditorProps {
  content: TipTapDoc | null
  onChange: (content: TipTapDoc) => void
  placeholder?: string
  className?: string
  editorKey?: string | number
  onBlur?: () => void
  onFocus?: () => void
  onExitUp?: () => void
  onExitDown?: () => void
  projectId?: string
  sceneId?: number | null
  mentionItems: MentionItemInput[]
  braindumps: Braindump[]
  worldbuildings: Worldbuilding[]
  onMentionInsert?: (item: MentionItemInput) => void
}

export type TipTapEditorHandle = {
  focusAtStart: () => void
  focusAtEnd: () => void
  getEditor: () => Editor | null
}

function DraftingTipTapEditorImpl(
  {
    content,
    onChange,
    placeholder = 'Start writing... ',
    className = '',
    editorKey,
    onBlur,
    onFocus,
    onExitUp,
    onExitDown,
    projectId,
    sceneId,
    mentionItems,
    braindumps,
    worldbuildings,
    onMentionInsert,
  }: DraftingTipTapEditorProps,
  ref: React.Ref<TipTapEditorHandle | null>
) {
  const mentionExtension = useMentionExtension(mentionItems, { onMentionInsert })

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: false,
        hardBreak: {},
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
      SpanRefMark,
      ParagraphRefs,
      AiGeneratedBlock,
      ParagraphNumbers,
      mentionExtension,
    ],
    [placeholder, mentionExtension]
  )

  const editorProps = useMemo(
    () => ({
      attributes: {
        class: 'prose prose-lg max-w-none focus:outline-none',
      },
      handleKeyDown: (view: EditorView, event: KeyboardEvent) => {
        const { state } = view
        const { from, to, $head } = state.selection
        const isCollapsed = from === to
        if (!isCollapsed) return false

        const viewAny = view as unknown as Partial<{
          startOfTextblock: (dir: 'up' | 'down') => boolean
          endOfTextblock: (dir: 'up' | 'down') => boolean
        }>
        const atStartOfBlock =
          typeof viewAny.endOfTextblock === 'function'
            ? viewAny.endOfTextblock('up')
            : false
        const atEndOfBlock =
          typeof viewAny.endOfTextblock === 'function'
            ? viewAny.endOfTextblock('down')
            : false
        const isAtDocStart = from <= 1
        const isAtDocEnd = from >= state.doc.content.size

        let isFirstTopLevelBlock = false
        let isLastTopLevelBlock = false
        if ($head) {
          const topIndex = $head.index(0)
          isFirstTopLevelBlock = topIndex === 0
          isLastTopLevelBlock = topIndex >= state.doc.childCount - 1
        }

        if (
          event.key === 'ArrowUp' &&
          (atStartOfBlock || isAtDocStart) &&
          isFirstTopLevelBlock
        ) {
          if (onExitUp) {
            event.preventDefault()
            onExitUp()
            return true
          }
        }

        if (
          event.key === 'ArrowDown' &&
          (atEndOfBlock || isAtDocEnd) &&
          isLastTopLevelBlock
        ) {
          if (onExitDown) {
            event.preventDefault()
            onExitDown()
            return true
          }
        }

        return false
      },
    }),
    [onExitDown, onExitUp]
  )

  const handleUpdate = useCallback(
    ({ editor }: { editor: Editor }) => {
      onChange(editor.getJSON())
    },
    [onChange]
  )

  const editor = useEditor({
    extensions,
    content: content || { type: 'doc', content: [] },
    onUpdate: handleUpdate,
    editorProps,
  })

  useEffect(() => {
    if (!editor || !onBlur) return
    const handler = () => onBlur()
    editor.on('blur', handler)
    return () => {
      editor.off('blur', handler)
    }
  }, [editor, onBlur])

  useEffect(() => {
    if (!editor || !onFocus) return
    const handler = () => onFocus()
    editor.on('focus', handler)
    return () => {
      editor.off('focus', handler)
    }
  }, [editor, onFocus])

  useEffect(() => {
    if (!editor) return
    if (editor.isFocused) return
    const currentJson = editor.getJSON()
    if (JSON.stringify(currentJson) !== JSON.stringify(content)) {
      // Text pushed in from outside (server refresh, history restore) is not
      // the author typing: don't fire onChange, or it would be marked unsaved.
      editor.commands.setContent(content || { type: 'doc', content: [] }, { emitUpdate: false })
    }
  }, [content, editor])

  useImperativeHandle(ref, () => ({
    focusAtStart: () => {
      if (!editor) return
      editor.commands.focus('start')
    },
    focusAtEnd: () => {
      if (!editor) return
      editor.commands.focus('end')
    },
    getEditor: () => editor ?? null,
  }), [editor])

  if (!editor) {
    return (
      <div className={`animate-pulse bg-gray-50 rounded ${className}`}>
        <div className="h-24" />
      </div>
    )
  }

  return (
    <div className={className} >
      <BubbleMenu
        editor={editor}
        options={{ placement: 'top-start' }}
        appendTo={() => document.body}
        shouldShow={({ editor: e }) => {
          const { from, to } = e.state.selection
          return from !== to && e.state.doc.textBetween(from, to).trim().length > 0
        }}
      >
        <SelectionBubbleMenu
          editor={editor}
          projectId={projectId}
          sceneId={sceneId}
          braindumps={braindumps}
          worldbuildings={worldbuildings}
        />
      </BubbleMenu>
      <EditorContent key={editorKey} editor={editor} />
    </div>
  )
}

const DraftingTipTapEditor = forwardRef(DraftingTipTapEditorImpl)

export default DraftingTipTapEditor

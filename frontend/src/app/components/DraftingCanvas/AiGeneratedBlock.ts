/**
 * AI-generated paragraph block — pending-until-accepted rendering.
 *
 * A paragraph's `attrs.refs` (see ParagraphRefs) may include an
 * `{ entityType: 'ai-generated' }` entry alongside the author's other refs.
 * While that ref is present we render the paragraph as a green block with
 * Accept and Dismiss buttons and IGNORE the other refs on it — it reads as
 * not-yet-accepted AI prose.
 *  - Accept strips the `ai-generated` ref, so the paragraph collapses back into
 *    a normal paragraph.
 *  - Dismiss undoes the AI. A rewrite (`propose_scene_edits`) stashed the
 *    author's text on the marker as `original`, so the paragraph goes back to
 *    that text. An inserted paragraph (no `original`) is removed.
 * Both persist through the usual getJSON → autosave path.
 *
 * The decoration itself is view-only (the green box is not serialized) — the
 * `refs` attr alone drives the rendering. The inline braindump/world marks are
 * untouched and keep working as they are.
 */
import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'

const AI_REF = 'ai-generated'

/** Small inline check glyph for the per-paragraph accept affordance. */
const CHECK_SVG =
  '<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>'

/** Small inline cross glyph for the per-paragraph dismiss affordance. */
const CROSS_SVG =
  '<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>'

/** Same round 18px shape as `.ai-gen-accept`, in a neutral grey. */
const DISMISS_CLASS =
  'ai-gen-dismiss flex h-[18px] w-[18px] cursor-pointer select-none items-center justify-center rounded-full bg-muted-foreground text-white opacity-50 transition-opacity duration-100 hover:opacity-100'

const aiGeneratedBlockKey = new PluginKey('aiGeneratedBlock')

type Ref = { entityType?: string; original?: unknown } | null | undefined

/** The `ai-generated` entry of a paragraph's refs. A rewrite keeps the author's text as `original`. */
export type AiMarker = { entityType: typeof AI_REF; original?: unknown }

/** The pending-AI marker in a paragraph's `attrs.refs`, or undefined if it has none. */
export function findAiMarker(refs: unknown): AiMarker | undefined {
  if (!Array.isArray(refs)) return undefined
  return refs.find((r: Ref) => !!r && typeof r === 'object' && r.entityType === AI_REF)
}

function hasAiRef(refs: unknown): boolean {
  return findAiMarker(refs) !== undefined
}

/** Position of the paragraph that owns a widget placed at its start. */
function paragraphPosAtWidget(view: EditorView, getPos: () => number | undefined): number | null {
  const widgetPos = getPos()
  if (widgetPos == null) return null
  const $pos = view.state.doc.resolve(widgetPos)
  if ($pos.parent.type.name !== 'paragraph') return null
  return $pos.before($pos.depth)
}

/** Remove the `ai-generated` ref from the paragraph that owns the widget. */
function accept(view: EditorView, getPos: () => number | undefined): void {
  const paraPos = paragraphPosAtWidget(view, getPos)
  if (paraPos == null) return
  const { state } = view
  const para = state.doc.nodeAt(paraPos)
  if (!para) return
  const refs = Array.isArray(para.attrs.refs) ? (para.attrs.refs as Ref[]) : []
  const nextRefs = refs.filter((r) => !(r && r.entityType === AI_REF))

  const tr = state.tr.setNodeMarkup(paraPos, undefined, {
    ...para.attrs,
    refs: nextRefs.length ? nextRefs : null,
  })
  view.dispatch(tr)
  view.focus()
}

/**
 * Undo the AI on the pending paragraph at `paraPos`. A rewrite carries the
 * author's text as the marker's `original`, so the paragraph goes back to that
 * text (keeping the author's other refs). An inserted paragraph has no
 * `original`, so it is deleted. Returns null if `paraPos` is not a pending AI
 * paragraph.
 */
export function dismissAiParagraph(state: EditorState, paraPos: number): Transaction | null {
  const para = state.doc.nodeAt(paraPos)
  if (!para || para.type.name !== 'paragraph' || !hasAiRef(para.attrs.refs)) return null
  const refs = para.attrs.refs as Ref[]
  const marker = findAiMarker(refs)
  const end = paraPos + para.nodeSize
  if (typeof marker?.original !== 'string') return state.tr.delete(paraPos, end)

  const otherRefs = refs.filter((r) => !(r && r.entityType === AI_REF))
  const restored = state.schema.nodes.paragraph.create(
    { ...para.attrs, refs: otherRefs.length ? otherRefs : null },
    marker.original ? state.schema.text(marker.original) : null
  )
  return state.tr.replaceWith(paraPos, end, restored)
}

function dismiss(view: EditorView, getPos: () => number | undefined): void {
  const paraPos = paragraphPosAtWidget(view, getPos)
  if (paraPos == null) return
  const tr = dismissAiParagraph(view.state, paraPos)
  if (!tr) return
  view.dispatch(tr)
  view.focus()
}

function actionButton(label: string, className: string, svg: string, onPress: () => void) {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = className
  btn.innerHTML = svg
  btn.title = label
  btn.setAttribute('aria-label', label)
  // mousedown (not click) + preventDefault so we don't blur/move the selection.
  btn.addEventListener('mousedown', (event) => {
    event.preventDefault()
    event.stopPropagation()
    onPress()
  })
  return btn
}

/** Dismiss + Accept, side by side at the block's top-right corner. */
function actionButtons(view: EditorView, getPos: () => number | undefined): HTMLElement {
  const wrap = document.createElement('span')
  wrap.className = 'absolute top-1 right-1 flex gap-1'
  wrap.setAttribute('contenteditable', 'false')
  wrap.append(
    actionButton('Dismiss', DISMISS_CLASS, CROSS_SVG, () => dismiss(view, getPos)),
    actionButton('Accept', 'ai-gen-accept', CHECK_SVG, () => accept(view, getPos))
  )
  return wrap
}

function buildDecorations(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph') return true
    if (!hasAiRef(node.attrs.refs)) return false
    decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: 'ai-gen-block' }))
    decorations.push(
      Decoration.widget(pos + 1, (view, getPos) => actionButtons(view, getPos), {
        side: -1,
        ignoreSelection: true,
      })
    )
    return false
  })
  return DecorationSet.create(doc, decorations)
}

/**
 * Strip the `ai-generated` ref from every pending paragraph in the editor —
 * the "Accept all" affordance at scene level. Returns true if anything changed.
 * Positions from the original doc stay valid because setNodeMarkup keeps node
 * sizes identical.
 */
export function acceptAllAiGenerated(editor: Editor): boolean {
  const { state, view } = editor
  const tr = state.tr
  let changed = false
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'paragraph') return
    if (!hasAiRef(node.attrs.refs)) return
    const refs = (node.attrs.refs as Ref[]).filter((r) => !(r && r.entityType === AI_REF))
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, refs: refs.length ? refs : null })
    changed = true
  })
  if (changed) view.dispatch(tr)
  return changed
}

/** Does this doc JSON (TipTap getJSON shape) contain any pending AI paragraph? */
export function jsonHasAiGenerated(doc: unknown): boolean {
  const node = doc as { content?: unknown[]; attrs?: { refs?: unknown } } | null
  if (!node || typeof node !== 'object') return false
  if (hasAiRef(node.attrs?.refs)) return true
  return Array.isArray(node.content) && node.content.some((child) => jsonHasAiGenerated(child))
}

export const AiGeneratedBlock = Extension.create({
  name: 'aiGeneratedBlock',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: aiGeneratedBlockKey,
        state: {
          init: (_config, { doc }) => buildDecorations(doc),
          apply: (tr, old) => (tr.docChanged ? buildDecorations(tr.doc) : old),
        },
        props: {
          decorations(state) {
            return aiGeneratedBlockKey.getState(state)
          },
        },
      }),
    ]
  },
})

export default AiGeneratedBlock

/**
 * TipTap Mark for span-based Braindump and World Building references.
 * Wraps a range of text with underline + badge styling.
 */
import { Mark, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    spanRef: {
      setSpanRef: (attrs: {
        entityId: string
        entityType: 'braindump' | 'worldbuilding'
        entityLabel: string
      }) => ReturnType
      unsetSpanRef: () => ReturnType
    }
  }
}

export const SpanRefMark = Mark.create({
  name: 'spanRef',

  addAttributes() {
    return {
      entityId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-entity-id'),
        renderHTML: (attributes) =>
          attributes.entityId ? { 'data-entity-id': attributes.entityId } : {},
      },
      entityType: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-entity-type'),
        renderHTML: (attributes) =>
          attributes.entityType ? { 'data-entity-type': attributes.entityType } : {},
      },
      entityLabel: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-entity-label'),
        renderHTML: (attributes) =>
          attributes.entityLabel ? { 'data-entity-label': attributes.entityLabel } : {},
      },
      /**
       * JSON-encoded array of all tags applied to this span.
       * Shape: [{ id: string; entityType: 'braindump' | 'worldbuilding'; entityLabel: string }]
       *
       * We keep the legacy single-value attributes above for backward compatibility
       * and use this field for representing multiple tags on the same text range.
       */
      entitiesJson: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-entities'),
        renderHTML: (attributes) =>
          attributes.entitiesJson ? { 'data-entities': attributes.entitiesJson } : {},
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-entity-id][data-entity-type]',
        getAttrs: (node) => {
          const el = node as HTMLElement
          const entityType = el.getAttribute('data-entity-type')
          if (entityType !== 'braindump' && entityType !== 'worldbuilding') return false
          const entitiesJson = el.getAttribute('data-entities')
          return {
            entityId: el.getAttribute('data-entity-id'),
            entityType,
            entityLabel: el.getAttribute('data-entity-label'),
            entitiesJson,
          }
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const entityType = HTMLAttributes['data-entity-type'] as string
    let className =
      'span-ref cursor-pointer border-b-2 transition-colors duration-100 relative'

    if (entityType === 'braindump') {
      className += ' border-blue-400 hover:border-blue-500'
    } else if (entityType === 'worldbuilding') {
      className += ' border-emerald-400 hover:border-emerald-500'
    } else {
      className += ' border-gray-400 hover:border-gray-500'
    }

    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { class: className }),
      0,
    ]
  },

  addCommands() {
    return {
      setSpanRef:
        (attrs) =>
        ({ commands }) => {
          return commands.setMark(this.name, attrs)
        },
      unsetSpanRef:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name)
        },
    }
  },
})

export default SpanRefMark

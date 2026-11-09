/**
 * Custom Mention extension that adds entityType for Characters, Braindumps, World Building.
 * Extends @tiptap/extension-mention with data-entity-type and data-entity-id attributes.
 */
import { Mention } from '@tiptap/extension-mention'

export const EntityMention = Mention.extend({
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-id') ?? element.getAttribute('data-entity-id'),
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.id) return {}
          return { 'data-id': attributes.id, 'data-entity-id': attributes.id }
        },
      },
      label: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-label'),
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.label) return {}
          return { 'data-label': attributes.label }
        },
      },
      mentionSuggestionChar: {
        default: '@',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-mention-suggestion-char'),
        renderHTML: (attributes: Record<string, unknown>) => ({
          'data-mention-suggestion-char': attributes.mentionSuggestionChar ?? '@',
        }),
      },
      entityType: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-entity-type'),
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.entityType ? { 'data-entity-type': attributes.entityType } : {},
      },
    }
  },
})

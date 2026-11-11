/**
 * Preview's view of a saved scene doc (TipTap getJSON shape): which blocks a
 * reader should see. `ProseBlocks` then turns those blocks into elements.
 *
 * Preview shows the manuscript as the AUTHOR has it, so pending AI prose (a
 * paragraph still carrying the `ai-generated` ref, see AiGeneratedBlock) is
 * read as if it were dismissed: an AI insert is hidden, and an AI rewrite shows
 * the author's original text it replaced. Accepting the AI makes it appear.
 */
import { findAiMarker } from '../../components/DraftingCanvas/AiGeneratedBlock';
import type { TipTapDoc } from '../write/data';

export type ProseMark = { type: string; attrs?: Record<string, unknown> };

export type ProseNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: ProseMark[];
  content?: ProseNode[];
};

/** The visible name of an @mention node. Its text lives in `attrs.label`, not in `content`. */
export function mentionLabel(node: ProseNode): string {
  const label = node.attrs?.label;
  return typeof label === 'string' ? label : '';
}

/** `node` with every pending AI paragraph dismissed; null if nothing of it is the author's. */
export function withoutPendingAi(node: ProseNode): ProseNode | null {
  if (node.type === 'paragraph') {
    const marker = findAiMarker(node.attrs?.refs);
    if (!marker) return node;
    if (typeof marker.original !== 'string') return null;
    return {
      type: 'paragraph',
      content: marker.original ? [{ type: 'text', text: marker.original }] : [],
    };
  }
  if (!node.content) return node;
  const content = node.content.map(withoutPendingAi).filter((n): n is ProseNode => n !== null);
  return { ...node, content };
}

/** Does this node show the reader anything (words, a name, a scene break)? */
function hasReadableContent(node: ProseNode): boolean {
  switch (node.type) {
    case 'text':
      return !!node.text?.trim();
    case 'mention':
      return !!mentionLabel(node);
    case 'horizontalRule':
      return true;
    default:
      return (node.content ?? []).some(hasReadableContent);
  }
}

/** The scene's top-level blocks a reader should see: author's prose only, no empty blocks. */
export function readableBlocks(doc: TipTapDoc | undefined): ProseNode[] {
  const blocks = (doc as { content?: ProseNode[] } | undefined)?.content ?? [];
  return blocks
    .map(withoutPendingAi)
    .filter((b): b is ProseNode => b !== null && hasReadableContent(b));
}

import type { ReactNode } from 'react';
import { mentionLabel, type ProseMark, type ProseNode } from './prose';

/**
 * Renders a scene's prose blocks (from `readableBlocks`) as a printed book
 * would: the editor's nodes and marks map to plain elements. Text style comes
 * from the surrounding `ty-story-body`; a blockquote switches to
 * `ty-story-quote`. Anything this map doesn't know still shows its text.
 */
export function ProseBlocks({ blocks }: { blocks: ProseNode[] }) {
  return <>{blocks.map(renderNode)}</>;
}

function renderChildren(node: ProseNode): ReactNode {
  return (node.content ?? []).map(renderNode);
}

function renderNode(node: ProseNode, key: number): ReactNode {
  switch (node.type) {
    case 'text':
      return <MarkedText key={key} text={node.text ?? ''} marks={node.marks ?? []} />;
    case 'mention':
      return mentionLabel(node);
    case 'hardBreak':
      return <br key={key} />;
    case 'paragraph':
      return <p key={key}>{renderChildren(node)}</p>;
    case 'heading':
      return <h3 key={key} className="ty-story-heading">{renderChildren(node)}</h3>;
    case 'blockquote':
      return (
        <blockquote key={key} className="ty-story-quote flex flex-col gap-3 pl-6">
          {renderChildren(node)}
        </blockquote>
      );
    case 'bulletList':
      return <ul key={key} className="flex list-disc flex-col gap-1 pl-6">{renderChildren(node)}</ul>;
    case 'orderedList':
      return (
        <ol
          key={key}
          start={typeof node.attrs?.start === 'number' ? node.attrs.start : undefined}
          className="flex list-decimal flex-col gap-1 pl-6"
        >
          {renderChildren(node)}
        </ol>
      );
    case 'listItem':
      return <li key={key}>{renderChildren(node)}</li>;
    case 'codeBlock':
      return <pre key={key} className="whitespace-pre-wrap"><code>{renderChildren(node)}</code></pre>;
    case 'horizontalRule':
      // A scene break, set the way books print one.
      return (
        <div key={key} role="separator" className="text-center" style={{ color: 'var(--ink-3)' }}>
          * * *
        </div>
      );
    default:
      return <span key={key}>{renderChildren(node)}</span>;
  }
}

/** Formatting marks → elements. Reference marks (spanRef) and links are not printed. */
const MARK_TAGS: Record<string, 'strong' | 'em' | 's' | 'u' | 'code'> = {
  bold: 'strong',
  italic: 'em',
  strike: 's',
  underline: 'u',
  code: 'code',
};

function MarkedText({ text, marks }: { text: string; marks: ProseMark[] }) {
  return marks.reduce<ReactNode>((inner, mark) => {
    const Tag = MARK_TAGS[mark.type];
    return Tag ? <Tag>{inner}</Tag> : inner;
  }, text);
}

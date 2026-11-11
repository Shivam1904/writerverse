import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { readableBlocks, type ProseNode } from './prose';
import { ProseBlocks } from './ProseBlocks';

const text = (t: string, ...marks: string[]): ProseNode => ({
  type: 'text',
  text: t,
  ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}),
});
const para = (...content: ProseNode[]): ProseNode => ({ type: 'paragraph', content });
const aiPara = (marker: Record<string, unknown>, ...content: ProseNode[]): ProseNode => ({
  type: 'paragraph',
  attrs: { refs: [{ entityType: 'ai-generated', ...marker }] },
  content,
});
const doc = (...content: ProseNode[]) => ({ type: 'doc', content });

/** Render a doc the way Preview does and return the HTML. */
function html(d: ReturnType<typeof doc>): string {
  return render(<ProseBlocks blocks={readableBlocks(d)} />).container.innerHTML;
}

describe('readableBlocks', () => {
  it('drops empty and whitespace-only blocks', () => {
    const blocks = readableBlocks(doc(para(), para(text('   ')), para(text('Kept.'))));
    expect(blocks).toHaveLength(1);
  });

  it('hides a pending AI insert', () => {
    expect(readableBlocks(doc(aiPara({}, text('The AI wrote this.'))))).toEqual([]);
  });

  it("shows the author's original text in place of a pending AI rewrite", () => {
    const blocks = readableBlocks(doc(aiPara({ original: 'My own words.' }, text('AI rewrite.'))));
    expect(blocks).toEqual([para(text('My own words.'))]);
  });

  it('shows a paragraph once its AI ref is accepted (other refs stay)', () => {
    const accepted: ProseNode = {
      type: 'paragraph',
      attrs: { refs: [{ entityType: 'character', id: 3, label: 'Yorrin' }] },
      content: [text('Accepted.')],
    };
    expect(readableBlocks(doc(accepted))).toEqual([accepted]);
  });

  it('hides pending AI paragraphs nested in a blockquote, and the quote if nothing is left', () => {
    const quote: ProseNode = { type: 'blockquote', content: [aiPara({}, text('AI.'))] };
    expect(readableBlocks(doc(quote))).toEqual([]);
  });

  it('keeps a paragraph that is only an @mention', () => {
    const mention: ProseNode = { type: 'mention', attrs: { id: '7', label: 'Yorrin Tide' } };
    expect(readableBlocks(doc(para(mention)))).toHaveLength(1);
  });

  it('tolerates a missing doc', () => {
    expect(readableBlocks(undefined)).toEqual([]);
  });
});

describe('ProseBlocks', () => {
  it('prints an @mention by its name instead of dropping it', () => {
    const out = html(
      doc(
        para(
          text('Yorrin watched from '),
          { type: 'mention', attrs: { id: '7', label: 'Yorrin Tide', entityType: 'character' } },
          text('.'),
        ),
      ),
    );
    expect(out).toBe('<p>Yorrin watched from Yorrin Tide.</p>');
  });

  it('renders bold, italic, strike, underline and nested marks', () => {
    const out = html(
      doc(
        para(
          text('b', 'bold'),
          text('i', 'italic'),
          text('s', 'strike'),
          text('u', 'underline'),
          text('bi', 'bold', 'italic'),
        ),
      ),
    );
    expect(out).toBe('<p><strong>b</strong><em>i</em><s>s</s><u>u</u><em><strong>bi</strong></em></p>');
  });

  it('prints reference marks (spanRef) as plain text', () => {
    const out = html(doc(para({ type: 'text', text: 'the Tide', marks: [{ type: 'spanRef' }] })));
    expect(out).toBe('<p>the Tide</p>');
  });

  it('renders headings, blockquotes, lists, hard breaks and scene breaks', () => {
    const { container } = render(
      <ProseBlocks
        blocks={readableBlocks(
          doc(
            { type: 'heading', attrs: { level: 2 }, content: [text('Part One')] },
            { type: 'blockquote', content: [para(text('Quoted.'))] },
            { type: 'bulletList', content: [{ type: 'listItem', content: [para(text('dot'))] }] },
            {
              type: 'orderedList',
              attrs: { start: 3 },
              content: [{ type: 'listItem', content: [para(text('three'))] }],
            },
            para(text('line one'), { type: 'hardBreak' }, text('line two')),
            { type: 'horizontalRule' },
          ),
        )}
      />,
    );
    expect(container.querySelector('h3')?.textContent).toBe('Part One');
    expect(container.querySelector('blockquote p')?.textContent).toBe('Quoted.');
    expect(container.querySelector('ul li')?.textContent).toBe('dot');
    expect(container.querySelector('ol')?.getAttribute('start')).toBe('3');
    expect(container.querySelector('p br')).not.toBeNull();
    expect(container.querySelector('[role="separator"]')?.textContent).toBe('* * *');
  });

  it("keeps the text of a node type it doesn't know", () => {
    expect(html(doc({ type: 'mystery', content: [para(text('still here'))] }))).toContain('still here');
  });
});

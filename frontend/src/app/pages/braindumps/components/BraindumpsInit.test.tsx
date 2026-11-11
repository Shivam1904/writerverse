// SA-274 / SA-183: the starter chips under the empty Ideas box fill the box
// with half a sentence, so a stuck writer has something to finish.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BraindumpsInit } from './BraindumpsInit';

const box = () => screen.getByLabelText('your first idea') as HTMLTextAreaElement;

function clickSeed(label: string) {
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole('button', { name: label }));
  act(() => vi.runAllTimers()); // the caret move waits one animation frame
  vi.useRealTimers();
}

describe('BraindumpsInit starter chips', () => {
  it('fills the empty box with the starter and puts the caret after it', () => {
    render(<BraindumpsInit onSubmit={vi.fn()} onDone={vi.fn()} />);
    clickSeed('a character');
    expect(box().value).toBe('A character who ');
    expect(document.activeElement).toBe(box());
    expect(box().selectionStart).toBe('A character who '.length);
  });

  it('swaps an untouched starter for another one', () => {
    render(<BraindumpsInit onSubmit={vi.fn()} onDone={vi.fn()} />);
    clickSeed('a character');
    clickSeed('a world');
    expect(box().value).toBe('A world where ');
  });

  it("keeps the author's own words and starts a new line", () => {
    render(<BraindumpsInit onSubmit={vi.fn()} onDone={vi.fn()} />);
    fireEvent.change(box(), { target: { value: 'the moon is hollow ' } });
    clickSeed('a what-if');
    expect(box().value).toBe('the moon is hollow\nWhat if ');
  });
});

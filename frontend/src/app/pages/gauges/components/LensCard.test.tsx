import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LensCard } from './LensCard';

const lens = { id: 'lens-1', kind: 'feeling', name: 'Mood', question: 'How does it feel?' };

describe('LensCard', () => {
  it('"Configure →" opens the same lens as clicking the card (SA-221)', () => {
    const onOpen = vi.fn();
    render(<LensCard lens={lens} watching={false} onOpen={onOpen} />);

    fireEvent.click(screen.getByText('Configure →'));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(lens);

    fireEvent.click(screen.getByText('How does it feel?'));
    expect(onOpen).toHaveBeenLastCalledWith(lens);
  });
});

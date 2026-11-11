import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SaveFailureBanner } from './SaveFailureBanner';

describe('SaveFailureBanner', () => {
  it('renders nothing when no save is failing', () => {
    const { container } = render(<SaveFailureBanner sceneNames={[]} onRetry={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('names the failing scene and offers a retry', () => {
    const onRetry = vi.fn();
    render(<SaveFailureBanner sceneNames={['The Docks']} onRetry={onRetry} />);
    expect(screen.getByRole('alert').textContent).toContain('"The Docks"');
    fireEvent.click(screen.getByRole('button', { name: /retry now/i }));
    expect(onRetry).toHaveBeenCalled();
  });
});

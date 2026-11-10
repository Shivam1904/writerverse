import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('./useNotifications', () => ({
  useNotifications: () => ({ projectId: 'p1', archived: [] }),
}));

import { NotificationBell } from './NotificationBell';
import { useProposalStore } from '../proposal';

const DAY = 24 * 60 * 60 * 1000;
function push(id: number, name: string, ageDays: number) {
  useProposalStore.getState().push({
    proposalId: id,
    capability: 'create_character',
    result: { name },
    onAccept: vi.fn(),
    onCancel: vi.fn(),
    createdAt: Date.now() - ageDays * DAY,
  });
}

function renderBell() {
  return render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>,
  );
}

describe('NotificationBell — suggestion age (wrt-54)', () => {
  beforeEach(() => useProposalStore.getState().clear());

  it('lists newest first, each with how long ago it was suggested; badge counts the last 7 days', () => {
    push(1, 'Ancient', 22); // arrives first in the store, but is the oldest
    push(2, 'Fresh', 0);
    push(3, 'Middle', 2);
    const { container } = renderBell();
    expect(container.querySelector('.wv2-notif-bell-badge')?.textContent).toBe('2');

    fireEvent.click(screen.getByRole('button', { name: 'proposals and notifications' }));
    const text = container.querySelector('.wv2-notif-panel')!.textContent!;
    expect(text).not.toContain('Old suggestions');
    const order = ['just now', 'Fresh', '2 days ago', 'Middle', '3 weeks ago', 'Ancient'].map((s) =>
      text.indexOf(s),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('only old suggestions → no badge, but they are still in the panel', () => {
    push(1, 'Ancient', 65);
    const { container } = renderBell();
    expect(container.querySelector('.wv2-notif-bell-badge')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'proposals and notifications' }));
    const text = container.querySelector('.wv2-notif-panel')!.textContent!;
    expect(text).toContain('Ancient');
    expect(text).toContain('2 months ago');
  });
});

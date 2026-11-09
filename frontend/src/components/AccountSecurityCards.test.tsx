// SA-57: change password + delete account forms on the Profile page.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { useAuthStore } from '../stores/authStore';
import { ChangePasswordCard, DeleteAccountCard } from './AccountSecurityCards';

vi.mock('axios');

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  useAuthStore.setState({ tokens: { access: 'old-a', refresh: 'old-r' } });
});
afterEach(() => vi.clearAllMocks());

describe('ChangePasswordCard', () => {
  it('sends current + new password and stores the fresh tokens', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { access: 'new-a', refresh: 'new-r' } });
    render(<ChangePasswordCard />);
    type('Current password', 'old-pass');
    type('New password', 'Brand-new-456');
    type('Repeat new password', 'Brand-new-456');
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText(/Password changed/)).toBeTruthy();
    expect(axios.post).toHaveBeenCalledWith('/auth/password-change/', {
      current_password: 'old-pass', new_password: 'Brand-new-456',
    });
    expect(useAuthStore.getState().tokens).toEqual({ access: 'new-a', refresh: 'new-r' });
  });

  it('stops when the two new passwords differ', async () => {
    render(<ChangePasswordCard />);
    type('Current password', 'old-pass');
    type('New password', 'Brand-new-456');
    type('Repeat new password', 'Brand-new-457');
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText("The new passwords don't match.")).toBeTruthy();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("shows the server's reason, e.g. a wrong current password", async () => {
    vi.mocked(axios.post).mockRejectedValue({
      response: { status: 400, data: { current_password: ['Your current password is not correct.'] } },
    });
    render(<ChangePasswordCard />);
    type('Current password', 'wrong');
    type('New password', 'Brand-new-456');
    type('Repeat new password', 'Brand-new-456');
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('Your current password is not correct.')).toBeTruthy();
    expect(useAuthStore.getState().tokens).toEqual({ access: 'old-a', refresh: 'old-r' });
  });
});

describe('DeleteAccountCard', () => {
  const button = () => screen.getByRole('button', { name: /Delete my account/ }) as HTMLButtonElement;

  it('keeps the button off until the password and the exact word DELETE are typed', () => {
    render(<DeleteAccountCard />);
    expect(button().disabled).toBe(true);
    type('Current password', 'pw');
    type('Type DELETE to confirm', 'delete');
    expect(button().disabled).toBe(true);
    type('Type DELETE to confirm', 'DELETE');
    expect(button().disabled).toBe(false);
  });

  it('deletes, signs out and goes to the login page', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    vi.mocked(axios.post).mockResolvedValue({ status: 204, data: '' });
    render(<DeleteAccountCard />);
    type('Current password', 'pw');
    type('Type DELETE to confirm', 'DELETE');
    fireEvent.click(button());

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login'));
    expect(axios.post).toHaveBeenCalledWith('/auth/delete-account/', { current_password: 'pw', confirm: 'DELETE' });
    expect(useAuthStore.getState().tokens).toBeNull();
    vi.unstubAllGlobals();
  });

  it('shows the error and stays signed in when the password is wrong', async () => {
    vi.mocked(axios.post).mockRejectedValue({
      response: { status: 400, data: { current_password: ['Your current password is not correct.'] } },
    });
    render(<DeleteAccountCard />);
    type('Current password', 'wrong');
    type('Type DELETE to confirm', 'DELETE');
    fireEvent.click(button());

    expect(await screen.findByText('Your current password is not correct.')).toBeTruthy();
    expect(useAuthStore.getState().tokens).toEqual({ access: 'old-a', refresh: 'old-r' });
  });
});

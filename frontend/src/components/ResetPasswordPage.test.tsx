// SA-39: a reset link opened with a session already open must still work, and
// end that session once the new password is set.
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import ResetPasswordPage from './ResetPasswordPage';
import { useAuthStore } from '../stores/authStore';

vi.mock('axios');

const logout = vi.fn(async () => {});

function submitNewPassword() {
  render(
    <MemoryRouter initialEntries={['/reset-password?uid=u1&token=t1']}>
      <ResetPasswordPage />
    </MemoryRouter>,
  );
  const pw = 'Str0ng-Passw0rd!';
  fireEvent.change(screen.getByLabelText('New password'), { target: { name: 'password', value: pw } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { name: 'passwordConfirm', value: pw } });
  fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    logout.mockClear();
    useAuthStore.setState({ logout, isAuthenticated: true });
  });

  it('signs out any open session once the password is reset', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: {} });
    submitNewPassword();
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy();
    expect(axios.post).toHaveBeenCalledWith('/auth/password-reset-confirm/',
      expect.objectContaining({ uid: 'u1', token: 't1' }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('keeps the session when the reset fails', async () => {
    vi.mocked(axios.post).mockRejectedValue({ response: { data: { token: ['Link expired.'] } } });
    submitNewPassword();
    expect(await screen.findByText('Link expired.')).toBeTruthy();
    expect(logout).not.toHaveBeenCalled();
  });
});

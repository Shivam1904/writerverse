// Email verification: the "Check your inbox" screen after sign-up, the
// /verify-email page, and the login hint for an unconfirmed email.
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import SignupPage from './SignupPage';
import LoginPage from './LoginPage';
import VerifyEmailPage from './VerifyEmailPage';
import { useAuthStore } from '../stores/authStore';

vi.mock('axios');

const PW = 'Str0ng-Passw0rd!';

function type(label: string, name: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { name, value } });
}

beforeEach(() => {
  vi.mocked(axios.post).mockReset();
  localStorage.clear();
  useAuthStore.setState({ user: null, tokens: null, isAuthenticated: false, isLoading: false, error: null });
});

describe('SignupPage with verification required', () => {
  function signUp() {
    render(<MemoryRouter><SignupPage /></MemoryRouter>);
    type('First name', 'firstName', 'Ava');
    type('Last name', 'lastName', 'Lee');
    type('Email', 'email', 'ava@example.com');
    type('Password', 'password', PW);
    type('Confirm password', 'passwordConfirm', PW);
    // Ticks the terms box when the build's extension asks for one.
    const terms = screen.queryByRole('checkbox');
    if (terms) fireEvent.click(terms);
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  }

  it('shows "Check your inbox" with the email, a resend button, and does not sign in', async () => {
    vi.mocked(axios.post).mockResolvedValue({
      status: 201, data: { verification_required: true, email: 'ava@example.com' },
    });
    signUp();
    expect(await screen.findByText('Check your inbox')).toBeTruthy();
    expect(screen.getByText('ava@example.com')).toBeTruthy();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);

    vi.mocked(axios.post).mockResolvedValue({ data: {} });
    fireEvent.click(screen.getByRole('button', { name: 'Resend link' }));
    expect(await screen.findByText(/new link sent/i)).toBeTruthy();
    expect(axios.post).toHaveBeenLastCalledWith('/auth/verify-email/resend/', { email: 'ava@example.com' });

    fireEvent.click(screen.getByRole('button', { name: 'Sign up again' }));
    expect(screen.getByRole('button', { name: 'Create account' })).toBeTruthy();
  });
});

describe('VerifyEmailPage', () => {
  function open(url: string) {
    render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/library" element={<p>Library page</p>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('signs the user in and goes to the library', async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: { access: 'a1', refresh: 'r1', user: { id: 1, email: 'ava@example.com' } },
    });
    open('/verify-email?token=tok-1');
    expect(await screen.findByText('Library page')).toBeTruthy();
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(axios.post).toHaveBeenCalledWith('/auth/verify-email/', { token: 'tok-1' });
    expect(useAuthStore.getState().tokens).toEqual({ access: 'a1', refresh: 'r1' });
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('explains a dead link and offers a new one', async () => {
    vi.mocked(axios.post).mockRejectedValueOnce({
      response: { status: 400, data: { detail: 'This link has expired or was already used.', code: 'link_invalid' } },
    });
    open('/verify-email?token=old');
    expect(await screen.findByText("That link didn't work")).toBeTruthy();
    expect(screen.getByText(/expired or was already used/)).toBeTruthy();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);

    vi.mocked(axios.post).mockResolvedValue({ data: {} });
    type('Email', 'email', 'ava@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Send a new link' }));
    expect(await screen.findByText(/new link sent/i)).toBeTruthy();
    expect(axios.post).toHaveBeenLastCalledWith('/auth/verify-email/resend/', { email: 'ava@example.com' });
  });

  it('says so when the link has no token, without calling the server', () => {
    open('/verify-email');
    expect(screen.getByText(/missing its token/)).toBeTruthy();
    expect(axios.post).not.toHaveBeenCalled();
  });
});

describe('LoginPage with an unconfirmed email', () => {
  it('asks the user to confirm their email and offers a resend', async () => {
    vi.mocked(axios.post).mockRejectedValueOnce({
      response: { status: 403, data: { detail: 'Please confirm your email first.', code: 'email_not_verified' } },
    });
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    type('Email', 'email', 'ava@example.com');
    type('Password', 'password', PW);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Please confirm your email first')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Resend link' })).toBeTruthy();
  });
});

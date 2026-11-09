// SA-184: a failed reset request must not claim the email is on its way.
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import ForgotPasswordPage from './ForgotPasswordPage';

vi.mock('axios');

function submit(email: string) {
  render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Email'), { target: { name: 'email', value: email } });
  fireEvent.click(screen.getByRole('button', { name: /send/i }));
}

describe('ForgotPasswordPage', () => {
  it('says the email is on its way when the request succeeds', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: {} });
    submit('a@example.com');
    expect(await screen.findByText(/we've sent a link/i)).toBeTruthy();
  });

  it('shows an error and keeps the form when the request fails', async () => {
    vi.mocked(axios.post).mockRejectedValue(new Error('Network Error'));
    submit('a@example.com');
    expect(await screen.findByText(/couldn't send the reset email/i)).toBeTruthy();
    expect(screen.queryByText(/we've sent a link/i)).toBeNull();
    expect(screen.getByLabelText('Email')).toBeTruthy();
  });
});

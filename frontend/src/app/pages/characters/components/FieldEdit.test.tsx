import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FieldEdit } from './FieldEdit';

function openAndType(text: string) {
  fireEvent.click(screen.getByText('old value'));
  const box = screen.getByRole('textbox') as HTMLInputElement;
  fireEvent.change(box, { target: { value: text } });
  return box;
}

describe('FieldEdit save', () => {
  it('keeps the typed text and shows an error when the save fails', async () => {
    const onCommit = vi.fn().mockResolvedValue(false);
    render(<FieldEdit value="old value" onCommit={onCommit} />);
    const box = openAndType('my long new text');
    fireEvent.blur(box);
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('my long new text');
  });

  it('also treats a rejected save as a failure', async () => {
    const onCommit = vi.fn().mockRejectedValue(new Error('500'));
    render(<FieldEdit value="old value" onCommit={onCommit} />);
    fireEvent.blur(openAndType('kept'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('kept');
  });

  it('closes the field when the save succeeds', async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    render(<FieldEdit value="old value" onCommit={onCommit} />);
    fireEvent.blur(openAndType('new text'));
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
    expect(onCommit).toHaveBeenCalledWith('new text');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('stays open while the save is pending', async () => {
    let finish: (v?: unknown) => void = () => {};
    const onCommit = vi.fn(() => new Promise((res) => { finish = res; }));
    render(<FieldEdit value="old value" onCommit={onCommit} />);
    fireEvent.blur(openAndType('typing'));
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('typing');
    finish();
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
  });
});

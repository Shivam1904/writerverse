import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateCharacter = vi.fn();
vi.mock('../data', () => ({
  updateCharacter: (...a: unknown[]) => updateCharacter(...a),
  loadCharacterFull: vi.fn().mockResolvedValue(null),
  acceptCharacterField: vi.fn(),
  rejectCharacterField: vi.fn(),
  updateProposedField: vi.fn(),
}));
vi.mock('../../../modules/arnKit', () => ({ ArnIdeaButton: () => null, ArnIdeaBox: () => null }));

import { VoiceBlock } from './VoiceBlock';

function renderBlock(character: any) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <VoiceBlock projectId="1" character={character} showIdeas={false} />
    </QueryClientProvider>,
  );
}

function typeSignature(text: string) {
  fireEvent.click(screen.getByText('— one unmistakable sentence'));
  const box = screen.getByRole('textbox');
  fireEvent.change(box, { target: { value: text } });
  fireEvent.blur(box);
}

describe('VoiceBlock signature line (SA-105)', () => {
  beforeEach(() => { updateCharacter.mockReset(); });

  it('saves the signature line into voice_profile, keeping the voice tone', async () => {
    updateCharacter.mockResolvedValue({});
    renderBlock({ id: 7, voice_profile: { tone: 'clipped' } });
    typeSignature('I never lose twice.');
    await waitFor(() => expect(updateCharacter).toHaveBeenCalledWith('1', 7, {
      voice_profile: { tone: 'clipped', signature: 'I never lose twice.' },
    }));
  });

  it('shows the saved line after a remount (collapse / reload)', () => {
    renderBlock({ id: 7, voice_profile: { signature: 'I never lose twice.' } });
    expect(screen.getByText('“I never lose twice.”')).toBeTruthy();
  });

  it('keeps the typed line and shows an error when the save fails', async () => {
    updateCharacter.mockRejectedValue(new Error('500'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    renderBlock({ id: 7, voice_profile: {} });
    typeSignature('I never lose twice.');
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('I never lose twice.');
  });
});

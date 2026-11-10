import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProposalRailCard, sectionForProposal } from './ProposalRailCard';
import { PROPOSAL_SURFACES } from './registry';

function renderCard(error?: 'accept' | 'reject') {
  const onAccept = vi.fn();
  const onCancel = vi.fn();
  render(
    <MemoryRouter>
      <ProposalRailCard capability="create_character" result={{ name: 'Mara' }}
        onAccept={onAccept} onCancel={onCancel} error={error} />
    </MemoryRouter>,
  );
  return { onAccept, onCancel };
}

describe('ProposalRailCard failure state (SA-292)', () => {
  it('shows no error row when nothing failed', () => {
    renderCard();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a failed accept shows a message, and Retry calls accept again', () => {
    const { onAccept, onCancel } = renderCard('accept');
    expect(screen.getByRole('alert').textContent).toContain("Couldn't accept this.");
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('a failed dismiss shows a message, and Retry calls dismiss again', () => {
    const { onAccept, onCancel } = renderCard('reject');
    expect(screen.getByRole('alert').textContent).toContain("Couldn't dismiss this.");
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
  });
});

describe('ProposalRailCard stale accept (SA-209)', () => {
  const conflicts = [{ field: 'want', was: 'old', current: 'Tuesday want', proposed: 'AI want' }];
  function renderStale() {
    const onAccept = vi.fn();
    const onCancel = vi.fn();
    const onForceAccept = vi.fn();
    render(
      <MemoryRouter>
        <ProposalRailCard capability="propose_character_edit" result={{ character_id: 1, fields: {} }}
          onAccept={onAccept} onCancel={onCancel} onForceAccept={onForceAccept} conflicts={conflicts} />
      </MemoryRouter>,
    );
    return { onAccept, onCancel, onForceAccept };
  }

  it("shows the author's value next to the AI's", () => {
    renderStale();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('You changed this after the AI suggested it.');
    expect(alert.textContent).toContain('Tuesday want');
    expect(alert.textContent).toContain('AI want');
  });

  it("Use AI's force-accepts and Keep mine dismisses", () => {
    const { onAccept, onCancel, onForceAccept } = renderStale();
    fireEvent.click(screen.getByRole('button', { name: "Use AI's" }));
    expect(onForceAccept).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Keep mine' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
  });
});

describe('ProposalRailCard beat suggestions', () => {
  function renderBeat(capability: string, result: any) {
    const { container } = render(
      <MemoryRouter>
        <ProposalRailCard capability={capability} result={result}
          onAccept={vi.fn()} onCancel={vi.fn()} />
      </MemoryRouter>,
    );
    return container.textContent ?? '';
  }

  it('an added beat names its thread and shows the beat text', () => {
    const card = renderBeat('propose_insert_beat', {
      type: 'beat_insert', thread_id: 'ro_1', thread_title: 'The Heist', index: 2,
      fields: { text: 'Mara cracks the vault.' },
    });
    expect(card).toContain('Adding a beat to The Heist.');
    expect(card).toContain('Mara cracks the vault.');
    expect(card).not.toContain('propose insert beat');
    expect(screen.getByRole('button', { name: 'Add beat' })).toBeTruthy();
  });

  it('an edited beat names its thread', () => {
    const card = renderBeat('propose_update_beat', {
      type: 'beat_edit', thread_id: 'ro_1', thread_title: 'The Heist', beat_id: 'b1',
      fields: { text: 'Mara hesitates.' },
    });
    expect(card).toContain('Editing a beat in The Heist.');
    expect(card).toContain('Mara hesitates.');
    expect(card).not.toContain('propose update beat');
  });

  it('a beat proposal with no thread title still reads as a sentence', () => {
    const card = renderBeat('propose_update_beat', {
      type: 'beat_edit', thread_id: 'ro_1', beat_id: 'b1', fields: { kind: 'heading' },
    });
    expect(card).toContain('Editing a beat in a plot thread.');
    expect(card).toContain('Turn it into a heading.');
  });

  it('is hidden on the Threads page, where the beat already shows inline', () => {
    expect(sectionForProposal('propose_insert_beat', {})).toBe('plot-threads');
    expect(sectionForProposal('propose_update_beat', {})).toBe('plot-threads');
  });
});

describe('ProposalRailCard plain labels (wrt-29)', () => {
  function renderText(capability: string, result: any) {
    const { container, unmount } = render(
      <MemoryRouter>
        <ProposalRailCard capability={capability} result={result}
          onAccept={vi.fn()} onCancel={vi.fn()} />
      </MemoryRouter>,
    );
    const text = container.textContent ?? '';
    unmount();
    return text;
  }

  it('a drafted world-entry description reads as a sentence, not a field dump', () => {
    const card = renderText('draft_world_entity', {
      type: 'world_entity_edit', worldbuilding_id: 'wb_1', name: 'the flats', block: 'places',
      content: 'The flats are a work site for salt harvesters.',
    });
    expect(card).toContain('Describing the flats in places.');
    expect(card).toContain('The flats are a work site for salt harvesters.');
    expect(card).not.toContain('world_entity_edit');
    expect(card).not.toContain('wb_1');
  });

  it('story-details fields use plain labels', () => {
    const card = renderText('update_project_meta', {
      type: 'meta_edit', project_id: 8, fields: { perspective: 'first', logline: 'A heist.' },
    });
    expect(card).toContain('Point of view');
    expect(card).toContain('A heist.');
    expect(card).not.toContain('meta_edit');
  });

  it('an unknown suggestion never shows its internal names or keys', () => {
    const card = renderText('some_new_capability', {
      type: 'secret_kind', thing_id: 'x9', weird_key: 'raw', name: 'Mara',
    });
    expect(card).toContain('AI suggestion');
    expect(card).toContain('Mara');
    for (const leak of ['some_new_capability', 'some new capability', 'secret_kind', 'weird', 'x9', 'raw']) {
      expect(card).not.toContain(leak);
    }
  });

  it('no suggestion type puts its capability or payload type on the card', () => {
    const payload = {
      type: 'internal_kind', project_id: 3, worldbuilding_id: 'wb_9',
      name: 'Mara', content: 'Some text.', fields: { text: 'Beat.' },
    };
    for (const capability of Object.keys(PROPOSAL_SURFACES)) {
      const card = renderText(capability, payload);
      expect(card, capability).not.toContain(capability);
      expect(card, capability).not.toContain(capability.replace(/_/g, ' '));
      expect(card, capability).not.toContain('internal_kind');
      expect(card, capability).not.toContain('wb_9');
    }
  });
});

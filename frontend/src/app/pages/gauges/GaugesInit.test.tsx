// SA-166: a brand-new author on the gauges onboarding picks a lens → Continue
// opens the config step → Save advances to scope-binding (BindingsModal).
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GaugesInit } from './GaugesInit'

const { callOp } = vi.hoisted(() => ({ callOp: vi.fn() }))
vi.mock('../../gateway', () => ({ callOp, callResource: vi.fn() }))
vi.mock('../../useCounts', () => ({ useCountsRecord: () => ({ counts: { outline: 3 }, loaded: true }) }))

// One bank template: the 'arc' type → the 'feeling' family card.
const template = { id: 'tension', name: 'Tension rises', type: 'arc', watches: 'Does the tension keep rising?', y_items: ['calm', 'tense'] }

function respond(op: string) {
  switch (op) {
    case 'get_gauge_catalogue': return { types: [{ id: 'arc', kind_word: 'an arc', lenses: [template] }], shared: {} }
    case 'get_gauge_presets': return { presets: [] }
    case 'get_gauge_suggestions': return { suggestions: [] }
    case 'get_gauge_inventions': return { inventions: [] }
    case 'get_gauge_board': return { charts: [], scenes: [] }
    case 'create_preset': return { preset_id: 'p-1' }
    default: return {}
  }
}

function renderInit(onBound = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/project/7/gauges']}>
        <Routes><Route path="/project/:projectId/:section" element={<div className="wv2-root"><GaugesInit onBound={onBound} /></div>} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  callOp.mockReset()
  callOp.mockImplementation(async (_pid: unknown, op: string) => respond(op))
})

describe('GaugesInit onboarding (SA-166)', () => {
  it('Continue opens the config step for the picked lens', async () => {
    renderInit()
    fireEvent.click(await screen.findByRole('button', { name: /Tension rises/ }))
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }))
    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.getByDisplayValue('Tension rises')).toBeTruthy()
  })

  it('Save creates the preset, advances to scope-binding, and binding it reports back', async () => {
    const onBound = vi.fn()
    renderInit(onBound)
    fireEvent.click(await screen.findByRole('button', { name: /Tension rises/ }))
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Save/ }))

    await waitFor(() => expect(callOp).toHaveBeenCalledWith('7', 'create_preset', expect.anything(), expect.anything()))
    // the binding step opens for the NEW preset
    expect(await screen.findByText(/Bindings · which scopes to watch/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Bind this scope/ }))
    await waitFor(() => expect(callOp).toHaveBeenCalledWith('7', 'bind_gauge',
      expect.objectContaining({ ref: { kind: 'preset', id: 'p-1' }, source: 'preset' }), expect.anything()))
    await waitFor(() => expect(onBound).toHaveBeenCalled())
  })

  it('a save that returns no preset keeps the dialog open and says so', async () => {
    callOp.mockImplementation(async (_pid: unknown, op: string) => (op === 'create_preset' ? {} : respond(op)))
    renderInit()
    fireEvent.click(await screen.findByRole('button', { name: /Tension rises/ }))
    fireEvent.click(screen.getByRole('button', { name: /Continue/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Save/ }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.queryByText(/Bindings · which scopes to watch/)).toBeNull()
  })
})

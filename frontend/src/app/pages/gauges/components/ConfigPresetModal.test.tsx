// SA-166: the config modal hands off to scope-binding. LensDetail and
// GaugesCharts open it on an existing preset and pass onSaved/onShowBindings.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigPresetModal } from './ConfigPresetModal'

const { callOp } = vi.hoisted(() => ({ callOp: vi.fn() }))
vi.mock('../../../gateway', () => ({ callOp, callResource: vi.fn() }))

const preset = { id: 'p-9', preset_id: 'p-9', source: 'preset', name: 'Mara stays brave', type: 'arc', kind: 'feeling', items: ['wavers', 'holds'] }

function renderModal(props: Record<string, unknown>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/project/7/lens/p-9']}>
        <Routes><Route path="/project/:projectId/:section/:sub" element={<ConfigPresetModal lens={preset} onClose={vi.fn()} {...props} />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  callOp.mockReset()
  callOp.mockResolvedValue({})
})

describe('ConfigPresetModal → bindings (SA-166)', () => {
  it('Save on an existing preset updates it and passes it to onSaved', async () => {
    const onSaved = vi.fn()
    const onClose = vi.fn()
    renderModal({ onSaved, onClose })
    fireEvent.click(screen.getByRole('button', { name: /Save & continue/ }))

    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(callOp).toHaveBeenCalledWith('7', 'update_preset', expect.objectContaining({ preset_id: 'p-9' }), expect.anything())
    expect(onSaved.mock.calls[0][0]).toMatchObject({ preset_id: 'p-9', source: 'preset', name: 'Mara stays brave' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('"Where it watches" jumps straight to the bindings', () => {
    const onShowBindings = vi.fn()
    renderModal({ onSaved: vi.fn(), onShowBindings })
    fireEvent.click(screen.getByRole('button', { name: /Where it watches/ }))
    expect(onShowBindings).toHaveBeenCalledWith(preset)
  })

  it('without onSaved (the bank), Save just closes', async () => {
    const onClose = vi.fn()
    renderModal({ onClose })
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /Where it watches/ })).toBeNull()
  })

  it('a suggestion whose edits fail to save shows an error instead of moving on', async () => {
    callOp.mockImplementation(async (_pid: unknown, op: string) => {
      if (op === 'accept_suggestion') return { preset_id: 'p-new' }
      if (op === 'update_preset') throw new Error('update failed')
      return {}
    })
    const onSaved = vi.fn()
    const onClose = vi.fn()
    renderModal({ lens: { ...preset, id: 's-1', preset_id: undefined, source: 'suggested' }, onSaved, onClose })
    fireEvent.click(screen.getByRole('button', { name: /Save & continue/ }))

    await screen.findByText(/Couldn.t save this gauge/)
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})

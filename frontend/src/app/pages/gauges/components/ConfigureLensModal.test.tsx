// SA-298: picking a chart visual is optimistic; a failed save puts the old one back.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ConfigureLensModal } from './ConfigureLensModal'

const { callOp } = vi.hoisted(() => ({
  callOp: vi.fn(async (_pid: unknown, op: string): Promise<any> => {
    if (op === 'set_gauge_view') throw new Error('view failed')
    return {}
  }),
}))
vi.mock('../../../gateway', () => ({ callOp, callResource: vi.fn() }))

const lens = { id: 'g-1', preset_id: 'g-1', source: 'preset', name: 'Pace', type: 'arc', kind: 'feeling', visuals: ['bars', 'heat_strip'] }
const selections = [{ template: 'g-1', scope: { name: 'story' }, chart: { binding_id: 'b-1' } }]

describe('ConfigureLensModal: a failed visual pick is undone', () => {
  it('steps back to the old visual when saving the new one fails', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { container } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/project/7/gauges/x']}>
          <Routes><Route path="/project/:projectId/:section/:sub" element={<ConfigureLensModal lens={lens} selections={selections} onClose={vi.fn()} />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const count = () => container.querySelector('.gz-vstep-count')?.textContent
    expect(count()).toBe('1 / 2')
    fireEvent.click(screen.getByRole('button', { name: '›' }))
    expect(count()).toBe('2 / 2')
    expect(callOp).toHaveBeenCalledWith('7', 'set_gauge_view', { binding_id: 'b-1', visual: 'heat_strip' }, expect.anything())
    await waitFor(() => expect(count()).toBe('1 / 2'))
  })
})

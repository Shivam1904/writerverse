// SA-208: the backend's `items` domain (discovery items, e.g. after a braindump
// extract) used to refetch nothing. The World query reads get_items, so it must.
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { bindQueryClient, handleDispatchInvalidates, subscribeInvalidation } from './queryInvalidator'

describe('items domain', () => {
  it("refetches the project's World query", () => {
    const qc = new QueryClient()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    bindQueryClient(qc)
    handleDispatchInvalidates(7, ['items'])
    expect(spy).toHaveBeenCalledWith({ queryKey: ['world', '7'] })
  })

  it('reaches local-state pages subscribed to it', () => {
    const cb = vi.fn()
    const unsub = subscribeInvalidation('items', cb)
    handleDispatchInvalidates(7, ['items'])
    unsub()
    handleDispatchInvalidates(7, ['items'])
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith('7')
  })
})

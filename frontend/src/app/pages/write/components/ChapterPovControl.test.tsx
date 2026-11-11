// SA-298: the POV pick is optimistic; a failed save puts the old POV back.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ChapterPovControl } from './ChapterPovControl'

const { callOp } = vi.hoisted(() => ({
  callOp: vi.fn(async (_pid: unknown, op: string): Promise<any> => {
    if (op === 'set_chapter_pov') throw new Error('pov failed')
    return {}
  }),
}))
vi.mock('../../../gateway', () => ({ callOp }))

describe('ChapterPovControl: a failed POV save is undone', () => {
  it('puts the previous POV back on screen and in the page', async () => {
    const onLocalUpdate = vi.fn()
    render(
      <ChapterPovControl projectId="7" chapterId="ch1" characters={[]}
        pov={{ mode: 'multiple', character: '' }} onLocalUpdate={onLocalUpdate} />,
    )
    const mode = screen.getByDisplayValue('Multiple') as HTMLSelectElement
    fireEvent.change(mode, { target: { value: 'third-omniscient' } })
    expect(mode.value).toBe('third-omniscient')
    expect(onLocalUpdate).toHaveBeenLastCalledWith({ mode: 'third-omniscient', character: '' })
    await waitFor(() => expect(mode.value).toBe('multiple'))
    expect(onLocalUpdate).toHaveBeenLastCalledWith({ mode: 'multiple', character: '' })
  })
})

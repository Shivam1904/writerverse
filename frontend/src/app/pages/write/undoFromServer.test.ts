// SA-298: WritePage + ChaptersV2Page send their outline writes (new scene,
// chapter/scene title) through addSceneOrUndo / renameOrUndo; a failed write
// re-pulls the server's outline so the unsaved change drops off the screen.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addSceneOrUndo, renameOrUndo, undoFromServer } from './undoFromServer'
import { useWriteStore } from './writeStore'
import { useReceiptStore } from '../../modules/receipt/receiptStore'

const server = { chapters: [{ id: 'ch1', text: 'Saved title', scenes: [] }], totalWords: 0 }
vi.mock('./data', () => ({
  loadWriteData: vi.fn(async () => ({ data: server, contentById: {}, acts: [{ id: 'ac1' }] })),
}))
const { addOutlineItem, updateOutlineItem } = vi.hoisted(() => ({
  addOutlineItem: vi.fn(),
  updateOutlineItem: vi.fn(),
}))
vi.mock('../outline/data', () => ({ addOutlineItem, updateOutlineItem }))

const chapters = () => useWriteStore.getState().data.chapters
const shown = () => useReceiptStore.getState().receipts.map((r) => r.what)
const UNDONE = "Couldn't save that change — undone"

beforeEach(() => {
  useReceiptStore.setState({ receipts: [] })
  // what the page shows after its optimistic edit: a typed title + a new scene
  useWriteStore.setState({
    data: { chapters: [{ id: 'ch1', text: 'Typed title', scenes: [{ id: 'sc-new' }] }], totalWords: 0 } as any,
    dirtySceneIds: new Set(),
  })
  addOutlineItem.mockReset()
  updateOutlineItem.mockReset()
})

describe('undoFromServer', () => {
  it('drops the unsaved change by putting the server outline back', async () => {
    const onLoaded = vi.fn()
    await undoFromServer('p1', onLoaded)
    expect(chapters()).toEqual(server.chapters)
    expect(onLoaded).toHaveBeenCalledWith(expect.objectContaining({ acts: [{ id: 'ac1' }] }))
    expect(shown()).toEqual([UNDONE])
  })

  it('a new scene whose save fails disappears again', async () => {
    addOutlineItem.mockRejectedValue(new Error('add failed'))
    await addSceneOrUndo('p1', 'ch1', 'sc-new')
    expect(addOutlineItem).toHaveBeenCalledWith('p1', 'scene', 'ch1', undefined, 'sc-new')
    expect(chapters()).toEqual(server.chapters)
    expect(shown()).toEqual([UNDONE])
  })

  it('a title whose save fails goes back to the saved one', async () => {
    updateOutlineItem.mockRejectedValue(new Error('update failed'))
    await renameOrUndo('p1', 'chapter', 'ch1', 'Typed title')
    expect(updateOutlineItem).toHaveBeenCalledWith('p1', 'chapter', 'ch1', { text: 'Typed title' })
    expect(chapters()[0].text).toBe('Saved title')
  })

  it('a save that lands changes nothing', async () => {
    updateOutlineItem.mockResolvedValue({})
    await renameOrUndo('p1', 'chapter', 'ch1', 'Typed title')
    expect(chapters()[0].text).toBe('Typed title')
    expect(shown()).toEqual([])
  })
})

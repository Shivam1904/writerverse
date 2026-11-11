// SA-306: screens that never show prose ask for the outline WITHOUT scene prose
// (include_prose: false). Write and Preview load structure lean too and fetch
// prose one chapter at a time (get_chapter_docs, SA-308); no screen reads the
// whole manuscript.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { callOp } = vi.hoisted(() => ({ callOp: vi.fn() }))
vi.mock('../../gateway', () => ({ callOp }))

import { loadOutline } from './data'
import { loadThreads } from '../threads/data'
import { loadStorySoFar } from '../story-so-far/data'
import { loadWriteData } from '../write/data'
import { queries } from '../../queries'

const PROSE = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Rain.' }] }] }
const outline = () => ({
  acts: [{ id: 'ac1', text: 'Act', chapters: [{ id: 'ch1', text: 'Ch', scenes: [
    { id: 'sc1', text: 'Scene', words: 1, content: PROSE, beats: [] },
  ] }] }],
})

const outlineCalls = () => callOp.mock.calls.filter((c) => c[1] === 'get_grand_outline')

beforeEach(() => {
  callOp.mockReset()
  callOp.mockImplementation(async (_pid: unknown, op: string) =>
    op === 'get_grand_outline' ? { grand_outline: outline() } : {})
})

describe('lean outline reads (no scene prose)', () => {
  it.each([
    ['Outline (loadOutline)', () => loadOutline('p1')],
    ['shared qk.outline query (useTickNav, useOutlineModel)', () => queries.outline('p1').queryFn!({} as any)],
    ['Threads', () => loadThreads('p1')],
    ['Story so far', () => loadStorySoFar('p1')],
  ])('%s asks for include_prose: false', async (_name, load) => {
    await load()
    expect(outlineCalls()).toHaveLength(1)
    expect(outlineCalls()[0][2]).toEqual({ include_prose: false })
  })
})

describe('prose reads', () => {
  it('Write + Preview (loadWriteData) ask for the lean outline and leave scene content undefined', async () => {
    const res = await loadWriteData('p1')
    expect(outlineCalls()).toHaveLength(1)
    expect(outlineCalls()[0][2]).toEqual({ include_prose: false })
    expect(res.data.chapters[0].scenes[0].content).toBeUndefined()
  })
})

// Guard: any NEW direct `callOp(..., 'get_grand_outline')` must be a deliberate
// choice. Only the lean helper and the Write/Preview loader may call it directly
// (Walks and the rest go through getLeanGrandOutline).
describe('who calls get_grand_outline directly', () => {
  it('only outline/data.ts (lean helper) and write/data.ts (lean, prose per chapter)', () => {
    const files = import.meta.glob(['../../**/*.{ts,tsx}', '!../../**/*.test.{ts,tsx}'], {
      query: '?raw', import: 'default', eager: true,
    }) as Record<string, string>
    const direct = Object.entries(files)
      .filter(([, src]) => /callOp\([^)]*'get_grand_outline'/.test(src))
      .map(([path]) => path)
      .sort()
    expect(direct).toEqual(['../write/data.ts', './data.ts'])
    // ...and every one of those calls is lean (SA-308: no full-prose read left).
    for (const path of direct) {
      const calls = files[path].match(/callOp\([^)]*'get_grand_outline'[^)]*\)/g) ?? []
      for (const call of calls) expect(call).toMatch(/include_prose: false/)
    }
  })
})

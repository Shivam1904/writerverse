// SA-113: the trash button archives (never hard-deletes); archived books sit in
// "Deleted books" with Restore; permanent delete needs the exact typed name.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../../stores/authStore'
import { useProjectStore } from '../../../stores/projectStore'
import Library from './Library'

const { get, post, del } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), del: vi.fn() }))
vi.mock('axios', () => ({
  default: {
    get, post, delete: del,
    defaults: { headers: { common: {} } },
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}))
vi.mock('./LibraryTopBar', () => ({ LibraryTopBar: () => null }))

const book = (over: Record<string, unknown>) => ({
  id: 1, title: 'Ember Lake', genre: 'fantasy', status: 'write', total_word_count: 84210,
  progress_percentage: 0, created_at: '2026-01-01', updated_at: '2026-09-01', archived_at: null,
  ...over,
})

function renderLibrary(projects: unknown[]) {
  get.mockResolvedValue({ data: projects })
  return render(<MemoryRouter><Library /></MemoryRouter>)
}

const deletedSection = () => screen.getByRole('region', { name: 'Deleted books' })

beforeEach(() => {
  get.mockReset(); post.mockReset(); del.mockReset()
  useAuthStore.setState({ user: { id: 1, email: 'a@b.c' } as never })
  useProjectStore.setState({ projects: [] })
})

describe('Library delete safety', () => {
  it('trash archives the book instead of deleting it', async () => {
    post.mockResolvedValue({ data: { archived_at: '2026-10-01T00:00:00Z' } })
    renderLibrary([book({})])

    fireEvent.click(await screen.findByRole('button', { name: /Move to Deleted books: Ember Lake/ }))

    await waitFor(() => expect(post).toHaveBeenCalledWith('/projects/1/archive/'))
    expect(del).not.toHaveBeenCalled()
    expect(within(deletedSection()).getByText('Ember Lake')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Move to Deleted books/ })).toBeNull()
  })

  it('a failed archive keeps the book on the shelf and tells the author', async () => {
    post.mockRejectedValue(new Error('Network Error'))
    renderLibrary([book({})])

    fireEvent.click(await screen.findByRole('button', { name: /Move to Deleted books: Ember Lake/ }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Move to Deleted books: Ember Lake/ })).toBeTruthy()
  })

  it('restore brings an archived book back to the shelf', async () => {
    post.mockResolvedValue({ data: { archived_at: null } })
    renderLibrary([book({ archived_at: '2026-10-01T00:00:00Z' })])

    fireEvent.click(await within(await screen.findByRole('region', { name: 'Deleted books' }))
      .findByRole('button', { name: 'Restore' }))

    await waitFor(() => expect(post).toHaveBeenCalledWith('/projects/1/restore/'))
    expect(await screen.findByRole('button', { name: /Move to Deleted books: Ember Lake/ })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Deleted books' })).toBeNull()
  })

  it('permanent delete is locked until the exact book name is typed, and shows the word count', async () => {
    del.mockResolvedValue({})
    renderLibrary([book({ archived_at: '2026-10-01T00:00:00Z' })])

    fireEvent.click(await within(await screen.findByRole('region', { name: 'Deleted books' }))
      .findByRole('button', { name: 'Delete forever' }))

    const dialog = screen.getByRole('dialog', { name: 'Delete this book forever?' })
    expect(within(dialog).getByText(/84,210 words/)).toBeTruthy()
    const confirm = within(dialog).getByRole('button', { name: 'Delete forever' }) as HTMLButtonElement
    const input = within(dialog).getByLabelText('Type the book name to confirm')

    expect(confirm.disabled).toBe(true)
    fireEvent.change(input, { target: { value: 'ember lake' } })
    expect(confirm.disabled).toBe(true)
    fireEvent.click(confirm)
    expect(del).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: 'Ember Lake' } })
    expect(confirm.disabled).toBe(false)
    fireEvent.click(confirm)
    await waitFor(() => expect(del).toHaveBeenCalledWith('/projects/1/'))
  })
})

describe('Library create failure (SA-126)', () => {
  it('a failed create keeps the modal open with the title and tells the author', async () => {
    post.mockRejectedValue(new Error('Network Error'))
    renderLibrary([])

    fireEvent.click(await screen.findByRole('button', { name: 'Create your first book' }))
    const dialog = screen.getByRole('dialog', { name: 'Create new book' })
    fireEvent.change(within(dialog).getByLabelText('Book name'), { target: { value: 'Ember Lake' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /Create book/ }))

    await waitFor(() => expect(post).toHaveBeenCalledWith('/projects/', { title: 'Ember Lake' }))
    const modal = screen.getByRole('dialog', { name: 'Create new book' })
    expect(within(modal).getByRole('alert').textContent).toMatch(/Couldn't create the book/)
    expect((within(modal).getByLabelText('Book name') as HTMLInputElement).value).toBe('Ember Lake')
  })
})

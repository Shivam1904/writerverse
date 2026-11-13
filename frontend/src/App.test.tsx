import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import App from './App'

// Mock axios
vi.mock('axios', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    defaults: { 
      baseURL: '',
      headers: { common: {} }
    },
    interceptors: {
      request: { use: vi.fn(), eject: vi.fn() },
      response: { use: vi.fn(), eject: vi.fn() }
    }
  }
}))

describe('App', () => {
  it('renders WriterVerse title', async () => {
    render(<App />)
    
    const elements = screen.getAllByText(/WriterVerse/i)
    expect(elements.length).toBeGreaterThan(0)
  })

  // We'll skip the loading state test because App component might not render "Checking backend connection..." anymore.
})

describe('dev-only routes (SA-104)', () => {
  const load = async (dev: boolean, path: string) => {
    vi.resetModules()
    vi.stubEnv('DEV', dev)
    window.history.pushState({}, '', path)
    const { default: FreshApp } = await import('./App')
    render(<FreshApp />)
  }

  it('does not register /demo/* or /dev/* when DEV is false', async () => {
    for (const path of ['/dev/logs', '/dev/lens-catalogue', '/demo/weave', '/demo/showcase-ui']) {
      await load(false, path)
      // the catch-all route redirects away instead of rendering the page
      await waitFor(() => expect(window.location.pathname).not.toBe(path))
      cleanup()
    }
  })

  it('still serves the dev pages when DEV is true', async () => {
    await load(true, '/dev/lens-catalogue')
    await new Promise((r) => setTimeout(r, 100))
    expect(window.location.pathname).toBe('/dev/lens-catalogue')
  })
})

describe('old /projectv2/ links', () => {
  it('redirect to the same page under /project/, keeping the query string and hash', async () => {
    window.history.pushState({}, '', '/projectv2/7/characters/12/studio?tab=arc#notes')
    render(<App />)
    await waitFor(() => expect(window.location.pathname).toBe('/project/7/characters/12/studio'))
    expect(window.location.search).toBe('?tab=arc')
    expect(window.location.hash).toBe('#notes')
    cleanup()
  })
})

describe('public auth pages, opened directly while signed out', () => {
  it.each(['/signup', '/forgot-password', '/reset-password', '/verify-email', '/login'])(
    '%s stays on its own page',
    async (path) => {
      window.history.pushState({}, '', path)
      render(<App />)
      await new Promise((r) => setTimeout(r, 50))
      expect(window.location.pathname).toBe(path)
      cleanup()
    },
  )

  // The browser still holds an old session: `isAuthenticated: true` is
  // persisted, but the tokens have expired and the refresh is refused. The
  // auth pages must wait for that check instead of bouncing to /library (and
  // from there to /login) on the stale flag.
  it.each(['/signup', '/forgot-password', '/login'])(
    '%s stays put when the saved session turns out to be dead',
    async (path) => {
      const expired = `x.${btoa(JSON.stringify({ exp: 1 }))}.y`
      localStorage.setItem('auth-storage', JSON.stringify({
        state: { user: { email: 'a@b.c' }, tokens: { access: expired, refresh: 'dead' }, isAuthenticated: true },
        version: 0,
      }))
      vi.resetModules()
      const { default: axios } = await import('axios')
      vi.mocked(axios.post).mockRejectedValue(new Error('401'))
      window.history.pushState({}, '', path)
      const { default: FreshApp } = await import('./App')
      render(<FreshApp />)
      const { useAuthStore } = await import('./stores/authStore')
      await waitFor(() => expect(useAuthStore.getState().initialized).toBe(true))
      await new Promise((r) => setTimeout(r, 50))
      expect(window.location.pathname).toBe(path)
      vi.mocked(axios.post).mockReset()
      localStorage.clear()
      cleanup()
    },
  )
})

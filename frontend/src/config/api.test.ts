import { afterEach, describe, expect, it, vi } from 'vitest'
import { joinApiUrl } from './api'

// Every backend call must use the one API base (VITE_API_URL). A relative
// `/api/...` fetch worked locally (Vite proxy) but hit the frontend host in
// production and got index.html back.

describe('joinApiUrl', () => {
  it('joins an absolute production base and a path', () => {
    expect(joinApiUrl('https://api.example.com/api', '/consistency/projects/7/chat/'))
      .toBe('https://api.example.com/api/consistency/projects/7/chat/')
  })

  it('keeps the query string and ignores a trailing slash on the base', () => {
    expect(joinApiUrl('https://api.example.com/api/', '/consistency/projects/7/frame/?page=write'))
      .toBe('https://api.example.com/api/consistency/projects/7/frame/?page=write')
  })

  it('works with a relative base (local Vite proxy)', () => {
    expect(joinApiUrl('/api', '/projects/')).toBe('/api/projects/')
  })

  it('rejects a path without a leading slash or with the /api prefix', () => {
    expect(() => joinApiUrl('/api', 'projects/')).toThrow(/must start with/)
    expect(() => joinApiUrl('/api', '/api/projects/')).toThrow(/must not include/)
  })
})

describe('API_BASE_URL / apiUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  async function load(viteApiUrl: string) {
    vi.stubEnv('VITE_API_URL', viteApiUrl)
    vi.resetModules()
    return import('./api')
  }

  it('uses VITE_API_URL when it is set', async () => {
    const { API_BASE_URL, apiUrl } = await load('https://api.example.com/api')
    expect(API_BASE_URL).toBe('https://api.example.com/api')
    expect(apiUrl('/projects/')).toBe('https://api.example.com/api/projects/')
  })

  it('falls back to the local backend when VITE_API_URL is empty', async () => {
    const { apiUrl } = await load('')
    expect(apiUrl('/projects/')).toBe('http://localhost:8555/api/projects/')
  })
})

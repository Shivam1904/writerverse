/**
 * Authentication store using Zustand for state management
 * Handles user authentication state, login, logout, and registration
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import axios from 'axios'
import { API_BASE_URL } from '../config/api'
import { useWriteStore } from '../app/pages/write/writeStore'
import { stashUnsavedProse } from '../app/pages/write/unsavedStash'

export interface User {
  id: number
  email: string
  first_name: string
  last_name: string
  date_joined: string
}

interface AuthTokens {
  access: string
  refresh: string
}

interface AuthState {
  user: User | null
  tokens: AuthTokens | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  /**
   * False until `checkAuthStatus()` has settled (a persisted-but-expired access
   * token is refreshed before this flips). Routes that fire authenticated data
   * fetches wait on this so the first request never goes out with a stale token.
   * Deliberately NOT persisted — it must start false on every page load.
   */
  initialized: boolean
  /**
   * True right after sign-up or email verification signs a new account in, so
   * the library can greet a brand-new author once (an extension's library
   * overlay reads it, see app/extensions.ts). Kept in the
   * store, not router state, because AuthRoute's own redirect can win the race.
   * Not persisted: a reload drops it.
   */
  justSignedUp: boolean
}

/** What the sign-up form sends. The server records the terms time and version itself. */
export interface RegisterInput {
  email: string
  password: string
  passwordConfirm: string
  firstName: string
  lastName: string
  /** The "I accept the Terms and Conditions" checkbox. Required by a deployed server. */
  acceptedTerms: boolean
}

/**
 * What sign-up leads to. A deployed server asks the user to confirm their
 * email first (no tokens yet); locally they are signed in straight away.
 */
export type RegisterResult =
  | { verificationRequired: true; email: string; devVerifyLink?: string }
  | { verificationRequired: false }

/** The `code` the server sends when the password is right but the email isn't confirmed. */
export const EMAIL_NOT_VERIFIED = 'email_not_verified'

/** An auth error with the server's `code` (if any), for pages that react to one. */
export type AuthError = Error & { code?: string }

interface AuthActions {
  login: (email: string, password: string) => Promise<void>
  register: (input: RegisterInput) => Promise<RegisterResult>
  /** Use the token from the verify-email link; on success the user is signed in. */
  verifyEmail: (token: string) => Promise<void>
  logout: () => Promise<void>
  clearError: () => void
  setLoading: (loading: boolean) => void
  checkAuthStatus: () => Promise<void> | void
  clearJustSignedUp: () => void
}

type AuthStore = AuthState & AuthActions

// Configure axios defaults
axios.defaults.baseURL = API_BASE_URL
// A hung socket must fail (so a save shows "error" and retries) instead of
// leaving a scene "saving" forever. Generous: some ops make LLM calls inline.
axios.defaults.timeout = 120_000

// Create axios interceptor for token refresh
let isRefreshing = false
let failedQueue: Array<{ resolve: (value?: string | null) => void; reject: (error?: unknown) => void }> = []
let interceptorsSetup = false

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error)
    } else {
      resolve(token)
    }
  })

  failedQueue = []
}

const setupAxiosInterceptors = (getTokens: () => AuthTokens | null, setTokens: (tokens: AuthTokens | null) => void, logout: () => void) => {
  if (interceptorsSetup) {
    return // Already set up
  }

  interceptorsSetup = true

  // Request interceptor to add auth token
  axios.interceptors.request.use(
    (config) => {
      const tokens = getTokens()
      const requestUrl = config.url || ''
      const isAuthRefresh = requestUrl.includes('/auth/refresh/')
      const isAuthLogout = requestUrl.includes('/auth/logout/')

      // Logout and refresh go out WITHOUT the access token. Logout is AllowAny
      // but keeps the default JWTAuthentication, and DRF authenticates every
      // request before checking permissions — so a dead token (e.g. right after
      // a password reset, which ends every session, SA-39) gets a 401 and the
      // logout never runs. Refresh has no authentication classes; dropping it
      // there just keeps the two auth calls alike. App.tsx sets a DEFAULT
      // Authorization header, so it must be removed here, not just left unset.
      if (isAuthRefresh || isAuthLogout) {
        config.headers.delete('Authorization')
      } else if (tokens?.access) {
        config.headers.Authorization = `Bearer ${tokens.access}`
      }
      return config
    },
    (error) => Promise.reject(error)
  )

  // Response interceptor to handle token refresh
  axios.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config
      const requestUrl = originalRequest?.url || ''
      const isAuthRefresh = requestUrl.includes('/auth/refresh/')

      // A 401 from the refresh endpoint itself means the refresh token is dead.
      // Don't try to refresh-the-refresh — that re-enters this handler and hammers
      // /auth/refresh/. Let it reject so the caller logs out + redirects exactly once.
      if (error.response?.status === 401 && !originalRequest._retry && !isAuthRefresh) {
        if (isRefreshing) {
          // If already refreshing, queue this request
          return new Promise((resolve, reject) => {
            failedQueue.push({ resolve, reject })
          }).then(token => {
            originalRequest.headers.Authorization = `Bearer ${token}`
            return axios(originalRequest)
          }).catch(err => {
            return Promise.reject(err)
          })
        }

        originalRequest._retry = true
        isRefreshing = true

        try {
          const tokens = getTokens()
          if (tokens?.refresh) {
            const response = await axios.post('/auth/refresh/', {
              refresh: tokens.refresh
            })

            const newTokens = {
              access: response.data.access,
              // Server has ROTATE_REFRESH_TOKENS on: each refresh returns a NEW
              // refresh token and blacklists the old one. Persist the rotated token,
              // or the next refresh reuses a blacklisted token and 401s in a loop.
              refresh: response.data.refresh ?? tokens.refresh
            }

            setTokens(newTokens)
            processQueue(null, newTokens.access)

            originalRequest.headers.Authorization = `Bearer ${newTokens.access}`
            return axios(originalRequest)
          } else {
            throw new Error('No refresh token available')
          }
        } catch (refreshError) {
          // Refresh failed, logout user and process queue with error
          processQueue(refreshError, null)
          // The redirect below wipes the editor; park unsaved prose first.
          const { contentById, dirtySceneIds } = useWriteStore.getState()
          stashUnsavedProse(contentById, dirtySceneIds)
          logout()
          // Redirect to login page
          window.location.href = '/login'
          return Promise.reject(refreshError)
        } finally {
          isRefreshing = false
        }
      }

      return Promise.reject(error)
    }
  )
}

/**
 * Ask for a new verify-email link. The server answers the same for every
 * email, so this only fails when the request itself didn't get through.
 * Returns the link itself only in local dev (DEV_SHORTCUTS_ENABLED).
 */
export async function resendVerificationEmail(email: string): Promise<{ devVerifyLink?: string }> {
  try {
    const response = await axios.post('/auth/verify-email/resend/', { email })
    return { devVerifyLink: response.data?.dev_verify_link }
  } catch {
    throw new Error("We couldn't send a new link. Check your connection and try again.")
  }
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => {
      const store = {
        // State
        user: null,
        tokens: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
        initialized: false,
        justSignedUp: false,

        // Actions
        login: async (email: string, password: string) => {
          set({ isLoading: true, error: null })

          try {
            const response = await axios.post('/auth/login/', {
              email,
              password
            })

            const { access, refresh, user } = response.data
            const tokens = { access, refresh }

            set({
              user,
              tokens,
              isAuthenticated: true,
              isLoading: false,
              error: null
            })
          } catch (error: unknown) {
            const err = error as { response?: { data?: { detail?: string; code?: string; non_field_errors?: string[] } } }
            const data = err.response?.data
            const message = !err.response
              ? "Can't reach the server — check your connection."
              : data?.detail || data?.non_field_errors?.[0] || 'Sign in failed. Please try again.'
            set({ isLoading: false, error: message })
            const enrichedError: AuthError = error instanceof Error ? error : new Error(message)
            enrichedError.message = message
            enrichedError.code = data?.code
            throw enrichedError
          }
        },

        verifyEmail: async (token: string) => {
          set({ isLoading: true, error: null })
          try {
            const response = await axios.post('/auth/verify-email/', { token })
            const { access, refresh, user } = response.data
            set({
              user,
              tokens: { access, refresh },
              isAuthenticated: true,
              isLoading: false,
              error: null,
              justSignedUp: true,
            })
          } catch (error: unknown) {
            const err = error as { response?: { data?: { detail?: string; code?: string } } }
            const message = !err.response
              ? "Can't reach the server — check your connection."
              : err.response.data?.detail || 'This link has expired or was already used.'
            set({ isLoading: false })
            const enrichedError: AuthError = new Error(message)
            enrichedError.code = err.response?.data?.code
            throw enrichedError
          }
        },

        register: async ({ email, password, passwordConfirm, firstName, lastName, acceptedTerms }: RegisterInput): Promise<RegisterResult> => {
          set({ isLoading: true, error: null })

          try {
            const response = await axios.post('/auth/register/', {
              email,
              password,
              password_confirm: passwordConfirm,
              first_name: firstName,
              last_name: lastName,
              accepted_terms: acceptedTerms,
            })

            if (response.data.verification_required) {
              // No tokens yet: the user signs in by clicking the emailed link.
              set({ isLoading: false, error: null })
              return {
                verificationRequired: true,
                email: response.data.email,
                devVerifyLink: response.data.dev_verify_link,
              }
            }

            const { access, refresh, user } = response.data
            const tokens = { access, refresh }

            set({
              user,
              tokens,
              isAuthenticated: true,
              isLoading: false,
              error: null,
              justSignedUp: true,
            })
            return { verificationRequired: false }
          } catch (error: unknown) {
            const err = error as { response?: { data?: unknown } }
            const extractMessage = () => {
              if (!err.response) {
                return "Can't reach the server — check your connection."
              }
              const data = err?.response?.data
              if (!data) {
                return 'Registration failed. Please try again.'
              }

              if (typeof data === 'string') {
                return data
              }

              if (typeof data === 'object' && data !== null) {
                const dataObj = data as Record<string, unknown>
                if (dataObj.detail) {
                  return dataObj.detail as string
                }

                const formatFieldLabel = (field: string) => {
                  // accepted_terms: the server's message already says what to do.
                  if (!field || field === 'detail' || field === 'non_field_errors' || field === 'accepted_terms') {
                    return ''
                  }

                  return field
                    .split('_')
                    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
                    .join(' ')
                }

                const parts = Object.entries(dataObj)
                  .map(([field, value]) => {
                    const messages = Array.isArray(value) ? value : [value]
                    const messageText = messages
                      .map(message => String(message).trim())
                      .filter(Boolean)
                      .join(' ')

                    if (!messageText) {
                      return ''
                    }

                    const label = formatFieldLabel(field)
                    return label ? `${label}: ${messageText}` : messageText
                  })
                  .filter(Boolean)

                if (parts.length) {
                  return parts.join(' \u2022 ')
                }
              }

              return 'Registration failed. Please try again.'
            }

            const message = extractMessage()

            set({
              isLoading: false,
              error: message
            })

            const enrichedError: Error = error instanceof Error ? error : new Error(message)
            enrichedError.message = message

            throw enrichedError
          }
        },

        logout: async () => {
          set({ isLoading: true })

          try {
            const tokens = get().tokens
            if (tokens?.refresh) {
              await axios.post('/auth/logout/', {
                refresh: tokens.refresh
              })
            }
          } catch (error) {
            console.error('Logout error:', error)
          } finally {
            // Clear all authentication state
            set({
              user: null,
              tokens: null,
              isAuthenticated: false,
              isLoading: false,
              error: null
            })

            // Clear localStorage
            localStorage.removeItem('auth-storage')

            // Clear axios default headers
            delete axios.defaults.headers.common['Authorization']
          }
        },

        clearError: () => set({ error: null }),
        clearJustSignedUp: () => set({ justSignedUp: false }),
        setLoading: (loading: boolean) => set({ isLoading: loading }),

        checkAuthStatus: async () => {
          const tokens = get().tokens
          if (!tokens?.access) {
            set({
              user: null,
              tokens: null,
              isAuthenticated: false,
              isLoading: false,
              error: null,
              initialized: true
            })
            return
          }

          try {
            const base64Url = tokens.access.split('.')[1]
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
            const jsonPayload = decodeURIComponent(
              atob(base64).split('').map(c =>
                '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
              ).join('')
            )
            const payload = JSON.parse(jsonPayload)
            const currentTime = Math.floor(Date.now() / 1000)

            if (payload.exp < currentTime) {
              if (tokens.refresh) {
                try {
                  const response = await axios.post('/auth/refresh/', {
                    refresh: tokens.refresh
                  })
                  set({
                    // Persist the rotated refresh token (see interceptor note above).
                    tokens: { access: response.data.access, refresh: response.data.refresh ?? tokens.refresh }
                  })
                } catch {
                  get().logout()
                }
              } else {
                get().logout()
              }
            }
          } catch (error) {
            console.error('Auth check failed:', error)
            get().logout()
          } finally {
            // Token is now settled (valid, refreshed, or cleared) — release any
            // route gated on `initialized` so its first fetch carries a good token.
            set({ initialized: true })
          }
        }
      }

      // Setup axios interceptors
      setupAxiosInterceptors(
        () => get().tokens,
        (tokens) => set({ tokens }),
        () => {
          set({
            user: null,
            tokens: null,
            isAuthenticated: false,
            isLoading: false,
            error: null
          })
        }
      )

      return store
    },
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        tokens: state.tokens,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
)

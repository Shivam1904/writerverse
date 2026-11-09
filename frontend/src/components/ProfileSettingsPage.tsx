import React from 'react'
/**
 * Profile Settings Page Component
 * Dedicated page for editing user profile information.
 *
 * View rebuilt onto the app design system (2026-06-25) — token inline
 * styles (--paper / --surface / --line / --ink / --terra / --r-* / --sh-*) and
 * the kit typography atoms, the on-system page idiom. The
 * data layer (authStore + axios PUT /auth/me/) is unchanged.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, AlertCircle } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { Avatar } from '../app/components/Avatar'
import { Eyebrow, Label } from '../app/ui/typography'
import axios from 'axios'
import { ChangePasswordCard, DeleteAccountCard } from './AccountSecurityCards'

export default function ProfileSettingsPage() {
  const navigate = useNavigate()
  const { user, tokens } = useAuthStore()

  const [formData, setFormData] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    email: user?.email || ''
  })

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Redirect if not authenticated
  useEffect(() => {
    if (!user) {
      navigate('/login')
    }
  }, [user, navigate])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))

    // Clear messages when user starts typing
    if (error) setError(null)
    if (success) setSuccess(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await axios.put('/auth/me/', {
        first_name: formData.first_name,
        last_name: formData.last_name
      }, {
        headers: {
          'Authorization': `Bearer ${tokens?.access}`,
          'Content-Type': 'application/json',
        },
      })

      // Update local state with new data
      setFormData({
        first_name: response.data.first_name,
        last_name: response.data.last_name,
        email: response.data.email
      })
      setSuccess('Profile updated successfully!')
    } catch (err: unknown) {
      console.error('Profile update error:', err)
      const axiosError = err as { response?: { data?: { detail?: string } } }
      if (axiosError.response?.data) {
        setError(axiosError.response.data.detail || 'Failed to update profile')
      } else {
        setError("Can't reach the server — check your connection.")
      }
    } finally {
      setIsLoading(false)
    }
  }

  if (!user) {
    return null // Will redirect in useEffect
  }

  const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim()
  const memberSince = new Date(user.date_joined).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })

  const inputCls =
    'h-9 w-full rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-sans ' +
    'text-[var(--ink)] outline-none transition-colors focus:border-[var(--terra)]'

  return (
    <div className="min-h-screen flex flex-col font-sans" style={{ background: 'var(--paper)' }}>

      {/* ── Page header ── */}
      <div style={{ borderBottom: '1px solid var(--line)' }}>
        <div className="flex items-center gap-5 px-10 pt-6 pb-4">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-xs font-medium flex-shrink-0"
            style={{ color: 'var(--ink-3)' }}
            onClick={() => navigate('/library')}
          >
            <ArrowLeft size={12} />
            Back to Library
          </button>

          <div className="flex flex-col gap-0.5">
            <Eyebrow style={{ letterSpacing: '0.1em' }}>Account</Eyebrow>
            <span className="text-xl font-bold font-sans leading-tight" style={{ color: 'var(--ink)' }}>
              Profile
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-8 max-w-2xl mx-auto w-full px-6 py-8">

        {/* ── Identity card ── */}
        <div
          className="rounded-[var(--r-xl)] flex items-center gap-4 px-7 py-6"
          style={{ background: 'var(--surface)', border: '1px solid var(--line)', boxShadow: 'var(--sh-2)' }}
        >
          <Avatar name={fullName || user.email} size="lg" />
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-lg font-bold font-sans truncate" style={{ color: 'var(--ink)' }}>
              {fullName || 'Your name'}
            </span>
            <span className="text-sm truncate" style={{ color: 'var(--ink-3)' }}>{user.email}</span>
            <div className="flex items-center gap-3 mt-1.5">
              <Label muted>Member since {memberSince}</Label>
            </div>
          </div>
        </div>

        {/* ── Personal information card ── */}
        <div
          className="rounded-[var(--r-xl)] overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--line)', boxShadow: 'var(--sh-2)' }}
        >
          <div className="px-7 pt-6 pb-1">
            <h2 className="text-base font-bold font-sans" style={{ color: 'var(--ink)' }}>Personal Information</h2>
            <Label muted>Update the name shown across WriterVerse.</Label>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-7 pt-4 pb-7">
            {/* Error / success banners (token-styled) */}
            {error && (
              <div
                className="flex items-center gap-2.5 rounded-[var(--r-lg)] px-4 py-3"
                style={{
                  background: 'color-mix(in srgb, var(--clay) 8%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--clay) 22%, transparent)',
                }}
              >
                <AlertCircle size={15} style={{ color: 'var(--clay)' }} />
                <Label style={{ color: 'var(--clay)' }}>{error}</Label>
              </div>
            )}
            {success && (
              <div
                className="flex items-center gap-2.5 rounded-[var(--r-lg)] px-4 py-3"
                style={{
                  background: 'color-mix(in srgb, var(--sage) 8%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--sage) 20%, transparent)',
                }}
              >
                <Check size={15} style={{ color: 'var(--sage)' }} />
                <Label style={{ color: 'var(--sage)' }}>{success}</Label>
              </div>
            )}

            {/* Name fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Eyebrow>First name</Eyebrow>
                <input
                  type="text"
                  id="first_name"
                  name="first_name"
                  value={formData.first_name}
                  onChange={handleInputChange}
                  className={inputCls}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Eyebrow>Last name</Eyebrow>
                <input
                  type="text"
                  id="last_name"
                  name="last_name"
                  value={formData.last_name}
                  onChange={handleInputChange}
                  className={inputCls}
                  required
                />
              </div>
            </div>

            {/* Email (read-only) */}
            <div className="flex flex-col gap-1.5">
              <Eyebrow>Email address</Eyebrow>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                className={inputCls + ' cursor-not-allowed opacity-70'}
                style={{ background: 'color-mix(in srgb, var(--ink) 3%, var(--surface))' }}
                disabled
              />
              <Label muted>Email can't be changed — contact support if you need to update it.</Label>
            </div>

            {/* Actions — primary uses token-inline terra (matches app primary;
                the kit's .kit-btn-primary is .wv2-root-scoped, absent on this route). */}
            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={isLoading}
                className="inline-flex items-center justify-center gap-2 rounded-[var(--r-sm)] px-4 h-9 text-sm font-semibold font-sans disabled:opacity-60"
                style={{ background: 'var(--terra)', color: '#fff' }}
              >
                {isLoading ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Saving…
                  </>
                ) : 'Save changes'}
              </button>
              <button
                type="button"
                onClick={() => navigate('/library')}
                className="inline-flex items-center justify-center rounded-[var(--r-sm)] px-4 h-9 text-sm font-semibold font-sans"
                style={{ background: 'transparent', color: 'var(--ink)', border: '1px solid var(--line)' }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>

        <ChangePasswordCard />
        <DeleteAccountCard />
      </div>
    </div>
  )
}

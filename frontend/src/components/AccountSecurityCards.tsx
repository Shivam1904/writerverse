/**
 * The two account-safety cards on the Profile page (SA-57):
 *   - ChangePasswordCard: current password + new password (twice).
 *     On success the server signs out every other device and sends this one
 *     fresh tokens, which we store so this tab stays signed in.
 *   - DeleteAccountCard: the danger zone. Needs the current password and the
 *     word DELETE typed exactly. The server checks both again; this only
 *     keeps the button off until they look right.
 *
 * Styled like the rest of ProfileSettingsPage (token inline styles): the kit's
 * button classes are scoped to .wv2-root, which this route does not have.
 */
import React, { useState } from 'react'
import axios from 'axios'
import { AlertCircle, Check } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'
import { Eyebrow, Label } from '../app/ui/typography'

const DELETE_WORD = 'DELETE'

const inputCls =
  'h-9 w-full rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm font-sans ' +
  'text-[var(--ink)] outline-none transition-colors focus:border-[var(--terra)]'

const cardStyle: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--line)', boxShadow: 'var(--sh-2)',
}

/** Turn a DRF error body ({field: [msg]} or {detail}) into one readable line. */
function apiErrorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: unknown } }
  if (!e.response) return "Can't reach the server — check your connection."
  const data = e.response.data
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>
    if (typeof obj.detail === 'string') return obj.detail
    const parts = Object.values(obj).flatMap(v => (Array.isArray(v) ? v : [v])).map(String).filter(Boolean)
    if (parts.length) return parts.join(' ')
  }
  return fallback
}

function Banner({ kind, children }: { kind: 'error' | 'success'; children: React.ReactNode }) {
  const color = kind === 'error' ? 'var(--clay)' : 'var(--sage)'
  const Icon = kind === 'error' ? AlertCircle : Check
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className="flex items-center gap-2.5 rounded-[var(--r-lg)] px-4 py-3"
      style={{
        background: `color-mix(in srgb, ${color} 8%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 22%, transparent)`,
      }}
    >
      <Icon size={15} style={{ color }} />
      <Label style={{ color }}>{children}</Label>
    </div>
  )
}

function PasswordField({ id, label, value, onChange, autoComplete }: {
  id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id}><Eyebrow>{label}</Eyebrow></label>
      <input
        id={id}
        type="password"
        value={value}
        autoComplete={autoComplete}
        onChange={e => onChange(e.target.value)}
        className={inputCls}
        required
      />
    </div>
  )
}

export function ChangePasswordCard() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const edit = (setter: (v: string) => void) => (v: string) => {
    setter(v)
    setError(null)
    setSuccess(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (next !== repeat) {
      setError("The new passwords don't match.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const { data } = await axios.post('/auth/password-change/', {
        current_password: current,
        new_password: next,
      })
      // Old tokens are dead now; keep this tab signed in with the new pair.
      useAuthStore.setState({ tokens: { access: data.access, refresh: data.refresh } })
      setCurrent('')
      setNext('')
      setRepeat('')
      setSuccess('Password changed. Other devices have been signed out.')
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't change the password. Please try again."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-[var(--r-xl)] overflow-hidden" style={cardStyle}>
      <div className="px-7 pt-6 pb-1">
        <h2 className="text-base font-bold font-sans" style={{ color: 'var(--ink)' }}>Change password</h2>
        <Label muted>Changing it signs you out on every other device.</Label>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-7 pt-4 pb-7" aria-label="Change password">
        {error && <Banner kind="error">{error}</Banner>}
        {success && <Banner kind="success">{success}</Banner>}
        <PasswordField id="current_password" label="Current password" value={current}
          onChange={edit(setCurrent)} autoComplete="current-password" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PasswordField id="new_password" label="New password" value={next}
            onChange={edit(setNext)} autoComplete="new-password" />
          <PasswordField id="repeat_password" label="Repeat new password" value={repeat}
            onChange={edit(setRepeat)} autoComplete="new-password" />
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={saving || !current || !next || !repeat}
            className="inline-flex items-center justify-center gap-2 rounded-[var(--r-sm)] px-4 h-9 text-sm font-semibold font-sans disabled:opacity-60"
            style={{ background: 'var(--terra)', color: '#fff' }}
          >
            {saving ? 'Changing…' : 'Change password'}
          </button>
        </div>
      </form>
    </div>
  )
}

export function DeleteAccountCard() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ready = password.length > 0 && confirm === DELETE_WORD

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready) return
    setDeleting(true)
    setError(null)
    try {
      await axios.post('/auth/delete-account/', { current_password: password, confirm })
      // The account is gone: drop local auth state, then a full reload to the
      // login page so no cached data from this account stays in memory.
      await useAuthStore.getState().logout()
      window.location.assign('/login')
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't delete the account. Please try again."))
      setDeleting(false)
    }
  }

  return (
    <div
      className="rounded-[var(--r-xl)] overflow-hidden"
      style={{ ...cardStyle, border: '1px solid color-mix(in srgb, var(--clay) 35%, var(--line))' }}
    >
      <div className="px-7 pt-6 pb-1">
        <h2 className="text-base font-bold font-sans" style={{ color: 'var(--clay)' }}>Delete account</h2>
        <Label muted>
          This deletes your account and every book in it — scenes, characters, world entries and
          ideas — right away. It cannot be undone.
        </Label>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-7 pt-4 pb-7" aria-label="Delete account">
        {error && <Banner kind="error">{error}</Banner>}
        <PasswordField id="delete_password" label="Current password" value={password}
          onChange={v => { setPassword(v); setError(null) }} autoComplete="current-password" />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="delete_confirm"><Eyebrow>Type {DELETE_WORD} to confirm</Eyebrow></label>
          <input
            id="delete_confirm"
            type="text"
            value={confirm}
            autoComplete="off"
            spellCheck={false}
            onChange={e => { setConfirm(e.target.value); setError(null) }}
            className={inputCls}
          />
        </div>
        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={!ready || deleting}
            className="inline-flex items-center justify-center gap-2 rounded-[var(--r-sm)] px-4 h-9 text-sm font-semibold font-sans disabled:opacity-50"
            style={{ background: 'var(--clay)', color: '#fff' }}
          >
            {deleting ? 'Deleting…' : 'Delete my account forever'}
          </button>
        </div>
      </form>
    </div>
  )
}

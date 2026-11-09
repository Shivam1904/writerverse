import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { useForm, CommonFields } from '../hooks/useForm'
import { BrandMark, Button, Card, Heading, Input } from '../app/ui'
import { useAuthStore } from '../stores/authStore'

function extractErrorMessage(error: unknown): string {
  const err = error as { response?: { data?: Record<string, unknown> } }
  if (!err.response) return "Can't reach the server — check your connection."
  const data = err.response.data
  if (!data) return 'Something went wrong. Please try again.'

  const fromField = (field: string) => {
    const value = data[field]
    if (!value) return null
    return Array.isArray(value) ? String(value[0]) : String(value)
  }

  return (
    fromField('detail')
    || fromField('non_field_errors')
    || fromField('new_password')
    || fromField('token')
    || fromField('uid')
    || 'Something went wrong. Please try again.'
  )
}

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const uid = searchParams.get('uid') || ''
  const token = searchParams.get('token') || ''
  const [done, setDone] = useState(false)
  const logout = useAuthStore((s) => s.logout)

  const form = useForm({
    fields: [{ ...CommonFields.password, value: '' }],
    onSubmit: async (data) => {
      if (data.password !== data.passwordConfirm) {
        form.setValidationErrors({ passwordConfirm: 'Passwords do not match' })
        throw new Error('Passwords do not match')
      }

      try {
        await axios.post('/auth/password-reset-confirm/', {
          uid,
          token,
          new_password: data.password,
        })
      } catch (error) {
        throw new Error(extractErrorMessage(error))
      }
      // The link can be opened with a session already open — maybe for a
      // different account. End it so "Sign in" leads to a fresh login with
      // the new password instead of bouncing to that session's library.
      await logout()
      setDone(true)
    },
    clearErrorOnChange: true,
    clearErrorOnMount: true,
  })

  const handlePasswordConfirmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target
    if (value && value !== form.formData.password) {
      form.setValidationErrors({ ...form.validationErrors, passwordConfirm: 'Passwords do not match' })
    } else {
      const { passwordConfirm: _unused, ...rest } = form.validationErrors
      form.setValidationErrors(rest)
    }
    form.handleInputChange(e)
  }

  const linkInvalid = !uid || !token

  return (
    <div className="wv2-root flex min-h-screen items-center justify-center bg-[var(--canvas)] px-4 py-10 sm:px-6 lg:px-10">
      <Card variant="container" className="w-full max-w-md p-0 shadow-[var(--sh-2)]">
        <main className="p-6 sm:p-10">
          <Link to="/" className="inline-flex">
            <BrandMark size="lg" />
          </Link>
          <Heading as="h2" className="mt-8 text-3xl">Set a new password</Heading>

          {linkInvalid ? (
            <p className="mt-4 text-muted-foreground">
              This reset link is missing its token. Request a new one from the{' '}
              <Link to="/forgot-password" className="font-semibold text-[var(--terra-deep)] hover:underline">forgot password</Link> page.
            </p>
          ) : done ? (
            <>
              <p className="mt-4 text-muted-foreground">Your password has been reset.</p>
              <Button
                variant="primary"
                className="mt-6 h-11 w-full"
                onClick={() => navigate('/login')}
              >
                Sign in
              </Button>
            </>
          ) : (
            <>
              <p className="mt-2 text-muted-foreground">Choose a new password for your account.</p>

              <form onSubmit={form.handleSubmit} className="mt-8 space-y-5">
                {form.error && (
                  <div className="rounded-[var(--r-md)] border border-[var(--destructive)]/40 bg-[var(--destructive)]/10 px-4 py-3 text-sm text-[var(--destructive)]">
                    {form.error}
                  </div>
                )}

                <AuthField
                  id="password"
                  label="New password"
                  type="password"
                  autoComplete="new-password"
                  value={form.formData.password}
                  onChange={form.handleInputChange}
                  placeholder="Create a strong password"
                  error={form.validationErrors.password}
                />

                <AuthField
                  id="passwordConfirm"
                  label="Confirm new password"
                  type="password"
                  autoComplete="new-password"
                  value={form.formData.passwordConfirm || ''}
                  onChange={handlePasswordConfirmChange}
                  placeholder="Re-enter password"
                  error={form.validationErrors.passwordConfirm}
                />

                <Button
                  type="submit"
                  variant="primary"
                  disabled={form.isLoading}
                  className="mt-2 h-11 w-full"
                >
                  {form.isLoading ? 'Resetting...' : 'Reset password'}
                </Button>
              </form>
            </>
          )}
        </main>
      </Card>
    </div>
  )
}

function AuthField({
  id, label, error, ...props
}: { id: string; label: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-muted-foreground">{label}</label>
      <Input
        id={id}
        name={id}
        required
        className="min-w-0"
        wrapClassName={`h-11 w-full${error ? ' border-[var(--destructive)]' : ''}`}
        {...props}
      />
      {error && <p className="mt-1 text-sm text-[var(--destructive)]">{error}</p>}
    </div>
  )
}

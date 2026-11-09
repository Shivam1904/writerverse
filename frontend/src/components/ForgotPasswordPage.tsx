import { useState } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { useForm, CommonFields } from '../hooks/useForm'
import { BrandMark, Button, Card, Heading, Input } from '../app/ui'
import { DEV_SHORTCUTS_ENABLED } from '../config/devFlags'

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false)
  // Only ever populated when the backend's own DEV_SHORTCUTS_ENABLED flag is
  // on (off by default in prod) — no real email provider is wired up yet, so
  // this is how the link gets tested locally without digging through logs.
  const [devResetLink, setDevResetLink] = useState<string | null>(null)

  const form = useForm({
    fields: [{ ...CommonFields.email, value: '' }],
    onSubmit: async (data) => {
      // The backend answers 200 for every email (known or not), so a failure
      // here means the request never got through. Say so — useForm shows the
      // thrown message in the error box — instead of promising an email.
      let response
      try {
        response = await axios.post('/auth/password-reset/', { email: data.email })
      } catch {
        throw new Error("We couldn't send the reset email. Check your connection and try again.")
      }
      setDevResetLink(response.data?.dev_reset_link || null)
      setSubmitted(true)
    },
    clearErrorOnChange: true,
    clearErrorOnMount: true,
  })

  return (
    <div className="wv2-root flex min-h-screen items-center justify-center bg-[var(--canvas)] px-4 py-10 sm:px-6 lg:px-10">
      <Card variant="container" className="w-full max-w-md p-0 shadow-[var(--sh-2)]">
        <main className="p-6 sm:p-10">
          <Link to="/" className="inline-flex">
            <BrandMark size="lg" />
          </Link>
          <Link to="/login" className="mt-8 block text-sm font-medium text-[var(--terra-deep)] hover:underline">← Back to sign in</Link>
          <Heading as="h2" className="mt-5 text-3xl">Reset your password</Heading>

          {submitted ? (
            <>
              <p className="mt-4 text-muted-foreground">
                If an account exists for that email, we've sent a link to reset your password. Check your inbox.
              </p>
              {DEV_SHORTCUTS_ENABLED && devResetLink && (
                <div className="mt-4 rounded-[var(--r-md)] border border-dashed border-border bg-[var(--surface-2)] px-4 py-3 text-sm">
                  <p className="font-medium text-foreground">Dev shortcut — no email provider wired up yet</p>
                  <a href={devResetLink} className="mt-1 block truncate text-[var(--terra-deep)] hover:underline">
                    {devResetLink}
                  </a>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="mt-2 text-muted-foreground">Enter your email and we'll send you a reset link.</p>

              <form onSubmit={form.handleSubmit} className="mt-8 space-y-5">
                {form.error && (
                  <div className="rounded-[var(--r-md)] border border-[var(--destructive)]/40 bg-[var(--destructive)]/10 px-4 py-3 text-sm text-[var(--destructive)]">
                    {form.error}
                  </div>
                )}

                <AuthField
                  id="email"
                  label="Email"
                  type="email"
                  autoComplete="email"
                  value={form.formData.email}
                  onChange={form.handleInputChange}
                  placeholder="you@example.com"
                  error={form.validationErrors.email}
                />

                <Button
                  type="submit"
                  variant="primary"
                  disabled={form.isLoading}
                  className="mt-2 h-11 w-full"
                >
                  {form.isLoading ? 'Sending...' : 'Send reset link'}
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

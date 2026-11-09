import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EMAIL_NOT_VERIFIED, useAuthStore, type AuthError } from '../stores/authStore'
import { useForm, CommonFields } from '../hooks/useForm'
import { BrandMark, Button, Card, Heading, Input } from '../app/ui'
import { ResendLinkButton } from './EmailVerification'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login, isLoading: authLoading, error: authError } = useAuthStore()
  // The email whose password was right but which isn't confirmed yet.
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null)

  const form = useForm({
    fields: [{ ...CommonFields.email, value: '' }, { ...CommonFields.password, value: '' }],
    onSubmit: async (data) => {
      setUnverifiedEmail(null)
      try {
        await login(data.email, data.password)
      } catch (error) {
        if ((error as AuthError).code === EMAIL_NOT_VERIFIED) setUnverifiedEmail(data.email)
        throw error
      }
      navigate('/dashboard')
    },
    onError: (error) => {
      console.error('Login error:', error)
    },
    clearErrorOnChange: true,
    clearErrorOnMount: true,
  })

  const displayError = form.error || authError

  return (
    <div className="wv2-root flex min-h-screen items-center justify-center bg-[var(--canvas)] px-4 py-10 sm:px-6 lg:px-10">
      <Card variant="container" className="grid w-full max-w-6xl overflow-hidden p-0 shadow-[var(--sh-2)] lg:grid-cols-[1.2fr_1fr]">
        <aside className="hidden flex-col justify-between border-r border-border bg-[var(--surface-2)] p-10 lg:flex">
          <div>
            <Link to="/" className="inline-flex">
              <BrandMark size="lg" />
            </Link>
            <Heading as="h1" className="mt-14 text-5xl leading-tight">Return to your story world.</Heading>
            <p className="mt-5 max-w-md text-[17px] leading-relaxed text-muted-foreground">
              Continue where you left off with your scenes, outlines, characters, and world rules in one focused workspace.
            </p>
          </div>
          <p className="text-sm text-muted-foreground/80">Consistency-aware drafting for fiction writers.</p>
        </aside>

        <main className="p-6 sm:p-10 lg:p-12">
          <div className="mx-auto w-full max-w-md">
            <Link to="/" className="text-sm font-medium text-[var(--terra-deep)] hover:underline">← Back to home</Link>
            <Heading as="h2" className="mt-5 text-4xl">Welcome back</Heading>
            <p className="mt-2 text-muted-foreground">Sign in to continue writing.</p>

            <form onSubmit={form.handleSubmit} className="mt-8 space-y-5">
              {unverifiedEmail ? (
                <div className="rounded-[var(--r-md)] border border-border bg-[var(--surface-2)] px-4 py-3 text-sm">
                  <p className="font-medium text-foreground">Please confirm your email first</p>
                  <p className="mt-1 text-muted-foreground">
                    We sent a link to {unverifiedEmail} when you signed up. Can't find it? Get a new one.
                  </p>
                  <ResendLinkButton email={unverifiedEmail} className="mt-3" />
                </div>
              ) : displayError && (
                <div className="rounded-[var(--r-md)] border border-[var(--destructive)]/40 bg-[var(--destructive)]/10 px-4 py-3 text-sm text-[var(--destructive)]">
                  {displayError}
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

              <div>
                <AuthField
                  id="password"
                  label="Password"
                  type="password"
                  autoComplete="current-password"
                  value={form.formData.password}
                  onChange={form.handleInputChange}
                  placeholder="Enter your password"
                  error={form.validationErrors.password}
                />
                <Link to="/forgot-password" className="mt-2 inline-block text-sm font-medium text-[var(--terra-deep)] hover:underline">
                  Forgot password?
                </Link>
              </div>

              <Button
                type="submit"
                variant="primary"
                disabled={form.isLoading || authLoading}
                className="mt-2 h-11 w-full"
              >
                {form.isLoading || authLoading ? 'Signing in...' : 'Sign in'}
              </Button>
            </form>

            <p className="mt-6 text-sm text-muted-foreground">
              New to Writerverse?{' '}
              <Link to="/signup" className="font-semibold text-[var(--terra-deep)] hover:underline">Create account</Link>
            </p>
          </div>
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
        wrapClassName={`h-11 w-full${error ? ' border-[var(--destructive)]' : ''}`}
        {...props}
      />
      {error && <p className="mt-1 text-sm text-[var(--destructive)]">{error}</p>}
    </div>
  )
}

import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore, type RegisterResult } from '../stores/authStore'
import { useForm, CommonFields } from '../hooks/useForm'
import { BrandMark, Button, Card, Checkbox, Dialog, Heading, Input } from '../app/ui'
import { extensions } from '../app/extensions'
import { CheckInbox } from './EmailVerification'

type PendingVerification = Extract<RegisterResult, { verificationRequired: true }>

// Terms to accept at sign-up come from the extension (app/extensions.ts).
// Without them the form shows no checkbox.
const terms = extensions.signupTerms

export default function SignupPage() {
  const navigate = useNavigate()
  const { register, isLoading: authLoading, error: authError } = useAuthStore()
  const [agreedToTerms, setAgreedToTerms] = React.useState(false)
  const [termsOpen, setTermsOpen] = React.useState(false)
  // Set when the server wants the email confirmed before the first sign-in.
  const [pending, setPending] = React.useState<PendingVerification | null>(null)

  const form = useForm({
    fields: [
      { ...CommonFields.email, value: '' },
      { ...CommonFields.password, value: '' },
      { ...CommonFields.firstName, value: '' },
      { ...CommonFields.lastName, value: '' },
    ],
    onSubmit: async (data) => {
      if (data.password !== data.passwordConfirm) {
        form.setValidationErrors({ passwordConfirm: 'Passwords do not match' })
        return
      }

      const result = await register({
        email: data.email,
        password: data.password,
        passwordConfirm: data.passwordConfirm,
        firstName: data.firstName,
        lastName: data.lastName,
        acceptedTerms: agreedToTerms,
      })
      if (result.verificationRequired) {
        setPending(result)
        return
      }
      navigate('/library', { replace: true })
    },
    onError: (error) => {
      console.error('Registration error:', error)
    },
    clearErrorOnChange: true,
    clearErrorOnMount: true,
  })

  const handlePasswordConfirmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target
    const password = form.formData.password

    if (value && value !== password) {
      form.setValidationErrors({
        ...form.validationErrors,
        passwordConfirm: 'Passwords do not match',
      })
    } else {
      const { passwordConfirm: _unused, ...rest } = form.validationErrors
      form.setValidationErrors(rest)
    }

    form.handleInputChange(e)
  }

  const displayError = form.error || authError

  return (
    <div className="wv2-root overflow-y-auto bg-[var(--canvas)]">
      <div className="flex min-h-full items-center justify-center px-4 py-10 sm:px-6 lg:px-10">
      <Card variant="container" className="grid w-full max-w-6xl overflow-hidden p-0 shadow-[var(--sh-2)] lg:grid-cols-[1fr_1.2fr]">
        <main className="p-6 sm:p-10 lg:p-12">
          <div className="mx-auto w-full max-w-md">
            <Link to="/" className="text-sm font-medium text-[var(--terra-deep)] hover:underline">← Back to home</Link>
            {pending ? (
              <>
                <Heading as="h2" className="mt-5 text-4xl">Check your inbox</Heading>
                <CheckInbox
                  email={pending.email}
                  devVerifyLink={pending.devVerifyLink}
                  onStartOver={() => setPending(null)}
                />
              </>
            ) : (
              <>
                <Heading as="h2" className="mt-5 text-4xl">Create your account</Heading>
                <p className="mt-2 text-muted-foreground">Start a new writing universe in minutes.</p>

                <form onSubmit={form.handleSubmit} className="mt-8 space-y-5">
                  {displayError && (
                    <div className="rounded-[var(--r-md)] border border-[var(--destructive)]/40 bg-[var(--destructive)]/10 px-4 py-3 text-sm text-[var(--destructive)]">
                      {displayError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <AuthField
                      id="firstName"
                      label="First name"
                      type="text"
                      autoComplete="given-name"
                      value={form.formData.firstName}
                      onChange={form.handleInputChange}
                      placeholder="Ava"
                      error={form.validationErrors.firstName}
                    />
                    <AuthField
                      id="lastName"
                      label="Last name"
                      type="text"
                      autoComplete="family-name"
                      value={form.formData.lastName}
                      onChange={form.handleInputChange}
                      placeholder="Monroe"
                      error={form.validationErrors.lastName}
                    />
                  </div>

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

                  <AuthField
                    id="password"
                    label="Password"
                    type="password"
                    autoComplete="new-password"
                    value={form.formData.password}
                    onChange={form.handleInputChange}
                    placeholder="Create a strong password"
                    error={form.validationErrors.password}
                  />

                  <AuthField
                    id="passwordConfirm"
                    label="Confirm password"
                    type="password"
                    autoComplete="new-password"
                    value={form.formData.passwordConfirm || ''}
                    onChange={handlePasswordConfirmChange}
                    placeholder="Re-enter password"
                    error={form.validationErrors.passwordConfirm}
                  />

                  {terms && (
                    <>
                      <div className="flex items-start gap-2.5">
                        <span className="mt-0.5">
                          <Checkbox checked={agreedToTerms} onChange={setAgreedToTerms} />
                        </span>
                        <div className="text-left text-sm text-muted-foreground">
                          <button type="button" onClick={() => setAgreedToTerms((v) => !v)} className="text-left">
                            {terms.checkboxLabel}{' '}
                          </button>
                          <button
                            type="button"
                            onClick={() => setTermsOpen(true)}
                            className="font-medium text-[var(--terra-deep)] hover:underline"
                          >
                            {terms.linkLabel}
                          </button>
                        </div>
                      </div>

                      <Dialog open={termsOpen} onOpenChange={setTermsOpen} title={terms.heading} width={440}>
                        {terms.body}
                        <Button variant="primary" className="mt-4 h-10 w-full" onClick={() => setTermsOpen(false)}>
                          Close
                        </Button>
                      </Dialog>
                    </>
                  )}

                  <Button
                    type="submit"
                    variant="primary"
                    disabled={form.isLoading || authLoading || (!!terms?.required && !agreedToTerms)}
                    className="mt-2 h-11 w-full"
                  >
                    {form.isLoading || authLoading ? 'Creating account...' : 'Create account'}
                  </Button>
                </form>

                <p className="mt-6 text-sm text-muted-foreground">
                  Already have an account?{' '}
                  <Link to="/login" className="font-semibold text-[var(--terra-deep)] hover:underline">Sign in</Link>
                </p>
              </>
            )}
          </div>
        </main>

        <aside className="hidden flex-col justify-between border-l border-border bg-[var(--surface-2)] p-10 lg:flex">
          <div>
            <Link to="/" className="inline-flex">
              <BrandMark size="lg" />
            </Link>
            <Heading as="h1" className="mt-14 text-5xl leading-tight">Build stories with memory and structure.</Heading>
            <p className="mt-5 max-w-md text-[17px] leading-relaxed text-muted-foreground">
              Plan beats, track world rules, and draft scenes with AI that understands your narrative context.
            </p>
          </div>
          <p className="text-sm text-muted-foreground/80">From first draft to polished manuscript.</p>
        </aside>
      </Card>
      </div>
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

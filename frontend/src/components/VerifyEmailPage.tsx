import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BrandMark, Card, Heading, Input } from '../app/ui'
import { useAuthStore } from '../stores/authStore'
import { ResendLinkButton } from './EmailVerification'

/**
 * Where the verify-email link lands. Sends the token once; on success the
 * user is signed in (like a login) and goes to their library. A dead link
 * (expired, already used, mangled) gets a form to send a new one.
 */
export default function VerifyEmailPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const verifyEmail = useAuthStore((s) => s.verifyEmail)
  const [error, setError] = useState<string | null>(token ? null : 'This link is missing its token.')
  // A link works only once. React's dev double-mount must not send it twice.
  const sent = useRef(false)

  useEffect(() => {
    if (!token || sent.current) return
    sent.current = true
    verifyEmail(token)
      .then(() => navigate('/library', { replace: true }))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'This link has expired or was already used.'))
  }, [token, verifyEmail, navigate])

  return (
    <div className="wv2-root flex min-h-screen items-center justify-center bg-[var(--canvas)] px-4 py-10 sm:px-6 lg:px-10">
      <Card variant="container" className="w-full max-w-md p-0 shadow-[var(--sh-2)]">
        <main className="p-6 sm:p-10">
          <Link to="/" className="inline-flex">
            <BrandMark size="lg" />
          </Link>
          {error ? <LinkFailed message={error} /> : (
            <>
              <Heading as="h2" className="mt-8 text-3xl">Confirming your email</Heading>
              <p className="mt-4 text-muted-foreground">One moment...</p>
            </>
          )}
        </main>
      </Card>
    </div>
  )
}

function LinkFailed({ message }: { message: string }) {
  const [email, setEmail] = useState('')
  return (
    <>
      <Heading as="h2" className="mt-8 text-3xl">That link didn't work</Heading>
      <p className="mt-4 text-muted-foreground">
        {message} Enter your email and we'll send you a new one.
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        Already confirmed? Just <Link to="/login" className="font-semibold text-[var(--terra-deep)] hover:underline">sign in</Link>.
      </p>
      <div className="mt-6">
        <label htmlFor="email" className="mb-2 block text-sm font-medium text-muted-foreground">Email</label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="min-w-0"
          wrapClassName="h-11 w-full"
        />
      </div>
      <ResendLinkButton email={email.trim()} label="Send a new link" className="mt-4" />
    </>
  )
}

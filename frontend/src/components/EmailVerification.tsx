// Pieces of the "confirm your email" flow, shared by the sign-up, login and
// verify-email pages. How it works: docs/how-it-works/account-emails.md.
import { useState } from 'react'
import { Button } from '../app/ui'
import { DEV_SHORTCUTS_ENABLED } from '../config/devFlags'
import { resendVerificationEmail } from '../stores/authStore'

/** "Resend link" for one email, with its own sending / sent / error state. */
export function ResendLinkButton({
  email, label = 'Resend link', className = '',
}: { email: string; label?: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [devLink, setDevLink] = useState<string | null>(null)

  const resend = async () => {
    setState('sending')
    setError(null)
    try {
      const { devVerifyLink } = await resendVerificationEmail(email)
      setDevLink(devVerifyLink || null)
      setState('sent')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
      setState('error')
    }
  }

  return (
    <div className={className}>
      <Button
        type="button"
        variant="secondary"
        disabled={!email || state === 'sending'}
        onClick={resend}
        className="h-11 w-full"
      >
        {state === 'sending' ? 'Sending...' : state === 'sent' ? 'Send another link' : label}
      </Button>
      {state === 'sent' && (
        <p className="mt-2 text-sm text-muted-foreground">New link sent. It can take a minute to arrive.</p>
      )}
      {error && <p className="mt-2 text-sm text-[var(--destructive)]">{error}</p>}
      <DevLink link={devLink} />
    </div>
  )
}

/** The "Check your inbox" screen shown right after sign-up. */
export function CheckInbox({
  email, devVerifyLink, onStartOver,
}: { email: string; devVerifyLink?: string; onStartOver: () => void }) {
  return (
    <div>
      <p className="mt-4 text-muted-foreground">
        We sent a link to <span className="font-semibold text-foreground">{email}</span>.
        Click it to confirm your email and start writing. The link works for 24 hours.
      </p>
      <p className="mt-3 text-sm text-muted-foreground">Can't find it? Check your spam folder, or get a new link.</p>
      <ResendLinkButton email={email} className="mt-6" />
      <DevLink link={devVerifyLink || null} />
      <p className="mt-6 text-sm text-muted-foreground">
        Wrong email?{' '}
        <button type="button" onClick={onStartOver} className="font-semibold text-[var(--terra-deep)] hover:underline">
          Sign up again
        </button>
      </p>
    </div>
  )
}

/** Local dev only: the verify link right on the page, no inbox needed. */
function DevLink({ link }: { link: string | null }) {
  if (!DEV_SHORTCUTS_ENABLED || !link) return null
  return (
    <div className="mt-4 rounded-[var(--r-md)] border border-dashed border-border bg-[var(--surface-2)] px-4 py-3 text-sm">
      <p className="font-medium text-foreground">Dev shortcut: the emailed link</p>
      <a href={link} className="mt-1 block truncate text-[var(--terra-deep)] hover:underline">{link}</a>
    </div>
  )
}

/**
 * User Dropdown Menu Component
 * Standard UX pattern with user avatar dropdown containing profile, settings, logout
 */
import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { logger } from '../utils/logger'
import { extensions } from '../app/extensions'

interface UserDropdownProps {
  user: {
    id: number
    email: string
    first_name: string
    last_name: string
  }
}

export default function UserDropdown({ user }: UserDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { logout } = useAuthStore()
  const navigate = useNavigate()

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const handleLogout = async () => {
    try {
      await logout()
      // Navigate to login page after successful logout
      navigate('/login')
    } catch (error) {
      console.error('Logout failed:', error)
      // Still navigate to login even if logout API fails
      navigate('/login')
    }
  }

  const getInitials = () => {
    // No name yet (new accounts): use the email's first letter, like the project header avatar.
    const fromName = `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`
    return (fromName || user.email?.[0] || 'U').toUpperCase()
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex h-10 items-center gap-2 rounded-xl border border-[rgba(224,192,177,0.9)] bg-white/70 px-2.5 text-left text-[var(--wv-on-background)] transition hover:border-[rgba(157,67,0,0.4)] hover:bg-white"
        type="button"
        aria-expanded={isOpen}
      >
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[var(--wv-primary)] to-[var(--wv-secondary)] text-xs font-semibold text-[var(--wv-on-primary)]">
          {getInitials()}
        </div>
        <div className="hidden min-w-0 sm:block">
          <div className="truncate text-sm font-medium">
            {user.first_name} {user.last_name}
          </div>
          <div className="truncate text-[11px] text-[var(--wv-on-surface-variant)]">
            {user.email}
          </div>
        </div>
        <svg
          className={`h-4 w-4 text-[var(--wv-on-surface-variant)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-2xl border border-[rgba(224,192,177,0.82)] bg-[rgba(255,253,251,0.98)] shadow-[0_14px_36px_rgba(33,17,8,0.18)] animate-fade-in-up">
          <div className="border-b border-[rgba(224,192,177,0.6)] p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[var(--wv-primary)] to-[var(--wv-secondary)] text-sm font-semibold text-[var(--wv-on-primary)]">
                {getInitials()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-[var(--wv-on-background)]">
                  {user.first_name} {user.last_name}
                </div>
                <div className="truncate text-xs text-[var(--wv-on-surface-variant)]">
                  {user.email}
                </div>
              </div>
            </div>
          </div>

          <div className="py-2">
            <button
              onClick={() => {
                setIsOpen(false)
                navigate('/profile')
              }}
              className="flex w-full items-center px-4 py-2.5 text-sm text-[var(--wv-on-surface-variant)] transition-colors hover:bg-[rgba(157,67,0,0.08)] hover:text-[var(--wv-primary)]"
            >
              <svg className="mr-3 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Profile Settings
            </button>

            <button
              onClick={() => {
                setIsOpen(false)
                logger.userAction('Navigate to account settings')
              }}
              className="flex w-full items-center px-4 py-2.5 text-sm text-[var(--wv-on-surface-variant)] transition-colors hover:bg-[rgba(157,67,0,0.08)] hover:text-[var(--wv-primary)]"
            >
              <svg className="mr-3 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Account Settings
            </button>

            {extensions.userMenuItems?.map((item) => (
              <button
                key={item.to}
                onClick={() => {
                  setIsOpen(false)
                  logger.userAction(`Navigate to ${item.to}`)
                  navigate(item.to)
                }}
                className="flex w-full items-center px-4 py-2.5 text-sm text-[var(--wv-on-surface-variant)] transition-colors hover:bg-[rgba(157,67,0,0.08)] hover:text-[var(--wv-primary)]"
              >
                {item.icon}
                {item.label}
              </button>
            ))}

            <button
              onClick={() => {
                setIsOpen(false)
                logger.userAction('Navigate to help')
              }}
              className="flex w-full items-center px-4 py-2.5 text-sm text-[var(--wv-on-surface-variant)] transition-colors hover:bg-[rgba(157,67,0,0.08)] hover:text-[var(--wv-primary)]"
            >
              <svg className="mr-3 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Help & Support
            </button>

            <div className="my-2 border-t border-[rgba(224,192,177,0.6)]"></div>

            <button
              onClick={() => {
                setIsOpen(false)
                handleLogout()
              }}
              className="flex w-full items-center px-4 py-2.5 text-sm text-red-700 transition-colors hover:bg-red-50"
            >
              <svg className="mr-3 h-4 w-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

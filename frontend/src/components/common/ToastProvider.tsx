import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
  type FC,
} from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface UndoToastConfig {
  /** Message shown in the toast, e.g. "Scene deleted" */
  message: string
  /** Label on the undo button (default "Undo") */
  undoLabel?: string
  /** How long the undo window stays open in milliseconds (default 5 000) */
  durationMs?: number
  /** Called if the author clicks Undo before the window closes */
  onUndo: () => void
  /**
   * Called when the undo window expires without the author acting.
   * This is where callers should commit the deletion to the backend.
   */
  onExpired: () => void
}

interface UndoToast extends UndoToastConfig {
  id: string
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface ToastContextValue {
  /** Show an undo toast; returns the toast id so callers can remove it early if needed */
  addUndoToast: (config: UndoToastConfig) => string
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

// Context hook colocated with its provider by design (small, 2 consumers).
// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}

// ─── Individual toast item ────────────────────────────────────────────────────

const UndoToastItem: FC<{ toast: UndoToast; onDismiss: (id: string) => void }> = ({
  toast,
  onDismiss,
}) => {
  const durationMs = toast.durationMs ?? 5000
  const [remaining, setRemaining] = useState(durationMs)
  // Guard so only one of onUndo / onExpired fires, never both
  const settledRef = useRef(false)

  useEffect(() => {
    const tickMs = 80
    const interval = setInterval(() => {
      setRemaining((prev) => Math.max(0, prev - tickMs))
    }, tickMs)

    const timer = setTimeout(() => {
      clearInterval(interval)
      if (!settledRef.current) {
        settledRef.current = true
        toast.onExpired()
        onDismiss(toast.id)
      }
    }, durationMs)

    return () => {
      clearInterval(interval)
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleUndo = () => {
    if (settledRef.current) return
    settledRef.current = true
    toast.onUndo()
    onDismiss(toast.id)
  }

  const progress = (remaining / durationMs) * 100

  return (
    <div
      role="status"
      aria-live="polite"
      className="relative flex items-center gap-3 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-2xl min-w-[280px] max-w-sm overflow-hidden animate-fade-in"
    >
      {/* Countdown bar */}
      <div
        className="absolute bottom-0 left-0 h-0.5 bg-amber-400"
        style={{ width: `${progress}%`, transition: 'width 80ms linear' }}
      />

      <span className="text-sm flex-1 leading-snug">{toast.message}</span>

      <button
        onClick={handleUndo}
        className="text-sm font-semibold text-amber-400 hover:text-amber-300 transition-colors flex-shrink-0 py-0.5"
      >
        {toast.undoLabel ?? 'Undo'}
      </button>
    </div>
  )
}

// ─── Provider ─────────────────────────────────────────────────────────────────

/**
 * P-B (part 2): Global undo-toast system.
 *
 * Wrap the app once; call useToast().addUndoToast() from any component
 * to show a timed "Deleted — Undo" banner at the bottom of the screen.
 *
 * The soft-delete pattern:
 *   1. Hide item from UI immediately.
 *   2. addUndoToast({ onUndo: restoreItem, onExpired: commitDelete })
 *   3. If author clicks Undo → restoreItem() runs, no backend call.
 *   4. If timer expires → commitDelete() runs, backend call fires.
 */
export const ToastProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<UndoToast[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const addUndoToast = useCallback((config: UndoToastConfig): string => {
    const id = Math.random().toString(36).slice(2, 10)
    setToasts((prev) => [...prev, { ...config, id }])
    return id
  }, [])

  return (
    <ToastContext.Provider value={{ addUndoToast, removeToast }}>
      {children}

      {toasts.length > 0 && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-[300] pointer-events-none"
          aria-label="Notifications"
        >
          {toasts.map((toast) => (
            <div key={toast.id} className="pointer-events-auto">
              <UndoToastItem toast={toast} onDismiss={removeToast} />
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export default ToastProvider

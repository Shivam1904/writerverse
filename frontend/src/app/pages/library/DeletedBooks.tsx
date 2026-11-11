import { useEffect, useState } from 'react'
import { LIBRARY } from '../../../config/library'

/**
 * "Deleted books": archived books, data intact. Restore puts a book back on
 * the shelf; "Delete forever" opens the typed-name gate below.
 */
export function DeletedBooks({
  books,
  onRestore,
  onDeleteForever,
}: {
  books: any[]
  onRestore: (book: any) => void
  onDeleteForever: (book: any) => void
}) {
  if (books.length === 0) return null
  return (
    <section aria-label={LIBRARY.deletedHeading} className="mt-10">
      <h2 className="wv2-lib-delete-name">{LIBRARY.deletedHeading}</h2>
      <p className="mb-3 text-sm opacity-70">{LIBRARY.deletedBody}</p>
      <ul className="flex flex-col gap-2">
        {books.map((book) => (
          <li key={book.id} className="flex items-center gap-3">
            <span className="flex-1 truncate">
              {book.title}
              <span className="ml-2 text-sm opacity-60">
                {(book.total_word_count || 0).toLocaleString()} words
              </span>
            </span>
            <button type="button" className="wv2-btn wv2-btn-subtle" onClick={() => onRestore(book)}>
              {LIBRARY.restore}
            </button>
            <button type="button" className="wv2-btn wv2-btn-subtle" onClick={() => onDeleteForever(book)}>
              {LIBRARY.deleteForever}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Permanent delete. The button stays disabled until the author types the
 * book's exact name; the copy shows how many words will be erased.
 */
export function DeleteForeverModal({
  book,
  busy,
  failed,
  onCancel,
  onConfirm,
}: {
  book: any
  busy: boolean
  failed?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const [typed, setTyped] = useState('')
  const matches = typed.trim() === (book.title || '').trim()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  return (
    <div
      className="wv2-lib-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={LIBRARY.deleteForeverTitle}
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel() }}
    >
      <div className="wv2-lib-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{LIBRARY.deleteForeverTitle}</h2>
        <p className="wv2-lib-delete-name">{book.title}</p>
        <p>{LIBRARY.deleteForeverBody(book.total_word_count || 0)}</p>
        <form
          className="wv2-lib-form"
          onSubmit={(e) => {
            e.preventDefault()
            if (matches && !busy) onConfirm()
          }}
        >
          <label htmlFor="lib-delete-typed">{LIBRARY.deleteTypeLabel}</label>
          <input
            id="lib-delete-typed"
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={book.title}
            autoComplete="off"
            autoFocus
          />
          {failed && <p role="alert">{LIBRARY.actionFailed}</p>}
          <div className="wv2-lib-modal-actions">
            <button type="button" className="wv2-btn wv2-btn-subtle" onClick={onCancel} disabled={busy}>
              {LIBRARY.createCancel}
            </button>
            <button
              type="submit"
              className="wv2-btn wv2-btn-primary wv2-lib-delete-confirm"
              disabled={!matches || busy}
            >
              {busy ? LIBRARY.deleteBusy : LIBRARY.deleteForever}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

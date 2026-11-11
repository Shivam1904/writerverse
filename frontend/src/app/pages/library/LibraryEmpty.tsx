import { BookOpen, Plus } from 'lucide-react'
import { LIBRARY } from '../../../config/library'

export function LibraryEmpty({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="wv2-lib-empty">
      <BookOpen className="wv2-lib-empty-icon" />
      <h3>{LIBRARY.emptyTitle}</h3>
      <p>{LIBRARY.emptyBody}</p>
      <button
        type="button"
        className="wv2-btn wv2-btn-primary wv2-lib-empty-btn"
        onClick={onCreateClick}
      >
        <Plus /> {LIBRARY.emptyAction}
      </button>
    </div>
  )
}

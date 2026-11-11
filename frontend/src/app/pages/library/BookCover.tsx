import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2 } from 'lucide-react'
import { genrePalette } from './genrePalette'
import { LIBRARY } from '../../../config/library'

/**
 * A face-out book on the shelf. Finished projects get a vibrant cloth cover
 * (spine + gilt + page-edge); projects still in `planning` render as a papery
 * DRAFT — wireframe skeleton, dashed binding, stamp. Each cover carries a
 * decoupled mirror reflection (a non-interactive twin anchored to the shelf, so
 * it slides *down* as the book lifts on hover). `featured` (the Continue strip)
 * drops the reflection and adds a ribbon bookmark.
 */
export function BookCover({
  project,
  enlarged,
  featured,
  onOpen,
  onDelete,
  deleting,
}: {
  project: any
  enlarged?: boolean
  featured?: boolean
  onOpen?: () => void
  onDelete?: () => void
  deleting?: boolean
}) {
  const navigate = useNavigate()
  const isDraft = ['imagine', 'plan'].includes((project.status || '').toLowerCase())
  const genre = project.genres?.[0] || ''  // the first genre the author picked
  const palette = genrePalette(genre, project.title)
  const progress = Math.max(0, Math.min(project.progress_percentage || 0, 100))
  const w = featured ? 168 : enlarged ? 200 : 150
  const h = featured ? 240 : enlarged ? 282 : 212

  const open = onOpen ?? (() => navigate(`/project/${project.id}`))
  const status = (project.status || '') as string
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1)
  const coverStyle = isDraft
    ? undefined
    : ({ ['--g' as any]: palette.bg, color: palette.text } as React.CSSProperties)

  const inner = (
    <>
      {isDraft && <span className="wv2-lib-cover-stamp">DRAFT</span>}
      <div className="wv2-lib-cover-top">
        <span className="wv2-lib-cover-genre">{genre.replace(/-/g, ' ')}</span>
        <h3 className="wv2-lib-cover-title">{project.title}</h3>
        {isDraft ? (
          <div className="wv2-lib-cover-skel"><i /><i /><i /></div>
        ) : (
          <div className="wv2-lib-cover-rule" />
        )}
      </div>
      <div className="wv2-lib-cover-bottom">
        <span className="wv2-lib-cover-words">
          {(project.total_word_count || 0).toLocaleString()} words
        </span>
        <div className="wv2-lib-cover-foot">
          <span className="wv2-lib-cover-pill">{statusLabel}</span>
          {progress > 0 && (
            <span className="wv2-lib-cover-prog">
              <i style={{ width: `${progress}%` }} />
            </span>
          )}
        </div>
      </div>
    </>
  )

  const draftCls = isDraft ? ' wv2-lib-cover-draft' : ''

  return (
    <div
      className={`wv2-lib-slot${isDraft ? ' is-draft' : ''}${featured ? ' is-featured' : ''}`}
      style={{ ['--bw' as any]: `${w}px`, ['--bh' as any]: `${h}px` }}
    >
      {featured && <span className="wv2-lib-ribbon" aria-hidden />}
      <article
        className={`wv2-lib-cover${draftCls}`}
        style={coverStyle}
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            open()
          }
        }}
      >
        {inner}
      </article>
      {onDelete && !featured && (
        <button
          type="button"
          className="wv2-lib-delete"
          aria-label={`${LIBRARY.moveToDeleted}: ${project.title}`}
          title={LIBRARY.moveToDeleted}
          disabled={deleting}
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          <Trash2 />
        </button>
      )}
      {!featured && (
        <div
          className={`wv2-lib-cover wv2-lib-cover-reflection${draftCls}`}
          style={coverStyle}
          aria-hidden
        >
          {inner}
        </div>
      )}
    </div>
  )
}

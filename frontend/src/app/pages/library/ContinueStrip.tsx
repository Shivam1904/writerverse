import { useNavigate } from 'react-router-dom'
import { LIBRARY } from '../../../config/library'
import { BookCover } from './BookCover'

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

export function ContinueStrip({ project }: { project: any }) {
  const navigate = useNavigate()
  const progress = Math.max(0, Math.min(project.progress_percentage || 0, 100))
  const hasWriting = Boolean(project.last_edited_scene || (project.total_word_count || 0) > 0)

  const ls = project.last_edited_scene
  const subtitle = [
    ls ? `Ch ${ls.chapter_order} · “${ls.scene_title}”` : null,
    `edited ${timeAgo(project.updated_at)}`,
  ]
    .filter(Boolean)
    .join('   ·   ')

  const handleOpen = () => {
    if (!hasWriting) {
      navigate(`/project/${project.id}`)
      return
    }
    const resume = ls ? `?chap=${ls.chapter_id}&sc=${ls.scene_id}` : ''
    navigate(`/project/${project.id}/chapters${resume}`)
  }

  return (
    <section className="wv2-lib-continue">
      <div className="wv2-lib-continue-book">
        <BookCover project={project} featured onOpen={handleOpen} />
      </div>
      <div className="wv2-lib-continue-meta">
        <div className="wv2-lib-continue-kicker">
          {hasWriting ? LIBRARY.continueWriting : LIBRARY.yourNewStory}
        </div>
        <h2 className="wv2-lib-continue-title">{project.title}</h2>
        <p className="wv2-lib-continue-sub">{subtitle}</p>
        {progress > 0 && (
          <div className="wv2-lib-continue-progress">
            <div className="wv2-lib-continue-track">
              <div className="wv2-lib-continue-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="wv2-lib-continue-pct">{Math.round(progress)}%</span>
          </div>
        )}
        <button type="button" className="wv2-btn wv2-btn-primary wv2-lib-open" onClick={handleOpen}>
          {LIBRARY.open} →
        </button>
      </div>
    </section>
  )
}

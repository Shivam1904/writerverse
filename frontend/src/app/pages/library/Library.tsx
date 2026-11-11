import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen } from 'lucide-react'
import { useAuthStore } from '../../../stores/authStore'
import { useProjectStore } from '../../../stores/projectStore'
import { LIBRARY } from '../../../config/library'
import { LibraryTopBar } from './LibraryTopBar'
import { extensions } from '../../extensions'
import { ContinueStrip } from './ContinueStrip'
import { BookCover } from './BookCover'
import { AddBookCard } from './AddBookCard'
import { LibraryEmpty } from './LibraryEmpty'
import { DeletedBooks, DeleteForeverModal } from './DeletedBooks'
import '../../app.css'
import './library.css'

// Books per shelf row on desktop; CSS shrinks covers / wraps on narrow screens.
const SHELF_SIZE = 5

export default function Library() {
  const navigate = useNavigate()
  const { user, justSignedUp, clearJustSignedUp } = useAuthStore()
  const {
    projects, fetchProjects, createProject, archiveProject, restoreProject, deleteProject,
    isLoading, correlationId, fetchFailed,
  } = useProjectStore()

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projectToDelete, setProjectToDelete] = useState<any | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [archivingId, setArchivingId] = useState<number | null>(null)
  const [actionFailed, setActionFailed] = useState(false)
  const [createFailed, setCreateFailed] = useState(false)

  useEffect(() => {
    if (user) fetchProjects()
  }, [user, fetchProjects])

  const closeCreateModal = () => {
    setShowCreateModal(false)
    setProjectName('')
    setCreateFailed(false)
  }

  const closeDeleteModal = useCallback(() => {
    if (isDeleting) return
    setProjectToDelete(null)
  }, [isDeleting])

  useEffect(() => {
    if (!showCreateModal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeCreateModal()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showCreateModal])

  // Archived books live in "Deleted books", not on the shelf.
  const sortedProjects = useMemo(
    () => projects
      .filter((p) => !p.archived_at)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
    [projects],
  )
  const deletedProjects = useMemo(
    () => projects
      .filter((p) => p.archived_at)
      .sort((a, b) => new Date(b.archived_at!).getTime() - new Date(a.archived_at!).getTime()),
    [projects],
  )

  // Group books into shelves; the add-a-book slot rides on the final shelf.
  const shelves = useMemo(() => {
    const rows: any[][] = []
    for (let i = 0; i < sortedProjects.length; i += SHELF_SIZE) {
      rows.push(sortedProjects.slice(i, i + SHELF_SIZE))
    }
    if (rows.length === 0 || rows[rows.length - 1].length >= SHELF_SIZE) rows.push([])
    return rows
  }, [sortedProjects])

  if (!user) {
    navigate('/login')
    return null
  }

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    const title = projectName.trim()
    if (!title) return
    setCreateFailed(false)
    try {
      const newProject = await createProject({ title })
      closeCreateModal()
      navigate(`/project/${newProject.id}`)
    } catch {
      setCreateFailed(true) // the modal stays open with the title, so Retry is one click
    }
  }

  // The trash button only archives: the book moves to "Deleted books", data kept.
  const handleArchiveProject = async (id: number) => {
    setArchivingId(id)
    setActionFailed(false)
    try {
      await archiveProject(id)
    } catch {
      setActionFailed(true)
    } finally {
      setArchivingId(null)
    }
  }

  const handleRestoreProject = async (id: number) => {
    setActionFailed(false)
    try {
      await restoreProject(id)
    } catch {
      setActionFailed(true)
    }
  }

  const handleDeleteProject = async () => {
    if (!projectToDelete) return
    setIsDeleting(true)
    setActionFailed(false)
    try {
      await deleteProject(projectToDelete.id)
      setProjectToDelete(null)
    } catch {
      setActionFailed(true)
    } finally {
      setIsDeleting(false)
    }
  }

  const continueProject = sortedProjects.find((p) => !['completed', 'abandoned'].includes(p.status))

  const hasBooks = sortedProjects.length > 0
  const isSingleBook = sortedProjects.length === 1

  return (
    <div className="wv2-root wv-theme wv2-lib">
        <LibraryTopBar user={user} />
        {/* Extension overlays, e.g. a welcome card for a brand-new account */}
        {extensions.libraryOverlays?.map((Overlay, i) => (
          <Overlay key={i} justSignedUp={justSignedUp} onClose={clearJustSignedUp} />
        ))}

        <main className="wv2-lib-main">
          {actionFailed && !projectToDelete && <p role="alert" className="mb-4">{LIBRARY.actionFailed}</p>}
          {isLoading && (
            <div className="wv2-lib-loading">
              <div className="spinner spinner-lg" />
            </div>
          )}

          {!isLoading && fetchFailed && (
            <div className="wv2-lib-error">
              <h3>{LIBRARY.errorHeading}</h3>
              <p>{LIBRARY.errorBody}</p>
              <button type="button" className="wv2-btn wv2-btn-primary" onClick={fetchProjects}>
                {LIBRARY.errorRetry}
              </button>
              {correlationId && <p className="wv2-lib-error-ref">ref: {correlationId}</p>}
            </div>
          )}

          {!isLoading && !fetchFailed && !hasBooks && (
            <LibraryEmpty onCreateClick={() => setShowCreateModal(true)} />
          )}

          {!isLoading && !fetchFailed && hasBooks && (
            <>
              {continueProject && <ContinueStrip project={continueProject} />}

              <div className="wv2-lib-shelves">
                {shelves.map((row, si) => (
                  <div className="wv2-lib-shelf" key={si}>
                    <div className="wv2-lib-shelf-row">
                      {row.map((project) => (
                        <BookCover
                          key={project.id}
                          project={project}
                          enlarged={isSingleBook}
                          deleting={archivingId === project.id}
                          onDelete={() => handleArchiveProject(project.id)}
                        />
                      ))}
                      {si === shelves.length - 1 && (
                        <AddBookCard
                          onClick={() => setShowCreateModal(true)}
                          enlarged={isSingleBook}
                          label={isSingleBook ? LIBRARY.startAnother : undefined}
                        />
                      )}
                    </div>
                    <div className="wv2-lib-shelf-line" />
                  </div>
                ))}
              </div>
            </>
          )}

          {!isLoading && !fetchFailed && (
            <DeletedBooks
              books={deletedProjects}
              onRestore={(book) => handleRestoreProject(book.id)}
              onDeleteForever={(book) => setProjectToDelete(book)}
            />
          )}
        </main>

        {showCreateModal && (
          <div
            className="wv2-lib-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={LIBRARY.createTitle}
            onClick={(e) => { if (e.target === e.currentTarget) closeCreateModal() }}
          >
            <div className="wv2-lib-modal" onClick={(e) => e.stopPropagation()}>
              <h2>{LIBRARY.createTitle}</h2>
              <p>{LIBRARY.createBody}</p>
              <form onSubmit={handleCreateProject} className="wv2-lib-form">
                <label htmlFor="lib-project-title">{LIBRARY.createLabel}</label>
                <input
                  id="lib-project-title"
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder={LIBRARY.createPlaceholder}
                  autoFocus
                  required
                />
                {createFailed && <p role="alert">{LIBRARY.createFailed}</p>}
                <div className="wv2-lib-modal-actions">
                  <button type="button" className="wv2-btn wv2-btn-subtle" onClick={closeCreateModal}>
                    {LIBRARY.createCancel}
                  </button>
                  <button type="submit" className="wv2-btn wv2-btn-primary" disabled={!projectName.trim()}>
                    <BookOpen /> {LIBRARY.createSubmit}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {projectToDelete && (
          <DeleteForeverModal
            book={projectToDelete}
            busy={isDeleting}
            failed={actionFailed}
            onCancel={() => { closeDeleteModal(); setActionFailed(false) }}
            onConfirm={handleDeleteProject}
          />
        )}
      </div>
  )
}

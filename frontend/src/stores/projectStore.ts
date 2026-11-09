/**
 * Project Store
 * Centralized state for projects and related story data (characters, mentions)
 */
import { create } from 'zustand'
import axios from 'axios'
import type { Chapter } from '../types'
import { ERRORS } from '../config/errors'

// Project types
export interface Project {
  id: number
  title: string
  description: string
  synopsis?: string
  genre: string
  status: string
  target_word_count: number | null
  total_word_count: number
  total_acts: number
  total_chapters: number
  total_scenes: number
  progress_percentage: number
  last_edited_scene?: {
    scene_id: number
    scene_title: string
    chapter_id: number
    chapter_title: string
    chapter_order: number
    scene_order: number
    updated_at: string
  } | null
  created_at: string
  updated_at: string
  /** Set when the book is in "Deleted books"; null while it's on the shelf. */
  archived_at?: string | null
}

// Story element types
export interface Character {
  id: number
  name: string
  description: string
  project: number
  type?: string
  story?: string
  want?: string
  want_items?: number[]
  need?: string
  need_items?: number[]
  misbelief?: string
  misbelief_items?: number[]
  permanent_traits: Record<string, unknown>
  evolving_states: Record<string, unknown>
  is_main_character: boolean
  is_protagonist: boolean
  is_antagonist: boolean
  status?: string
  voice_profile: Record<string, unknown>
  chart_ids?: number[]
  mention_count: number
  mentions?: Array<{
    id: number
    scene_title: string
    chapter_id: number
    context: string
    start_position: number
    end_position: number
    created_at: string
  }>
  chapters_with_mentions?: number[]
  last_mentioned?: string | null
  relationship_notes?: string
  relationships?: Array<{
    character_id: number
    name: string
    relationship_type: string
    notes?: string
  }>
  scene_links?: { id: number; title: string; chapter_id: number | null }[]
  created_at: string
  updated_at: string
}

interface ProjectStoreState {
  // Project state
  projects: Project[]
  isLoading: boolean
  error: string | null
  correlationId: string | null
  fetchFailed: boolean
  fetchProjects: () => Promise<void>
  createProject: (data: Partial<Project>) => Promise<Project>
  archiveProject: (id: number) => Promise<void>
  restoreProject: (id: number) => Promise<void>
  deleteProject: (id: number) => Promise<void>
  clearError: () => void

  // Story element state
  characters: Character[]
  chapters: Chapter[]
  storyLoading: boolean
  storyError: string | null
  fetchCharacters: (projectId: number) => Promise<void>
  fetchCharacter: (projectId: number, characterId: number) => Promise<Character>
  createCharacter: (data: Partial<Character>, projectId: number) => Promise<Character>
  updateCharacter: (id: number, data: Partial<Character>, projectId: number) => Promise<Character>
  deleteCharacter: (id: number, projectId: number) => Promise<void>
  clearStoryError: () => void
  clearStoryData: () => void
}

export const useProjectStore = create<ProjectStoreState>((set) => ({
  // Project state
  projects: [],
  isLoading: false,
  error: null,
  correlationId: null,
  fetchFailed: false,
  chapters: [],

  async fetchProjects() {
    set({ isLoading: true, error: null, fetchFailed: false })
    try {
      const response = await axios.get('/projects/')
      const data = Array.isArray(response.data) ? response.data : (response.data?.results || [])
      set({ projects: data, isLoading: false, fetchFailed: false })
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string; correlation_id?: string } } }
      const message = err.response?.data?.error || ERRORS.fetchProjects
      const correlationId = err.response?.data?.correlation_id ?? null
      set({ error: message, correlationId, isLoading: false, fetchFailed: true })
      console.error('fetchProjects error:', error)
    }
  },

  async createProject(data) {
    set({ isLoading: true, error: null })
    try {
      const response = await axios.post('/projects/', data)
      const newProject = response.data
      set(state => ({
        projects: [...state.projects, newProject],
        isLoading: false
      }))
      return newProject
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } }
      const message = err.response?.data?.error || 'Failed to create project'
      set({ error: message, isLoading: false })
      console.error('createProject error:', error)
      throw error
    }
  },

  // Archive and restore only flip `archived_at`; the book and its data stay.
  async archiveProject(id) {
    const response = await axios.post(`/projects/${id}/archive/`)
    const archivedAt: string = response.data?.archived_at ?? new Date().toISOString()
    set(state => ({
      projects: state.projects.map(p => (p.id === id ? { ...p, archived_at: archivedAt } : p)),
    }))
  },

  async restoreProject(id) {
    await axios.post(`/projects/${id}/restore/`)
    set(state => ({
      projects: state.projects.map(p => (p.id === id ? { ...p, archived_at: null } : p)),
    }))
  },

  // Permanent delete. The backend only allows it for an archived book.
  async deleteProject(id) {
    set({ isLoading: true, error: null })
    try {
      await axios.delete(`/projects/${id}/`)
      set(state => ({
        projects: state.projects.filter(project => project.id !== id),
        isLoading: false
      }))
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } }
      const message = err.response?.data?.error || 'Failed to delete project'
      set({ error: message, isLoading: false })
      console.error('deleteProject error:', error)
      throw error
    }
  },

  clearError() {
    set({ error: null, correlationId: null, fetchFailed: false })
  },

  // Story element state
  characters: [],
  storyLoading: false,
  storyError: null,

  async fetchCharacters(projectId) {
    set({ storyLoading: true, storyError: null })
    try {
      const response = await axios.get(`/projects/${projectId}/characters/`)
      const data = Array.isArray(response.data) ? response.data : (response.data?.results || [])
      set({ characters: data, storyLoading: false })
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string }; status?: number } }
      if (err.response?.status === 404) {
        set({ characters: [], storyLoading: false })
        return
      }
      const message = err.response?.data?.error || ERRORS.fetchCharacters
      set({ storyError: message, storyLoading: false })
      console.error('fetchCharacters error:', error)
    }
  },

  async fetchCharacter(projectId, characterId) {
    set({ storyLoading: true, storyError: null })
    try {
      const response = await axios.get(`/projects/${projectId}/characters/${characterId}/`)
      const character = response.data as Character
      set(state => ({
        characters: state.characters.map(existing => (
          existing.id === characterId ? character : existing
        )),
        storyLoading: false
      }))
      return character
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } }
      const message = err.response?.data?.error || 'Failed to fetch character'
      set({ storyError: message, storyLoading: false })
      console.error('fetchCharacter error:', error)
      throw error
    }
  },

  async createCharacter(data, projectId) {
    set({ storyLoading: true, storyError: null })
    try {
      const payload = { ...data, project: projectId }
      const response = await axios.post(`/projects/${projectId}/characters/`, payload)
      const newCharacter = response.data as Character
      set(state => ({
        characters: [...state.characters, newCharacter],
        storyLoading: false
      }))
      return newCharacter
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } }
      const message = err.response?.data?.error || 'Failed to create character'
      set({ storyError: message, storyLoading: false })
      console.error('createCharacter error:', error)
      throw error
    }
  },

  async updateCharacter(id, data, projectId) {
    set({ storyLoading: true, storyError: null })
    try {
      const payload = { ...data, project: projectId }
      const response = await axios.patch(`/projects/${projectId}/characters/${id}/`, payload)
      const updatedCharacter = response.data as Character
      set(state => ({
        characters: state.characters.map(character => (
          character.id === id ? updatedCharacter : character
        )),
        storyLoading: false
      }))
      return updatedCharacter
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } }
      const message = err.response?.data?.error || 'Failed to update character'
      set({ storyError: message, storyLoading: false })
      console.error('updateCharacter error:', error)
      throw error
    }
  },

  async deleteCharacter(id, projectId) {
    set({ storyLoading: true, storyError: null })
    try {
      await axios.delete(`/projects/${projectId}/characters/${id}/`)
      set(state => ({
        characters: state.characters.filter(character => character.id !== id),
        storyLoading: false
      }))
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } } }
      const message = err.response?.data?.error || 'Failed to delete character'
      set({ storyError: message, storyLoading: false })
      console.error('deleteCharacter error:', error)
      throw error
    }
  },

  clearStoryError() {
    set({ storyError: null })
  },

  clearStoryData() {
    set({
      characters: [],
      storyError: null
    })
  }
}))
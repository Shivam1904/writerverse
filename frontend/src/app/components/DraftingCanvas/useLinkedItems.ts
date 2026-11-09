import { useEffect, useState } from 'react'
import axios from 'axios'

// Relocated from the legacy projectStore (the only old-tree tie this editor had).
// Self-contained shape — the editor only reads id / name.
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

export type Braindump = { id: number; title: string; content: string }
export type Worldbuilding = { id: number; title: string; content: string }

export function useLinkedItems(projectId: string) {
  const [characters, setCharacters] = useState<Character[]>([])
  const [braindumps, setBraindumps] = useState<Braindump[]>([])
  const [worldbuildings, setWorldbuildings] = useState<Worldbuilding[]>([])

  useEffect(() => {
    const loadLinkedItems = async () => {
      try {
        const charactersRes = await axios.get(`/projects/${projectId}/characters/`).catch(() => ({ data: { results: [] } }))
        const charactersList = Array.isArray(charactersRes.data)
          ? charactersRes.data
          : (charactersRes.data.results || [])

        // Store characters in state
        setCharacters(charactersList)

        const [braindumpsRes, worldbuildingsRes] = await Promise.all([
          axios.get(`/projects/${projectId}/braindumps/`).catch(() => ({ data: { results: [] } })),
          axios.get(`/projects/${projectId}/worldbuildings/`).catch(() => ({ data: { results: [] } })),
        ])
        
        const braindumpsList = Array.isArray(braindumpsRes.data) 
          ? braindumpsRes.data 
          : (braindumpsRes.data.results || [])
        const worldbuildingsList = Array.isArray(worldbuildingsRes.data)
          ? worldbuildingsRes.data
          : (worldbuildingsRes.data.results || [])
        
        setBraindumps(braindumpsList)
        setWorldbuildings(worldbuildingsList)
      } catch (err) {
        console.error('[useLinkedItems] Error loading linked items:', err)
      }
    }
    
    void loadLinkedItems()
  }, [projectId])

  return {
    characters,
    braindumps,
    worldbuildings,
  }
}


/**
 * Legacy shared types. Only `Chapter` is still used (by stores/projectStore.ts).
 */

export interface Chapter {
  id: number
  title: string
  description: string
  order: number
  word_count: number
  scene_count: number
  created_at: string
  updated_at: string
}

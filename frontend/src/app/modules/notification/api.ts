import axios from 'axios';
import type { AppNotification } from './types';

// Plain REST (not the capability facade) — notifications are informational.
// axios baseURL is the API root (config/api.ts); auth rides the global interceptor (see authStore).

export async function loadNotifications(
  projectId: any,
): Promise<{ active: AppNotification[]; archived: AppNotification[] }> {
  const r = await axios.get(`/consistency/projects/${projectId}/notifications/`);
  return { active: r.data?.active ?? [], archived: r.data?.archived ?? [] };
}

export async function archiveNotification(projectId: any, id: number): Promise<void> {
  await axios.post(`/consistency/projects/${projectId}/notifications/${id}/archive/`, {});
}

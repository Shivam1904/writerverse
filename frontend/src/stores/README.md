# Stores (Legacy)

This directory contains legacy Zustand stores from before the app migration.

**Do not add new stores here.** New state lives in `frontend/src/app/` — either as Zustand stores within that tree or as TanStack Query cache.

## What's here

- `authStore.ts` — user session, JWT tokens, user profile. Still active.
- `projectStore.ts` — active project metadata. Still active.

## Guidance

- Use TanStack Query (`useQuery`/`useMutation`) for any server state.
- Use Zustand only for UI state that doesn't live in the DB (sidebar, unsaved flags, etc.).
- Always use selectors to avoid unnecessary re-renders: `useAuthStore(s => s.user)` not `useAuthStore().user`.

# app — the frontend

This is the active UI. All new frontend work goes here.

## CSS / styling rules (strict)

- **No CSS file creation or modification** for visual styles (color, font, shadow, border, animation). Ask first.
- **Layout only in JSX** via Tailwind classes (margin, padding, flex, grid).
- **Shadcn kit components** at `ui/` cover 90% of visual needs — use them.
- To enrich a kit component, edit it in `ui/` directly. Do not add new CSS classes to `app.css`.

## Component rules

- If a component you need doesn't exist in `ui/`, ask before creating it. New components are designed in `pages/showcase/` first.
- Design system (icons, page headers, buttons, switches): reuse the existing kit in `ui/` and the patterns in `pages/showcase/`. Don't invent per-page icon, button or header styles.
- Reference implementation: `pages/braindumps/components/StreamView.tsx`.

## State

- Server state → TanStack Query (`queries.ts` + per-page query hooks).
- UI state → Zustand stores within this tree.
- Pending proposals → `modules/proposal/useProposalStore`, the one client list — do not keep another. Accept / dismiss through `callOp` (or `makeProposalHandlers`) so the card settles on every screen. How it works: `docs/how-it-works/proposals.md`.

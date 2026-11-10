import { create } from 'zustand';

/* useArnUiStore — the rest of the per-ARN heading state the kit owns, beyond the
 * lens (which lives in useArnLensStore):
 *
 *   expanded[arn]   — the node's expand/collapse state. The kit keeps it so a
 *                     parent can read/drive it through <ArnExpand>, and so it
 *                     survives a re-render. Session-only.
 *   rewrite[arn]    — the AI-rewrite affordance's state: whether the inline input
 *                     is open, and the current draft text. The ghost diamond
 *                     expands in place into this input; submit seeds Night Eyes.
 *   ideasOpen[arn]  — whether the node's "from your braindumps" idea box is open.
 *                     The lightbulb button (<ArnIdeaButton>) toggles it; the box
 *                     (<ArnIdeaBox>) reads it — the same button/box pattern the
 *                     lens uses, keyed by the same ARN.
 *
 * All session-only — nothing here is worth persisting. */

interface RewriteState { open: boolean; draft: string }

interface ArnUiState {
  expanded: Record<string, boolean>;
  rewrite: Record<string, RewriteState>;
  ideasOpen: Record<string, boolean>;
  toggleExpanded: (arn: string) => void;
  setExpanded: (arn: string, v: boolean) => void;
  openRewrite: (arn: string) => void;
  closeRewrite: (arn: string) => void;
  setDraft: (arn: string, draft: string) => void;
  toggleIdeas: (arn: string) => void;
  setIdeas: (arn: string, v: boolean) => void;
}

const REWRITE_OFF: RewriteState = { open: false, draft: '' };

export const useArnUiStore = create<ArnUiState>((set) => ({
  expanded: {},
  rewrite: {},
  ideasOpen: {},
  toggleExpanded: (arn) => set((s) => ({ expanded: { ...s.expanded, [arn]: !s.expanded[arn] } })),
  setExpanded: (arn, v) => set((s) => ({ expanded: { ...s.expanded, [arn]: v } })),
  toggleIdeas: (arn) => set((s) => ({ ideasOpen: { ...s.ideasOpen, [arn]: !s.ideasOpen[arn] } })),
  setIdeas: (arn, v) => set((s) => ({ ideasOpen: { ...s.ideasOpen, [arn]: v } })),
  openRewrite: (arn) =>
    set((s) => ({ rewrite: { ...s.rewrite, [arn]: { ...(s.rewrite[arn] ?? REWRITE_OFF), open: true } } })),
  closeRewrite: (arn) =>
    set((s) => ({ rewrite: { ...s.rewrite, [arn]: { open: false, draft: '' } } })),
  setDraft: (arn, draft) =>
    set((s) => ({ rewrite: { ...s.rewrite, [arn]: { ...(s.rewrite[arn] ?? REWRITE_OFF), draft } } })),
}));

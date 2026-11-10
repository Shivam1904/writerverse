/**
 * useSuggestionsModel — the single, page-aware source of truth for "what would
 * the suggestions list show right now": pending proposals (from the global
 * proposal store) + the hint species (walk-along, initialize, what-to-do-next,
 * ambient) + notifications, plus their counts.
 *
 * Lifted out of <SuggestionsRail> so two consumers share it:
 *   • <SuggestionsRail> — renders the full list (now inside the Night Eyes drawer).
 *   • the Night Eyes bottom bar — reads the counts + the first proposal / first
 *     hint to preview inline.
 *
 * The right rail itself is gone; this content lives in the Night Eyes panel now.
 */

import { useParams } from 'react-router-dom';
import { useProposalStore, sectionForProposal, type PendingProposal } from '../modules/proposal';
import { activeInitializeHints, activeWalkAlongHints, nextStepHint } from '../modules/hint';
import type { Hint } from '../modules/hint';
import { useNotifications } from '../modules/notification';
import { useCountsRecord } from '../useCounts';

// What-to-do-next selection (NEXT_META / PAGE_NEXT_TYPES) lives in
// modules/hint/nextStepHints — shared with collectLiveHints so what the author
// sees in the rail and what Night Eyes is told are selected from one table.

// Ambient, headingless tips. Parked (empty) for now — renders nothing until a
// hints service (or real copy) is wired back in.
const AMBIENT_HINTS: { id: string; text: string; page?: string }[] = [];

export interface SuggestionsModel {
  /** Section-filtered pending proposals (the page's own inline surface shows
   *  proposals targeting the current section, so they're hidden here). */
  pending: PendingProposal[];
  /** what-to-do-next + ambient tips → <HintRailCard> list. */
  hints: Hint[];
  /** initialize milestone cards (each carries its own <Card>). */
  initzHints: ReturnType<typeof activeInitializeHints>;
  /** walk-along cards (each carries its own <Card>). */
  walkHints: ReturnType<typeof activeWalkAlongHints>;
  notifs: ReturnType<typeof useNotifications>['active'];
  archiveNotif: ReturnType<typeof useNotifications>['archive'];
  presenceLoaded: boolean;
  proposalCount: number;
  /** walk-along + initialize + hint cards — everything that isn't a proposal. */
  hintCount: number;
}

export function useSuggestionsModel(): SuggestionsModel {
  const allPending = useProposalStore((s) => s.pending);
  const { projectId, section: sectionParam, characterId } = useParams();

  // The character studio route is `/project/:projectId/characters/:characterId`
  // — a literal `characters` segment, so there's no `:section` param. Treat a
  // characterId route as the `characters` section so the same page-awareness
  // (proposal suppression + hints) applies there as on the cast list.
  const section = sectionParam ?? (characterId ? 'characters' : undefined);

  // Hide proposals whose target page IS the current section — that page renders
  // its own inline surface for them, so showing them again here would duplicate.
  const pending = allPending.filter(
    (p) => sectionForProposal(p.capability, p.result) !== section,
  );

  const { counts, loaded: presenceLoaded } = useCountsRecord(projectId);
  const { active: notifs, archive: archiveNotif } = useNotifications();

  // The single active what-to-do-next hint: the highest-priority empty type this
  // page opts into (modules/hint/nextStepHints). Gated on presenceLoaded so a
  // half-loaded store doesn't flash.
  const nextStep = presenceLoaded ? nextStepHint({ section, counts }) : null;

  const hints: Hint[] = [];
  if (nextStep) {
    hints.push({
      id: nextStep.id,
      page: nextStep.page,
      intent: 'start',
      data: { line: nextStep.line },
      cta: nextStep.cta,
    });
  }
  for (const h of AMBIENT_HINTS) {
    hints.push({ id: h.id, page: h.page ?? '', intent: 'tip', data: { line: h.text } });
  }

  const initzHints = presenceLoaded ? activeInitializeHints({ section, counts }) : [];
  const walkHints = presenceLoaded ? activeWalkAlongHints({ section, counts }) : [];

  return {
    pending,
    hints,
    initzHints,
    walkHints,
    notifs,
    archiveNotif,
    presenceLoaded,
    proposalCount: pending.length,
    hintCount: hints.length + initzHints.length + walkHints.length,
  };
}

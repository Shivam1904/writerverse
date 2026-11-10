/* arnKit — the reusable, ARN-keyed heading kit. A parent drops in button atoms by
 * naming a node's ARN parts (section / sub / item) + the entity's display `name`;
 * the kit resolves labels, hints and lenses from the marker registry, derives the
 * lens scope from the ARN + the URL, and owns the per-ARN state (expand, lens
 * attach, AI-rewrite). No context wrapper — page/id come from the URL
 * (useArnLocation), projectId from useParams. See modules/sectionMarker/registry.ts. */

export { useArnKit, useArn, type ArnKit, type UseArnKitArgs } from './useArnKit';

// button atoms
export {
  ArnInfoEye, ArnLensButton, ArnLensReport, ArnAiRewrite, ArnExpand,
  type ArnNodeProps,
} from './tools';

// idea atoms — the "from your braindumps" button/box pair (self-resolves phrases
// from the ARN registry's ideaTags via useArnIdeas).
export { ArnIdeaButton, ArnIdeaBox, type ArnIdeaNodeProps } from './ideas';
export { useArnIdeas, resolveArnIdeas, entityMatchNames, type IdeaPhrase } from './useArnIdeas';

// promoted showcase atoms (visual-only)
export { LensIndicator, LensEye, LENS_MODES, type LensModeKey, type EyeExpr } from './LensIndicator';
export { GhostDiamond } from './GhostDiamond';

// per-ARN heading UI state (expand / rewrite). The LENS engine + surfaces now live
// in modules/lensKit — arn renders <LensKit type="section"> via <ArnLensReport>.
export { useArnUiStore } from './useArnUi';

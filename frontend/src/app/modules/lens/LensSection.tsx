import { useNavigate, useParams } from 'react-router-dom';
import './lens.css';
import { useLensSection } from './useLensSection';
// the kit Shelf is the single shelf dispatcher; import the FILE (not the lensKit
// barrel) — the barrel pulls LensKit → LensSection back here and would cycle.
import { LensShelf } from '../lensKit/Shelf';
import type { Where } from './lensLibrary';

/* LensSection — the thin DATA wrapper behind every page lens section. It owns the
 * page context (where + id + threads + projectId), builds the live model
 * (useLensSection), and hands it to the kit Shelf, which renders the variant. The
 * rich board renderers live in LensBoards and are reached only through the Shelf.
 *
 *   where   — which page (character | threads | outline | chapters)
 *   id      — the in-view entity (character / thread / chapter id), optional
 *   variant — which board: 'shelf' · 'ribbon' · 'real' · 'workspace' · 'shaping'
 */
export type LensVariant = 'shelf' | 'ribbon' | 'real' | 'workspace' | 'shaping';

export function LensSection({ where, id, variant, threads = [], showHead, eyebrow, title }:
  { where: Where; id?: string; variant: LensVariant; threads?: any[]; showHead?: boolean; eyebrow?: string; title?: string }) {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const model = useLensSection(projectId, where, id, threads);
  const onBrowse = () => navigate(`/project/${projectId}/gauges`);

  return <LensShelf variant={variant} model={model} onBrowse={onBrowse} showHead={showHead} eyebrow={eyebrow} title={title} />;
}

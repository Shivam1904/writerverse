import { useNavigate, useParams } from 'react-router-dom';
import '../lens/lens.css';
import { useLensCatalogue } from './catalogue';
import { FullLensCard } from '../lens/LensAtoms';

/* LensInventory — the `type='inventory'` slice: the unattached lens LIBRARY (the
 * whole bank catalogue, browse-only). It's section-independent and scope-less, so
 * cards don't bind here — attaching needs a scope (slice 3: the attach-box scope
 * picker); for now the cards route to the full gauge bank. */

export function LensInventory() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const lenses = useLensCatalogue(projectId);
  const onBrowse = () => navigate(`/project/${projectId}/gauges`);

  return (
    <div className="lens-root" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
      {lenses.map((l) => (
        <FullLensCard
          key={l.slug}
          lens={{ key: l.slug, name: l.question, type: (l.raw?.type || 'arc'), walk: (l.raw?.axis?.walk || 'outline'), desc: l.description }}
          attached={false}
          onToggle={onBrowse}
        />
      ))}
      {lenses.length === 0 && <p className="ui sl-box-empty">The lens library is empty.</p>}
    </div>
  );
}

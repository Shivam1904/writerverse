import { useParams } from 'react-router-dom';
import { GaugesBank } from './GaugesBank';
import { GaugesWatching } from './GaugesWatching';
import { GaugesCharts } from './GaugesCharts';

/**
 * Gauges — the new, parallel lens/charts route. Three URL-driven views (no top
 * toggle): the section sub-param decides which.
 *   · /gauges          → <GaugesWatching>  (overview — or onboarding init if nothing bound)
 *   · /gauges/bank     → <GaugesBank>      (the four-source shelf)
 *   · /gauges/<id>     → <GaugesCharts>    (one gauge, drilled in)
 */
export function GaugesPage() {
  const { sub } = useParams();
  if (sub === 'bank') return <GaugesBank />;
  if (sub) return <GaugesCharts focusId={sub} />;
  return <GaugesWatching />;
}

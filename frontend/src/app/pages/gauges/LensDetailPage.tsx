import { Navigate, useParams } from 'react-router-dom';
import { LensDetail } from './LensDetail';

/**
 * LensDetailPage — the redesigned single-gauge detail, mounted at the NEW route
 *   /project/:projectId/lens/:id   (the `:id` arrives as the `sub` param).
 * It renders the same board as <GaugesCharts> (the old /gauges/:id, left intact),
 * re-skinned to the lens design language. A bare /lens (no id) sends you back to
 * the Watching overview.
 */
export function LensDetailPage() {
  const { projectId, sub } = useParams();
  if (!sub) return <Navigate to={`/project/${projectId}/gauges`} replace />;
  return <LensDetail focusId={sub} />;
}

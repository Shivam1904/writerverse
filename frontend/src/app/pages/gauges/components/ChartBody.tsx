import type { ChartInstance, ChartScene } from '../data';
import { effectiveVisual, TICK_LABELS } from '../data';
import { TrajectoryChart } from './TrajectoryChart';
import { LedgerChart } from './LedgerChart';
import { CoverageChart } from './CoverageChart';
import { TickedList } from './TickedList';
import { ProgressRing } from './ProgressRing';
import { DependencyChart } from './DependencyChart';
import { ReportList } from './ReportList';
import { BarsChart, HeatStrip, GaugeDial, TransitionList, PlantedPaidBoard, HangingList } from './AltVisuals';

const EMPTY = new Set<string>();

// The x-axis legend — what this binding walks (a thread / the outline) and the
// tick grain. Shown under EVERY scene-mapped chart, so visuals that don't draw a
// spatial x-axis (gauge dial, bars, heat strip) still say what the points are.
function XAxisLegend({ chart }: { chart: any }) {
  const walk = chart.axis?.walk || 'outline';
  const tick = chart.axis?.tick || 'scene';
  const attached = walk === 'thread'
    ? (chart.thread_label ? `the “${chart.thread_label}” thread` : 'a thread')
    : walk === 'story' ? 'the story' : 'the outline';
  const n = (chart.ticks || []).length || (chart.data_points || []).length;
  return (
    <div className="gz-xaxis-legend">
      <span className="gz-xaxis-dot" /> x-axis: walks <b>{attached}</b>
      {' · '}one tick per {TICK_LABELS[tick] || tick}{n ? ` · ${n} ticks` : ''}
    </div>
  );
}

/**
 * ChartBody — the render registry. Dispatches on the chart's EFFECTIVE visual
 * (per-binding pick → per-lens default → type default), NOT on the backend — so
 * the same data renders different visuals via the "Show as ▾" switch. A new
 * visual = one case here + a renderer. Unknown visual falls back by backend.
 */
export function ChartBody({ chart, scenes = [], bareAxis = false, hideLegend = false }: { chart: ChartInstance; scenes?: ChartScene[]; bareAxis?: boolean; hideLegend?: boolean }) {
  const body = renderVisual(chart, scenes, bareAxis);
  // scene-mapped charts walk an x-axis; coverage charts (checklist / setup→payoff)
  // don't — only the former get the legend. Config preview (bareAxis) skips it;
  // `hideLegend` skips ONLY the legend (keeps the chart's own axes) for callers
  // that render their own x-axis caption (the /lens/:id detail).
  if (bareAxis || hideLegend || (chart as any).data_style !== 'scene_mapped') return body;
  return <>{body}<XAxisLegend chart={chart} /></>;
}

function renderVisual(chart: ChartInstance, scenes: ChartScene[], bareAxis: boolean) {
  const v = effectiveVisual(chart);
  switch (v) {
    // arc
    case 'ladder_line':
      return <TrajectoryChart chart={chart} scenes={scenes} staleScenes={EMPTY} bareAxis={bareAxis} />;
    case 'line_with_ideal':
      return <TrajectoryChart chart={chart} scenes={scenes} staleScenes={EMPTY} ideal bareAxis={bareAxis} />;
    case 'gauge':
      return <GaugeDial chart={chart} />;
    // map
    case 'contour_line':
      return <TrajectoryChart chart={chart} scenes={scenes} staleScenes={EMPTY} smooth bareAxis={bareAxis} />;
    case 'bars':
      return <BarsChart chart={chart} />;
    case 'heat_strip':
      return <HeatStrip chart={chart} />;
    // tracker
    case 'state_lanes':
    case 'state_cells':
      return <LedgerChart chart={chart} scenes={scenes} staleScenes={EMPTY} />;
    case 'step_line':
      return <TrajectoryChart chart={chart} scenes={scenes} staleScenes={EMPTY} step bareAxis={bareAxis} />;
    case 'transition_list':
      return <TransitionList chart={chart} />;
    // checklist
    case 'checklist':
      return <TickedList chart={chart} />;
    case 'progress_ring':
      return <ProgressRing chart={chart} />;
    case 'beats_timeline':
      return <CoverageChart chart={chart} staleScenes={EMPTY} />;
    // setup → payoff
    case 'payoff_arcs':
      return <DependencyChart chart={chart} scenes={scenes} staleScenes={EMPTY} />;
    case 'planted_paid_board':
      return <PlantedPaidBoard chart={chart} />;
    case 'hanging_list':
      return <HangingList chart={chart} />;
    // report
    case 'report':
      return <ReportList chart={chart} />;
    default:
      // fall back to the backend's natural form
      switch (chart.backend) {
        case 'ledger': return <LedgerChart chart={chart} scenes={scenes} staleScenes={EMPTY} />;
        case 'coverage': return <CoverageChart chart={chart} staleScenes={EMPTY} />;
        case 'dependency': return <DependencyChart chart={chart} scenes={scenes} staleScenes={EMPTY} />;
        case 'report': return <ReportList chart={chart} />;
        default: return <TrajectoryChart chart={chart} scenes={scenes} staleScenes={EMPTY} bareAxis={bareAxis} />;
      }
  }
}

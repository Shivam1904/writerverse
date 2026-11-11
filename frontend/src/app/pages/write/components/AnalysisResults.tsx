import type { AnalysisResult } from './AnalysisMenu';

interface Props {
  result: AnalysisResult;
  onDismiss: () => void;
}

export function AnalysisResults({ result, onDismiss }: Props) {
  const d = result.data;

  return (
    <div className="wr-analysis-card">
      <div className="wr-analysis-card-head">
        <span className="wr-analysis-card-label">{result.label}</span>
        <button className="wr-analysis-card-x" onClick={onDismiss} title="Dismiss">
          ×
        </button>
      </div>

      <div className="wr-analysis-card-summary">{result.summary}</div>

      {/* Error state */}
      {d.error && !d.summary && (
        <div className="wr-analysis-err">{d.error}</div>
      )}

      {/* POV purity — violations list */}
      {d.violations?.length > 0 && (
        <ul className="wr-analysis-list">
          {d.violations.map((v: string, i: number) => (
            <li key={i}>{v}</li>
          ))}
        </ul>
      )}

      {/* Hook grade — verdicts */}
      {d.opening_verdict && (
        <div className="wr-analysis-verdicts">
          <div>{d.opening_verdict}</div>
          <div>{d.closing_verdict}</div>
        </div>
      )}

      {/* Subtext / voice — flags list */}
      {d.flags?.length > 0 && !d.violations && (
        <ul className="wr-analysis-list">
          {d.flags.map((f: string, i: number) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      )}

      {/* POV consistency — classifications + deviations */}
      {d.classifications?.length > 0 && (
        <div className="wr-analysis-table">
          <div className="wr-analysis-dominant">
            Dominant: <b>{d.dominant_pov}</b>
          </div>
          {d.deviations?.length > 0 && (
            <>
              <div className="wr-analysis-sub">Deviations:</div>
              <ul className="wr-analysis-list">
                {d.deviations.map((dev: any, i: number) => (
                  <li key={i}>
                    {dev.title} — <em>{dev.pov}</em>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* Outline drift — not-aligned pairs */}
      {d.not_aligned?.length > 0 && (
        <ul className="wr-analysis-list">
          {d.not_aligned.map((r: any, i: number) => (
            <li key={i}>
              <b>{r.beat_title}</b> ↔ {r.scene_title}: {r.explanation}
            </li>
          ))}
        </ul>
      )}

      {/* Beat coverage — uncovered beats */}
      {d.uncovered?.length > 0 && (
        <ul className="wr-analysis-list">
          {d.uncovered.map((b: any, i: number) => (
            <li key={i}>
              <b>{b.beat}</b>
              {b.note && <> — {b.note}</>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

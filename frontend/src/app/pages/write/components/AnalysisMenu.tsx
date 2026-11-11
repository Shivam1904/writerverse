import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

export interface AnalysisResult {
  key: string;
  label: string;
  data: any;
  summary: string;
}

interface AnalysisDef {
  key: string;
  label: string;
  scope: 'scene' | 'project';
  /** URL builder — receives (projectId, sceneId?) */
  url: (pid: string, sid?: number) => string;
}

const ANALYSES: AnalysisDef[] = [
  /* project-level */
  {
    key: 'outline-drift',
    label: 'Outline drift (beats vs prose)',
    scope: 'project',
    url: (p) => `/analytics/projects/${p}/analysis/outline-drift/`,
  },
  {
    key: 'beat-coverage',
    label: 'Beat coverage (uncovered)',
    scope: 'project',
    url: (p) => `/analytics/projects/${p}/analysis/beat-coverage/`,
  },
];

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */

interface Props {
  sceneId: number;
  onResult: (result: AnalysisResult | null) => void;
}

export function AnalysisMenu({ sceneId, onResult }: Props) {
  const { projectId } = useParams();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const run = useCallback(
    async (def: AnalysisDef) => {
      if (!projectId || running) return;
      setRunning(def.key);
      setOpen(false);
      try {
        const url =
          def.scope === 'scene'
            ? def.url(projectId, sceneId)
            : def.url(projectId);
        const res = await axios.post(url);
        const data = res.data ?? {};
        onResult({
          key: def.key,
          label: def.label,
          data,
          summary: data.summary || 'Analysis complete.',
        });
      } catch (err: any) {
        const msg =
          err?.response?.data?.error ||
          err?.response?.data?.message ||
          'Analysis failed.';
        onResult({
          key: def.key,
          label: def.label,
          data: { error: msg },
          summary: msg,
        });
      } finally {
        setRunning(null);
      }
    },
    [projectId, sceneId, running, onResult],
  );

  return (
    <div className="wr-analysis-wrap" ref={menuRef}>
      <button
        className="wr-scene-act-btn"
        title={running ? `Running ${running}…` : 'Analyze scene'}
        onClick={() => setOpen((v) => !v)}
        disabled={!!running}
      >
        {running ? (
          <span className="wr-analysis-spinner" />
        ) : (
          
          <button className="wr-scene-act-btn" title="More">
          <svg viewBox="0 0 24 24">
            <circle cx="6" cy="12" r="1.4" />
            <circle cx="12" cy="12" r="1.4" />
            <circle cx="18" cy="12" r="1.4" />
          </svg>
        </button>
        )}
      </button>

      {open && (
        <div className="wr-analysis-dropdown">
          <div className="wr-analysis-section">Project</div>
          {ANALYSES.filter((a) => a.scope === 'project').map((a) => (
            <button
              key={a.key}
              className="wr-analysis-option"
              onClick={() => run(a)}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

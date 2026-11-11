import { useCallback, useEffect, useState } from 'react';
import { callOp } from '../../gateway';

// One scene-analysis pipeline's switch state (from get_scene_pipelines).
export interface ScenePipeline {
  key: string;
  label: string;
  enabled: boolean;
  default_enabled: boolean;
  cost: string;
}

// Loads the per-project pipeline switches and exposes an optimistic toggle.
// `enabledKeys` lets the save path skip the analyze_scene call when nothing's on.
export function useScenePipelines(projectId: string | undefined) {
  const [pipelines, setPipelines] = useState<ScenePipeline[]>([]);

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    callOp(projectId, 'get_scene_pipelines')
      .then((r: any) => {
        if (alive) setPipelines(r?.pipelines ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [projectId]);

  const toggle = useCallback(
    async (key: string, enabled: boolean) => {
      if (!projectId) return;
      setPipelines((ps) => ps.map((p) => (p.key === key ? { ...p, enabled } : p)));
      try {
        await callOp(projectId, 'set_scene_pipeline', { key, enabled });
      } catch {
        // Revert the optimistic flip on failure.
        setPipelines((ps) =>
          ps.map((p) => (p.key === key ? { ...p, enabled: !enabled } : p)),
        );
      }
    },
    [projectId],
  );

  const enabledKeys = pipelines.filter((p) => p.enabled).map((p) => p.key);
  return { pipelines, toggle, enabledKeys, anyEnabled: enabledKeys.length > 0 };
}

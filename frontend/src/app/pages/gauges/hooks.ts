import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { queries } from '../../queries';
import { rulesRegistry } from './api';

const EMPTY: any[] = [];
const EMPTY_SHARED = {};

/**
 * useGaugeBank — the bindable library as one object: the shared templates + the
 * shared vocab (the static catalogue, fetched once per session) and the author's
 * presets (small, per project). Two cached reads, see `queries.gaugeCatalogue` /
 * `queries.gaugesPresets` (SA-261).
 */
export function useGaugeBank(projectId: any): { templates: any[]; presets: any[]; shared: any } {
  const enabled = !!projectId;
  const { data: catalogue } = useQuery({ ...queries.gaugeCatalogue(projectId), enabled });
  const { data: presets = EMPTY } = useQuery({ ...queries.gaugesPresets(projectId), enabled });
  return useMemo(() => ({
    templates: catalogue?.templates ?? EMPTY,
    presets,
    shared: catalogue?.shared ?? EMPTY_SHARED,
  }), [catalogue, presets]);
}

/**
 * useGaugeRules — the verdict-rule registry (shared.rules / shared.math_rules),
 * normalized. Reads the cached catalogue (TanStack dedupes, so the modals share
 * one fetch). Returns a `{id → {label, family, hint, ordered, status}}` map; `{}`
 * until it loads.
 *
 * NOTE: the per-lens `rules` menu served on each lens is now the primary source
 * for the rule picker; this registry remains the fallback / shared catalogue.
 */
export function useGaugeRules(): Record<string, any> {
  const { projectId } = useParams();
  const { data } = useQuery({ ...queries.gaugeCatalogue(projectId), enabled: !!projectId });
  return rulesRegistry(data?.shared);
}

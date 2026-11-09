import { extensions } from '../extensions';

/**
 * What one run of an AI feature costs, as a short label for the button that
 * runs it ("~1 unit", "free"), or '' when there is nothing to say. The label
 * comes from the extension's `useCostLabel` slot; with no extension it is ''.
 */
const noCost = (_feature: string) => '';
const useCostLabel = extensions.useCostLabel ?? noCost;

export function useActionCost(feature: string): string {
  return useCostLabel(feature);
}

/** "Read my story" + " · <cost>" (or just the verb when there is no cost label). */
export function withCost(verb: string, cost: string): string {
  return cost ? `${verb} · ${cost}` : verb;
}

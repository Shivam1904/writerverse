// Night Eyes model-tier picker copy (agentic core). `id` is the wire value
// the backend's ChatRequestSerializer accepts.
export const NE_TIERS = [
  { id: 'auto', label: 'Auto', hint: 'Night Eyes picks the model per message' },
  { id: 'quick', label: 'Quick', hint: 'Fastest — lookups and small edits' },
  { id: 'standard', label: 'Standard', hint: 'Everyday drafting' },
  { id: 'deep', label: 'Deep', hint: 'Strongest — heavy structural work' },
] as const;

export const NE_TIER_NOTE: Record<string, string> = {
  quick: 'answered with Quick',
  standard: 'answered with Standard',
  deep: 'answered with Deep',
};

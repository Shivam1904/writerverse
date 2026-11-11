/**
 * Lenses — UI config (kind taxonomy). Lens DATA comes from the backend only.
 */

export const KINDS = {
  feeling: {
    label: 'Feeling', color: 'var(--teal)', preview: 'arc',
    catTitle: 'How a feeling rises or falls', catTerm: 'Arc',
    catDesc: 'does something get better or worse as you go?',
  },
  tracking: {
    label: 'Tracking', color: 'var(--terra)', preview: 'track',
    catTitle: 'Keeping track of where things are', catTerm: 'Tracker',
    catDesc: 'people and things, scene by scene',
  },
  'loose-end': {
    label: 'Loose end', color: 'var(--mauve)', preview: 'promise',
    catTitle: 'Did you finish what you started?', catTerm: 'Promise',
    catDesc: 'every hint or setup should pay off',
  },
  'fair-share': {
    label: 'Fair share', color: 'var(--sage)', preview: 'bars',
    catTitle: 'Is everyone getting a fair share?', catTerm: 'Coverage',
    catDesc: 'enough room for each part of the story',
  },
  report: {
    label: 'Report', color: 'var(--clay)', preview: 'report',
    catTitle: 'Find clashes & gaps', catTerm: 'Report',
    catDesc: 'contradictions and continuity slips — a list, not a chart',
  },
};

export const KIND_ORDER = ['feeling', 'tracking', 'loose-end', 'fair-share', 'report'];

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { loadScaffolds } from '../data';

export interface OutlineScaffoldPickerProps {
  onInit: (args: { base_template?: string; acts?: string[] }) => Promise<void>;
}

// Per-scaffold copy. Unknown ids fall back to a neutral kicker + the scaffold's
// own label, so a new preset still renders sensibly without a code change.
export const SCAFFOLD_META: Record<string, { kicker: string; desc: string }> = {
  three_act: {
    kicker: 'Classic',
    desc: 'Three movements — the workhorse.',
  },
  hero_journey: {
    kicker: 'Mythic',
    desc: 'Ordinary world to return — a fuller map.',
  },
};

// Preview-only fallback for the three-act hero so it paints before `scaffolds`
// loads; the real labels from the backend (config `base_scaffold.three_act`)
// replace these the moment they arrive — and match, so there's no flash.
export const THREE_ACT_PREVIEW = ['Act I — Setup', 'Act II — Confrontation', 'Act III — Resolution'];

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export const actMarker = (i: number, total: number) =>
  total <= 4 ? ROMAN[i] ?? String(i + 1) : String(i + 1).padStart(2, '0');

export function useOutlineScaffoldPicker(onInit: OutlineScaffoldPickerProps['onInit']) {
  const { projectId } = useParams();
  const [scaffolds, setScaffolds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [acts, setActs] = useState<string[]>(['']);

  useEffect(() => {
    let alive = true;
    loadScaffolds(projectId).then((s) => {
      if (!alive) return;
      setScaffolds(s);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [projectId]);

  const startBlank = async () => {
    if (busy) return;
    setBusy(true);
    // One act called "Story" — the backend seeds it with a single empty chapter.
    await onInit({ acts: ['Story'] });
  };

  const pickPreset = async (id: string) => {
    if (busy) return;
    setBusy(true);
    await onInit({ base_template: id });
  };

  const createCustom = async () => {
    if (busy) return;
    const names = acts.map((a) => a.trim()).filter(Boolean);
    if (!names.length) return;
    setBusy(true);
    await onInit({ acts: names });
  };

  return {
    scaffolds,
    loading,
    busy,
    acts,
    setActs,
    startBlank,
    pickPreset,
    createCustom,
  };
}

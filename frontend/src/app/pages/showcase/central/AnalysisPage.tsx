import { ScanEye } from 'lucide-react';
import { Button, PageHead, Spark } from '../../../ui';
import { MiniLensCard, FullLensCard, LensChip, InventMini, LibraryDeck } from '../../../modules/lens/LensAtoms';
import '../../../modules/lens/lens.css';
import { type PackLens } from '../../../modules/lens/lensLibrary';

/* The lens accent — the lens module's primary purple (#6d57a6, scoped to
 * .lens-root). Analysis is the lenses workspace, so its margin/header borrow it. */
export const ANALYSIS_COLOR = '#6d57a6';

/* Showcase-only sample cards. The hardcoded lens catalogue (PAGE_PACKS) was
 * deleted 2026-06-24 — real lenses come from the bank. This page just demos the
 * card components, so it carries its own throwaway sample data. */
const LIBRARY_COUNT = 21;
const ALL_LENSES: PackLens[] = [
    { key: 'hero', name: 'Does the Hero Grow?', type: 'arc', walk: 'thread', desc: 'Whether your main character actually changes — from who they were to who they need to become.', templateId: 'does_hero_grow' },
    { key: 'tension', name: 'Tension Curve', type: 'arc', walk: 'thread', desc: 'Whether the pressure builds toward the climax, then releases at the end.', templateId: 'tension_curve' },
    { key: 'energy', name: 'Scene Energy', type: 'map', walk: 'outline', desc: 'How much each scene moves the story — its energy and momentum, scene by scene.', templateId: 'scene_energy' },
    { key: 'skeleton', name: 'Story Skeleton', type: 'checklist', walk: 'outline', desc: 'Whether your story hits the load-bearing beats every shaped story leans on.', templateId: 'story_skeleton' },
    { key: 'loose', name: 'Loose Ends', type: 'payoff', walk: 'outline', desc: 'Whether everything you make a point of setting up actually pays off later.', templateId: 'loose_ends' },
    { key: 'presence', name: 'Where They Show Up', type: 'tracker', walk: 'outline', desc: 'Where this character appears across the story — and where they vanish for too long.', templateId: 'whos_where' },
];

/**
 * AnalysisBody — the Analysis central page: create and list all lenses.
 * Shows the three card sizes as they'd appear in the library:
 *   · chips for quick scanning
 *   · mini cards for the shelf
 *   · full cards for the curated three
 */
export function AnalysisBody() {
    const three = ALL_LENSES.slice(0, 3);
    const _chips = ALL_LENSES.slice(3);

    return (
        <div className="lens-root">
            <PageHead
                eyebrow="Plan · analysis"
                icon={<ScanEye size={22} strokeWidth={1.7} />}
                title="Analysis"
                actions={<Button variant="ai" size="sm"><Spark /> Suggest lenses</Button>}
                className="mb-2"
            />
            <p className="ty-story-body m-0 text-muted-foreground" style={{ fontFamily: 'var(--serif)' }}>
                Every lens is a question Night Eyes can read your prose against — where the
                draft drifts from what you set. Create and browse all the lenses here.
            </p>

            {/* full cards — the curated three */}
            <div className="mt-6">
                <div className="mb-3 flex items-baseline gap-3">
                    <span style={{ fontFamily: 'var(--ai-font)', fontSize: 18, fontWeight: 600, letterSpacing: '-.01em' }}>Lenses</span>
                    <span className="ty-system-caption">ways of reading your story — attach to any thread or walk</span>
                    <span className="flex-1" />
                    <button className="ty-system-label" style={{ border: 0, background: 'transparent', color: 'var(--lens-purple)', fontWeight: 600, padding: '2px 4px' }}>
                        library · {LIBRARY_COUNT} →
                    </button>
                </div>
                <div style={{ borderBottom: '1px solid var(--lens-line-2)', marginBottom: 14 }} />
                <div className="grid grid-cols-3 gap-3">
                    {three.map((l) => <FullLensCard key={l.key} lens={l} attached={false} onToggle={() => {}} />)}
                </div>
                <div className="mt-3 flex gap-3 items-stretch">
                    <div style={{ flex: 1, borderRadius: 14, border: '1px dashed var(--lens-gold-soft)',
                        background: 'linear-gradient(160deg, var(--lens-gold-wash), rgba(247,239,220,.35))', padding: '14px 18px',
                        display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ color: 'var(--lens-gold)', fontSize: 13 }}>✦</span>
                        <span style={{ fontFamily: 'var(--ai-font)', fontSize: 15, fontWeight: 600, color: 'var(--lens-gold)' }}>Ask your own</span>
                        <span className="ty-system-caption" style={{ marginLeft: 2 }}>— Night Eyes shapes it into a lens.</span>
                    </div>
                    <LibraryDeck count={LIBRARY_COUNT - 3} label="more in the library" onClick={() => {}} />
                </div>
            </div>

            {/* mini shelf */}
            <div className="mt-8">
                <div className="mb-1 ty-system-eyebrow">All lenses</div>
                <div className="mt-3 flex flex-wrap gap-3">
                    {ALL_LENSES.map((l) => <MiniLensCard key={l.key} lens={l} onOpen={() => {}} />)}
                    <InventMini />
                </div>
            </div>

            {/* chip strip */}
            <div className="mt-8">
                <div className="mb-2 ty-system-eyebrow">Quick attach</div>
                <div className="flex flex-wrap gap-2">
                    {ALL_LENSES.map((l) => <LensChip key={l.key} lens={l} attached={false} onToggle={() => {}} />)}
                </div>
            </div>
        </div>
    );
}

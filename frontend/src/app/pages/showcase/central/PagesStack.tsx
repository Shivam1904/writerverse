import { useRef } from 'react';
import { Lightbulb, Globe, ScanEye } from 'lucide-react';
import { MarginBlock, MarginOverlay, type MarginItem } from '../../../modules/margin';
import { ASP, HeadingMargin, SectionMargin } from '../panels/shared';
import { WorldBody, WORLD_SECTIONS, WORLD_CARDS } from './WorldPage';
import { FieldListSection } from './FieldListSection';
import { WorldCardGrid } from './WorldCardGrid';
import { ANALYSIS_COLOR } from './AnalysisPage';
import { CharacterIntro, IdentitySection, ArcSection } from './CharacterPage';

/* Margin entries — rendered both in the block gutter (scroll with the section)
 * and by the overlay (park at the gutter edges).
 *   · Page workspaces (Ideas / World) → HeadingMargin: boxed concept glyph (system).
 *   · Story things (world sections, the character & its sections) → SectionMargin:
 *     glossy story icon, STORY heading + SYSTEM subheading. */
const _ideasEntry = (o?: () => void) => (
    <HeadingMargin glyph={<Lightbulb size={16} strokeWidth={1.8} />} label="Ideas" sub="Plan" color={ASP.idea} onClick={o} />
);
const worldEntry = (o?: () => void) => (
    <HeadingMargin glyph={<Globe size={16} strokeWidth={1.8} />} label="World" sub="Plan" color="var(--asp-world)" onClick={o} />
);
const _analysisEntry = (o?: () => void) => (
    <HeadingMargin glyph={<ScanEye size={16} strokeWidth={1.8} />} label="Analysis" sub="Plan" color={ANALYSIS_COLOR} onClick={o} />
);
const sectionEntry = (sec: typeof WORLD_SECTIONS[number], o?: () => void) => (
    <SectionMargin glyph={sec.glyph} color={sec.color} label={sec.label} hint={sec.hint} onClick={o} />
);

/* Character rail entries — all STORY icon types (glossy). */
const personEntry = (o?: () => void) => (
    <SectionMargin glyph="person" color={ASP.char} label="Mara Vance" hint="protagonist" onClick={o} />
);
const identityEntry = (o?: () => void) => (
    <SectionMargin glyph="generic" color={ASP.char} label="Identity" hint="who she is" onClick={o} />
);
const arcEntry = (o?: () => void) => (
    <SectionMargin glyph="generic" color={ASP.char} label="Arc" hint="how she changes" onClick={o} />
);

/**
 * PagesStack — the central panel: Ideas → World (+ its sections) → a Character
 * (+ Identity / Arc), STACKED in one scroll. Every block is a MarginBlock; ONE
 * shared MarginOverlay parks all the heading entries at the gutter edges.
 */
export function PagesStack({ scrollerRef, showGutter = true }: { scrollerRef: React.RefObject<HTMLElement | null>; showGutter?: boolean }) {
    const gutterRef = useRef<HTMLDivElement>(null); // anchors the overlay's gutter column
    const g = (entry: React.ReactNode, ref = false) => (showGutter ? (ref ? <div ref={gutterRef}>{entry}</div> : entry) : null);

    const items: MarginItem[] = [
        // { id: 'ideas', render: (o) => ideasEntry(o) },   // hidden temporarily
        { id: 'world', render: (o) => worldEntry(o) },
        ...WORLD_SECTIONS.map((sec) => ({ id: sec.id, render: (o: () => void) => sectionEntry(sec, o) })),
        // { id: 'analysis', render: (o) => analysisEntry(o) },   // hidden temporarily
        { id: 'character', render: (o) => personEntry(o) },
        { id: 'identity', render: (o) => identityEntry(o) },
        { id: 'arc', render: (o) => arcEntry(o) },
    ];

    return (
        <>
            {/* Ideas — hidden temporarily
            <MarginBlock id="ideas" gutter={g(ideasEntry(), true)}>
                <IdeasBody />
            </MarginBlock>

            <div className="h-10" />
            */}

            <MarginBlock id="world" gutter={g(worldEntry(), true)}>
                <WorldBody />
            </MarginBlock>
            {WORLD_SECTIONS.map((sec) => (
                <MarginBlock key={sec.id} id={sec.id} gutter={g(sectionEntry(sec))} className="mt-7">
                    {sec.id === 'locations' ? (
                        <WorldCardGrid items={WORLD_CARDS.locations} layout="top" addLabel="location" />
                    ) : sec.id === 'items' ? (
                        <WorldCardGrid items={WORLD_CARDS.items} layout="side" addLabel="item" />
                    ) : (
                        <FieldListSection id={sec.id} label={sec.label.toLowerCase()} color={sec.color} items={sec.items} />
                    )}
                </MarginBlock>
            ))}

            <div className="h-10" />

            {/* Analysis — hidden temporarily
            <MarginBlock id="analysis" gutter={g(analysisEntry())}>
                <AnalysisBody />
            </MarginBlock>

            <div className="h-10" />
            */}

            <MarginBlock id="character" gutter={g(personEntry())}>
                <CharacterIntro />
            </MarginBlock>
            <MarginBlock id="identity" gutter={g(identityEntry())} className="mt-7">
                <IdentitySection />
            </MarginBlock>
            <MarginBlock id="arc" gutter={g(arcEntry())} className="mt-7">
                <ArcSection />
            </MarginBlock>

            {showGutter && <MarginOverlay items={items} anchorRef={gutterRef} scrollerRef={scrollerRef} />}
        </>
    );
}

import { Globe } from 'lucide-react';
import { Button, PageHead, Spark } from '../../../ui';

export interface WorldSectionData {
    id: string;
    label: string;
    hint: string;
    glyph: string;   // SectionMark glyph: entity kind or bespoke section shape
    color: string;
    items: string[];
}

/* Picture-card data for the two card-laid sections (Locations / Items). Plain
 * data fed to WorldCardGrid; lives here beside WORLD_SECTIONS so the demo reads
 * in one place. `hasImage` shows the photo-ish fill; otherwise a nameplate/initial. */
export const WORLD_CARDS: Record<string, { name: string; line?: string; from?: string; hasImage?: boolean }[]> = {
    locations: [
        { name: 'The Vault', line: 'A debt-bank beneath the harbour where the dead hold collateral.', hasImage: true },
        { name: 'The Old Pier', line: 'Where the drowned are ferried in at slack tide.', from: 'braindump' },
        { name: 'The mentor’s study', line: 'Lamplit, ledger-walled, one locked drawer.' },
    ],
    items: [
        { name: 'The black ledger', line: 'Lists every debt that outlived its debtor.', hasImage: true },
        { name: 'Her father’s coat', line: 'Too big, salt-stiff, a key sewn in the hem.', from: 'braindump' },
    ],
};

/* The world's section blocks (mirrors KNOWN_SECTIONS on the real world page).
 * Each becomes a MarginBlock in PagesStack: a glossy SectionMark heading in the
 * gutter + a FieldListSection of fields in the body. */
export const WORLD_SECTIONS: WorldSectionData[] = [
    { id: 'locations', label: 'Locations', hint: 'where things happen', glyph: 'location', color: 'var(--asp-locations)', items: ['The Vault', 'The Old Pier', 'The mentor’s study'] },
    { id: 'things', label: 'Things', hint: 'objects that matter', glyph: 'item', color: 'var(--asp-items)', items: ['The black ledger', 'Her father’s coat'] },
    { id: 'rules', label: 'Rules', hint: 'how the world works', glyph: 'rule', color: 'var(--asp-rules)', items: ['The vault only opens for the dead.', 'A debt outlives the debtor.'] },
    { id: 'factions', label: 'Factions', hint: 'groups & powers', glyph: 'faction', color: 'var(--asp-factions)', items: ['The Keepers', 'The Drowned Court'] },
];

/** WorldBody — the page intro (synopsis / metadata hero lives here; wired later).
 *  The section blocks below it are separate MarginBlocks composed in PagesStack. */
export function WorldBody() {
    return (
        <>
            <PageHead
                eyebrow="Plan · world"
                icon={<Globe size={22} strokeWidth={1.7} />}
                title="World"
                actions={<Button variant="ai" size="sm"><Spark /> Suggest</Button>}
                className="mb-3"
            />
            <p className="ty-story-body m-0 text-muted-foreground">
                A drowned city that sells its debts to the dead. The premise, metadata and
                synopsis hero will live here — wired later. Below are the world sections.
            </p>
        </>
    );
}

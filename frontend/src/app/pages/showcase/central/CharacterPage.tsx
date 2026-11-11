import { useState } from 'react';
import { User } from 'lucide-react';
import { Button, PageHead, Spark, Field } from '../../../ui';
import { ASP } from '../panels/shared';
import { FieldListSection } from './FieldListSection';

/** CharacterIntro — the character page header, consistent with our PageHead
 *  (same as Ideas / World), not the bespoke studio header. */
export function CharacterIntro() {
    return (
        <>
            <PageHead
                eyebrow="People · protagonist"
                icon={<User size={22} strokeWidth={1.7} />}
                title="Mara Vance"
                actions={<Button variant="ai" size="sm"><Spark /> Generate</Button>}
                className="mb-2"
            />
            <p className="ty-story-quote m-0 text-muted-foreground">“I don't need to be saved. I need to be right.”</p>
        </>
    );
}

/** IdentitySection — who she is. Labeled fields styled to look more like the
 *  character studio page's arc section (inline, verb-style labels), followed by
 *  an interactive madlibs appearance form example. Some fields are left empty
 *  by default to demonstrate placeholder states. */
export function IdentitySection() {
    const [role, setRole] = useState("Protagonist · daughter of the accused");
    const [appearance, setAppearance] = useState("Lean, restless; her father's coat two sizes too big");
    const [backstory, setBackstory] = useState(""); // Left empty to show placeholder
    const [signature, setSignature] = useState(""); // Left empty to show proposal/placeholder
    const [proposedSig, setProposedSig] = useState<string | null>("Counts doorways before she trusts a room.");

    // Madlibs appearance states
    const [age, setAge] = useState("twenty-four");
    const [gender, setGender] = useState("young woman");
    const [build, setBuild] = useState("lean, wire-thin");
    const [hair, setHair] = useState("dark, wind-tangled");
    const [eyes, setEyes] = useState("grey, scanning");
    const [clothing, setClothing] = useState(""); // Left empty to show madlibs gap placeholder
    const [features, setFeatures] = useState(""); // Left empty to show madlibs gap placeholder

    const lineStyle: React.CSSProperties = {
        fontFamily: 'var(--serif)',
        fontSize: '16px',
        lineHeight: '1.6',
        color: 'var(--ink-2)',
        margin: '6px 0',
        maxWidth: '60ch',
        textWrap: 'pretty',
        display: 'flex',
        alignItems: 'baseline',
    };

    const verbStyle: React.CSSProperties = {
        fontFamily: 'var(--ui)',
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: 'var(--ink-3)',
        marginRight: '8px',
        flexShrink: 0,
        userSelect: 'none',
        minWidth: '96px', // Align verbs neatly
    };

    const madlibLabelStyle: React.CSSProperties = {
        fontFamily: 'var(--ui)',
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.04em',
        color: 'var(--ink-3)',
        userSelect: 'none',
    };

    const proposedSigProps = proposedSig ? {
        value: proposedSig,
        onEdit: (next: string) => setProposedSig(next),
        onAccept: (final: string) => {
            setSignature(final);
            setProposedSig(null);
        },
        onReject: () => setProposedSig(null),
    } : undefined;

    return (
        <div>
            {/* Section Header (Story heading + System subheading) */}
            <div className="mb-4 flex items-baseline gap-1.5 flex-wrap">
                <span className="ty-story-heading text-ink font-semibold">who they are</span>
                <span className="text-ink-3 select-none">—</span>
                <span className="ty-system-caption text-ink-3 uppercase tracking-wider font-semibold">
                    essence, appearance, world, backstory
                </span>
            </div>

            {/* Core Identity Fields styled like Studio's ArcSection */}
            <div className="mb-6">
                <p style={lineStyle}>
                    <span style={verbStyle}>Role</span>
                    <Field inline value={role} onCommit={setRole} placeholder="role in the story" />
                </p>
                <p style={lineStyle}>
                    <span style={verbStyle}>Appearance</span>
                    <Field inline value={appearance} onCommit={setAppearance} placeholder="what they look like" />
                </p>
                <p style={lineStyle}>
                    <span style={verbStyle}>Backstory</span>
                    <Field inline value={backstory} onCommit={setBackstory} placeholder="what happened before" />
                </p>
                <p style={lineStyle}>
                    <span style={verbStyle}>Signature</span>
                    <Field
                        inline
                        value={signature}
                        onCommit={setSignature}
                        placeholder="a key detail or habit"
                        proposed={proposedSigProps}
                    />
                </p>
            </div>

            {/* Madlibs-style Appearance Form Sub-block */}
            <div className="mt-6 pt-5 border-t border-dashed border-line">
                <div className="ty-system-eyebrow mb-3">Appearance (Madlibs style)</div>
                <p className="my-1.5 ty-system-body text-ink-3 font-bold" style={{ lineHeight: '1.9' }}>
                    <span className="ty-story-body text-ink font-bold italic mr-1">Mara Vance</span>
                    <span style={madlibLabelStyle}>is{' '}</span>
                    <Field inline value={age} placeholder="how old?" onCommit={setAge} />, <span style={madlibLabelStyle}>identifying as a{' '}</span>
                    <Field inline value={gender} placeholder="gender?" onCommit={setGender} />, <span style={madlibLabelStyle}>with a{' '}</span>
                    <Field inline value={build} placeholder="build & height?" onCommit={setBuild} /> <span style={madlibLabelStyle}>build.</span>
                </p>
                <p className="my-1.5 ty-system-body text-ink-3 font-bold" style={{ lineHeight: '1.9' }}>
                    <span style={madlibLabelStyle}>She has{' '}</span>
                    <Field inline value={hair} placeholder="hair description?" onCommit={setHair} /> <span style={madlibLabelStyle}>hair and{' '}</span>
                    <Field inline value={eyes} placeholder="eyes description?" onCommit={setEyes} /> <span style={madlibLabelStyle}>eyes.</span>
                </p>
                <p className="my-1.5 ty-system-body text-ink-3 font-bold" style={{ lineHeight: '1.9' }}>
                    <span style={madlibLabelStyle}>Day to day she wears{' '}</span>
                    <Field inline value={clothing} placeholder="everyday clothes?" onCommit={setClothing} />
                    <span style={madlibLabelStyle}>. What stands out is{' '}</span>
                    <Field inline value={features} placeholder="distinctive features?" onCommit={setFeatures} />
                    <span style={madlibLabelStyle}>.</span>
                </p>
            </div>
        </div>
    );
}

const ARC_BEATS = [
    'Refuses to believe her father was guilty.',
    'Forced to trust the mentor to get inside the Vault.',
    'The betrayal in the rain — every lesson turns suspect.',
    'Chooses forgiveness over control.',
];

/** ArcSection — how she changes. Internal want/need/misbelief (verb-style labels)
 *  over the external plot points (a reusable field list). Some fields are left empty
 *  by default to demonstrate placeholder states. */
export function ArcSection() {
    const [wants, setWants] = useState("To clear her father's name");
    const [needs, setNeeds] = useState(""); // Left empty to show placeholder
    const [misbelieves, setMisbelieves] = useState("That control equals safety");

    const lineStyle: React.CSSProperties = {
        fontFamily: 'var(--serif)',
        fontSize: '16px',
        lineHeight: '1.6',
        color: 'var(--ink-2)',
        margin: '6px 0',
        maxWidth: '60ch',
        textWrap: 'pretty',
        display: 'flex',
        alignItems: 'baseline',
    };

    const verbStyle: React.CSSProperties = {
        fontFamily: 'var(--ui)',
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: 'var(--ink-3)',
        marginRight: '8px',
        flexShrink: 0,
        userSelect: 'none',
        minWidth: '96px', // Align verbs neatly matching IdentitySection
    };

    return (
        <div>
            {/* Section Header (Story heading + System subheading) */}
            <div className="mb-4">
                <div className="flex items-baseline gap-1.5 flex-wrap">
                    <div className="ty-story-caption mt-2 text-ink-3 font-semibold">Mara Vance's Arc</div>
                </div>
                <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="ty-system-quote text-ink-3 capitalize font-semibold">give their story a spine</span>
                    <span className="text-ink-3 select-none">—</span>
                    <span className="ty-system-caption text-ink-3 uppercase tracking-wider font-semibold">
                        wants, needs, the lie, the plot
                    </span>
                </div>
            </div>

            {/* Core Arc Fields styled like Studio's ArcSection */}
            <div className="mb-6">
                <p style={lineStyle}>
                    <span style={verbStyle}>Wants</span>
                    <Field inline value={wants} onCommit={setWants} placeholder="what they chase out loud" />
                </p>
                <p style={lineStyle}>
                    <span style={verbStyle}>Needs</span>
                    <Field inline value={needs} onCommit={setNeeds} placeholder="what would actually heal them" />
                </p>
                <p style={lineStyle}>
                    <span style={verbStyle}>Misbelieves</span>
                    <Field inline value={misbelieves} onCommit={setMisbelieves} placeholder="the lie that keeps them stuck" />
                </p>
            </div>
            <div className="mt-4">
                <div className="ty-system-eyebrow mb-1">Plot points</div>
                <FieldListSection id="arc-beats" label="plot points" color={ASP.char} items={ARC_BEATS} />
            </div>
        </div>
    );
}

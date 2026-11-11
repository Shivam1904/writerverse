import { useRef, useState } from 'react';
import { List } from 'lucide-react';
import '../../app.css';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { Button, Spark } from '../../ui';
import { TopBar } from './panels/TopBar';
import { Sidebar } from './panels/Sidebar';
import { RightMargin } from './panels/RightMargin';
import { NightEyes } from './panels/NightEyes';
import { PagesStack } from './central/PagesStack';
import { SHELL_W, useShellLayout, Drawer } from './panels/layout';

/**
 * /demo/showcase-ui-pages — the shell. Regions, left → right:
 *   sidebar (fixed) · [ 2nd-left gutter · central (fills) · 2nd-right rail ] · Night Eyes (fixed)
 *
 * No max-width centering — the central panel STRETCHES to fill all space between
 * the fixed margins, so there's never extra space (e.g. between the rail and
 * Night Eyes). As width shrinks the regions drop — right rail → Night Eyes →
 * left gutter — and each becomes a temporary Drawer (toggle in the top bar).
 * Widths come from SHELL_W (will become user-adjustable + persisted).
 *
 * House rule: NO CSS files — Tailwind / inline / kit classes only.
 */
export default function ShowcaseUIPages() {
    const [section, setSection] = useState('Ideas');
    const [neDocked, setNeDocked] = useState(true);
    const [drawer, setDrawer] = useState<null | 'rail' | 'ne'>(null);
    const scrollerRef = useRef<HTMLDivElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);
    const { showGutter, showNe, showRail } = useShellLayout(bodyRef);

    const neInline = showNe && neDocked;

    const goTo = (label: string) => {
        setSection(label);
        const id = label === 'People' ? 'character' : label.toLowerCase();
        document.getElementById(`wm-block-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <ThemeProvider>
            <div
                className="wv2-root text-foreground"
                style={{
                    gap: 12,
                    padding: 12,
                    background:
                        'radial-gradient(ellipse 120% 85% at 50% -10%, color-mix(in srgb, var(--paper) 45%, var(--surface)) 0%, var(--surface) 62%)',
                }}
            >
                <TopBar
                    actions={
                        <>
                            {!showRail && (
                                <Button variant="ghost" size="icon" title="Page rail" onClick={() => setDrawer('rail')}><List size={15} /></Button>
                            )}
                            {!neInline && (
                                <Button variant="ghost" size="icon" title="Night Eyes" onClick={() => setDrawer('ne')}><Spark style={{ fontSize: 14 }} /></Button>
                            )}
                        </>
                    }
                />

                <div ref={bodyRef} className="flex min-h-0 flex-1 gap-3">
                    <Sidebar active={section} onSelect={goTo} />

                    {/* CENTRAL — the scroller fills all remaining space. The 2nd-left
                        gutter lives inside it (via PagesStack's MarginBlocks); the
                        body stretches to full width. */}
                    <div ref={scrollerRef} className="min-w-0 flex-1 overflow-y-auto">
                        <div
                            className="px-4 pt-1"
                            style={{ ['--wm-gutter' as any]: showGutter ? `${SHELL_W.gutter}px` : '0px', ['--wm-gap' as any]: '20px' }}
                        >
                            <main className="pb-16">
                                <PagesStack scrollerRef={scrollerRef} showGutter={showGutter} />
                            </main>
                        </div>
                    </div>

                    {/* 2nd-right rail — fixed, stuck to Night Eyes. */}
                    {(showRail || false) && (
                        <aside className="shrink-0" style={{ width: SHELL_W.rail }}>
                            <RightMargin />
                        </aside>
                    )}

                    {/* Night Eyes — fixed, far right. PanelRight undocks it. */}
                    {neInline && (
                        <aside className="flex shrink-0" style={{ width: SHELL_W.ne }}>
                            <NightEyes onPanelClick={() => setNeDocked(false)} />
                        </aside>
                    )}
                </div>

                {/* Drawers for collapsed regions. */}
                {drawer === 'rail' && (
                    <Drawer side="right" width={SHELL_W.rail + 24} onClose={() => setDrawer(null)}>
                        <RightMargin />
                    </Drawer>
                )}
                {drawer === 'ne' && (
                    <Drawer side="right" width={SHELL_W.ne + 24} onClose={() => setDrawer(null)}>
                        <NightEyes onPanelClick={() => { setNeDocked(true); setDrawer(null); }} />
                    </Drawer>
                )}
            </div>
        </ThemeProvider>
    );
}

import { ArrowUp, PanelRight } from 'lucide-react';
import { Button, Card, Input, Spark } from '../../../ui';
import { ClickFocus } from './shared';

/** Night Eyes — the AI chat dock. Renders just the panel; the shell places it
 *  inline (far right) or inside a Drawer. `onPanelClick` drives the dock/undock
 *  (or close) button. */
export function NightEyes({ onPanelClick }: { onPanelClick?: () => void }) {
    return (
        <Card variant="container" className="flex h-full w-full flex-col overflow-hidden p-0">
                <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
                    <Spark style={{ fontSize: 18 }} />
                    <div className="min-w-0">
                        <div className="ty-ai-title" style={{ fontSize: 15, lineHeight: 1.1 }}>Night Eyes</div>
                        <div className="ty-system-caption">watching 4 threads</div>
                    </div>
                    <span className="flex-1" />
                    <Button variant="ghost" size="icon" onClick={onPanelClick}><PanelRight size={15} /></Button>
                </div>
                <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
                    <div className="max-w-[85%] self-start rounded-[var(--r-lg)] bg-[var(--surface)] px-3 py-2 shadow-[var(--sh-1)]">
                        <p className="ty-ai-body m-0">Mara's age in Chapter 3 contradicts the timeline you set in the outline. Want me to reconcile it?</p>
                    </div>
                    <div className="max-w-[85%] self-end rounded-[var(--r-lg)] bg-secondary px-3 py-2">
                        <p className="ty-system-body m-0">Yes — keep the outline version.</p>
                    </div>
                    <div className="max-w-[85%] self-start rounded-[var(--r-lg)] bg-[var(--surface)] px-3 py-2 shadow-[var(--sh-1)]">
                        <p className="ty-ai-body m-0">Done. I updated her age in the scene and flagged one more mention to check.</p>
                    </div>
                </div>
                <ClickFocus className="cursor-text border-t border-border p-3">
                    <div className="flex items-center gap-2 rounded-[var(--r-md)] border border-input bg-[var(--surface)] px-2.5 py-1.5">
                        <Input variant="inline" placeholder="Ask Night Eyes…" wrapClassName="flex-1" />
                        <Button variant="primary" size="icon"><ArrowUp size={15} /></Button>
                    </div>
                </ClickFocus>
        </Card>
    );
}

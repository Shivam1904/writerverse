import { List } from 'lucide-react';
import { Card, ContainerHead, Phrase } from '../../../ui';
import { ASP } from './shared';

/** Right margin (2nd-right) — a page-rail container. Renders just the panel; the
 *  shell places it inline (stuck to Night Eyes) or inside a Drawer when collapsed. */
export function RightMargin() {
    return (
        <div className="sticky top-1 w-full pt-1">
            <Card variant="container" className="overflow-hidden p-0">
                <ContainerHead icon={<List size={16} strokeWidth={1.8} />} title="On this page" subtitle="page rail · right margin" />
                <div className="flex flex-col gap-1.5 p-3">
                    <Phrase tags={[{ label: 'Mara', dot: ASP.char }]}>the mentor has been lying the whole time</Phrase>
                    <Phrase tags={[{ label: 'The Vault', dot: ASP.loc }]}>a vault that only opens for the dead</Phrase>
                    <Phrase>open with the funeral, not the murder</Phrase>
                </div>
            </Card>
        </div>
    );
}

import { FileText, Layers, Lightbulb, Globe, Users, ScanEye } from 'lucide-react';
import { Card, NavButton } from '../../../ui';

const NAV = [
    { Icon: Lightbulb, label: 'Ideas' },
    { Icon: Layers, label: 'Threads' },
    { Icon: FileText, label: 'Write' },
    { Icon: Globe, label: 'World' },
    { Icon: ScanEye, label: 'Analysis' },
    { Icon: Users, label: 'People' },
];

/** Sidebar (far left) — the icon nav rail. Drives which central page shows.
 *  Never collapses. */
export function Sidebar({ active, onSelect }: { active: string; onSelect: (label: string) => void }) {
    return (
        <Card variant="container" className="flex w-[76px] shrink-0 flex-col items-center gap-1 bg-[var(--paper)] px-1.5 py-3">
            {NAV.map(({ Icon, label }) => (
                <NavButton
                    key={label}
                    layout="icon"
                    active={active === label}
                    onClick={() => onSelect(label)}
                    icon={<Icon size={19} strokeWidth={1.7} />}
                >
                    {label}
                </NavButton>
            ))}
        </Card>
    );
}

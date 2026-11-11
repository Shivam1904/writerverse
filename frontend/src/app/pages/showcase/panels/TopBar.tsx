import { Card, Label, Spark } from '../../../ui';
import { useThemeStore } from '../../../theme/useThemeStore';
import { THEME_NAMES, THEME_LABELS } from '../../../theme/themes';

function ThemePicker() {
    const themeName = useThemeStore((s) => s.themeName);
    const setTheme = useThemeStore((s) => s.setTheme);
    return (
        <select
            value={themeName}
            onChange={(e) => setTheme(e.target.value)}
            className="h-8 rounded-[var(--r-md)] border border-input bg-[var(--surface)] px-2 font-sans text-[12.5px] text-foreground outline-none focus:border-[var(--terra)]"
        >
            {THEME_NAMES.map((t) => (
                <option key={t} value={t}>{THEME_LABELS[t] ?? t}</option>
            ))}
        </select>
    );
}

/** Top bar — brand + drawer toggles (for collapsed regions) + theme picker. */
export function TopBar({ actions }: { actions?: React.ReactNode }) {
    return (
        <Card variant="container" className="flex shrink-0 items-center gap-3 px-4 py-2.5">
            <Spark style={{ fontSize: 16 }} />
            <span className="font-serif text-[15px] font-semibold text-foreground">UI showcase</span>
            <Label muted className="hidden sm:inline">pages · built from the kit</Label>
            <span className="flex-1" />
            {actions}
            <Label muted>theme</Label>
            <ThemePicker />
        </Card>
    );
}

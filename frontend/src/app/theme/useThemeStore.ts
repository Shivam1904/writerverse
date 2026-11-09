import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_THEME, THEMES, type ThemeToken, type ThemeVars } from './themes';

interface ThemeState {
  themeName: string;
  // Per-token user tweaks layered on top of the chosen template.
  overrides: Partial<Record<ThemeToken, string>>;
  // Decorative toggle: when on, the twinkling ✦ "diamond" shows on every
  // lens medallion.
  diamond: boolean;
  setTheme: (name: string) => void;
  setOverride: (token: ThemeToken, value: string) => void;
  resetToken: (token: ThemeToken) => void;
  resetOverrides: () => void;
  setDiamond: (on: boolean) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      themeName: DEFAULT_THEME,
      overrides: {},
      diamond: true,
      setTheme: (name) => set({ themeName: name }),
      setDiamond: (on) => set({ diamond: on }),
      setOverride: (token, value) =>
        set((s) => ({ overrides: { ...s.overrides, [token]: value } })),
      resetToken: (token) =>
        set((s) => {
          const next = { ...s.overrides };
          delete next[token];
          return { overrides: next };
        }),
      resetOverrides: () => set({ overrides: {} }),
    }),
    { name: 'wv-theme-v3' },
  ),
);

// The effective token map = template values with user overrides layered on top.
export function resolvedVars(
  themeName: string,
  overrides: Partial<Record<ThemeToken, string>>,
): ThemeVars {
  const base = THEMES[themeName] ?? THEMES[DEFAULT_THEME];
  return { ...base, ...overrides };
}

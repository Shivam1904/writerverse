import { useEffect } from 'react';
import { resolvedVars, useThemeStore } from './useThemeStore';

/**
 * Applies the active theme's CSS custom properties (template + user overrides)
 * to <html>, so everything under .wv2-root picks them up. Mirrors the mockup's
 * runtime theme.js, but driven by the persisted zustand store.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const themeName = useThemeStore((s) => s.themeName);
  const overrides = useThemeStore((s) => s.overrides);
  const diamond = useThemeStore((s) => s.diamond);

  useEffect(() => {
    const vars = resolvedVars(themeName, overrides);
    const root = document.documentElement;
    for (const [token, value] of Object.entries(vars)) {
      root.style.setProperty(token, value);
    }
    root.setAttribute('data-wv-theme', themeName);
    root.setAttribute('data-wv-diamond', diamond ? 'on' : 'off');
  }, [themeName, overrides, diamond]);

  return <>{children}</>;
}

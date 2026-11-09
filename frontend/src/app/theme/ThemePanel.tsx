import { RotateCcw, X } from 'lucide-react';
import { THEME_LABELS, THEME_NAMES, THEMES, TOKEN_GROUPS, type ThemeToken } from './themes';
import { resolvedVars, useThemeStore } from './useThemeStore';

/** Theme picker (templates) + per-token tweak panel. */
export function ThemePanel({ onClose }: { onClose: () => void }) {
  const { themeName, overrides, diamond, setTheme, setOverride, resetToken, resetOverrides, setDiamond } =
    useThemeStore();
  const vars = resolvedVars(themeName, overrides);
  const hasOverrides = Object.keys(overrides).length > 0;

  return (
    <div className="wv2-panel-scrim" onClick={onClose}>
      <aside className="wv2-panel" onClick={(e) => e.stopPropagation()}>
        <header className="wv2-panel-head">
          <span>Theme</span>
          <button className="wv2-icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <section className="wv2-panel-section">
          <div className="wv2-panel-label">Template</div>
          <div className="wv2-theme-grid">
            {THEME_NAMES.map((name) => {
              const t = THEMES[name];
              return (
                <button
                  key={name}
                  className={`wv2-theme-swatch${name === themeName ? ' is-active' : ''}`}
                  onClick={() => setTheme(name)}
                >
                  <span className="wv2-swatch-chips">
                    <i style={{ background: t['--canvas'] }} />
                    <i style={{ background: t['--terra'] }} />
                    <i style={{ background: t['--ink'] }} />
                  </span>
                  <span className="wv2-swatch-name">{THEME_LABELS[name] ?? name}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="wv2-panel-section">
          <div className="wv2-toggle-row">
            <div>
              <span className="wv2-panel-label">Pro diamond</span>
              <p className="wv2-toggle-hint">The <span className="wv2-diamond-mark">✦</span> that marks a Pro subscriber — shown on every lens.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={diamond}
              aria-label="Toggle diamond accent"
              className={`wv2-switch${diamond ? ' is-on' : ''}`}
              onClick={() => setDiamond(!diamond)}
            >
              <span className="wv2-switch-knob" />
            </button>
          </div>
        </section>

        <section className="wv2-panel-section">
          <div className="wv2-panel-label-row">
            <span className="wv2-panel-label">Tweak tokens</span>
            {hasOverrides && (
              <button className="wv2-reset-all" onClick={resetOverrides}>
                <RotateCcw size={12} /> Reset all
              </button>
            )}
          </div>

          {TOKEN_GROUPS.map((group) => (
            <div key={group.label} className="wv2-token-group">
              <div className="wv2-token-group-label">{group.label}</div>
              {group.tokens.map((token: ThemeToken) => {
                const overridden = token in overrides;
                return (
                  <label key={token} className="wv2-token-row">
                    <input
                      type="color"
                      value={vars[token]}
                      onChange={(e) => setOverride(token, e.target.value)}
                    />
                    <span className="wv2-token-name">{token}</span>
                    <span className="wv2-token-value">{vars[token]}</span>
                    {overridden && (
                      <button
                        className="wv2-icon-btn wv2-token-reset"
                        onClick={(e) => {
                          e.preventDefault();
                          resetToken(token);
                        }}
                        aria-label={`Reset ${token}`}
                      >
                        <RotateCcw size={12} />
                      </button>
                    )}
                  </label>
                );
              })}
            </div>
          ))}
        </section>
      </aside>
    </div>
  );
}

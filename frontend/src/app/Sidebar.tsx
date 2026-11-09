import { useState, useEffect, useCallback, useRef } from 'react';
import { Palette } from 'lucide-react';
import { NavLink, useParams } from 'react-router-dom';
import type { ComponentType } from 'react';
import { NAV_GROUPS, DEFAULT_SECTION, isVisible, type NavItem, type ShellState } from './nav';
import { CharacterSubList } from './sublists/CharacterRail';
import { ThreadSubList } from './sublists/ThreadRail';
import { Card } from './ui';

/* Nav items that reveal a live entity sub-list when hovered (rail open). The
 * mapped components self-fetch and self-style, so the list stays in sync with
 * that section's page. `countKey` is the shell count that says whether there is
 * anything to list: an empty book opens no popover (wrt-114). */
const SUBLIST_BY_ID: Record<string, { List: ComponentType<{ projectId: string; variant?: 'rail' | 'nav' }>; countKey: string }> = {
  characters: { List: CharacterSubList, countKey: 'characters' },
  'plot-threads': { List: ThreadSubList, countKey: 'threads' },
};

interface SidebarProps {
  projectId: string;
  state: ShellState;
  onOpenTheme: () => void;
}

/* ── nav item row ── */

// Inner content of a nav row — shared by the real row and the hover flyout so
// the flyout is a pixel-exact replica (icon + label). The `wv2-nav-sublabel` is
// the faint caption shown INSIDE the icon tile (under the glyph) while the rail
// is collapsed; it fades out as the drawer opens (CSS), and is hidden in the
// expanded panel + flyout.
function NavItemInner({ item, tier }: { item: NavItem; tier: string }) {
  const Icon = item.icon;
  const iconSize = tier === 'secondary' ? 18 : 20;
  return (
    <>
      <span className="wv2-nav-icon-wrap">
        {Icon ? (
          <Icon size={iconSize} strokeWidth={tier === 'secondary' ? 1.7 : 1.85} className="wv2-nav-icon" />
        ) : (
          <span className="wv2-nav-emoji">{item.emoji}</span>
        )}
        {/* caption lives INSIDE the icon tile (the box), beneath the glyph, so the
            collapsed-rail highlight wraps both. It's absolutely positioned ⇒
            showing/hiding it never changes the tile height. */}
        <span className="wv2-nav-sublabel" aria-hidden="true">{item.label}</span>
      </span>
      <span className="wv2-nav-label">{item.label}</span>
    </>
  );
}

export type FlyoutData = { item: NavItem; tier: string; dimmed: boolean; left: number; top: number };

function NavItemRow({
  item,
  projectId,
  state,
  activeId,
  dimmed,
  onHover,
}: {
  item: NavItem;
  projectId: string;
  state: ShellState;
  activeId: string;
  // The group hasn't met its `enabledWhen` yet — show the row greyed but still
  // clickable (clicking lands on the destination's empty state).
  dimmed?: boolean;
  onHover: (data: FlyoutData | null) => void;
}) {
  if (!isVisible(item.visibleWhen, state)) return null;
  const forceActive = item.id === activeId;
  const tier = item.tier ?? 'primary';

  return (
    <NavLink
      to={`/project/${projectId}/${item.id}`}
      className={({ isActive }) =>
        `wv2-nav-item wv2-nav-item--${tier}${isActive || forceActive ? ' is-active' : ''}${dimmed ? ' is-dimmed' : ''}`
      }
      onMouseEnter={(e) => {
        // anchor the flyout to the row box so the replica lands exactly where
        // the row will sit once the panel expands — same x/y, same width
        const r = e.currentTarget.getBoundingClientRect();
        onHover({ item, tier, dimmed: !!dimmed, left: r.left, top: r.top + r.height / 2 });
      }}
      onMouseLeave={() => onHover(null)}
    >
      <NavItemInner item={item} tier={tier} />
    </NavLink>
  );
}

/* ── sidebar ── */

const PIN_KEY = 'wv2:sidebar-pinned';

export function Sidebar({ projectId, state, onOpenTheme }: SidebarProps) {
  const { section, characterId } = useParams();
  const [pinned, setPinned] = useState<boolean>(() => {
    try { return localStorage.getItem(PIN_KEY) === '1'; } catch { return false; }
  });
  // Hover-intent: the rail only expands after the pointer dwells for ~1s, so a
  // quick move-and-click reaches a page without the rail flying open. It
  // collapses immediately on leave / on click. Pinned overrides the delay.
  const [armed, setArmed] = useState(false);
  // The live sub-list popover: which item it belongs to and the viewport `top`
  // to align it to. Rendered as a fixed panel to the RIGHT of the rail so the
  // main rows never shift (an inline accordion would push them around). Only
  // items in SUBLIST_BY_ID ever open it; siblings clear it on hover.
  const [submenu, setSubmenu] = useState<{ id: string; top: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const HOVER_DELAY = 350;

  const clearHoverTimer = useCallback(() => {
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null; }
  }, []);
  // clear any pending timer on unmount
  useEffect(() => clearHoverTimer, [clearHoverTimer]);

  const handleMouseEnter = useCallback(() => {
    if (pinned) return;
    clearHoverTimer();
    hoverTimer.current = setTimeout(() => setArmed(true), HOVER_DELAY);
  }, [pinned, clearHoverTimer]);

  const handleMouseLeave = useCallback(() => {
    clearHoverTimer();
    setArmed(false);
    setFlyout(null);
    setSubmenu(null);
  }, [clearHoverTimer]);

  // Instant hover flyout (shown while collapsed) — a pixel-exact replica of the
  // hovered row (same background, width, icon+label, position), so when the
  // panel expands behind it nothing shifts. The panel still waits for the dwell.
  const [flyout, setFlyout] = useState<FlyoutData | null>(null);
  const handleItemHover = useCallback((_data: FlyoutData | null) => {
    // Temporarily disabled: no instant preview chip on hover. Only the actual
    // rail opens (after the dwell). To restore the preview, call setFlyout(_data).
    setFlyout(null);
  }, []);

  // The character-detail route has no `:section` param, so treat a present
  // characterId as the characters section. The bare project route redirects
  // to DEFAULT_SECTION, so default there to keep the rail steady.
  const effectiveSection = characterId ? 'characters' : (section ?? DEFAULT_SECTION);
  const activeId = effectiveSection;

  const _togglePin = useCallback(() => {
    clearHoverTimer();
    // pointer is over the rail when toggling; keep it open either way
    setArmed(true);
    setPinned((prev) => {
      const next = !prev;
      try { localStorage.setItem(PIN_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }, [clearHoverTimer]);

  // Collapse the rail the moment a nav target is clicked (the pointer is still
  // over it), and don't let the pending hover timer re-open it — re-open needs
  // a fresh hover. Ignored while pinned.
  const handleNavClick = useCallback((e: React.MouseEvent) => {
    if (pinned) return;
    if ((e.target as HTMLElement).closest('a')) {
      clearHoverTimer();
      setArmed(false);
    }
  }, [pinned, clearHoverTimer]);

  const isOpen = pinned || armed;

  return (
    <>
      <aside
        className={`wv2-sidebar${pinned ? ' is-pinned' : ''}${isOpen ? ' is-open' : ''}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div ref={panelRef}>
          <Card className="wv2-sidebar-panel p-0" >
            <nav className="wv2-nav" onClick={handleNavClick}>
              {/* All section groups always show, split into three divided
                sections (imagine/plan/write). The topbar status switch no
                longer filters which sections live in the rail. */}
              {NAV_GROUPS
                .map((group, idx) => (
                  <div key={group.label}>
                    {idx > 0 && <div className="wv2-nav-divider" />}
                    <div className="wv2-nav-section">
                      <div className="wv2-nav-group">
                        <div className="wv2-nav-group-label">{group.label}</div>
                        {group.items.map((item) => {
                          if (!isVisible(item.visibleWhen, state)) return null;
                          const sub = SUBLIST_BY_ID[item.id];
                          const hasSub = !!sub && (state.counts[sub.countKey] ?? 0) > 0;
                          return (
                            <div
                              key={item.id}
                              // Open this item's sub-list popover on hover; hovering
                              // any non-sub sibling clears it. Capture only the row's
                              // vertical position — the popover's x is the rail's
                              // right edge (so it sits beside the rail, not inline).
                              onMouseEnter={(e) => {
                                const top = e.currentTarget.getBoundingClientRect().top;
                                setSubmenu(hasSub ? { id: item.id, top } : null);
                              }}
                            >
                              <NavItemRow
                                item={item}
                                projectId={projectId}
                                state={state}
                                activeId={activeId}
                                onHover={handleItemHover}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
            </nav>

            <div className="wv2-sidebar-footer">
              <button className="wv2-theme-btn" onClick={onOpenTheme}>
                <Palette size={17} strokeWidth={1.8} />
                <span className="wv2-nav-label">Theme</span>
              </button>
            </div>
          </Card>
        </div>

        {/* hover flyout — a replica of the hovered row (same bg / width / icon /
            label), placed exactly where the row sits when expanded. It stays on
            top THROUGH the expansion (overlapping the real row pixel-for-pixel)
            so there's no hide/show flicker; it only clears on mouse-leave. */}
        {flyout && (
          <div
            className={`wv2-nav-item wv2-nav-item--${flyout.tier} wv2-nav-flyout${flyout.dimmed ? ' is-dimmed' : ''}`}
            style={{ left: flyout.left, top: flyout.top }}
          >
            <NavItemInner item={flyout.item} tier={flyout.tier} />
          </div>
        )}

        {/* live sub-list popover — a fixed panel pinned to the rail's right edge
            (panel left + the expanded rail width, mirroring --rail-expanded),
            aligned to the hovered row's top. It's a child of the <aside>, so the
            rail's onMouseLeave is descendant-aware: sliding the pointer right off
            the rail and into this panel does NOT collapse the rail or close the
            menu — only leaving both does. Surface uses the kit's token utilities
            (same as ui/overlays Popover); no new CSS. */}
        {isOpen && submenu && (() => {
          const SubList = SUBLIST_BY_ID[submenu.id]?.List;
          if (!SubList) return null;
          const left = (panelRef.current?.getBoundingClientRect().left ?? 0) + 276;
          return (
            <div
              // Compact the borrowed nav rows for a sub-menu: shorter height +
              // tighter left padding than the 44px primary items (scoped here via
              // descendant specificity, so the second rail's rows are untouched).
              className="wv2-root fixed z-[60] w-[228px] overflow-y-auto rounded-[var(--r-lg)] border border-border bg-[var(--surface)] p-1 shadow-[var(--sh-3)] [&_.wv2-nav-item]:h-[34px] [&_.wv2-nav-item]:pl-3 [&_.wv2-role-head]:pt-2 [&_.wv2-role-head]:pb-1"
              style={{ left, top: submenu.top, maxHeight: `calc(100vh - ${submenu.top}px - 12px)` }}
            >
              <SubList projectId={projectId} variant="nav" />
            </div>
          );
        })()}
      </aside>
    </>
  );
}

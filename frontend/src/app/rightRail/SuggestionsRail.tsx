/**
 * SuggestionsRail — the hints/notifications list. Originally the bottom half of
 * the right rail; the rail is gone now and this renders INSIDE the Night Eyes
 * drawer (the bottom-bar "review" sheet). Its data comes from the shared
 * useSuggestionsModel hook so the Night Eyes bottom bar can preview the same
 * first hint.
 *
 * Stacked groups (top → bottom):
 *   0. NOTIFICATIONS — active informational pings (archived ones live in the bell).
 *   1. WALK-ALONG HINTS — bespoke cards that run their move IN PLACE.
 *   2. INITIALIZE HINTS — bespoke milestone cards.
 *   3. HINTS — lighter <HintRailCard>s (what-to-do-next 'start' nudges + ambient).
 *
 * Proposals are NOT here anymore — they live in the topbar bell (the universal
 * surface); page surfaces still repaint their own artifacts in place.
 */

import './rightRail.css'; // .wv2-rr-* containers + .wv2-prop-em-* card treatments
import { HintRailCard } from '../modules/hint';
import { NotificationCard } from '../modules/notification';
import { useSuggestionsModel } from './useSuggestionsModel';

// Rail entrance choreography — the delays handed to CSS (`.wv2-enter*` in
// rightRail.css) via the inline --enter-delay custom prop.
const WALK_STEP = 0.18; // s between walk-along cards
const DELAYED_BASE = 2.5; // s pause before the first non-walk hint
const DELAYED_STEP = 0.5; // s between each subsequent hint
const NOTIF_STEP = 0.08; // s between notification cards
const enterDelay = (s: number) => ({ ['--enter-delay' as any]: `${s}s` });

export function SuggestionsRail() {
  const {
    hints,
    initzHints,
    walkHints,
    notifs,
    archiveNotif,
  } = useSuggestionsModel();

  const showNotifs = notifs.length > 0;
  const showHints = hints.length > 0;
  const showInitz = initzHints.length > 0;
  const showWalk = walkHints.length > 0;

  // Nothing to suggest — rest instead of leaving a blank column: a dimmed,
  // slowly breathing ✦ + a calm line.
  if (!showHints && !showInitz && !showWalk && !showNotifs) {
    return (
      <section className="wv2-rr-sug wv2-rr-rest" aria-label="Suggestions">
        <div className="wv2-rr-rest-inner wv2-enter wv2-enter-slow">
          <span className="wv2-rr-rest-spark" aria-hidden="true">✦</span>
          <p className="wv2-rr-rest-head">All quiet</p>
          <p className="wv2-rr-rest-sub">
            Nothing needs you here right now — keep going, and I'll surface anything worth a
            look.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="wv2-rr-sug" aria-label="Suggestions">
      {showNotifs && (
        <div className="wv2-rr-notif-list" aria-label="Notifications">
          {notifs.map((n, i) => (
            <div key={n.id} className="wv2-enter wv2-enter-pop" style={enterDelay(i * NOTIF_STEP)}>
              <NotificationCard n={n} onArchive={archiveNotif} />
            </div>
          ))}
        </div>
      )}

      {showWalk && (
        <div className="wv2-rr-walk-list" aria-label="Suggested next move">
          {walkHints.map((h, i) => (
            <div key={h.id} className="wv2-enter wv2-enter-slow" style={enterDelay(i * WALK_STEP)}>
              <h.Card />
            </div>
          ))}
        </div>
      )}

      {showInitz && (
        <div className="wv2-rr-initz-list" aria-label="Get started">
          {initzHints.map((h, i) => (
            <div
              key={h.id}
              className="wv2-enter wv2-enter-delayed"
              style={enterDelay(DELAYED_BASE + i * DELAYED_STEP)}
            >
              <h.Card />
            </div>
          ))}
        </div>
      )}

      {showHints && (
        <div className="wv2-rr-hint-list" aria-label="Hints">
          {hints.map((h, i) => (
            <div
              key={h.id}
              className="wv2-enter wv2-enter-delayed"
              style={enterDelay(DELAYED_BASE + (initzHints.length + i) * DELAYED_STEP)}
            >
              <HintRailCard hint={h} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

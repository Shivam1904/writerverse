/* Margin library — reusable gutter-block + off-screen overlay.
 *
 * ── Vocabulary (one entry, three presentations) ──────────────────────────────
 *   · traveler    — the live copy that rides ALONG with its section heading as you
 *                   scroll (the in-flow gutter entry). Only the traveler may carry
 *                   rich detail (subheadings etc.); it's the one you're "at".
 *   · top dock    — when a section has scrolled off ABOVE, its marker parks
 *                   (docks) at the top of the rail: a compact label, no detail.
 *   · bottom dock — same, for sections still BELOW: parked at the rail's bottom.
 *   The two docks are "the gutter ones above and below"; the traveler is "the
 *   moving one". Exactly one of the three is visible per entry at any scroll
 *   position — they swap the instant the traveler coincides with a dock, so the
 *   heading appears to glide into its parked slot with no jump.
 *
 * ── Usage (per page) ─────────────────────────────────────────────────────────
 *   1. Write your own entry component. Give it a rich and a compact form if you
 *      want the traveler to show more than the docks.
 *   2. Wrap each section — its `gutter` IS the TRAVELER (render the rich form):
 *        <MarginBlock id={x.id} gutter={<MyEntry rich …/>}>{body}</MarginBlock>
 *   3. Put ONE overlay on the page, fed the same entries in DOCK (compact) form —
 *      `render` produces a docked copy:
 *        <MarginOverlay items={list.map(x => ({ id: x.id, render: s => <MyEntry compact onClick={s}/> }))} anchorRef={…} />
 *
 * The library owns only the layout + off-screen stacking (the traveler ⇄ dock
 * swap). Each page owns its entry's UI — see margin.css for the mechanism. */
export { MarginOverlay, type MarginItem } from './MarginOverlay';
export { MarginBlock } from './MarginBlock';

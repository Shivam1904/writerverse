/** An author-facing notification (informational ping). `Notification` is a DOM
 *  global, so this is named `AppNotification`. */
export interface AppNotification {
  id: number;
  title?: string;
  /** markdown — bold / headings / bullets etc. */
  content: string;
  /** where a click navigates: a section slug ("characters", "outline" — may
   *  carry params like "characters/22") or a full path ("/project/9/..."). */
  target_url?: string;
  /** picks the card glyph — a section slug or a kind slug (see slugs.ts). */
  slug?: string;
  status: 'active' | 'archived';
  created_at?: string;
}

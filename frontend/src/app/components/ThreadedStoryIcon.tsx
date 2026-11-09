import { GlossyStoryIcon, type StoryIconKey } from './StoryIconsRegistry';

export interface ThreadedStoryIconProps {
  /** The main glyph (any story icon). */
  iconKey: StoryIconKey;
  /** Main glyph colour. Default = character blue. */
  color?: string;
  /** Thread badge colour. Default = the thread aspect colour. */
  threadColor?: string;
  /** Rendered px (square) of the main glyph. */
  size?: number;
  title?: string;
  className?: string;
}

/**
 * Any main glyph with a small glossy thread badge overlaid bottom-right.
 * Both colours are independently choosable.
 */
export function ThreadedStoryIcon({
  iconKey,
  color = '#4a72b0',
  threadColor = '#6a6a72',
  size = 22,
  title,
  className,
}: ThreadedStoryIconProps) {
  const main = Math.round(size * 0.82);
  const badge = Math.round(size * 0.72);
  return (
    <span
      className={`relative inline-flex shrink-0 ${className ?? ''}`}
      style={{ width: size, height: size }}
    >
      <GlossyStoryIcon iconKey={iconKey} color={color} size={main} title={title} className="absolute top-0 left-0" />
      <GlossyStoryIcon
        iconKey="thread"
        color={threadColor}
        size={badge}
        className="absolute bottom-0 right-0 translate-x-[14%] translate-y-[14%]"
      />
    </span>
  );
}

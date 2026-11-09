// app shadcn-based kit. Import the token bridge once here so every
// consumer of the kit gets the shadcn → theme aliases.
import './tokens.css';
import './kit.css';
import './typography.css';

export { Button, buttonVariants, type ButtonProps, AiDiamond, type AiDiamondProps, NavButton, type NavButtonProps } from './button';
export { Chip, chipVariants, type ChipProps, Badge, type BadgeProps, Swatch, type SwatchProps } from './chip';
export { Popover, Dialog, Tooltip, type TooltipProps, TooltipProvider, withTooltip } from './overlays';
export { ColorSwatches, ColorDotPicker } from './color-picker';
export { Phrase, PhraseParagraph, type PhraseTag } from './phrase';
export { BeatList, type Beat, type BeatKind } from './beat-list';
export { BeatMarker, type BeatMarkerKind, type BeatMarkerForm, type BeatMarkerContent } from './beat-marker';
export { BeatField, type BeatFieldProps } from './beat-field';
export { Field, type FieldProposal } from './form-field';
export { Input, type InputProps, Textarea, type TextareaProps } from './input';
export { Card, cardVariants, type CardProps, CardHead } from './card';
export { ContainerHead, RailHead, PageHead } from './heads';
export { Heading, type HeadingProps, SectionHeading, Eyebrow, Label } from './typography';
export { Spark, Kbd, Spinner, DragHandle, EntityDot, Progress } from './marks';
export { Icon, ICON_STROKE, type IconProps, type IconWeight } from './icon';
export { BrandMark } from './BrandMark';
export { Segmented, type SegmentedOption, Toggle, PinToggle, Checkbox } from './controls';

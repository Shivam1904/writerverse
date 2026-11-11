import { useRef } from 'react';
import { ArrowUp } from 'lucide-react';
import { Button, Input, Spark, Kbd, Card } from '../../../ui';
import { ClickFocus } from '../../showcase/panels/shared';
import { braindumpsCopy } from '../../../../config/braindumps';
import { useIdeaDraft } from '../useIdeaDraft';

export function ChatInput({
  placeholder,
  onSubmit,
  variant,
  draftKey,
}: {
  placeholder: string;
  onSubmit?: (body: string) => Promise<boolean | void> | boolean | void;
  variant?: 'composer';
  /** Keep unsent text on this device under this key (see useIdeaDraft). */
  draftKey?: string;
}) {
  const { text: value, setText: setValue, clear } = useIdeaDraft(draftKey);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit() {
    const trimmed = value.trim();
    if (!trimmed || !onSubmit) return;
    const ok = await onSubmit(trimmed);
    if (ok !== false) {
      clear();
      inputRef.current?.focus();
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  const hasText = !!value.trim();

  // If this is the composer variant, style it exactly like the showcase ideas composer.
  // Otherwise, use a standard layout but styled with Shadcn elements.
  if (variant === 'composer') {
    return (
      // Pinned composer: the sticky band carries an opaque page-coloured
      // background (Card variant="inner" is bg-transparent app-wide, so we make
      // the wrapper the occluder) so scrolling idea cards don't bleed through.
      // Flush to the scroll top + a soft elevation shadow = the standard pinned
      // header pattern.
      <ClickFocus className="sticky top-0 z-10 mb-2.5 cursor-text bg-[var(--surface)] rounded-xl shadow-[var(--sh-1)]">
        <Card variant="inner" className="p-3">
          <div className="flex items-center gap-2">
            <Input
              ref={inputRef}
              variant="inline"
              serif
              placeholder={placeholder}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={onKeyDown}
              wrapClassName="flex-1 text-base"
            />
            <Button
              variant="primary"
              size="icon"
              disabled={!hasText}
              onClick={() => void submit()}
            >
              <ArrowUp size={15} />
            </Button>
          </div>
          <div className="mt-2 flex items-center gap-2 border-t pt-2">
            <Spark style={{ fontSize: 12 }} />
            <span className="ty-system-caption">{braindumpsCopy.taggingHint}</span>
            <span className="flex-1" />
            <span className="flex items-center gap-1">
              <Kbd>⌘</Kbd>
              <Kbd>↵</Kbd>
            </span>
          </div>
        </Card>
      </ClickFocus>
    );
  }

  // Fallback/standard styling (e.g. at the bottom of canvas view) updated to match style principles
  return (
    <ClickFocus className="p-3">
      <Card
        variant="inner"
        className="max-w-[760px] mx-auto flex items-center gap-2 p-2"
      >
        <Input
          ref={inputRef}
          variant="inline"
          serif
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          wrapClassName="flex-1 text-sm"
        />
        <Button
          variant="primary"
          size="icon"
          disabled={!hasText}
          onClick={() => void submit()}
        >
          <ArrowUp size={15} />
        </Button>
      </Card>
    </ClickFocus>
  );
}

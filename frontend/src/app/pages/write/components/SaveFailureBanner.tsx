import { Button } from '../../../ui';

// Page-level alert while any scene's save is failing. Stays up until a save
// lands (the scene's status leaves 'error'), so a failure can't go unnoticed
// the way the small per-scene label could.
export function SaveFailureBanner({
  sceneNames,
  onRetry,
}: {
  sceneNames: string[];
  onRetry: () => void;
}) {
  if (sceneNames.length === 0) return null;
  const named = sceneNames.map((n) => `"${n}"`).join(', ');
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 border-b border-[var(--clay)] bg-[var(--clay)]/10 px-4 py-2 text-[13px] text-[var(--ink)]"
    >
      <span>
        Couldn’t save {named}. Your words are still here. Don’t close this tab
        until the save goes through.
      </span>
      <Button size="xs" variant="secondary" onClick={onRetry}>
        Retry now
      </Button>
    </div>
  );
}

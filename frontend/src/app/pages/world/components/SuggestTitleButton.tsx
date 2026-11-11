import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Spark } from '../../../ui';
import { callOp } from '../../../gateway';
import { useActionCost, withCost } from '../../../lib/actionCost';
import { problem } from '../../../modules/receipt/receiptStore';

export const NEEDS_SYNOPSIS = 'Write a synopsis first, then the AI can suggest a title.';

/**
 * "Suggest a title" — the AI names the book only when the author clicks
 * (wrt-104). Runs the free `generate_title` with `from_project`, so the
 * server builds the request from the synopsis + the author's ideas. The
 * suggestion fills the title; the author can edit it like any title.
 */
export function SuggestTitleButton({ hasSynopsis, onTitle }: {
  /** The server needs a synopsis to work from; without one a click says so. */
  hasSynopsis: boolean;
  onTitle: (title: string) => void;
}) {
  const { projectId } = useParams();
  const cost = useActionCost('generate_title');
  const [busy, setBusy] = useState(false);

  const suggest = async () => {
    if (!projectId || busy) return;
    if (!hasSynopsis) { problem(NEEDS_SYNOPSIS); return; }
    setBusy(true);
    try {
      const res: any = await callOp(projectId, 'generate_title', { from_project: true });
      const title = String(res?.title ?? '').trim();
      if (title) onTitle(title);
    } catch {
      // The gateway already shows a red note for a failed call.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="ai"
      size="xs"
      onClick={suggest}
      disabled={busy}
      tooltip={hasSynopsis
        ? 'The AI suggests a title from your synopsis and ideas. You can change it after.'
        : NEEDS_SYNOPSIS}
    >
      <Spark /> {busy ? 'Thinking…' : withCost('Suggest a title', cost)}
    </Button>
  );
}

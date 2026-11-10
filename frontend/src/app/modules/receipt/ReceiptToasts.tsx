import { useNavigate } from 'react-router-dom';
import { Card } from '../../ui/card';
import { useProblemStore, useReceiptStore } from './receiptStore';

/**
 * Work-receipt toasts — renders the `✦ what → where` sentences from the
 * receipt store ("Receipt" in docs/product/glossary.md), plus red problem toasts
 * for failed writes (stay until dismissed). Mounted once in the
 * shell. Visuals come from the kit Card; only
 * layout lives here.
 */
export function ReceiptToasts() {
  const receipts = useReceiptStore((s) => s.receipts);
  const remove = useReceiptStore((s) => s.remove);
  const problems = useProblemStore((s) => s.problems);
  const removeProblem = useProblemStore((s) => s.remove);
  const navigate = useNavigate();
  if (!receipts.length && !problems.length) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-1.5">
      {problems.map((p) => (
        <Card key={p.id} variant="problem" role="alert" className="flex items-center gap-2 !p-2 !px-3">
          <span className="ty-system-caption">{p.what}</span>
          <button
            type="button"
            aria-label="Dismiss"
            className="ty-system-caption"
            onClick={() => removeProblem(p.id)}
          >
            ✕
          </button>
        </Card>
      ))}
      {receipts.map((r) => (
        <Card key={r.id} variant="item" className="flex items-center gap-1.5 !p-2 !px-3">
          {/* ✦ marks AI work; an Undo toast follows the author's own delete. */}
          {!r.undo && <span aria-hidden="true">✦</span>}
          <span className="ty-system-caption">{r.what}</span>
          {r.where && (
            <>
              <span aria-hidden="true">→</span>
              {r.href ? (
                <button
                  type="button"
                  className="ty-system-caption underline underline-offset-2"
                  onClick={() => { navigate(r.href!); remove(r.id); }}
                >
                  {r.where}
                </button>
              ) : (
                <span className="ty-system-caption">{r.where}</span>
              )}
            </>
          )}
          {r.undo && (
            <>
              <span aria-hidden="true">—</span>
              <button
                type="button"
                className="ty-system-caption underline underline-offset-2"
                onClick={() => { r.undo!(); remove(r.id); }}
              >
                Undo
              </button>
            </>
          )}
        </Card>
      ))}
    </div>
  );
}

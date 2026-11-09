import { Button, Heading, Spinner } from '../ui';
import type { LoadStatus } from '../lib/loadStatus';

// Shown in place of a page when its first load failed (backend down, network
// gone). A failed load must never fall through to the empty / first-run screen:
// that tells the author their book is gone and invites them to start over.
export function LoadError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-16 text-center">
      <Heading as="h2" size="section">Couldn’t load {what}</Heading>
      <p className="text-[13px] text-muted-foreground">
        We couldn’t reach the server. Your work is safe; this is a connection
        problem, not missing data.
      </p>
      <Button size="sm" variant="secondary" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

// Stands in for a page whose main query is not ready yet (see lib/loadStatus):
// a spinner while the first load is in flight, LoadError if it failed.
//
//   const status = loadStatus(query);
//   if (status !== 'ready') return <LoadState status={status} what="your outline" onRetry={query.refetch} />;
export function LoadState({ status, what, onRetry }: {
  status: Exclude<LoadStatus, 'ready'>;
  what: string;
  onRetry: () => void;
}) {
  if (status === 'error') return <LoadError what={what} onRetry={onRetry} />;
  return <PageLoading />;
}

// The page-sized spinner: a page's first data load, and the Suspense fallback
// while a lazily loaded page's code downloads (see lib/lazyNamed).
export function PageLoading() {
  return (
    <div className="mx-auto flex justify-center py-16">
      <Spinner />
    </div>
  );
}

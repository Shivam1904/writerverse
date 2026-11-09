import { lazy, type ComponentType } from 'react';
import { withChunkReload } from './chunkReload';

/**
 * React.lazy for a module's NAMED export. React.lazy only understands default
 * exports; our pages use named ones (`export function WorldPage`), so this maps
 * the chosen export onto `default`. Each call becomes its own build chunk,
 * downloaded the first time the page renders. Render it inside <Suspense>.
 * If that file is gone after a deploy, the page reloads once (chunkReload.ts).
 *
 *   const WorldPage = lazyNamed(() => import('./world/WorldPage'), 'WorldPage');
 */
export function lazyNamed<M extends Record<K, ComponentType<any>>, K extends keyof M & string>(
  load: () => Promise<M>,
  name: K,
) {
  return lazy(withChunkReload(() => load().then((m) => ({ default: m[name] }))));
}

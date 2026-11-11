import type { ComponentType } from 'react';
import { lazyNamed } from '../lib/lazyNamed';

/**
 * Built section pages, keyed by nav item id (see ../nav.ts).
 * As we build pages one by one, add the page here; sections not listed fall
 * back to <Placeholder>.
 *
 * Every page is lazy: its code is a separate build chunk, downloaded the first
 * time the author opens that section. ProjectShell renders the page inside
 * <Suspense fallback={<PageLoading />}>.
 */
export const BUILT_PAGES: Record<string, ComponentType> = {
  'chapters-old': lazyNamed(() => import('./write/WritePage'), 'WritePage'),
  'chapters': lazyNamed(() => import('./write/v2/ChaptersV2Page'), 'ChaptersV2Page'),
  characters: lazyNamed(() => import('./characters/CharactersPage'), 'CharactersPage'),
  braindumps: lazyNamed(() => import('./braindumps/BraindumpsPage'), 'BraindumpsPage'),
  'plot-threads': lazyNamed(() => import('./threads/ThreadsPage'), 'ThreadsPage'),
  'outline': lazyNamed(() => import('./outline/OutlinePage'), 'OutlinePage'),
  world: lazyNamed(() => import('./world/WorldPage'), 'WorldPage'),
  gauges: lazyNamed(() => import('./gauges/GaugesPage'), 'GaugesPage'),
  lens: lazyNamed(() => import('./gauges/LensDetailPage'), 'LensDetailPage'),
  walks: lazyNamed(() => import('./walks/WalksPage'), 'WalksPage'),
  preview: lazyNamed(() => import('./preview/PreviewPage'), 'PreviewPage'),
  merge: lazyNamed(() => import('./merge/MergePage'), 'MergePage'),
};

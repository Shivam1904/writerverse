import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { chapterDocsKey, loadChapterDocs } from './data';
import { useWriteStore } from './writeStore';

// The open chapter's prose. The Write page loads the book's structure without
// prose (a series can be 1M+ words) and fetches prose one chapter at a time:
// one query per chapter (chapterDocsKey). Every answer goes into the write
// store (applyChapterDocs), which keeps text the author is typing.
export function useChapterDocs(projectId: string | undefined, chapterId: any) {
  const cid = chapterId == null ? '' : String(chapterId);
  const query = useQuery({
    queryKey: chapterDocsKey(projectId ?? '', cid),
    queryFn: () => loadChapterDocs(projectId!, cid),
    enabled: !!projectId && !!cid,
  });
  const applyChapterDocs = useWriteStore((s) => s.applyChapterDocs);
  const docs = query.data;
  // True while a scene this answer covers has no prose in the store (first
  // load, or a page reload cleared the store while the answer sat in cache).
  const missing = useWriteStore((s) =>
    !!docs && docs.scenes.some((sc) => s.contentById[sc.id as any] === undefined),
  );

  useEffect(() => {
    if (docs) applyChapterDocs(docs.scenes, docs.fetchedAt);
  }, [docs, missing, applyChapterDocs]);

  return {
    failed: query.isError && !docs,
    retry: () => void query.refetch(),
  };
}

/** A scene's prose for the editor, or undefined while it is still loading.
 * Never fall back to an empty doc for a saved scene: the author could type into
 * it and the save would replace the real prose. */
export function sceneDoc(
  contentById: Record<number, any>,
  scene: { id: any; content?: any },
) {
  return contentById[scene.id] ?? scene.content;
}

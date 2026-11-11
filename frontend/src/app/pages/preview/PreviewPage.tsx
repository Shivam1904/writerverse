import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { BookOpen } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { LoadError } from '../../components/LoadError';
import { Button, Icon, Spinner } from '../../ui';
import {
  EMPTY_WRITE,
  chapterDocsKey,
  loadChapterDocs,
  loadWriteData,
  type ChapterDocs,
  type WriteData,
} from '../write/data';
import { readableBlocks, type ProseNode } from './prose';
import { ProseBlocks } from './ProseBlocks';

/**
 * Preview — read the manuscript back as a finished book.
 *
 * A series can be 1M+ words, so Preview never downloads the whole book. It
 * reads the lean outline (structure + word counts, no prose), then fetches
 * prose ONE CHAPTER AT A TIME (get_chapter_docs, the same per-chapter query the
 * Write page uses): the first chapters up front, the next one when the reader
 * nears the end of what's loaded.
 *
 * Chapters whose scenes have no saved words are skipped without a request.
 * Each scene's TipTap prose is rendered with its formatting (`readableBlocks` +
 * ProseBlocks); pending AI suggestions are not the author's yet, so they're
 * left out, and a chapter left with nothing readable is hidden too. The empty
 * state appears only when there's genuinely nothing written yet.
 */

/** How many chapters with prose to fetch before the reader scrolls. */
export const FIRST_CHAPTERS = 2;

type ReadScene = { id: string; title: string; blocks: ProseNode[] };

function readScenes(
  scenes: { id: unknown; text: string }[],
  docs: ChapterDocs,
): ReadScene[] {
  const byId = new Map(docs.scenes.map((sc) => [String(sc.id), sc.content]));
  return scenes
    .map((sc) => ({
      id: String(sc.id),
      title: sc.text,
      blocks: readableBlocks(byId.get(String(sc.id)) ?? undefined),
    }))
    .filter((sc) => sc.blocks.length > 0);
}

export function PreviewPage() {
  const { projectId } = useParams();
  const [data, setData] = useState<WriteData>(EMPTY_WRITE);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [wanted, setWanted] = useState(FIRST_CHAPTERS);
  const endRef = useRef<HTMLDivElement>(null);
  // Parsed scenes per chapter, so a chapter is parsed once when its prose
  // arrives, not again on every render as the reader scrolls. Keyed on the
  // query's answer; reused while the chapter's outline scenes are unchanged.
  const parsed = useRef(new WeakMap<ChapterDocs, { from: unknown; scenes: ReadScene[] }>());

  useEffect(() => {
    let live = true;
    setLoading(true);
    setFailed(false);
    setWanted(FIRST_CHAPTERS);
    // Structure only (no prose): the prose comes per chapter below.
    loadWriteData(projectId).then((res) => {
      if (!live) return;
      setData(res.data);
      setLoading(false);
    }).catch(() => {
      // Not "Nothing to preview yet" — the manuscript just didn't load (SA-132).
      if (live) { setFailed(true); setLoading(false); }
    });
    return () => {
      live = false;
    };
  }, [projectId, reloadKey]);

  // Only chapters with saved words can have prose to read (the server counts
  // words on every prose save), so the rest never cost a request.
  const withWords = data.chapters.filter((ch) => ch.scenes.some((sc) => (sc.words ?? 0) > 0));
  const toLoad = withWords.slice(0, wanted);

  const docs = useQueries({
    queries: toLoad.map((ch) => ({
      queryKey: chapterDocsKey(projectId ?? '', String(ch.id)),
      queryFn: () => loadChapterDocs(projectId!, String(ch.id)),
      enabled: !!projectId,
    })),
  });

  // Render in book order, stopping at the first chapter still on its way, so a
  // later chapter never shows up above a gap.
  const shown: { ch: (typeof withWords)[number]; scenes: ReadScene[] | null; retry: () => void }[] = [];
  let waiting = false;
  for (let i = 0; i < toLoad.length; i++) {
    const q = docs[i];
    if (q?.data) {
      let hit = parsed.current.get(q.data);
      if (!hit || hit.from !== toLoad[i].scenes) {
        hit = { from: toLoad[i].scenes, scenes: readScenes(toLoad[i].scenes, q.data) };
        parsed.current.set(q.data, hit);
      }
      const { scenes } = hit;
      if (scenes.length) shown.push({ ch: toLoad[i], scenes, retry: () => {} });
    } else if (q?.isError) {
      shown.push({ ch: toLoad[i], scenes: null, retry: () => void q.refetch() });
    } else {
      waiting = true;
      break;
    }
  }
  const more = !waiting && wanted < withWords.length;
  const keepReading = () => setWanted((w) => w + 1);

  // Fetch the next chapter as the reader nears the end of what's loaded. The
  // observer is rebuilt after each load, so if the end is still in view (a
  // short chapter, or one that was all pending AI) the next one follows.
  useEffect(() => {
    const el = endRef.current;
    if (!more || !el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setWanted((w) => w + 1);
      },
      { rootMargin: '800px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [more, wanted]);

  const nothingToRead = withWords.length === 0 || (!more && !waiting && shown.length === 0);

  return (
    <div className="wv2-page">
      <div className="wv2-page-main">
        <PageHeader
          section="preview"
          eyebrow="Write · preview"
          title="Preview"
          caption="Read your manuscript back as a finished book."
        />

        {loading ? null : failed ? (
          <LoadError what="your manuscript" onRetry={() => setReloadKey((k) => k + 1)} />
        ) : nothingToRead ? (
          <div className="mt-12 flex flex-col items-center gap-4 text-center">
            <span
              className="flex h-16 w-16 items-center justify-center rounded-[var(--r-xl)]"
              style={{ background: 'color-mix(in srgb, var(--terra) 8%, transparent)', color: 'var(--terra)' }}
            >
              <Icon as={BookOpen} size={28} weight="init" />
            </span>
            <div className="flex max-w-md flex-col gap-1.5">
              <span className="ty-story-heading" style={{ color: 'var(--ink)' }}>Nothing to preview yet</span>
              <span className="ty-system-body" style={{ color: 'var(--ink-3)' }}>
                Write some scenes in the Manuscript and they'll appear here, laid out as a
                finished book.
              </span>
            </div>
          </div>
        ) : (
          <div className="mx-auto mt-10 flex max-w-2xl flex-col gap-14">
            {shown.map(({ ch, scenes, retry }) => (
              <section key={ch.id} className="flex flex-col gap-5">
                <span className="ty-story-heading" style={{ color: 'var(--ink)' }}>
                  {ch.text?.trim() || `Chapter ${ch.number}`}
                </span>
                {scenes === null ? (
                  <LoadError what="this chapter" onRetry={retry} />
                ) : (
                  <div className="flex flex-col gap-8">
                    {scenes.map((sc) => (
                      <div key={sc.id} className="ty-story-body flex flex-col gap-3">
                        {scenes.length > 1 && sc.title?.trim() ? (
                          <span className="ty-story-caption" style={{ color: 'var(--ink-3)' }}>
                            {sc.title}
                          </span>
                        ) : null}
                        <ProseBlocks blocks={sc.blocks} />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ))}
            <div ref={endRef} className="flex justify-center pb-10">
              {waiting ? (
                <Spinner />
              ) : more ? (
                <Button variant="ghost" onClick={keepReading}>Keep reading</Button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

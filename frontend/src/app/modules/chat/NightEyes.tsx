import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import './night-eyes.css';
import { queries } from '../../queries';
import { useChatStore } from './useChatStore';
import {
  streamChat, fetchFrame, answerPing, fetchThreads, fetchThreadMessages,
  type ChatEvent, type ThreadSummary,
} from './streamClient';
import { callOp } from '../../gateway';
import { assistantLockup } from '../../../config/lexicon';
import { NE_TIERS, NE_TIER_NOTE } from '../../../config/nightEyes';
import { Segmented } from '../../components/PageHeader';
import { handleDispatchInvalidates } from '../../queryInvalidator';
import { useCountsRecord } from '../../useCounts';
import { collectLiveHints, HintRailCard } from '../hint';
import { useProposalStore, makeProposalHandlers } from '../proposal';
import { syncPendingProposals } from './syncPendingProposals';
import { buildPageContext } from './pageContext';
import { useCurrentSceneId } from '../../pages/write/currentScene';
import { SuggestionsRail } from '../../rightRail/SuggestionsRail';
import { useSuggestionsModel, type SuggestionsModel } from '../../rightRail/useSuggestionsModel';

// Night Eyes — the floating reader companion + the home for hints.
// The shell: orb ⇄ float/dock, header, thread, thinking trace, quick chips,
// walking toast. Below the composer sits the HINTS layer: a bottom
// <SuggestionsBar> previews a hint + a running count, and clicking it opens a
// drawer that renders the full <SuggestionsRail> (hints + notifications).
// Proposals no longer surface here — they live in the topbar bell now. When NE
// makes an edit it still records the proposal event and shows a lightweight
// "in your bell" reference inline in the conversation.

const QUICK_CHIPS = [
  'What should I work on next?',
  'Find contradictions',
  'Summarise what I have so far',
];

const PAGE_LABELS: Record<string, string> = {
  characters: 'Characters', world: 'World', braindumps: 'Braindumps',
  'plot-threads': 'Threads', threads: 'Threads', outline: 'Outline',
  write: 'Write', gauges: 'Gauges', 'story-so-far': 'Story so far',
  'character-studio': 'Studio',
};
const pageLabel = (p: string) => PAGE_LABELS[p] ?? (p ? p[0].toUpperCase() + p.slice(1) : 'Story');

// How long Night Eyes must sit quiet (no new message) before the bottom bar may
// surface a hint preview instead of resting on the count.
const IDLE_HINT_MS = 30_000;

// Composer auto-grow ceiling — at least 6 rows (line-height 1.5 × 13px + padding,
// with headroom for per-browser line-box rounding) before it starts scrolling.
// Kept in sync with `max-height` in night-eyes.css.
const INPUT_MAX_H = 126;

// Message ids are stamped `u-<ms>` / `a-<ms>` by the chat store — recover the ms.
const msgTs = (id: string): number => {
  const n = Number(String(id).split('-')[1]);
  return Number.isFinite(n) ? n : 0;
};

export function NightEyes({ page }: { page: string }) {
  const { projectId, characterId } = useParams();
  // Live presence counts — same source the suggestions rail reads, so the hints
  // we hand Night Eyes match the cards actually on screen. (`page` IS the section
  // slug here, the axis the hint `when` predicates key on.)
  const { counts, loaded: countsLoaded } = useCountsRecord(projectId);
  const {
    isOpen, isStreaming, messages, threadId, attachment, seed, mode, unread, tier,
    open, close, newThread, ensureProject, setAttachment, setSeed, toggleDock, loadThread,
    addUser, startAssistant, appendToken,
    addToolCall, addToolResult, addProposal, addNote,
    complete, fail, setThreadId, setTier,
  } = useChatStore();

  const [input, setInput] = useState('');
  const [walking, setWalking] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [chips, setChips] = useState<string[]>(QUICK_CHIPS);
  const [ping, setPing] = useState<{ question: string; options: string[] } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [historyQuery, setHistoryQuery] = useState('');
  const [actionError, setActionError] = useState<{ proposalId: number; message: string } | null>(null);
  // Ticks every few seconds while open so the bottom bar can notice when the
  // conversation has gone quiet long enough to surface a hint.
  const [nowTick, setNowTick] = useState(() => Date.now());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const prevPage = useRef(page);

  const pushToast = useProposalStore((s) => s.push);
  const removeToast = useProposalStore((s) => s.remove);

  // The suggestions list — proposals (global store) + hints — page-aware, shared
  // with <SuggestionsRail> (rendered in the drawer below). The right rail is gone;
  // these now live in this panel: the bar previews the first item, the drawer
  // shows the full list.
  const sug = useSuggestionsModel();

  // Timing for the bottom bar (see the bar render below): a hint previews only
  // once the conversation has been idle for a while.
  const lastActivityTime = useMemo(
    () => (messages.length ? Math.max(...messages.map((m) => msgTs(m.id))) : 0),
    [messages],
  );
  const idle = isOpen && !isStreaming && nowTick - lastActivityTime > IDLE_HINT_MS;

  const filteredThreads = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    const list = q
      ? threads.filter((t) => (t.title || '').toLowerCase().includes(q))
      : threads;
    return [...list].sort((a, b) =>
      (b.last_message_at || '').localeCompare(a.last_message_at || ''));
  }, [threads, historyQuery]);

  // Bind the conversation to the current project. If the persisted chat belongs
  // to a different project (or none yet), this resets to a fresh thread so we
  // never surface another project's conversation. useLayoutEffect runs before
  // paint, so the wrong chat never flashes. Past chats stay in the history drawer.
  useLayoutEffect(() => {
    if (projectId) ensureProject(projectId);
  }, [projectId]);

  // Keep `nowTick` advancing while the panel is open so the bar can notice when
  // the conversation has been idle long enough to surface a hint.
  useEffect(() => {
    if (!isOpen) return;
    const t = setInterval(() => setNowTick(Date.now()), 5_000);
    return () => clearInterval(t);
  }, [isOpen]);

  // "Walking with you" — on a page change mid-conversation, flash a toast.
  useEffect(() => {
    if (prevPage.current === page) return;
    const had = useChatStore.getState().messages.length > 0;
    prevPage.current = page;
    if (!had) return;
    setWalking(pageLabel(page));
    const t = setTimeout(() => setWalking(null), 2600);
    return () => clearTimeout(t);
  }, [page]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isOpen]);

  // A caller (e.g. a World-page hint) can pre-load the composer with a starter
  // prompt and pop the panel open by setting `seed` in the store. Copy it into
  // the input once, then clear it so it fires only on the next request.
  useEffect(() => {
    if (seed == null) return;
    setInput(seed);
    setSeed(null);
    requestAnimationFrame(() => taRef.current?.focus());
  }, [seed]);

  // Keep the composer ready to type: focus it when the panel opens and when a
  // surface ping wants an answer. The textarea stays enabled while Night Eyes is
  // streaming (you can draft your next message; only sending is held), so we keep
  // focus during streaming too. Skip while an overlay (history / suggestions
  // drawer) owns the screen so we don't yank focus from its search box.
  useEffect(() => {
    if (!isOpen || historyOpen || drawerOpen) return;
    const id = requestAnimationFrame(() => taRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [isOpen, isStreaming, ping, historyOpen, drawerOpen]);

  // Auto-grow the composer to fit its content, up to ~6 rows, then scroll.
  // Runs on every input change — typed, cleared after send, or pre-loaded via
  // `seed` — so the height always matches the text (and collapses back on clear).
  // useLayoutEffect sizes before paint, avoiding a one-frame height pop.
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, INPUT_MAX_H)}px`;
  }, [input, isOpen]);

  // Per-page quick chips from the frame config (chat_frames.yml → /frame/).
  // Placeholder chips like "How does {name} connect…" need page-entity context
  // the global shell doesn't have, so drop them; fall back to the defaults.
  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    fetchFrame(projectId, page).then((frame) => {
      if (!alive) return;
      const real = (frame?.quick_actions ?? []).filter((c) => !c.includes('{'));
      setChips(real.length ? real : QUICK_CHIPS);
    });
    return () => { alive = false; };
  }, [projectId, page]);

  // On the character studio (/characters/:id) Night Eyes is told WHICH character
  // the author is looking at, so "this character" / its arc threads resolve
  // without them naming it. We inject {character_id, character_name} into the
  // turn context; the `character-studio` frame interpolates {character_name}.
  // Resolved from the same characters cache the studio page reads (gated to the
  // studio page so it doesn't fetch elsewhere). Analogue of `chapters`/scene_id.
  const isStudio = page === 'character-studio';
  const { data: charData } = useQuery({
    ...queries.characters(projectId),
    enabled: !!projectId && isStudio,
    staleTime: 60_000,
  });
  // On the Write page: the open chapter (?chap=) and the current scene, by the
  // same rule the page's margin highlight uses (pages/write/currentScene.ts).
  const [searchParams] = useSearchParams();
  const chap = searchParams.get('chap');
  const sceneId = useCurrentSceneId();
  const pageContext = useMemo<Record<string, any>>(() => {
    const c = isStudio
      ? (charData as any)?.characters?.find((x: any) => String(x.id) === String(characterId))
      : null;
    return buildPageContext({ page, chap, sceneId, character: c ?? null });
  }, [page, isStudio, charData, characterId, chap, sceneId]);

  // Past conversations for the history drawer (+ the header count). Refetched
  // when the panel opens, the drawer opens, or the active thread changes.
  useEffect(() => {
    if (!projectId || !isOpen) return;
    let alive = true;
    fetchThreads(projectId).then((t) => { if (alive) setThreads(t); });
    return () => { alive = false; };
  }, [projectId, isOpen, historyOpen, threadId]);

  // Declared before the early return: hooks must run on every render (rules-of-hooks).
  const [hovered, setHovered] = useState(false);
  if (!projectId) return null;

  const consumeStream = async (
    asstId: string,
    runner: (onEvent: (e: ChatEvent) => void) => Promise<void>,
  ): Promise<boolean> => {
    let errored = false;
    try {
      await runner((ev) => {
        if (ev.type === 'thread' && typeof ev.data === 'string') {
          setThreadId(ev.data);
        } else if (ev.type === 'token') {
          appendToken(asstId, ev.data);
        } else if (ev.type === 'tool_call') {
          if (typeof ev.data === 'string') addToolCall(asstId, ev.data);
          else addToolCall(asstId, ev.data?.name ?? '', ev.data?.args);
        } else if (ev.type === 'tool_result') {
          addToolResult(asstId, ev.data?.name ?? '', ev.data?.preview ?? '');
        } else if (ev.type === 'proposal') {
          addProposal(asstId, ev.data);
          const preview = ev.data?.proposal?.preview;
          const capability = String(ev.data?.capability || '');
          const proposalId = Number(ev.data?.proposal_id);
          if (capability && proposalId) {
            pushToast({
              proposalId,
              capability,
              result: preview || ev.data?.args || {},
              // Shared handlers: a failed accept keeps the card (Retry), and a
              // stale accept (author edited the target since) shows the
              // Use AI's / Keep mine choice on the card (SA-209).
              ...makeProposalHandlers(proposalId, (cap, extra) =>
                callOp(projectId, cap, { proposal_id: String(proposalId), ...extra }, page)),
            });
          }
        } else if (ev.type === 'ping') {
          setPing({
            question: ev.data?.question ?? '',
            options: Array.isArray(ev.data?.options) ? ev.data.options : [],
          });
        } else if (ev.type === 'invalidates') {
          handleDispatchInvalidates(projectId, ev.data as string[]);
        } else if (ev.type === 'done') {
          const t = ev.data?.tier;
          // Only annotate under Auto — that's when the author doesn't already
          // know which model answered. A manual pin is self-evident, so no note.
          if (t && NE_TIER_NOTE[t] && useChatStore.getState().tier === 'auto') {
            addNote(asstId, NE_TIER_NOTE[t]);
          }
          complete(asstId);
        } else if (ev.type === 'error') {
          fail(asstId, String(ev.data));
          errored = true;
        }
      });
      if (!errored) complete(asstId);
    } catch (err: any) {
      fail(asstId, err?.message ?? 'stream error');
      errored = true;
    }
    // The turn may have created a proposal the stream never announced (e.g. it
    // errored after the write). Re-read pending rows so the bell shows it now.
    syncPendingProposals(projectId).catch(() => {}); // a failed refetch just waits for the next turn
    return errored;
  };

  const onAnswerPing = async (text: string) => {
    const answer = (text ?? '').trim();
    if (!answer || !threadId || isStreaming) return;
    setPing(null);
    setInput('');
    addUser(answer);
    const asstId = startAssistant();
    await consumeStream(asstId, (onEvent) =>
      answerPing({ projectId, threadId, answer, page, context: pageContext, onEvent }),
    );
  };

  const onSend = async (raw?: string) => {
    if (ping) { void onAnswerPing(raw ?? input); return; }
    const typed = (raw ?? input).trim();
    const attach = attachment;
    if ((!typed && !attach) || isStreaming) return;
    // Fold any "Ask Night Eyes" passage into the message (no backend change).
    const question = typed || 'What do you make of this passage?';
    const msg = attach ? `${question}\n\n> "${attach}"` : question;
    setInput('');
    setAttachment(null);
    addUser(msg);
    const asstId = startAssistant();
    // Hidden context: the side-rail hint cards on screen RIGHT NOW, so Night Eyes
    // stays aligned with them instead of re-pitching cards the author already has.
    // Skipped until counts load (a half-loaded store would emit stale empty-state
    // nudges). Rides with the turn; never part of the user's message text.
    const liveHints = countsLoaded ? collectLiveHints({ section: page, counts }) : [];
    await consumeStream(asstId, (onEvent) =>
      streamChat({ projectId, message: msg, threadId, page, tier, context: { ...pageContext, live_hints: liveHints }, onEvent }),
    );
  };

  // Retry for the chat's "Accept failed" banner. Proposal cards use the shared
  // makeProposalHandlers (set when the proposal is pushed above).
  const onAccept = async (proposalId: number) => {
    setActionError(null);
    removeToast(proposalId);
    try {
      await callOp(projectId, 'accept_proposal', { proposal_id: String(proposalId) }, page);
    } catch {
      setActionError({ proposalId, message: 'Accept failed' });
    }
  };

  // Open a past conversation from the history drawer: point the live thread at
  // it and pull its transcript from the backend checkpointer so the panel shows
  // the actual messages instead of a blank slate. Close the drawer right away;
  // show a loading row while the fetch is in flight. On failure the thread just
  // opens empty (and can still be continued).
  const openThread = async (tid: string) => {
    if (isStreaming) return;
    setHistoryOpen(false);
    loadThread(tid, []);
    setThreadLoading(true);
    try {
      const msgs = await fetchThreadMessages(projectId, tid);
      loadThread(tid, msgs);
    } finally {
      setThreadLoading(false);
    }
  };

  const walkingToast = walking ? (
    <div className="ne-walking" role="status">
      <span className="ne-walking-eye">✦</span>
      <span>Walking with you to <b>{walking}</b> · <i>still reading along</i></span>
    </div>
  ) : null;

  if (!isOpen) {
    return (
      <>
        {/* {walkingToast} */}
        {/* Minimized: the orb at the bottom + a petite edge strip rising from it
            to the top. Both live inside .ne-edge, which carries the single
            drop-shadow so the strip and orb read as one extruded object. The
            wrapper is click-through (pointer-events:none); only the two buttons
            inside are interactive. */}
        <div className="ne-edge cursor-pointer" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
          onClick={open} aria-label="Open Night Eyes">
          <button className={`ne-orb ${hovered ? 'ne-orb--hovered' : ''}`} type="button">
            <span className="ne-orb-eye" />
            <span className={`ne-orb-lbl`}>
              Night Eyes
              <small>{orbSubtitle(unread)}</small>
            </span>
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {walkingToast}
      <aside className={`transition-all rounded-[var(--r-lg)] bg-[var(--container)] ne-panel${mode === 'dock' ? ' ne-dock' : ''}`} aria-label="Night Eyes">
        <header className="ne-head" onClick={close} title="Minimize" role="button">
          <div className="ne-avatar" />
          <div className="ne-meta">
            <div className="ne-name">
              {assistantLockup('The Reader')}
              <span className="ne-page-chip"><span className="dot" />{pageLabel(page)}</span>
            </div>
            <div className="ne-status">
              <span>{isStreaming ? 'reading…' : 'reading along'}</span>
            </div>
          </div>
          <div className="ne-acts" onClick={(e) => e.stopPropagation()}>
            <button
              className="ne-iconbtn ne-iconbtn--new" type="button" title="Start a new conversation"
              onClick={newThread} disabled={isStreaming}
            >
              <svg viewBox="0 0 24 24"><path d="M16 3.5a2.1 2.1 0 0 1 3 3L9 16.5l-4 1 1-4z" /></svg>
            </button>
            <button
              className="ne-iconbtn ne-iconbtn--history" type="button" title="Past conversations"
              onClick={() => setHistoryOpen(true)}
            >
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
              {threads.length > 0 && <span className="ne-count">{threads.length}</span>}
            </button>
            <div className="ne-winctl">
              <button
                className="ne-iconbtn" type="button"
                title={mode === 'dock' ? 'Float' : 'Dock to the side'} onClick={toggleDock}
              >
                <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></svg>
              </button>
            </div>
          </div>
        </header>

        <SuggestionsBar
          sug={sug}
          showHint={idle && !ping}
          onOpen={() => setDrawerOpen(true)}
        />

        <div className="ne-thread" ref={scrollRef}>
          {threadLoading ? (
            <div className="ne-tool-running"><span className="ne-spin" />loading conversation…</div>
          ) : messages.length === 0 ? (
            <div className="ne-greet">
              <div className="ne-greet-glyph">✦</div>
              <h3>I'm reading along.</h3>
              <p>Ask anything about your story, or pick a thread from the chips below.</p>
            </div>
          ) : (
            messages.map((m) => <Message key={m.id} m={m} />)
          )}
        </div>

        {!ping && (
          <div className="flex items-center justify-end px-3 pt-1">
            <Segmented
              value={tier}
              onChange={(v) => setTier(v as any)}
              ariaLabel="Model tier"
              options={NE_TIERS.map((t) => ({ value: t.id, label: t.label, title: t.hint }))}
            />
          </div>
        )}

        {!ping && (
          <div className="ne-quick">
            {chips.map((c) => (
              <button
                key={c} className="ne-qchip" type="button"
                disabled={isStreaming}
                onClick={() => { setInput(c); taRef.current?.focus(); }}
              >
                <span className="gl">✦</span>{c}
              </button>
            ))}
          </div>
        )}

        {ping && (
          <div className="ne-ping">
            <div className="ne-ping-head">
              <span className="gl">✦</span>
              <span>quick question</span>
              <span className="ne-ping-dots">paused</span>
            </div>
            <div className="ne-ping-q">{ping.question}</div>
            {ping.options.length > 0 && (
              <div className="ne-ping-options">
                {ping.options.map((opt, i) => (
                  <button
                    key={i} className="ne-ping-opt" type="button"
                    disabled={isStreaming}
                    onClick={() => void onAnswerPing(opt)}
                  >
                    <span className="ne-ping-key">{i + 1}</span>
                    <span>{opt}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="ne-ping-foot">
              <span className="ne-ping-typehint">or type your answer below</span>
            </div>
          </div>
        )}

        {actionError && (
          <div className="ne-action-error" role="alert">
            <span className="ne-action-error-icon">⚠</span>
            <span className="ne-action-error-msg">Action failed, retry or ignore?</span>
            <div className="ne-action-error-acts">
              <button
                className="ne-action-error-btn" type="button"
                onClick={() => { setActionError(null); onAccept(actionError.proposalId); }}
              >Retry</button>
              <button
                className="ne-action-error-btn dismiss" type="button"
                onClick={() => setActionError(null)}
              >Dismiss</button>
            </div>
          </div>
        )}

        <div className="ne-input-wrap">
          {attachment && (
            <div className="ne-input-sel">
              <span className="ne-input-sel-lbl">attached</span>
              <span className="ne-input-sel-text">{attachment}</span>
              <button
                className="ne-input-sel-x" type="button" aria-label="Remove attachment"
                onClick={() => setAttachment(null)}
              >×</button>
            </div>
          )}
          <div className="ne-input">
            <textarea
              ref={taRef} rows={1}
              placeholder={ping ? 'type your answer…' : 'ask Night Eyes about your story…'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void onSend();
                }
              }}
            />
            <button
              className={`ne-input-send${isStreaming ? ' is-working' : ''}`} type="button"
              title={isStreaming ? 'Night Eyes is reading… hold on' : 'Send'}
              onClick={() => void onSend()} disabled={isStreaming || (!input.trim() && !attachment)}
            >
              {isStreaming
                ? <span className="ne-spin" aria-hidden />
                : <svg viewBox="0 0 24 24"><path d="M12 19V5" /><path d="M5 12l7-7 7 7" /></svg>}
            </button>
          </div>
          <div className="ne-input-hint">
            <span><kbd>↵</kbd> send <kbd>⇧↵</kbd> newline</span>
          </div>
        </div>

        {historyOpen && (
          <div className="ne-history">
            <div className="ne-history-head">
              <button
                className="ne-history-back" type="button" aria-label="Back to conversation"
                onClick={() => setHistoryOpen(false)}
              >
                <svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6" /></svg>
              </button>
              <div className="ne-history-title">Past conversations</div>
              <div className="ne-history-count">{threads.length}</div>
            </div>
            <div className="ne-history-search">
              <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6" /><path d="M20 20l-4-4" /></svg>
              <input
                type="text" placeholder="search threads…"
                value={historyQuery} onChange={(e) => setHistoryQuery(e.target.value)}
              />
            </div>
            <div className="ne-history-list">
              {groupThreads(filteredThreads).map((group) => (
                <Fragment key={group.label}>
                  <div className="ne-history-day">{group.label}</div>
                  {group.items.map((t) => (
                    <button
                      key={t.thread_id}
                      className={`ne-history-row${t.thread_id === threadId ? ' active' : ''}`}
                      type="button"
                      onClick={() => void openThread(t.thread_id)}
                    >
                      <div className="ne-h-title">{t.title || 'Untitled conversation'}</div>
                      <div className="ne-h-meta">
                        <span className="ne-h-page">{pageLabel(t.page)}</span>
                      </div>
                      <span className="ne-h-time">{relTime(t.last_message_at)}</span>
                    </button>
                  ))}
                </Fragment>
              ))}
              {filteredThreads.length === 0 && (
                <div className="ne-history-empty">
                  {historyQuery ? 'No conversations match.' : 'No past conversations yet.'}
                </div>
              )}
            </div>
          </div>
        )}
      </aside>
      {drawerOpen && (
        <>
          <div className="ne-sheet-backdrop" onClick={() => setDrawerOpen(false)} />
          <aside className="ne-sheet ne-sheet--suggestions" aria-label="Suggestions">
            <header className="ne-sheet-head">
              <div className="ne-sheet-meta">
                <div className="ne-sheet-kind">
                  <span className="ne-sheet-stat">
                    {sug.hintCount} hint{sug.hintCount === 1 ? '' : 's'}
                  </span>
                </div>
                <h2 className="ne-sheet-title">Suggestions</h2>
                <p className="ne-sheet-sub">What to look at next — pending proposals live in the bell up top.</p>
              </div>
              <button className="ne-sheet-close" type="button" aria-label="Close" onClick={() => setDrawerOpen(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </header>
            <div className="ne-sheet-body ne-sheet-body--suggestions">
              <SuggestionsRail />
            </div>
          </aside>
        </>
      )}
    </>
  );
}

/* ── Bottom suggestions bar ──────────────────────────────────────────────────
 * Above the composer: a count of hints, plus an inline preview of one hint once
 * the conversation has gone idle. Otherwise it minimizes to just the count.
 * Clicking the count opens the drawer (the full hints + notifications list).
 * Proposals live in the topbar bell now — they no longer surface here. */
function SuggestionsBar({
  sug,
  showHint,
  onOpen,
}: {
  sug: SuggestionsModel;
  showHint: boolean;
  onOpen: () => void;
}) {
  const total = sug.hintCount;
  if (total === 0) return null;

  // Hint to preview when idle: walk-along, else initialize (both carry their
  // own <Card>), else a plain what-to-do-next card.
  const walk = sug.walkHints[0];
  const initz = sug.initzHints[0];
  const plainHint = sug.hints[0];
  const preview = showHint
    ? (walk ? <walk.Card /> : initz ? <initz.Card /> : plainHint ? <HintRailCard hint={plainHint} /> : null)
    : null;

  return (
    <div className={`ne-sugbar${preview ? ' is-open' : ''}`}>
      {preview && <div className="ne-sugbar-preview">{preview}</div>}
      <button className="ne-sugbar-count" type="button" onClick={onOpen}>
        <span className="ne-sugbar-dots">
          {Array.from({ length: Math.min(4, Math.max(1, total)) }).map((_, i) => (
            <span key={i} className="ne-sugbar-dot" />
          ))}
        </span>
        <span className="ne-sugbar-lbl">
          <b>{sug.hintCount} hint{sug.hintCount === 1 ? '' : 's'}</b>
        </span>
        <span className="ne-sugbar-act">{preview ? 'see all' : 'review'}</span>
        <span className="ne-sugbar-chev">→</span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- helpers

// Index of the bracket that closes the one opened at `start`, or -1 if the span
// never balances (e.g. a half-streamed, incomplete blob). String-aware so
// brackets inside JSON string values don't throw off the depth count.
function matchBalanced(text: string, start: number): number {
  const open = text[start];
  if (open !== '[' && open !== '{') return -1;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// Strip embedded JSON blobs from an assistant message so only the prose shows.
// Night Eyes sometimes pastes a raw tool payload (a JSON array/object) inline
// with its reply — the author should never see that. We scan for balanced
// `[...]` / `{...}` spans that JSON.parse cleanly into an array/object and drop
// them, keeping the surrounding prose. Conservative: a span that doesn't parse
// (ordinary prose with a stray brace, or a half-streamed blob) is left intact.
export function stripJsonBlobs(text: string): string {
  if (!text || (!text.includes('[') && !text.includes('{'))) return text;
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '[' || ch === '{') {
      const end = matchBalanced(text, i);
      if (end > i) {
        const span = text.slice(i, end + 1);
        try {
          const parsed = JSON.parse(span);
          if (parsed !== null && typeof parsed === 'object') {
            i = end + 1; // drop the blob, keep scanning
            continue;
          }
        } catch {
          // not valid JSON — fall through and keep the character
        }
      }
    }
    out += ch;
    i += 1;
  }
  return out.trim();
}

function Message({ m }: { m: any }) {
  if (m.role === 'user') {
    return (
      <div className="ne-msg user">
        <div className="ne-bubble">{m.content}</div>
      </div>
    );
  }

  const events: any[] = m.events ?? [];
  const toolEvents = events.filter((e) => e.kind === 'tool_call' || e.kind === 'tool_result');
  const notes = events.filter((e) => e.kind === 'note');
  const proposals = events.filter((e) => e.kind === 'proposal');
  const streaming = m.status === 'streaming';

  const failed = m.status === 'error';
  if (failed && !m.content) {
    return <div className="ne-msg-error">⚠ {m.error || 'failed'}</div>;
  }

  return (
    <div className="ne-msg assistant">
      {toolEvents.length > 0 && <ThinkingTrace events={toolEvents} streaming={streaming} />}
      {streaming && !m.content && toolEvents.length === 0 && (
        <div className="ne-tool-running"><span className="ne-spin" />reading…</div>
      )}
      {m.content && (
        <div className="ne-body">
          <ReactMarkdown>{stripJsonBlobs(m.content)}</ReactMarkdown>
          {streaming && <span className="ne-caret" />}
        </div>
      )}
      {/* Lightweight reference — the full accept/reject card lives in the topbar
          bell now. Each proposal NE made this turn leaves a quiet inline marker
          so the conversation still signals an action is waiting. */}
      {proposals.map((_e, i) => (
        <div key={`p-${i}`} className="ne-note">✦ Proposal ready — review in your bell ↗</div>
      ))}
      {notes.map((e, i) => (
        <div key={`n-${i}`} className="ne-note">{e.data}</div>
      ))}
      {/* Text streamed, then the turn failed (e.g. the AI call was refused mid-turn). */}
      {failed && <div className="ne-msg-error">⚠ {m.error || 'failed'}</div>}
    </div>
  );
}

interface Step { name: string; args: any; tail?: string; result?: string; }

function fmtResult(raw: string): string {
  if (!raw) return '';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function ThinkingTrace({ events, streaming }: { events: any[]; streaming: boolean }) {
  const [open, setOpen] = useState(false);
  const [openSteps, setOpenSteps] = useState<Set<number>>(new Set());
  const steps: Step[] = [];
  for (const e of events) {
    if (e.kind === 'tool_call') {
      const name = typeof e.data === 'string' ? e.data : e.data?.name ?? '';
      const args = typeof e.data === 'string' ? null : e.data?.args;
      steps.push({ name, args });
    } else if (e.kind === 'tool_result') {
      const name = e.data?.name;
      const last = [...steps].reverse().find((s) => s.name === name && s.result === undefined);
      if (last) {
        const preview = e.data?.preview ?? '';
        last.result = preview;
        last.tail = preview.slice(0, 52);
      }
    }
  }
  const label = streaming && steps.length
    ? `Reading · ${steps.length} step${steps.length === 1 ? '' : 's'}`
    : `Thought for ${steps.length} step${steps.length === 1 ? '' : 's'}`;

  const toggleStep = (i: number) =>
    setOpenSteps((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className={`ne-steps${open ? ' open' : ''}`}>
      <div className="ne-steps-head" onClick={() => setOpen((v) => !v)}>
        <span className="ne-think-ic">✦</span>
        <span>{label}</span>
        <span className="ne-think-chev">›</span>
      </div>
      {open && (
        <div className="ne-steps-body">
          {steps.map((s, i) => {
            const stepOpen = openSteps.has(i);
            const hasResult = !!s.result;
            return (
              <div key={i} className={`ne-step${hasResult ? ' ne-step--expandable' : ''}${stepOpen ? ' ne-step--open' : ''}`}>
                <div
                  className="ne-step-row"
                  onClick={hasResult ? () => toggleStep(i) : undefined}
                  style={hasResult ? { cursor: 'pointer' } : undefined}
                >
                  <span className="ne-step-ic">
                    <svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
                  </span>
                  <span className="ne-step-name">{s.name}</span>
                  {firstArg(s.args) && <span className="ne-step-arg">{firstArg(s.args)}</span>}
                  {!stepOpen && s.tail && (
                    <span className="ne-step-tail">
                      {s.tail}{s.result && s.result.length > 52 ? '…' : ''}
                    </span>
                  )}
                  {hasResult && (
                    <span className="ne-step-chev">{stepOpen ? '▾' : '▸'}</span>
                  )}
                </div>
                {stepOpen && s.result && (
                  <pre className="ne-step-result">{fmtResult(s.result)}</pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Compact one-line label for a tool-call's first argument, shown in the
// thinking trace. (Restored — an in-flight edit dropped this definition but
// left its call site in <ThinkingTrace>.)
function firstArg(args: any): string {
  if (!args || typeof args !== 'object') return '';
  const first = Object.values(args)[0];
  if (first == null) return '';
  const s = typeof first === 'string' ? first : JSON.stringify(first);
  return s.length > 24 ? `${s.slice(0, 24)}…` : s;
}

function orbSubtitle(unread: number): string {
  if (unread > 0) return `${unread} new · reading along`;
  return 'reading along';
}

interface ThreadGroup { label: string; items: ThreadSummary[]; }

function dayBucket(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'Earlier';
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (t >= startToday) return 'Today';
  if (t >= startToday - 86400000) return 'Yesterday';
  if (t >= startToday - 7 * 86400000) return 'This week';
  return 'Earlier';
}

function groupThreads(threads: ThreadSummary[]): ThreadGroup[] {
  const order = ['Today', 'Yesterday', 'This week', 'Earlier'];
  const map: Record<string, ThreadSummary[]> = {};
  for (const t of threads) {
    const b = t.last_message_at ? dayBucket(t.last_message_at) : 'Earlier';
    (map[b] ||= []).push(t);
  }
  return order.filter((l) => map[l]?.length).map((l) => ({ label: l, items: map[l] ?? [] }));
}

function relTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (Number.isNaN(diff)) return '';
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

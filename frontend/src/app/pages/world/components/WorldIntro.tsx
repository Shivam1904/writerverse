import { useEffect, useState } from 'react';
import { Globe } from 'lucide-react';
import { Button, Chip, Eyebrow, Field, Input, Spark, type FieldProposal } from '../../../ui';
import { useChatStore } from '../../../modules/chat/useChatStore';
import { useActionCost, withCost } from '../../../lib/actionCost';
import { ArnIdeaButton, ArnIdeaBox } from '../../../modules/arnKit';
import type { WorldData } from '../data';
import type { MetaPatch } from '../useWorldPage';
import { FIELD_LABELS, NARRATION_LABELS, type MetaField, type MetaFields } from '../useMetaFields';
import { PLACEHOLDER } from '../../../../config/lexicon';
import { SuggestTitleButton } from './SuggestTitleButton';

/**
 * WorldIntro — the World page's Story section. The title is a big serif heading;
 * the premise (synopsis / logline) are inline kit `Field`s in the showcase's
 * verb-label "wants-needs" style (click-to-edit-in-place, no boxes), then read
 * `Chip` rows for genre / themes / tone + the narration facts. Text fields
 * self-save via `onSave` (the page's update_project_meta seam).
 *
 * "✦ Suggest a title" (next to the title) runs the free title helper only on
 * click and fills the title; the author can still edit it.
 *
 * AI suggestions: "✦ Suggest" opens Night Eyes with a request ready to send
 * (the AI only runs when the author sends it; the button shows the chat's
 * cost label, if an extension gives one). What the AI suggests comes back as a pending proposal and shows here
 * IN the field it changes — green, with ✓ accept / ✗ dismiss — via
 * useMetaFields. Until accepted it is the AI's, not the author's.
 */

const SUGGEST_SEED =
  'Suggest a synopsis, logline, genres, themes and tone for my story, based on my ideas. ' +
  'Put them in as suggestions I can accept or dismiss one by one.';

const label = (kind: MetaField, v: string) => NARRATION_LABELS[kind]?.[v] ?? v;

/** A verb-labeled premise row (mirrors the showcase Arc "Wants / Needs" form):
 *  an uppercase label + an inline editable serif value. */
function VerbRow({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <p className="my-1.5 flex max-w-[62ch] items-baseline" style={{ fontFamily: 'var(--serif)', textWrap: 'pretty' }}>
      <span className="mr-2 min-w-[84px] shrink-0 select-none font-[family-name:var(--ui)] text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--ink-3)]">
        {heading}
      </span>
      {children}
    </p>
  );
}

/** Genre / themes / tone. With a pending AI suggestion the row shows the
 *  suggested list as one green field (comma-separated) instead of the chips. */
function ChipRow({ heading, hint, values, loading, proposed }: {
  heading: string; hint?: string; values: string[]; loading?: boolean; proposed?: FieldProposal;
}) {
  let body: React.ReactNode;
  if (proposed) body = <Field inline value={values.join(', ')} proposed={proposed} actionsAfter />;
  else if (values.length) body = values.map((v) => <Chip key={v} variant="tag">{v}</Chip>);
  else if (!loading) body = <span className="font-[family-name:var(--serif)] text-[13px] italic text-[var(--ink-3)]">{PLACEHOLDER.passive}</span>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="ty-system-caption min-w-[84px] uppercase tracking-[0.04em]">{heading}{hint && <span className="ml-1 normal-case tracking-normal text-[var(--ink-4)]">· {hint}</span>}</span>
      {body}
    </div>
  );
}

const NARRATION_FIELDS: { field: MetaField; heading: string }[] = [
  { field: 'perspective', heading: 'Perspective' },
  { field: 'tense', heading: 'Tense' },
  { field: 'audience', heading: 'Audience' },
];

export function WorldIntro({ world, loading = false, onSave, meta }: {
  world: WorldData;
  /** True while loadWorld is in flight — suppresses the empty-state placeholders
   *  so a loading card can't read as "your data is gone". */
  loading?: boolean;
  onSave: (patch: MetaPatch) => void;
  /** Pending AI suggestions per field (useMetaFields). */
  meta: MetaFields;
}) {
  const [title, setTitle] = useState(world.storyTitle);
  useEffect(() => { setTitle(world.storyTitle); }, [world.storyTitle]);

  const setSeed = useChatStore((s) => s.setSeed);
  const openChat = useChatStore((s) => s.open);
  // The estimate is a rolling average over ALL the author's chat turns (or a
  // cold-start default), whatever model answered them. A request like this one
  // is often answered by a bigger model and costs more, so say "from".
  const chatCost = useActionCost('chat');
  const suggest = () => {
    setSeed(SUGGEST_SEED);
    openChat();
  };

  const proposals = Object.fromEntries(
    (Object.keys(FIELD_LABELS) as MetaField[]).map((f) => [f, meta.proposalFor(f)]),
  ) as Record<MetaField, FieldProposal | undefined>;
  const anyProposal = Object.values(proposals).some(Boolean);

  const facts = NARRATION_FIELDS
    .map(({ field }) => [field, world[field as 'perspective' | 'tense' | 'audience']] as const)
    .filter(([field, v]) => !!v && !proposals[field]);

  return (
    <section className="mb-[22px] border-b border-border pb-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <Eyebrow>Imagine · world</Eyebrow>
        <div className="flex items-center gap-1.5">
          <ArnIdeaButton section="story" storyScoped />
          <Button
            variant="ai"
            size="sm"
            onClick={suggest}
            tooltip="Opens Night Eyes with a request ready to send. The AI runs only when you send it. The cost depends on the model that answers; a full set of suggestions can cost more."
          >
            <Spark /> {withCost('Suggest', chatCost && chatCost !== 'free' ? `from ${chatCost}` : chatCost)}
          </Button>
        </div>
      </div>
      <ArnIdeaBox section="story" storyScoped />

      {/* Title — a big serif heading, editable in place */}
      <div className="mb-3 flex items-center gap-2">
        <Globe size={20} strokeWidth={1.5} className="shrink-0 text-[var(--asp-world)]" />
        <Input
          variant="inline"
          serif
          value={title}
          placeholder="Untitled Book"
          wrapClassName="flex-1"
          className="text-[24px] font-semibold tracking-[-0.012em]"
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => { if (title.trim() !== world.storyTitle) onSave({ title: title.trim() }); }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
        <SuggestTitleButton
          hasSynopsis={!!world.synopsis?.[0]?.trim()}
          onTitle={(t) => { setTitle(t); onSave({ title: t }); }}
        />
      </div>

      {anyProposal && (
        <p className="ty-system-caption mb-1 flex items-center gap-1.5">
          <Spark /> AI suggestions are shaded green. ✓ makes one yours, ✗ dismisses it.
        </p>
      )}

      {/* Premise — inline verb-label fields (wants/needs style) */}
      <div className="mb-4">
        {proposals.title && (
          <VerbRow heading="Title">
            <Field inline value={world.storyTitle} proposed={proposals.title} actionsAfter />
          </VerbRow>
        )}
        <VerbRow heading="Synopsis">
          <Field
            inline
            value={world.synopsis?.[0] ?? ''}
            placeholder={loading ? '' : 'the whole arc — ending and all'}
            proposed={proposals.synopsis}
            actionsAfter
            onCommit={(v) => onSave({ synopsis: v })}
          />
        </VerbRow>
        <VerbRow heading="Logline">
          <Field
            inline
            value={world.logline ?? ''}
            placeholder={loading ? '' : 'the one-sentence hook'}
            proposed={proposals.logline}
            actionsAfter
            onCommit={(v) => onSave({ logline: v })}
          />
        </VerbRow>
        {NARRATION_FIELDS.filter(({ field }) => proposals[field]).map(({ field, heading }) => (
          <VerbRow key={field} heading={heading}>
            <Field inline value={label(field, String(world[field as 'perspective'] ?? ''))} proposed={proposals[field]} actionsAfter />
          </VerbRow>
        ))}
      </div>

      {meta.staleField && (
        <div role="alert" className="mb-3 flex flex-wrap items-center gap-2">
          <span className="ty-system-caption">
            You changed the {FIELD_LABELS[meta.staleField]} after the AI suggested it, so nothing was saved.
          </span>
          <Button variant="ai" size="xs" onClick={meta.acceptAiAnyway}>Use the AI's</Button>
          <Button variant="ghost" size="xs" onClick={meta.keepMine}>Keep mine</Button>
        </div>
      )}

      {/* Read chips — genre / themes / tone + narration facts */}
      <div className="flex flex-col gap-2">
        <ChipRow heading="Genre" values={world.genres ?? []} loading={loading} proposed={proposals.genres} />
        <ChipRow heading="Themes" hint="what it's about" values={world.themes ?? []} loading={loading} proposed={proposals.themes} />
        <ChipRow heading="Tone" hint="how it feels" values={world.tones ?? []} loading={loading} proposed={proposals.tones} />
        {facts.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {facts.map(([k, v]) => (
              <span key={k} className="ty-system-caption rounded-[var(--r-xs)] border border-border bg-[color-mix(in_srgb,var(--ink)_4%,var(--surface))] px-2 py-0.5 uppercase tracking-[0.02em]">
                {label(k, v)}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

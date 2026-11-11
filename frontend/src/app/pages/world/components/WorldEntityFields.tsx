import { FieldEdit, type FieldProposal } from '../../characters/components/FieldEdit';

/**
 * WorldEntityFields — the roomy edit body shared by every world entity (bullets,
 * cards). Uses the studio FieldEdit primitive (a name line + a multiline
 * description). When a draft proposal is pending, the description renders green
 * with the edit + ✓ accept / ✗ reject mechanism (the same `proposed` overlay the
 * character studio uses). The name is always a plain editable field — the AI only
 * ever drafts the description. Display/wrapper styling is kit typography + Tailwind;
 * the input chrome stays on the shared studio `cst-fe-*` classes.
 */
export function WorldEntityFields({
  name,
  description,
  proposal,
  onSaveName,
  onSaveDescription,
}: {
  name: string;
  description: string;
  proposal?: FieldProposal;
  onSaveName: (v: string) => void;
  onSaveDescription: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <FieldEdit
        value={name}
        restClassName={`ty-story-heading -mx-0.5 inline-block cursor-text rounded-[3px] px-0.5 text-[13.5px] hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)] ${name.trim() ? '' : 'font-normal italic text-muted-foreground'}`}
        restNode={name.trim() || 'Name'}
        editClassName="cst-fe-inline"
        placeholder="Name"
        onCommit={onSaveName}
        title="Click to rename"
        stop
      />
      <FieldEdit
        value={description}
        multiline
        restTag="p"
        restClassName={`ty-story-body m-0 cursor-text rounded-[3px] text-[12px] leading-snug text-muted-foreground hover:bg-[color-mix(in_srgb,var(--ink)_3%,transparent)] ${description.trim() ? '' : 'italic'}`}
        restNode={description.trim() || 'Describe this — what it is, what matters about it.'}
        editClassName="cst-fe-block"
        placeholder="Describe this — what it is, what matters about it."
        onCommit={onSaveDescription}
        proposed={proposal}
        title="Click to edit"
        stop
      />
    </div>
  );
}

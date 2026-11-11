import { useRef } from 'react';
import { PageShell } from '../../../components/PageShell';
import { PageHeader } from '../../../components/PageHeader';
import { MarginBlock, MarginOverlay } from '../../../modules/margin';

/* PageShellDemo — proves the PageShell primitive across three gutter densities
 * (many sections · few sections · single/no-gutter fallback). The point of the
 * demo: the header TITLE's left edge is identical in all three, because the
 * title band is offset by [gutter + gap] and the gutter docks travel to its
 * LEFT. Layout-only — styling comes from
 * the kit typography classes + CSS vars, nothing new. */

function Entry({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="ty-system-label flex flex-col">
      <span>{label}</span>
      {sub && <span className="ty-system-caption opacity-60">{sub}</span>}
    </div>
  );
}

function Demo({ section, title, sections }: { section: string; title: string; sections: string[] }) {
  const anchor = useRef<HTMLDivElement>(null);
  return (
    <div className="rounded-[var(--r-md)] border border-dashed border-[var(--line)]">
      <PageShell
        header={<PageHeader section={section} eyebrow={`Demo · ${section}`} title={title} suffix={`· ${sections.length}`} />}
        overlay={
          <MarginOverlay
            items={sections.map((s) => ({
              id: `${section}-${s}`,
              render: (go: () => void) => (
                <button type="button" onClick={go} className="text-left">
                  <Entry label={s} />
                </button>
              ),
            }))}
            anchorRef={anchor}
          />
        }
      >
        {sections.map((s, i) => (
          <MarginBlock
            key={s}
            id={`${section}-${s}`}
            gutter={<div ref={i === 0 ? anchor : undefined}><Entry label={s} sub="section" /></div>}
          >
            <div className="rounded-[var(--r-md)] border border-[var(--line)] p-4">
              {s} body — content sits in the reading column; the header title aligns to this left edge on every page.
            </div>
          </MarginBlock>
        ))}
      </PageShell>
    </div>
  );
}

export function PageShellDemo() {
  return (
    <div className="flex flex-col gap-12">
      <Demo section="world" title="Many sections" sections={['Story', 'Characters', 'Worldbuilding', 'Magic', 'Factions']} />
      <Demo section="outline" title="Few sections" sections={['Act I', 'Act II', 'Act III']} />
      <Demo section="characters" title="No-gutter fallback" sections={['Everyone']} />
    </div>
  );
}

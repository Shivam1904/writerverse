import { VISUAL_LABELS } from '../data';
import { useGaugeRules } from '../hooks';
import { SCOPE_WORDS } from './LensCard';

/* GaugeSettingsMenu — the gear dropdown on the redesigned /lens/:id detail. Same
 * read-only preset summary as <PresetSettings> (Kind/Watches/Scale/Verdict/Visual
 * + how many other scopes share the preset), moved out of the reading flow and
 * onto the lens design language. "Tune…" opens the same ConfigPresetModal. The
 * parent owns open/close + outside-click. */

const SOURCE_WORDS: Record<string, string> = {
  predefined: 'built in', extracted: 'pulled from your story',
  section: 'from a World section', user: 'you describe it',
};

function Row({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '108px 1fr', gap: 12, padding: '8px 0',
      borderTop: '1px solid color-mix(in srgb,var(--lens-ink) 7%,transparent)', fontSize: 12.5, alignItems: 'start',
    }}>
      <span style={{ color: 'var(--lens-muted)' }}>{label}{sub && <span style={{ color: 'var(--lens-muted-2)' }}> · {sub}</span>}</span>
      <span style={{ color: 'var(--lens-ink)' }}>{children}</span>
    </div>
  );
}

export function GaugeSettingsMenu({ chart, siblings = [], onTune }: {
  chart: any; siblings?: any[]; onTune: () => void;
}) {
  const ruleReg = useGaugeRules();
  const scale = (chart.y_items || []).map((y: any) => (typeof y === 'string' ? y : y?.value)).filter(Boolean);
  const ruleIds = (chart.rules || []).map((r: any) => (typeof r === 'string' ? r : r?.id)).filter(Boolean);
  const ruleLabels = ruleIds.map((id: string) => ruleReg[id]?.label || id);
  const deferred = (chart.rules_deferred || []).length;
  const visual = VISUAL_LABELS?.[chart.display] || chart.display || '—';
  const source = SOURCE_WORDS[chart.y_items_source] || chart.y_items_source;

  return (
    <div className="lens-root" style={{
      position: 'absolute', top: 46, right: 0, width: 340, zIndex: 40, background: 'var(--lens-paper)',
      border: '1px solid var(--lens-line-2)', borderRadius: 14, boxShadow: '0 24px 60px rgba(40,28,70,.18)',
      padding: '16px 18px',
    }}>
      <h3 style={{ margin: '0 0 3px', fontFamily: 'var(--lens-serif)', fontSize: 15, fontWeight: 600 }}>Gauge settings</h3>
      <div className="ui" style={{ fontSize: 11.5, color: 'var(--lens-muted)', marginBottom: 12 }}>
        from the preset “{chart.name || chart.label}”
      </div>

      <Row label="Kind">{chart.kind_word || chart.type || '—'}</Row>
      <Row label="Watches">{SCOPE_WORDS[chart.scope?.type || chart.scope_type] || chart.scope_type || 'the whole story'}</Row>
      <Row label="Scale" sub={source}>
        {scale.length
          ? <span style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {scale.map((v: string, i: number) => (
                <span key={i} style={{ fontSize: 11, padding: '2px 9px', borderRadius: 99, background: 'color-mix(in srgb,var(--lens-ink) 6%,transparent)', color: 'var(--lens-ink-soft)' }}>{v}</span>
              ))}
            </span>
          : <span style={{ color: 'var(--lens-muted)' }}>not set yet</span>}
      </Row>
      <Row label="Verdict">
        {ruleLabels.length
          ? <>{ruleLabels.join(' · ')}{deferred > 0 && <span style={{ color: 'var(--lens-muted)' }}> ({deferred} coming soon)</span>}</>
          : <span style={{ color: 'var(--lens-muted)' }}>no verdict — just a map</span>}
      </Row>
      <Row label="Visual">{visual}</Row>
      {chart.report_view && <Row label="Findings as">{chart.report_view}</Row>}
      {chart.block_key && <Row label="Bound section">{chart.block_key}</Row>}

      <div style={{
        marginTop: 13, paddingTop: 12, borderTop: '1px solid color-mix(in srgb,var(--lens-ink) 7%,transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
      }}>
        <span className="ui" style={{ fontSize: 11, color: 'var(--lens-muted)' }}>
          {siblings.length > 0
            ? <>Also bound on {siblings.length} other scope{siblings.length > 1 ? 's' : ''}.</>
            : 'The only binding of this preset.'}
        </span>
        <button type="button" className="ui focusring ld-menu-edit" onClick={onTune}
          style={{ fontSize: 12, fontWeight: 600, color: 'var(--lens-purple-deep)', background: 'transparent', border: 0, padding: '4px 6px', borderRadius: 7 }}>
          Tune…
        </button>
      </div>
    </div>
  );
}

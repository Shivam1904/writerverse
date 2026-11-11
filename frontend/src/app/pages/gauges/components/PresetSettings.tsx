import { VISUAL_LABELS } from '../data';
import { useGaugeRules } from '../hooks';
import { SCOPE_WORDS } from './LensCard';

/**
 * PresetSettings — on the chart view, the full config this chart inherits from
 * its preset (every binding of the preset shares it), plus how many OTHER scopes
 * the same preset is bound to. Read-only; "Tune this gauge" edits the preset.
 */
function Row({ label, sub, children }: any) {
  return (
    <div className="gz-set-row">
      <dt className="gz-set-k">{label}{sub && <span className="gz-set-sub"> · {sub}</span>}</dt>
      <dd className="gz-set-v">{children}</dd>
    </div>
  );
}

const SOURCE_WORDS: Record<string, string> = {
  predefined: 'built in', extracted: 'pulled from your story',
  section: 'from a World section', user: 'you describe it',
};

export function PresetSettings({ chart, siblings = [] }: any) {
  const ruleReg = useGaugeRules();
  const scale = (chart.y_items || []).map((y: any) => (typeof y === 'string' ? y : y?.value)).filter(Boolean);
  const ruleIds = (chart.rules || []).map((r: any) => (typeof r === 'string' ? r : r?.id)).filter(Boolean);
  const ruleLabels = ruleIds.map((id: string) => ruleReg[id]?.label || id);
  const deferred = (chart.rules_deferred || []).length;

  const visual = VISUAL_LABELS?.[chart.display] || chart.display || '—';
  const source = SOURCE_WORDS[chart.y_items_source] || chart.y_items_source;

  return (
    <div className="cv-chart-card gz-settings">
      <div className="gz-set-head">
        Settings <span className="gz-set-from">from the preset “{chart.name || chart.label}”</span>
      </div>

      <dl className="gz-set-grid">
        <Row label="Kind">{chart.kind_word || chart.type || '—'}</Row>
        <Row label="Watches">{SCOPE_WORDS[chart.scope?.type || chart.scope_type] || chart.scope_type || 'the whole story'}</Row>

        <Row label="Scale" sub={source}>
          {scale.length
            ? <span className="gz-set-chips">{scale.map((v: string, i: number) => <span key={i} className="gz-set-chip">{v}</span>)}</span>
            : <span className="gz-muted">not set yet</span>}
        </Row>

        <Row label="Verdict">
          {ruleLabels.length
            ? <>{ruleLabels.join(' · ')}{deferred > 0 && <span className="gz-muted"> ({deferred} coming soon)</span>}</>
            : <span className="gz-muted">no verdict — just a map</span>}
        </Row>

        <Row label="Visual">{visual}</Row>
        {chart.report_view && <Row label="Findings as">{chart.report_view}</Row>}
        {chart.block_key && <Row label="Bound section">{chart.block_key}</Row>}
      </dl>

      <div className="gz-set-bindings">
        {siblings.length > 0 ? (
          <>
            <span className="gz-set-bindings-ct">Also bound on {siblings.length} other scope{siblings.length > 1 ? 's' : ''}:</span>{' '}
            {siblings.map((s: any, i: number) => (
              <span key={s.binding_id || i} className="gz-set-binding-name">
                {s.scope?.type && s.scope.type !== 'story' ? s.scope?.name : 'the whole story'}
              </span>
            ))}
          </>
        ) : (
          <span className="gz-muted">The only binding of this preset.</span>
        )}
      </div>
    </div>
  );
}

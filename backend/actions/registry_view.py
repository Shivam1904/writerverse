"""Dev-only capability-registry viewer — backs the `/api/consistency/dev/registry/` route.

Serves a self-contained, filterable HTML page listing every capability in the
live registry (`all_capabilities()`), so the whole tool surface — reads, writes,
proposes, per-actor exposure, args, pages — is browsable in one place instead of
scattered across `register/*.py`. Read-only, dev-only (DEBUG + LOCAL_DEV), no auth ceremony
(mirrors the bare `/dev/logs` route). The registry is the source of truth; this
only reshapes it for display, so it stays accurate as capabilities change.

Replaced the throwaway `manage.py dump_registry` command (which wrote the same
page to a temp file) — this is the permanent, discoverable version.
"""
from __future__ import annotations

import json

from django.conf import settings
from django.http import HttpResponse, HttpResponseNotFound
from django.views import View

from actions.capabilities import all_capabilities


def _serialise() -> list[dict]:
    rows = []
    for cap in sorted(all_capabilities(), key=lambda c: c.name):
        rows.append({
            "name": cap.name,
            "ai_name": cap.ai_name,
            "tool_name": cap.tool_name or "",
            "description": cap.description,
            "route": cap.route.value if cap.route else "",
            "actors": [a.value for a in cap.actors],
            "chat_exposure": cap.chat_exposure,
            "has_accept": cap.accept is not None,
            "has_execute": cap.execute is not None,
            "has_commit": cap.commit is not None,
            "args": dict(cap.args) if cap.args else {},
            "pages": list(cap.pages) if cap.pages else [],
        })
    return rows


_HTML = """<!doctype html>
<html><head><meta charset="utf-8"><title>Capability Registry (dev)</title>
<style>
  :root { color-scheme: dark; }
  body { font: 13px/1.4 ui-monospace,Menlo,monospace; background:#11131a; color:#dfe3ec; margin:0; padding:16px; }
  h1 { font-size:15px; margin:0 0 4px; }
  .sub { color:#7b8194; margin:0 0 14px; }
  .controls { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px; align-items:center; }
  input, select { background:#1b1e28; border:1px solid #2c3040; color:#dfe3ec; padding:6px 8px; border-radius:6px; font:inherit; }
  input#q { flex:1; min-width:220px; }
  table { border-collapse:collapse; width:100%; }
  th,td { text-align:left; padding:6px 8px; border-bottom:1px solid #232734; vertical-align:top; }
  th { position:sticky; top:0; background:#161922; cursor:pointer; user-select:none; white-space:nowrap; }
  tr:hover td { background:#161a24; }
  .name { color:#9fd0ff; font-weight:600; white-space:nowrap; }
  .desc { color:#aab0bf; max-width:520px; }
  .pill { display:inline-block; padding:1px 7px; border-radius:10px; font-size:11px; }
  .read{background:#13351f;color:#8fe6ab} .write{background:#3a2a12;color:#f1c27a} .propose{background:#2a1d3a;color:#cba6f7}
  .actor{background:#1e2433;color:#8fb6e6;margin-right:3px}
  .tier{background:#22283a;color:#9aa6c4}
  .flag{color:#6f7787}.flag.on{color:#7ad19a}
  .args{color:#7b8194;font-size:11px}
  .count{color:#7b8194;margin-left:auto}
</style></head><body>
<h1>Capability Registry <span style="color:#7b8194">— live introspection</span></h1>
<p class="sub">Generated from <code>all_capabilities()</code>. Filter, search, click headers to sort.</p>
<div class="controls">
  <input id="q" placeholder="search name / description / args…" autofocus>
  <select id="route"><option value="">route: all</option></select>
  <select id="actor"><option value="">actor: all</option></select>
  <select id="tier"><option value="">tier: all</option></select>
  <span class="count" id="count"></span>
</div>
<table><thead><tr>
  <th data-k="name">name</th><th data-k="route">route</th>
  <th>actors</th><th data-k="chat_exposure">tier</th><th>flags</th>
  <th data-k="description">description</th><th>args</th>
</tr></thead><tbody id="body"></tbody></table>
<script>
const DATA = __DATA__;
const uniq = (k) => [...new Set(DATA.flatMap(d => Array.isArray(d[k]) ? d[k] : [d[k]]).filter(Boolean))].sort();
for (const v of uniq('route')) route.add(new Option('route: '+v, v));
for (const v of uniq('actors')) actor.add(new Option('actor: '+v, v));
for (const v of uniq('chat_exposure')) tier.add(new Option('tier: '+v, v));
let sortK = 'name', sortDir = 1;
function render() {
  const term = q.value.toLowerCase();
  let rows = DATA.filter(d => {
    if (route.value && d.route !== route.value) return false;
    if (actor.value && !d.actors.includes(actor.value)) return false;
    if (tier.value && d.chat_exposure !== tier.value) return false;
    if (!term) return true;
    return (d.name+' '+d.ai_name+' '+d.description+' '+JSON.stringify(d.args)).toLowerCase().includes(term);
  });
  rows.sort((a,b)=> String(a[sortK]).localeCompare(String(b[sortK]))*sortDir);
  count.textContent = rows.length + ' / ' + DATA.length;
  body.innerHTML = rows.map(d => `<tr>
    <td class="name">${d.name}${d.tool_name && d.tool_name!==d.name ? '<br><span class="args">ai: '+d.ai_name+'</span>':''}</td>
    <td><span class="pill ${d.route}">${d.route}</span></td>
    <td>${d.actors.map(a=>`<span class="pill actor">${a}</span>`).join('')}</td>
    <td><span class="pill tier">${d.chat_exposure}</span></td>
    <td><span class="flag ${d.has_execute?'on':''}">exec</span> · <span class="flag ${d.has_commit?'on':''}">commit</span> · <span class="flag ${d.has_accept?'on':''}">accept</span></td>
    <td class="desc">${d.description||''}</td>
    <td class="args">${Object.entries(d.args).map(([k,v])=>k+': '+v).join('<br>')||'—'}</td>
  </tr>`).join('');
}
for (const el of [q,route,actor,tier]) el.addEventListener('input', render);
document.querySelectorAll('th[data-k]').forEach(th => th.onclick = () => {
  const k = th.dataset.k; sortDir = (k===sortK) ? -sortDir : 1; sortK = k; render();
});
render();
</script></body></html>
"""


class RegistryView(View):
    """GET — the filterable capability registry page. Dev-only (DEBUG + LOCAL_DEV)."""

    def get(self, request):
        # DEBUG alone is not enough: a public server that copied .env.example
        # has DEBUG on too. LOCAL_DEV also needs the local runtime + a localhost frontend.
        if not (settings.DEBUG and settings.LOCAL_DEV):
            return HttpResponseNotFound()
        html = _HTML.replace("__DATA__", json.dumps(_serialise()))
        return HttpResponse(html)

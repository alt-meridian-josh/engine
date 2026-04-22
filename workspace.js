(function(){ 'use strict';

// Inputs from host page — the only shared globals.
const SB   = window.SB;
const KEY  = window.KEY;
const HDRS = window.HDRS;

// ── Supabase helpers (private to this module) ────────────────────────────────
async function sbGet(t, q = '') {
  const r = await fetch(`${SB}/rest/v1/${t}?${q}`, { headers: HDRS });
  if (!r.ok) throw new Error(`SB get ${t} ${r.status}: ${await r.text()}`);
  return r.json();
}
async function sbIns(t, d) {
  const r = await fetch(`${SB}/rest/v1/${t}`, {
    method: 'POST',
    headers: { ...HDRS, 'Prefer': 'return=representation' },
    body: JSON.stringify(d),
  });
  if (!r.ok) throw new Error(`SB insert ${t} ${r.status}: ${await r.text()}`);
  return r.json();
}
async function sbUpsert(t, d, conflict) {
  const r = await fetch(`${SB}/rest/v1/${t}?on_conflict=${conflict}`, {
    method: 'POST',
    headers: { ...HDRS, 'Prefer': 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify(d),
  });
  if (!r.ok) throw new Error(`SB upsert ${t} ${r.status}: ${await r.text()}`);
  return r.json();
}
async function sbPatch(t, q, d) {
  const r = await fetch(`${SB}/rest/v1/${t}?${q}`, {
    method: 'PATCH',
    headers: { ...HDRS, 'Prefer': 'return=representation' },
    body: JSON.stringify(d),
  });
  if (!r.ok) throw new Error(`SB patch ${t} ${r.status}: ${await r.text()}`);
  return r.json();
}

// ── State (private) ──────────────────────────────────────────────────────────
const WS = {
  ready: false,
  engagements: [], domains: [], scenarios: [], selections: [],
  defs: {}, inputs: {}, levers: [], evidence: [],
  eng: null, domainId: null,
  history: [],
  saveTimer: null,
  intake: null,
  snapshots: [],
  preset: 'typical',
};

// ── Formula eval + formatters ────────────────────────────────────────────────
// Safe eval: build a Function from the formula with input keys as named params.
function wsEvalFormula(formula, inputs) {
  if (!formula || typeof formula !== 'string') return null;
  const keys = Object.keys(inputs || {});
  const vals = keys.map(k => {
    const v = inputs[k];
    return (v == null || isNaN(Number(v))) ? 0 : Number(v);
  });
  try {
    const fn = new Function(...keys, '"use strict";return (' + formula + ');');
    const result = fn(...vals);
    return (typeof result === 'number' && isFinite(result)) ? result : null;
  } catch (e) { return null; }
}

function wsFmtMoney(n) {
  if (n == null || !isFinite(n)) return '—';
  if (Math.abs(n) >= 1e6) return '$' + (n/1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return '$' + Math.round(n/1000) + 'K';
  return '$' + Math.round(n).toLocaleString();
}

function wsEsc(t) {
  return String(t == null ? '' : t)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Init + dropdown + welcome ────────────────────────────────────────────────
async function wsInit() {
  try {
    const [engs, doms, levers] = await Promise.all([
      sbGet('vef_engagements', 'select=*&order=created_at.desc'),
      sbGet('vef_domains',     'select=*&order=domain_name.asc'),
      sbGet('vef_levers',      'select=*&order=vl_num.asc'),
    ]);
    WS.engagements = engs || [];
    WS.domains     = doms || [];
    WS.levers      = levers || [];
    wsRenderDropdown();
    if (!WS.ready) { wsShowWelcome(); WS.ready = true; }
  } catch (e) {
    console.error('workspace init', e);
    wsBotError('Could not load workspace data: ' + e.message);
  }
}

function wsRenderDropdown() {
  const sel = document.getElementById('ws-eng-sel');
  const current = sel.value;
  sel.innerHTML = '<option value="">— select engagement —</option>' +
    WS.engagements.map(e =>
      `<option value="${e.engagement_id}">${e.engagement_id} — ${e.vendor_name || '?'} / ${e.prospect_name || '?'}</option>`
    ).join('');
  if (current) sel.value = current;
}

function wsShowWelcome() {
  const m = document.getElementById('ws-msgs');
  m.innerHTML = '';
  const d = document.createElement('div');
  d.className = 'wsm bot';
  d.innerHTML = `<div class="wsm-who">Meridian</div>
    <div class="wsm-bub">Pick an engagement from the dropdown to load its scenarios, inputs, and snapshots — or type <em>new engagement</em> to create one.</div>
    <div class="ws-chips">
      <button class="ws-chip" onclick="wsStartIntake()">New engagement</button>
    </div>`;
  m.appendChild(d);
  m.scrollTop = m.scrollHeight;
}

// ── Chat message primitives ──────────────────────────────────────────────────
function wsResize(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 96) + 'px'; }
function wsOnKey(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); wsSend(); } }

function wsUserMsg(text) {
  const m = document.getElementById('ws-msgs');
  const d = document.createElement('div'); d.className = 'wsm user';
  d.innerHTML = `<div class="wsm-who">You</div><div class="wsm-bub">${wsEsc(text)}</div>`;
  m.appendChild(d); m.scrollTop = m.scrollHeight;
}

function wsBotMsg(html, chips) {
  const m = document.getElementById('ws-msgs');
  wsRmTyping();
  const d = document.createElement('div'); d.className = 'wsm bot';
  let inner = `<div class="wsm-who">Meridian</div><div class="wsm-bub">${html}</div>`;
  if (chips && chips.length) {
    inner += '<div class="ws-chips">';
    chips.forEach(c => {
      const label = typeof c === 'string' ? c : c.label;
      const val = typeof c === 'string' ? c : c.value;
      inner += `<button class="ws-chip" data-val="${wsEsc(val)}" onclick="wsChipClick(this)">${wsEsc(label)}</button>`;
    });
    inner += '</div>';
  }
  d.innerHTML = inner;
  m.appendChild(d); m.scrollTop = m.scrollHeight;
}

function wsBotError(msg) {
  const m = document.getElementById('ws-msgs');
  wsRmTyping();
  const d = document.createElement('div'); d.className = 'wsm bot';
  d.innerHTML = `<div class="wsm-who">Meridian</div><div class="wsm-bub wsm-err">${wsEsc(msg)}</div>`;
  m.appendChild(d); m.scrollTop = m.scrollHeight;
}

function wsRmTyping() { const el = document.getElementById('ws-typing'); if (el) el.remove(); }
function wsTyping() {
  const m = document.getElementById('ws-msgs');
  wsRmTyping();
  const d = document.createElement('div'); d.className = 'wsm bot'; d.id = 'ws-typing';
  d.innerHTML = `<div class="wsm-who">Meridian</div><div class="ws-typing"><span></span><span></span><span></span></div>`;
  m.appendChild(d); m.scrollTop = m.scrollHeight;
}

// ── Engagement load ──────────────────────────────────────────────────────────
async function wsSelectEngagement(engId) {
  if (!engId) {
    WS.eng = null; WS.domainId = null; WS.inputs = {}; WS.defs = {};
    WS.scenarios = []; WS.selections = []; WS.evidence = []; WS.snapshots = [];
    document.getElementById('ws-atit-eid').textContent = '—';
    document.getElementById('ws-snap-btn').disabled = true;
    document.getElementById('ws-presets').style.display = 'none';
    wsRenderEmpty('Select an engagement or type "new engagement" in chat.');
    return;
  }
  const eng = WS.engagements.find(e => e.engagement_id === engId);
  if (!eng) { wsBotError('Engagement not found.'); return; }
  WS.eng = eng;
  WS.domainId = eng.domain_id || null;
  document.getElementById('ws-atit-eid').textContent = `${eng.engagement_id} · ${eng.vendor_name || ''} → ${eng.prospect_name || ''}`;

  wsRenderEmpty('Loading engagement…');
  try {
    await wsLoadEngagementData();
    document.getElementById('ws-snap-btn').disabled = false;
    document.getElementById('ws-presets').style.display = 'flex';
    wsRenderAnalysis();
  } catch (e) {
    console.error(e);
    wsBotError('Failed to load engagement data: ' + e.message);
    wsRenderEmpty('Load failed.');
  }
}

async function wsLoadEngagementData() {
  const engId = WS.eng.engagement_id;
  const dom   = WS.domainId;
  const [defs, values, sels, scens, ev, snaps] = await Promise.all([
    dom ? sbGet('vef_input_definitions', `domain_id=eq.${encodeURIComponent(dom)}&select=*`) : Promise.resolve([]),
    sbGet('vef_input_values', `engagement_id=eq.${encodeURIComponent(engId)}&select=*`),
    sbGet('vef_scenario_selections', `engagement_id=eq.${encodeURIComponent(engId)}&select=*`),
    dom ? sbGet('vef_value_scenarios', `domain_id=eq.${encodeURIComponent(dom)}&select=*`) : Promise.resolve([]),
    dom ? sbGet('vef_evidence_registry', `domain_id=eq.${encodeURIComponent(dom)}&select=*&order=haircut_applied.desc&limit=20`) : Promise.resolve([]),
    sbGet('vef_output_snapshots', `engagement_id=eq.${encodeURIComponent(engId)}&select=*&order=snapshot_version.desc`),
  ]);

  // Deduplicate input defs by input_key
  const defMap = {};
  (defs || []).forEach(d => { if (!defMap[d.input_key]) defMap[d.input_key] = d; });
  WS.defs = defMap;

  // Seed inputs from typical_value, override with provided_value from DB
  WS.inputs = {};
  Object.values(WS.defs).forEach(d => {
    const tv = parseFloat(d.typical_value != null ? d.typical_value : d.default_value);
    if (!isNaN(tv)) WS.inputs[d.input_key] = tv;
  });
  (values || []).forEach(v => {
    const pv = parseFloat(v.provided_value);
    if (!isNaN(pv)) WS.inputs[v.input_key] = pv;
  });

  WS.selections = sels || [];
  WS.scenarios  = scens || [];
  WS.evidence   = ev || [];
  WS.snapshots  = snaps || [];
}

function wsRenderEmpty(msg) {
  const body = document.getElementById('ws-abody');
  body.innerHTML = `<div class="ws-empty"><div class="ws-empty-ico">⟁</div>
    <div class="ws-empty-tit">Workspace</div>
    <div class="ws-empty-sub">${wsEsc(msg)}</div></div>`;
}

})();

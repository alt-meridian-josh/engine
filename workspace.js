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

// ── Active scenarios + metrics ───────────────────────────────────────────────
function wsActiveScenarios() {
  const activeIds = new Set(
    WS.selections.filter(s => s.is_active !== false).map(s => s.scenario_id)
  );
  return WS.scenarios.filter(s => activeIds.has(s.scenario_id));
}

function wsComputeMetrics() {
  const active = wsActiveScenarios();
  const arv = active.reduce((sum, s) => {
    const v = wsEvalFormula(s.value_scenario_formula, WS.inputs);
    return sum + (v && isFinite(v) && v > 0 ? v : 0);
  }, 0);
  const coiTotal = active.reduce((sum, s) => {
    const v = wsEvalFormula(s.cost_of_inaction_formula, WS.inputs);
    return sum + (v && isFinite(v) && v > 0 ? v : 0);
  }, 0);
  const delayTotal = active.reduce((sum, s) => {
    const v = wsEvalFormula(s.delay_cost_formula, WS.inputs);
    return sum + (v && isFinite(v) && v > 0 ? v : 0);
  }, 0);

  const impl = Number(WS.inputs.implementation_cost) || 0;
  const payback_mo = (impl > 0 && arv > 0) ? (impl / arv) * 12 : null;
  const bcr = (impl > 0 && arv > 0) ? (arv * 3) / impl : null;
  const monthlyDelay = delayTotal > 0 ? delayTotal : (arv > 0 ? arv / 12 : 0);

  return { arv, coiTotal, payback_mo, bcr, monthlyDelay, impl };
}

// Compare current inputs to most recent snapshot's input_snapshot.
// 'snap' = match, 'live' = diverged, null = no snapshot to compare.
function wsSnapshotState() {
  const snap = WS.snapshots && WS.snapshots[0];
  if (!snap || !snap.input_snapshot) return null;
  const snapIn = snap.input_snapshot;
  const keys = new Set([...Object.keys(WS.inputs), ...Object.keys(snapIn)]);
  for (const k of keys) {
    const a = Number(WS.inputs[k]);
    const b = Number(snapIn[k]);
    const aOk = isFinite(a), bOk = isFinite(b);
    if (!aOk && !bOk) continue;
    if (aOk !== bOk) return 'live';
    if (Math.abs(a - b) > 1e-6) return 'live';
  }
  return 'snap';
}

function wsBadgeHtml() {
  const state = wsSnapshotState();
  if (!state) return '';
  return state === 'live'
    ? '<span class="mc-badge live">Live</span>'
    : '<span class="mc-badge snap">Snapshot</span>';
}

// ── Render analysis panel ────────────────────────────────────────────────────
function wsRenderAnalysis() {
  const body = document.getElementById('ws-abody');
  const m = wsComputeMetrics();
  const presetsActive = `<span style="font-family:'DM Mono',monospace;font-size:9px;color:var(--t3)">preset: ${WS.preset}</span>`;
  const badge = wsBadgeHtml();

  const defs = Object.values(WS.defs);
  const sliderHtml = defs.length
    ? defs.map(d => wsSliderRow(d)).join('')
    : '<div class="ws-empty-sub" style="padding:10px 0">No input definitions found for this domain.</div>';

  const snapHtml = WS.snapshots.length
    ? WS.snapshots.map(s => {
        const date = s.created_at ? new Date(s.created_at).toLocaleDateString() : '—';
        return `<div class="ws-snap">
          <div class="ws-snap-v">v${s.snapshot_version || '?'}</div>
          <div class="ws-snap-lbl">${wsEsc(s.snapshot_label || '—')}${s.intent ? ' · ' + wsEsc(s.intent) : ''}</div>
          <div class="ws-snap-val">${wsFmtMoney(s.annual_value)}</div>
          <div class="ws-snap-pay">${s.payback_mo != null ? s.payback_mo.toFixed(1) + 'mo' : '—'}</div>
          <div class="ws-snap-date">${wsEsc(date)}</div>
        </div>`;
      }).join('')
    : '<div class="ws-empty-sub" style="padding:6px 0">No snapshots yet. Save one from the header.</div>';

  body.innerHTML = `
    <div class="ws-metrics">
      <div class="ws-mc pri"><div class="ws-mcq">Annual Run-rate Value</div>
        <div class="ws-mcn" id="ws-mc-arv">${wsFmtMoney(m.arv)}</div>
        <div class="ws-mcs">ARV · sum of active scenarios</div>${badge}</div>
      <div class="ws-mc"><div class="ws-mcq">Payback</div>
        <div class="ws-mcn" id="ws-mc-pay">${m.payback_mo != null ? m.payback_mo.toFixed(1) + 'mo' : '—'}</div>
        <div class="ws-mcs">months to breakeven</div>${badge}</div>
      <div class="ws-mc"><div class="ws-mcq">BCR</div>
        <div class="ws-mcn" id="ws-mc-bcr">${m.bcr != null ? m.bcr.toFixed(1) + 'x' : '—'}</div>
        <div class="ws-mcs">benefit-cost · 3yr</div>${badge}</div>
      <div class="ws-mc warn"><div class="ws-mcq">Monthly Delay Cost</div>
        <div class="ws-mcn" id="ws-mc-dly">${wsFmtMoney(m.monthlyDelay)}</div>
        <div class="ws-mcs">per month of inaction</div>${badge}</div>
    </div>

    <div>
      <div class="ws-sec-hd"><span>Key Inputs</span>${presetsActive}</div>
      <div class="ws-sliders" id="ws-sliders">${sliderHtml}</div>
    </div>

    <div>
      <div class="ws-sec-hd"><span>Snapshots</span>
        <span style="font-family:'DM Mono',monospace;font-size:9px;color:var(--t3)">${WS.snapshots.length}</span>
      </div>
      <div class="ws-snap-list" id="ws-snap-list">${snapHtml}</div>
    </div>`;
}

// ── Slider row + input formatter ─────────────────────────────────────────────
function wsSliderRow(def) {
  const key = def.input_key;
  const cur = Number(WS.inputs[key] != null ? WS.inputs[key] : (def.typical_value || def.default_value || 0));
  let mn = parseFloat(def.min_value);
  let mx = parseFloat(def.max_value);
  if (!isFinite(mn)) mn = 0;
  if (!isFinite(mx)) mx = Math.max(cur * 3, 100);
  if (mx <= mn) mx = mn + 1;
  const unit = def.unit || '';
  const isDec = unit === 'decimal' || unit === '%';
  const span  = mx - mn;
  const step  = isDec ? Math.max(0.001, span / 200) : Math.max(1, Math.round(span / 200));
  const disp = wsFmtInput(cur, unit);
  const label = def.label || key;
  return `<div class="ws-sr">
    <div class="ws-stop">
      <div class="ws-slbl" title="${wsEsc(label)}">${wsEsc(label)}</div>
      <div class="ws-sval" id="ws-sv-${wsEsc(key)}">${wsEsc(disp)}</div>
    </div>
    <input type="range" min="${mn}" max="${mx}" step="${step}" value="${cur}"
      oninput="wsOnSlide('${wsEsc(key)}', this.value)">
    <div class="ws-shints">
      <span class="ws-sh">${wsEsc(wsFmtInput(mn, unit))}</span>
      <span class="ws-sh">${wsEsc(wsFmtInput(mx, unit))}</span>
    </div>
  </div>`;
}

function wsFmtInput(n, unit) {
  n = Number(n);
  if (!isFinite(n)) return '—';
  if (unit === '$') return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (unit === 'decimal' || unit === '%') return (Math.round(n * 1000) / 10) + '%';
  const u = unit ? ' ' + unit : '';
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 }) + u;
}

// ── Chat / intake router ─────────────────────────────────────────────────────
async function wsSend() {
  const el = document.getElementById('ws-inp');
  const text = (el.value || '').trim();
  if (!text) return;
  el.value = ''; el.style.height = 'auto';
  wsUserMsg(text);

  // Intake mode: state machine consumes input
  if (WS.intake) { await wsIntakeStep(text); return; }

  // Trigger intake
  if (/^\s*new\s+engagement\s*$/i.test(text)) { wsStartIntake(); return; }

  // General AI chat (engagement required)
  if (!WS.eng) {
    wsBotMsg('Select an engagement from the dropdown first, or type <em>new engagement</em> to create one.',
      [{ label: 'New engagement', value: 'new engagement' }]);
    return;
  }
  await wsChatAI(text);
}

function wsChipClick(btn) {
  const val = btn.dataset.val || btn.textContent;
  const inp = document.getElementById('ws-inp');
  inp.value = val;
  wsSend();
}

// ── Intake state machine ─────────────────────────────────────────────────────
const INTAKE_STEPS = [
  { key: 'vendor_name',         prompt: "What's the vendor name? (who's selling)" },
  { key: 'prospect_name',       prompt: "And the prospect? (who they're selling to)" },
  { key: 'domain_id',           prompt: "Which domain? Pick one below.", type: 'domain' },
  { key: 'deal_stage',          prompt: "What deal stage?", type: 'chips',
    options: ['Discovery', 'Technical Validation', 'Business Case', 'Negotiation', 'Closed Won'] },
  { key: 'sales_motion',        prompt: "What sales motion?", type: 'chips',
    options: ['Direct', 'Partner-led', 'Inbound', 'RFP', 'Expansion'] },
  { key: 'champion_role',       prompt: "Champion role? (e.g. VP Supply Chain)" },
  { key: 'economic_buyer_role', prompt: "Economic buyer role? (e.g. CFO)" },
  { key: 'artifact_purpose',    prompt: "Artifact purpose?", type: 'chips',
    options: ['CFO Business Case', 'Champion Leave-Behind', 'Executive Briefing', 'Proposal Section', 'RFP Response'] },
];

function wsStartIntake() {
  WS.intake = { step: 0, data: {} };
  wsBotMsg("Let's create a new engagement. I'll ask a few questions — answer in the box or tap a chip.");
  wsAskIntakeStep();
}

function wsAskIntakeStep() {
  const it = WS.intake;
  if (!it) return;
  if (it.step >= INTAKE_STEPS.length) { wsIntakeSummary(); return; }
  const step = INTAKE_STEPS[it.step];
  let chips = [];
  if (step.type === 'chips') chips = step.options.map(o => ({ label: o, value: o }));
  else if (step.type === 'domain') {
    chips = WS.domains.map(d => ({
      label: `${d.domain_id} — ${d.domain_name}`,
      value: d.domain_id,
    }));
  }
  wsBotMsg(wsEsc(step.prompt), chips);
}

async function wsIntakeStep(answer) {
  const it = WS.intake;
  const step = INTAKE_STEPS[it.step];

  if (step.type === 'domain') {
    const match = WS.domains.find(d =>
      d.domain_id === answer || d.domain_name === answer ||
      `${d.domain_id} — ${d.domain_name}` === answer);
    if (!match) {
      wsBotMsg(`Couldn't find that domain. Pick one from the list below.`,
        WS.domains.map(d => ({ label: `${d.domain_id} — ${d.domain_name}`, value: d.domain_id })));
      return;
    }
    it.data[step.key] = match.domain_id;
    wsBotMsg(`Got it — <strong>${wsEsc(match.domain_id)}</strong> (${wsEsc(match.domain_name)}).`);
  } else {
    it.data[step.key] = answer;
    wsBotMsg(`Got it — <strong>${wsEsc(answer)}</strong>.`);
  }

  it.step += 1;
  if (it.step >= INTAKE_STEPS.length) wsIntakeSummary();
  else wsAskIntakeStep();
}

function wsIntakeSummary() {
  const d = WS.intake.data;
  const rows = INTAKE_STEPS.map(s => {
    const v = d[s.key];
    const disp = (s.type === 'domain') ? (() => {
      const dom = WS.domains.find(x => x.domain_id === v);
      return dom ? `${dom.domain_id} — ${dom.domain_name}` : (v || '—');
    })() : (v || '—');
    return `<div class="ws-intake-row">
      <div class="ws-intake-k">${wsEsc(s.key.replace(/_/g,' '))}</div>
      <div class="ws-intake-v">${wsEsc(disp)}</div></div>`;
  }).join('');

  const m = document.getElementById('ws-msgs');
  const el = document.createElement('div'); el.className = 'wsm bot';
  el.innerHTML = `<div class="wsm-who">Meridian</div>
    <div class="wsm-bub">Here's what I've got. Create this engagement?</div>
    <div class="ws-intake-card">${rows}</div>
    <div class="ws-chips">
      <button class="ws-chip" onclick="wsIntakeCommit()">Yes, create it</button>
      <button class="ws-chip" onclick="wsIntakeCancel()">Cancel</button>
    </div>`;
  m.appendChild(el); m.scrollTop = m.scrollHeight;
}

function wsIntakeCancel() {
  WS.intake = null;
  wsBotMsg('Cancelled. No engagement was created.');
}

async function wsIntakeCommit() {
  const d = WS.intake ? WS.intake.data : null;
  if (!d) return;
  wsTyping();
  try {
    const today = new Date().toISOString().slice(0, 10);
    const engId = 'ENG-' + Date.now();
    const row = {
      engagement_id: engId,
      vendor_name: d.vendor_name,
      prospect_name: d.prospect_name,
      domain_id: d.domain_id,
      deal_stage: d.deal_stage,
      sales_motion: d.sales_motion,
      champion_role: d.champion_role,
      economic_buyer_role: d.economic_buyer_role,
      artifact_purpose: d.artifact_purpose,
      intake_source: 'tool',
      intake_date: today,
      engagement_status: 'Active',
    };
    const inserted = await sbIns('vef_engagements', [row]);
    const newEng = inserted[0] || row;

    // Seed scenario selections from domain defaults
    const domainScens = await sbGet('vef_value_scenarios',
      `domain_id=eq.${encodeURIComponent(d.domain_id)}&active_by_default=eq.true&select=scenario_id`);
    if (domainScens.length) {
      const selRows = domainScens.map(s => ({
        engagement_id: engId,
        scenario_id: s.scenario_id,
        is_active: true,
        source: 'intake-default',
      }));
      try { await sbIns('vef_scenario_selections', selRows); }
      catch (e) { console.warn('scenario selections seed failed', e); }
    }

    WS.intake = null;
    wsRmTyping();
    wsBotMsg(`✓ Created <strong>${wsEsc(engId)}</strong> and seeded ${domainScens.length} default scenarios.`);

    WS.engagements = [newEng, ...WS.engagements];
    wsRenderDropdown();
    document.getElementById('ws-eng-sel').value = engId;
    await wsSelectEngagement(engId);
  } catch (e) {
    console.error(e);
    wsRmTyping();
    wsBotError('Failed to create engagement: ' + e.message);
  }
}

})();

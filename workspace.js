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

// First value that parseFloats to a finite number, else null.
// Treats null, undefined, '', and NaN as "not present" so fallback chains
// don't dead-end when an earlier slot holds an empty string.
function wsNumOr(...vals) {
  for (const v of vals) {
    const n = parseFloat(v);
    if (isFinite(n)) return n;
  }
  return null;
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

  // Some engagements have a vertical-specific domain_id (e.g. WH-RFD, RET-RFD)
  // but the underlying input_definitions / scenarios / evidence are stored under
  // the technology's base key ('RFD'). Resolve the fallback lazily, memoized so
  // parallel queries trigger only one vef_domains lookup.
  let fallbackPromise = null;
  function getFallbackDom() {
    if (!dom) return Promise.resolve(null);
    if (!fallbackPromise) {
      fallbackPromise = sbGet('vef_domains',
          `domain_id=eq.${encodeURIComponent(dom)}&select=technology`)
        .then(rows => {
          const tech = rows && rows[0] && rows[0].technology;
          if (tech === 'RFID' && dom !== 'RFD') return 'RFD';
          return null;
        })
        .catch(e => { console.warn('fallback domain resolve failed', e); return null; });
    }
    return fallbackPromise;
  }

  async function byDomainWithFallback(table, suffix) {
    if (!dom) return [];
    const primaryQ = `domain_id=eq.${encodeURIComponent(dom)}&${suffix}`;
    const primary = await sbGet(table, primaryQ);
    if (primary && primary.length > 0) return primary;
    const fb = await getFallbackDom();
    if (!fb) return primary || [];
    return sbGet(table, `domain_id=eq.${encodeURIComponent(fb)}&${suffix}`);
  }

  const [defs, values, sels, scens, ev, snaps] = await Promise.all([
    byDomainWithFallback('vef_input_definitions', 'select=*'),
    sbGet('vef_input_values', `engagement_id=eq.${encodeURIComponent(engId)}&select=*`),
    sbGet('vef_scenario_selections', `engagement_id=eq.${encodeURIComponent(engId)}&select=*`),
    byDomainWithFallback('vef_value_scenarios', 'select=*'),
    byDomainWithFallback('vef_evidence_registry', 'select=*&order=haircut_applied.desc&limit=20'),
    sbGet('vef_output_snapshots', `engagement_id=eq.${encodeURIComponent(engId)}&select=*&order=snapshot_version.desc`),
  ]);

  // Deduplicate input defs by input_key
  const defMap = {};
  (defs || []).forEach(d => { if (!defMap[d.input_key]) defMap[d.input_key] = d; });
  WS.defs = defMap;

  // Seed order: typical_value → default_value. Provided_value overrides after.
  // Net precedence: provided_value > typical_value > default_value.
  WS.inputs = {};
  Object.values(WS.defs).forEach(d => {
    const seed = wsNumOr(d.typical_value, d.default_value);
    if (seed != null) WS.inputs[d.input_key] = seed;
  });
  (values || []).forEach(v => {
    const pv = wsNumOr(v.provided_value);
    if (pv != null) WS.inputs[v.input_key] = pv;
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
  // Fallback chain: live input → typical_value → default_value → 0.
  const cur = wsNumOr(WS.inputs[key], def.typical_value, def.default_value) ?? 0;
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

// ── Slider handler + metric refresh ──────────────────────────────────────────
function wsOnSlide(key, val) {
  const v = parseFloat(val);
  if (isNaN(v)) return;
  WS.inputs[key] = v;
  const def = WS.defs[key];
  const el = document.getElementById('ws-sv-' + key);
  if (el) {
    el.textContent = wsFmtInput(v, def ? def.unit : '');
    el.className = 'ws-sval just-changed';
    setTimeout(() => { if (el) el.className = 'ws-sval buyer'; }, 800);
  }
  wsRefreshMetrics();
  wsScheduleSave(key);
}

function wsRefreshMetrics() {
  const m = wsComputeMetrics();
  const p = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
  p('ws-mc-arv', wsFmtMoney(m.arv));
  p('ws-mc-pay', m.payback_mo != null ? m.payback_mo.toFixed(1) + 'mo' : '—');
  p('ws-mc-bcr', m.bcr != null ? m.bcr.toFixed(1) + 'x' : '—');
  p('ws-mc-dly', wsFmtMoney(m.monthlyDelay));
  wsRefreshBadges();
}

function wsRefreshBadges() {
  const state = wsSnapshotState();
  document.querySelectorAll('.ws-mc .mc-badge').forEach(b => b.remove());
  if (!state) return;
  const html = state === 'live'
    ? '<span class="mc-badge live">Live</span>'
    : '<span class="mc-badge snap">Snapshot</span>';
  document.querySelectorAll('.ws-mc').forEach(card => {
    card.insertAdjacentHTML('beforeend', html);
  });
}

// ── Debounced save + preset ──────────────────────────────────────────────────
function wsScheduleSave() {
  if (!WS.eng) return;
  const statusEl = document.getElementById('ws-save-status');
  if (statusEl) { statusEl.textContent = 'editing…'; statusEl.className = 'ws-save-status'; }
  clearTimeout(WS.saveTimer);
  WS.saveTimer = setTimeout(() => wsSaveInputs(), 1000);
}

async function wsSaveInputs() {
  if (!WS.eng) return;
  const engId = WS.eng.engagement_id;
  const statusEl = document.getElementById('ws-save-status');
  if (statusEl) { statusEl.textContent = 'saving…'; statusEl.className = 'ws-save-status saving'; }
  try {
    const rows = Object.entries(WS.inputs).map(([k, v]) => ({
      engagement_id: engId,
      input_key: k,
      provided_value: v,
      value_source: 'tool',
    }));
    if (rows.length === 0) return;
    await sbUpsert('vef_input_values', rows, 'engagement_id,input_key');
    if (statusEl) { statusEl.textContent = '✓ saved'; statusEl.className = 'ws-save-status saved'; }
    setTimeout(() => { if (statusEl && statusEl.textContent === '✓ saved') statusEl.textContent = ''; }, 1800);
  } catch (e) {
    console.error('save inputs', e);
    wsBotError('Failed to save inputs: ' + e.message);
    if (statusEl) { statusEl.textContent = 'save failed'; statusEl.className = 'ws-save-status'; }
  }
}

function wsApplyPreset(preset) {
  WS.preset = preset;
  document.querySelectorAll('.ws-preset').forEach(b =>
    b.classList.toggle('on', b.dataset.preset === preset));
  Object.values(WS.defs).forEach(d => {
    let presetVal;
    if (preset === 'conservative') presetVal = d.conservative_value;
    else if (preset === 'aggressive') presetVal = d.aggressive_value;
    else presetVal = d.typical_value;
    // When the preset column is null/blank (e.g. RFD has all three null),
    // fall back to default_value so the preset button still moves the slider.
    const num = wsNumOr(presetVal, d.default_value);
    if (num != null) WS.inputs[d.input_key] = num;
  });
  wsRenderAnalysis();
  wsScheduleSave();
}

// ── AI chat with injected context ────────────────────────────────────────────
function wsBuildSystemContext() {
  const active = wsActiveScenarios();
  const activeLines = active.map(s => {
    const fields = [
      s.scenario_id,
      s.description || s.one_liner || '',
      s.one_liner || '',
      s.value_theme || '',
      s.value_scenario_formula || '',
      s.cost_of_inaction_formula || '',
      s.evidence_strength || '',
      s.cfo_challenge || '',
    ];
    return '- ' + fields.map(f => String(f).replace(/\|/g, '/')).join(' | ');
  }).join('\n');

  const evLines = (WS.evidence || []).slice(0, 20).map(e => {
    return '- ' + [
      e.evidence_id,
      e.evidence_title,
      e.evidence_publisher,
      e.evidence_year,
      e.quantified_claim_summary,
      e.haircut_applied,
    ].map(f => String(f == null ? '' : f).replace(/\|/g, '/')).join(' | ');
  }).join('\n');

  const leverLines = (WS.levers || []).map(l => {
    return '- ' + [
      l.vl_num,
      l.value_lever,
      l.simple_formula,
    ].map(f => String(f == null ? '' : f).replace(/\|/g, '/')).join(' | ');
  }).join('\n');

  const inputLines = Object.entries(WS.inputs)
    .map(([k, v]) => `${k}=${v}`).join(', ');

  return `ENGAGEMENT: ${WS.eng ? WS.eng.engagement_id : '—'} · domain=${WS.domainId || '—'}
CURRENT INPUTS: ${inputLines || '(none)'}

ACTIVE SCENARIOS [scenario_id | description | one_liner | value_theme | value_scenario_formula | cost_of_inaction_formula | evidence_strength | cfo_challenge]:
${activeLines || '(none active)'}

EVIDENCE REGISTRY [evidence_id | evidence_title | evidence_publisher | evidence_year | quantified_claim_summary | haircut_applied]:
${evLines || '(none)'}

VALUE LEVERS [vl_num | value_lever | simple_formula]:
${leverLines || '(none)'}

Use the scenario formulas to reason about sensitivity. Cite evidence by evidence_id when making claims. Challenge soft numbers using haircut_applied.`;
}

async function wsChatAI(text) {
  wsTyping();
  WS.history.push({ role: 'user', content: text });
  const sysCtx = wsBuildSystemContext();
  try {
    const res = await fetch(`${SB}/functions/v1/value-chat`, {
      method: 'POST',
      headers: { ...HDRS },
      body: JSON.stringify({
        query: text,
        history: WS.history.slice(0, -1),
        session_id: 'ws_' + (WS.eng ? WS.eng.engagement_id : 'none'),
        solution_context: sysCtx,
        engagement_id: WS.eng ? WS.eng.engagement_id : null,
      }),
    });
    const data = await res.json();
    const s = data.structured || { type: 'text', text: data.error || 'No response.' };
    let textOut;
    if (s.type === 'text') {
      textOut = s.text || '';
    } else if (s.type === 'analysis') {
      textOut = (s.title ? `<strong>${wsEsc(s.title)}</strong><br>` : '') +
        ((s.signals || []).map(x => `• ${wsEsc(x.name)}: ${wsEsc(x.description || '')}`).join('<br>') || '');
      if (s.follow_up) textOut += `<br><em>${wsEsc(s.follow_up)}</em>`;
    } else {
      textOut = wsEsc(JSON.stringify(s));
    }
    WS.history.push({ role: 'assistant', content: textOut });
    if (WS.history.length > 14) WS.history = WS.history.slice(-14);
    wsRmTyping();
    const m = document.getElementById('ws-msgs');
    const el = document.createElement('div'); el.className = 'wsm bot';
    el.innerHTML = `<div class="wsm-who">Meridian</div><div class="wsm-bub">${textOut || '—'}</div>`;
    m.appendChild(el); m.scrollTop = m.scrollHeight;
  } catch (e) {
    console.error(e);
    wsBotError('Chat failed: ' + e.message);
  }
}

// ── Snapshot modal + save + toast ────────────────────────────────────────────
function wsOpenSnapModal() {
  if (!WS.eng) return;
  document.getElementById('ws-snap-modal').classList.add('on');
}

function wsCloseSnapModal() {
  document.getElementById('ws-snap-modal').classList.remove('on');
}

async function wsSaveSnapshot() {
  if (!WS.eng) return;
  const label  = document.getElementById('ws-snap-label').value;
  const intent = document.getElementById('ws-snap-intent').value;
  const btn = document.getElementById('ws-snap-confirm');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const m = wsComputeMetrics();
    const activeIds = wsActiveScenarios().map(s => s.scenario_id).join(',');
    const nextVersion = (WS.snapshots[0]?.snapshot_version || WS.snapshots.length) + 1;
    const row = {
      engagement_id: WS.eng.engagement_id,
      snapshot_version: nextVersion,
      annual_value: m.arv,
      payback_mo: m.payback_mo,
      bcr: m.bcr,
      monthly_delay_cost: m.monthlyDelay,
      active_scenario_ids: activeIds,
      input_snapshot: WS.inputs,
      snapshot_label: label,
      intent,
      domain_id: WS.domainId,
    };
    const inserted = await sbIns('vef_output_snapshots', [row]);
    const saved = inserted[0] || row;
    WS.snapshots = [saved, ...WS.snapshots];
    wsCloseSnapModal();
    wsRenderAnalysis();
    wsToast(`Snapshot v${saved.snapshot_version} saved`);
  } catch (e) {
    console.error(e);
    wsToast('Save failed: ' + e.message, true);
    wsBotError('Snapshot save failed: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Save';
  }
}

function wsToast(msg, err) {
  const el = document.getElementById('ws-toast');
  if (!el) return;
  el.textContent = (err ? '✗ ' : '✓ ') + msg;
  el.className = 'ws-toast on' + (err ? ' err' : '');
  clearTimeout(WS._toastT);
  WS._toastT = setTimeout(() => { el.className = 'ws-toast' + (err ? ' err' : ''); }, 2600);
}

// ── Public API (called from HTML onclick and from fd-admin's setTab) ─────────
window.wsInit              = wsInit;
window.wsSelectEngagement  = wsSelectEngagement;
window.wsApplyPreset       = wsApplyPreset;
window.wsOnKey             = wsOnKey;
window.wsResize            = wsResize;
window.wsSend              = wsSend;
window.wsOpenSnapModal     = wsOpenSnapModal;
window.wsCloseSnapModal    = wsCloseSnapModal;
window.wsSaveSnapshot      = wsSaveSnapshot;
window.wsOnSlide           = wsOnSlide;
window.wsStartIntake       = wsStartIntake;
window.wsChipClick         = wsChipClick;
window.wsIntakeCommit      = wsIntakeCommit;
window.wsIntakeCancel      = wsIntakeCancel;

})();

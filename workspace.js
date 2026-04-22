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

})();

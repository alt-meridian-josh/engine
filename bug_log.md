# bug_log.md
# Bug registry — append on every fix, read at session start

> Format: BUG-### · date · title · file(s) · symptom · root cause · fix · prevention rule · project
> If the same bug CLASS appears twice, escalate to a RULE in CLAUDE.md.

---

<!-- TEMPLATE — copy for each new bug

## BUG-[###] [YYYY-MM-DD] — [short title]
**File(s):** path/to/file
**Symptom:** what was observed
**Root cause:** the actual underlying problem
**Fix applied:** what changed and why
**Prevention rule:** coding/design pattern that avoids this class of bug
**Project:** [rfid-accelerator | alt-meridian | supabase | other]

-->

## BUG-000 2026-04-23 — Log initialized
**File(s):** bug_log.md
**Symptom:** No bug history existed
**Root cause:** New system
**Fix applied:** Created log
**Prevention rule:** Append every fix here. Don't rely on memory.
**Project:** all

## BUG-001 2026-04-25 — `vefa-ev-mod` / `vefa-ev-moderate` class drift
**File(s):** workspace.html (CSS line 413, JS line 1178 pre-fix)
**Symptom:** Two CSS rules with identical bodies for the same semantic state. Step 2 row chip emitted the short form (`vefa-ev-mod`); Step 3 chip emitted the long form (`vefa-ev-moderate`) via dynamic `toLowerCase()`. Both rendered correctly but a future amber-styling change had to be applied in two places.
**Root cause:** Step 2 was hand-written with abbreviated tokens; Step 3 was added later as a generic `vefa-ev-${ev.toLowerCase()}` template that emits the full DB string `Moderate`. CSS was extended at the new chip site without auditing the older one.
**Fix applied:** Standardized on `vefa-ev-moderate` (matches dynamic emit). Updated line 1178 to emit the long form. Dropped the duplicate `.vefa-ev-mod` CSS rule. Commit `c4dd63b`.
**Prevention rule:** When a render path expands from hand-mapped to template-driven (`'mod'` → `${ev.toLowerCase()}`), audit every CSS class hand-mapped to a vocabulary that doesn't match the DB string. Prefer the DB-string form so dynamic emit "just works."
**Status:** RESOLVED
**Project:** alt-meridian

## BUG-002 2026-04-25 — Orphaned `newAnalysis` modal render path
**File(s):** workspace.html (lines 636, 1475–1517, 1519–1558, 2288 pre-fix)
**Symptom:** ~88 lines of unreachable code: `renderNewAnalysisModal`, `onNewAnalysisSubmit`, dispatch arms in `renderModal` and the form-submit handler. Nothing in the file set `state.modal === 'newAnalysis'` — the trigger that historically opened it (`open-new-analysis`) had been retargeted to `openVEFAssist({mode:'new'})` when VEF Assist replaced the legacy intake.
**Root cause:** Replacement work redirected the user-visible trigger but didn't delete the now-unreachable target. Three shared constants (`STAGES`, `PHASES`, `FU_TRIGGERS`) inside the dead section made delete-by-instinct dangerous — they're used live by VEF Assist Step 1 and the Deal tab.
**Fix applied:** Deleted the dead functions and dispatch arms; preserved the constants under a renamed "FORM CONSTANTS" header; retargeted the stale "mirror onNewAnalysisSubmit" comment in `vefaBuildEngagementRow` to schema-anchored language. Commit `fbaa50a`.
**Prevention rule:** When replacing a modal/feature: (1) grep both the trigger action AND the modal-key string (`state.modal === 'X'`) before declaring the replacement done; (2) before deleting a section, grep every const/helper inside it for live callers — section headers don't tell you about cross-section reuse.
**Status:** RESOLVED
**Project:** alt-meridian

## BUG-003 2026-04-25 — `evidence_ids` registry fallback punted
**File(s):** workspace.html (`vefaSourcesCount`, line 1229 post-fix)
**Symptom:** Step 3 evidence table showed `Sources: 0` and classified scenarios as "Assumption" whenever the scenario row's `evidence_ids` column was null/empty — even when `vef_evidence_registry` actually contained rows for that scenario. The function returned `0` immediately on empty `evidence_ids` with no fallback.
**Root cause:** Original implementation only consumed the denormalized CSV column on the scenario row. The normalized `vef_evidence_registry` table is loaded into `state.evidence[domain_id]` at `onOpenEngagement` (line 1568) but VEF Assist Step 3 never read from it.
**Fix applied:** Fall back to `state.evidence[s.domain_id]` filtered by `scenario_id === s.scenario_id` when `evidence_ids` is empty. New-analysis path (no engagement open yet, registry not loaded) degrades to 0 — same as prior behavior, no regression. Commit `9dd813a`.
**Prevention rule:** Before adding a new fetch for "missing data" cases, check whether the same data is already loaded into session state by an earlier flow. Cheaper to filter what's already in memory than to add a second source of truth and re-fetch.
**Status:** RESOLVED
**Project:** alt-meridian

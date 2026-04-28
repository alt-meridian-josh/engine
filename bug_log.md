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

## BUG-004 2026-04-26 — Snapshot intent capitalization violates DB CHECK constraint
**File(s):** workspace.html (line 1661 auto-snapshot, line 2757 modal handler)
**Symptom:** Save Snapshot insert into `vef_output_snapshots` rejected by Postgres CHECK constraint when `intent` is sent capitalized ('Convince', 'Measure', 'Justify', 'Track'). The DB enum is lowercase ('convince', 'measure', 'justify', 'track').
**Root cause:** The `SNAP_INTENTS` UI vocabulary is capitalized for display, but the same string was written through to the DB without normalization. Two emit sites: the modal form value (`f.intent.value`) and the auto-snapshot row built before VEF Assist update (hardcoded `'Track'`). `snapshot_label` does NOT have a similar constraint — its values include capitals + hyphens (e.g., '30-Day Follow-Up') and have been working in production, so it's free text or a different shape.
**Fix applied:** `.toLowerCase()` on `f.intent.value` at line 2757; hardcoded `'Track'` → `'track'` at line 1661. Display labels in `SNAP_INTENTS` and the snapshot card meta line are unchanged — they continue to use the user-friendly capitalized form. Commit on main.
**Prevention rule:** When a UI vocabulary maps to a DB enum, normalize at the WRITE site (not the SOURCE constant), so the user-visible label can stay readable while the DB value matches the constraint. Audit every emit site that writes to the same column — modal handlers AND any background/auto paths.
**Status:** RESOLVED
**Project:** alt-meridian

## BUG-005 2026-04-26 — Context bar tier chip showed 'TIER' label prefix instead of just tier name
**File(s):** workspace.html (renderContextBar — line 1897 pre-fix; orphan CSS line 222 pre-fix)
**Symptom:** Tier chip rendered as "TIER TYPICAL" / "TIER 1" instead of the bare tier name. Spec for the chip listed values as `CONSERVATIVE / TYPICAL / AGGRESSIVE` with no prefix.
**Root cause:** Chunk 2 added a `<span class="ws-ctx-tier-key">TIER</span>` prefix inside the chip thinking it improved readability. Spec didn't ask for it and the prefix made the chip noisier than the other context-bar chips. The user read the prefix + value as one unit ("TIER 1") and flagged it as wrong content.
**Fix applied:** Removed the prefix span from the chip template; kept the chip's title attribute ("Cycle assumption tier") so the affordance is still discoverable on hover. Removed the now-orphan `.ws-ctx-tier-key` CSS rule.
**Prevention rule:** When a spec lists chip content as a list of bare values, render exactly those values — don't add prefix labels for "context" unless the spec asks. The chip's `title` and surrounding bar provide context already.
**Status:** RESOLVED
**Project:** alt-meridian

## BUG-006 2026-04-26 — Home filter + search persist across navigation, look like wrong defaults
**File(s):** workspace.html (back-to-home dispatch arm at line 3040)
**Symptom:** User reported the Analysis Home default filter tab was "COMPLETED not ALL" and that the stats row appeared filtered. Source state init sets `homeFilter:'all'` and `computeHomeStats()` reads from the global `state.engagements` (not `homeRows()`), so neither default was actually wrong on first load. The illusion appeared only after navigation: clicking a tab (e.g. Completed) or typing in the search persists into `state.homeFilter` / `state.homeSearch`, and `back-to-home` only reset `screen`, `activeEngagementId`, and `activeTab` — leaving the previous filter/search sticky. Returning to Home then showed the previously-selected tab highlighted, with the table filtered to a small (or empty) subset, while the stats row still reported global totals — reading as a stats/table inconsistency.
**Root cause:** Back-navigation reset was incomplete — preserved home-screen filter state instead of returning to the canonical default view.
**Fix applied:** Added `homeFilter:'all', homeSearch:''` to the `back-to-home` setState patch. Sort preference (`homeSort`) intentionally NOT reset — sort is a viewing preference, not a filter, and persisting it across sessions is helpful UX.
**Prevention rule:** When a screen has multiple state fields driving its view, the back-navigation reset must list every field that should snap back to default — not just the screen and active tab. Audit setState patches that change `screen`: any per-screen state that's user-selectable AND has a meaningful "default view" should be reset there.
**Status:** RESOLVED
**Project:** alt-meridian

## BUG-007 2026-04-28 — Topbar Report button shipped as a no-op handler
**File(s):** workspace2.html (AnalysisShell topbar, line 1942 pre-fix)
**Symptom:** The "Report" button in the AnalysisShell topbar rendered with full primary styling (red bg, hover state) but had no `onClick`. Clicking it did nothing. Survived undetected through the A1–A9 tag-engine merges and the I1–I5b intake feature; surfaced when a buyer-facing report was finally requested.
**Root cause:** The button was added to the topbar markup as a placeholder during an earlier rebuild and never wired to a handler. No type-check, no test, no visual signal that the button was inert (no `disabled` attr, no missing-handler React warning since `onClick` is optional).
**Fix applied:** R1–R5 introduced the print report path. Module-scope `openPrintReport()` toggles `body.print-mode` and calls `window.print()` with an idempotent `afterprint` cleanup. Button now wired to `openPrintReport`. Curated print stylesheet renders cover, hero, interpretation, scenarios, evidence, tags, and snapshot history.
**Prevention rule:** See CLAUDE.md — primary action buttons must have either a handler or a `disabled` attribute before merge.
**Status:** RESOLVED
**Project:** alt-meridian

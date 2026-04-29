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

## BUG-008 2026-04-28 — `weakLast` and `hideNonBiasedWeak` shipped as dead config (gap analysis #5, #6b)
**File(s):** workspace2.html (TAG_BEHAVIOR + ScenariosTab + ReportView), vef2.html (TAG_BEHAVIOR mirror, rankScenariosForVef comment)
**Symptom:** Two flags declared on `TAG_BEHAVIOR` (`new_footprint.weakLast`, `compliance_driven.hideNonBiasedWeak`) and merged onto the resolved `behavior` object (`TAG_BOOL_FIELDS` at vef2:161 / ws2:265) — but read by zero consumers. `new_footprint`-tagged engagements showed weak scenarios in default position; `compliance_driven`-tagged engagements showed weak non-Compliance scenarios in the buyer-facing list. Caught by gap-analysis pass (#5, #6b) after the A1–A9 squash merge.
**Root cause:** Schema declaration was valid (the flags merged cleanly into the `behavior` object), so a static check would say "tag is recognized". But no consumer was wired into the sort/filter path. Dead-config of this shape passes typecheck and runtime alike — only an end-to-end "does the buyer see what the spec describes" check exposes it.
**Fix applied:** Added `applyWeakLast(scenarios, on)` near `rankScenarios` and `applyHideNonBiasedWeak(scenarios, behavior)` near `applyThemeBias`. Wired into ScenariosTab (live UI) and ReportView (printed buyer artifact, including `topMechs` and `themeRaw` so theme totals reflect the visible set). Compose order: filter → rank → demote-weak. `hideNonBiasedWeak` reads `behavior.autoActiveThemes ?? behavior.themeBias ?? []` (autoActiveThemes is the literal source of truth for compliance_driven; themeBias fallback enables future tags that bias without auto-activating). Predicate restricted to `s.active` because workspace2 has no tag-toggle UX (no UI to mutate the TAGS line in engagement.notes); inactive weak non-biased rows stay visible so the seller can browse them. vef2's `rankScenariosForVef` got a comment explaining why these flags are intentionally workspace2-only (Step 2 is the seller's pre-engagement picker; hiding/demoting at that stage breaks scenario selection).
**Prevention rule:** When a tag/config schema declares a flag, the chunk that adds the flag must also add (or stub with a TODO) the consumer in the same commit. Dead-config audits are now part of the schema-vs-consumer gap-analysis pass: every field on a behavior object should have at least one read site outside the merger.
**Status:** RESOLVED
**Project:** alt-meridian

## BUG-009 2026-04-29 — `vef_scenario_selections.is_active` column referenced in code but not in schema
**File(s):** vef2.html:1002 (createAnalysis upsert), workspace2.html:643 (mergeScenarios read), workspace2.html:2278 (auto-activation effect), workspace2.html:2296 (manual toggle)
**Symptom:** Creating an analysis via vef2 (or toggling a scenario in workspace2) failed with PostgREST error `column "is_active" of relation "vef_scenario_selections" does not exist`. Code paths uniformly used `is_active` (the new name); the table still had the original `active` column.
**Root cause:** During the v3 rebuild on 2026-04-27 (commits `ce6db4c` W5, `7044a12` W7, `d54cc17` A7 on workspace2; `e7a1f22` V8 on vef2), the React rebuild standardized read/write column names on `is_active` to match later schema intent — but the matching DDL `ALTER TABLE … RENAME COLUMN active TO is_active` was never authored in the same chunk. The rename existed as an assumption in code with no migration to back it.
**Fix applied:** Direct DDL in Supabase dashboard: `ALTER TABLE vef_scenario_selections RENAME COLUMN active TO is_active`. No code changes.
**Prevention rule:** Any column rename or addition referenced in code must ship with a same-chunk DDL note (in the commit body or in a `migrations/` artifact). Audit step before merging a chunk that names a non-trivial column: run a quick `select <column>` smoke test or paste the DDL in the commit message so the next session has a paper trail. Also: legacy code paths must be checked when renaming. **workspace.html:717 and :2442 still reference the OLD `active` column** (legacy v1 surface, last touched 2026-04-27). Per the no-fix-other-code constraint of this session, those references are NOT patched here, but legacy v1 toggling/save paths will now fail with the inverse error (`column "active" does not exist`) until either the v1 file is updated or v1 is retired.
**Status:** RESOLVED (DDL applied)
**Project:** alt-meridian

## BUG-010 2026-04-29 — `vef_scenario_selections` missing UNIQUE constraint for ON CONFLICT
**File(s):** vef2.html:1002 (createAnalysis), workspace2.html:2278/:2296 (auto-activation + toggle), workspace.html:1612/:1697/:2442 (legacy v1 save paths)
**Symptom:** After BUG-009 was fixed, the upsert still failed: PostgREST error `there is no unique or exclusion constraint matching the ON CONFLICT specification`. Six call sites pass `'engagement_id,scenario_id'` as the `onConflict` argument to `sbUpsert`, and the table had no matching unique constraint. Without the constraint, PostgREST refuses the upsert path entirely.
**Root cause:** The ON CONFLICT clause was authored in v3 rebuild commits (same set as BUG-009: `ce6db4c`, `7044a12`, `d54cc17`, `e7a1f22`, plus older legacy paths in `workspace.html`) on the assumption that a unique constraint on `(engagement_id, scenario_id)` already existed. It didn't; the table presumably had only a generic primary key. Same root cause as BUG-009 — code-side schema assumptions outran DDL.
**Fix applied:** Direct DDL in Supabase dashboard: `ALTER TABLE vef_scenario_selections ADD CONSTRAINT vef_scenario_selections_engagement_scenario_unique UNIQUE (engagement_id, scenario_id)`. No code changes.
**Prevention rule:** Any new `sbUpsert` call with an `onConflict` argument must verify that a matching UNIQUE or EXCLUSION constraint exists on the named columns before merge. Tables in this codebase with ON CONFLICT upserts: `vef_scenario_selections (engagement_id, scenario_id)` — now constrained as of this fix; `vef_input_values (engagement_id, input_key)` — constraint status NOT verified in this session, has been working in production but worth confirming exists. Audit step: before merging a chunk that adds an upsert with a new conflict tuple, paste a `\d <table>` output or the DDL in the commit message.
**Status:** RESOLVED (DDL applied)
**Project:** alt-meridian

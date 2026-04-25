# task_lessons.md
# Self-improvement log — read at the start of every Claude Code session

> Format: date · title · context · what happened · root cause · rule going forward · project tags
> This file is append-only. Never delete entries. Escalate repeated patterns to CLAUDE.md.

---

<!-- TEMPLATE — copy for each new lesson

## [YYYY-MM-DD] — [short title]
**Context:** what we were building
**What happened:** the issue or insight
**Root cause:** why it happened
**Rule going forward:** the generalizable principle
**Applies to:** [rfid-accelerator | alt-meridian | supabase | german-citizenship | other]

-->

## 2026-04-23 — Initial setup
**Context:** CLAUDE.md system initialized
**What happened:** Established the five-rule operating system for all sessions
**Root cause:** N/A — intentional design
**Rule going forward:** Read this file before every session. Apply tagged rules to active project.
**Applies to:** all

## 2026-04-23 — Search-input focus loss on full re-render
**Context:** Building workspace.html home screen. `setState()` replaces `#app.innerHTML`, which destroys the currently-focused search input mid-keystroke — the field loses focus and the user has to click back in to keep typing.
**What happened:** First pass wired the search box through `setState({ homeSearch: val })`. Every keystroke rerendered the full home and dropped focus. Fix: set `state.homeSearch` silently and replace only `.table-wrap` via `outerHTML = renderAnalysisTable(homeRows())`.
**Root cause:** A single `render()` function tied to the whole screen can't preserve DOM identity for an input being typed into. Vanilla-JS re-render pattern ≠ React's reconciliation.
**Rule going forward:** When a render function owns the full screen, live text inputs need targeted DOM updates (replace just the dependent subtree), NOT `setState → render`. Apply the pattern: mutate state, then `node.outerHTML = renderFragment(...)` for the consumers.
**Applies to:** alt-meridian, other single-file SPAs

## 2026-04-23 — 150-line chunk cap forced a cleaner scope cut
**Context:** Chunk 8 (Overview tab) naturally included KPIs, Health, Scenarios-mini, Timeline, Next Actions AND Stakeholders + inline-edit. First pass hit 193 lines of diff.
**What happened:** Rather than breaking the cap, I moved Stakeholders + inline-edit to Chunk 13 (the polish chunk). Chunk 8 landed at 150. Chunk 13 took the deferred work plus Esc/Enter key handling — which grouped cleanly as 'all cross-tab interaction polish.'
**Root cause:** First pass sized work by 'what belongs on this tab,' not 'what belongs in this commit.' The cap forced a commit-boundary view.
**Rule going forward:** Commit-size caps aren't overhead — they surface the right scope cuts. When over budget, ask 'what here is polish vs structure?' and move the polish.
**Applies to:** alt-meridian, all

## 2026-04-23 — `applyPreset` baseline snapshot prevents compounding
**Context:** Inputs tab preset buttons multiply scenario.annualImpact by 0.75/1/1.25. Naïve implementation compounds on repeated clicks.
**What happened:** First sketch multiplied the live `annualImpact` in-place. Clicking Aggressive → Aggressive → Conservative left values at 1.25·1.25·0.75·original, not 0.75·original.
**Root cause:** Forgot to separate baseline from derived state.
**Rule going forward:** Any state that can be rescaled or re-expressed needs an explicit baseline stored on first mutation (`baselineImpact ??= annualImpact`). Derive rendered values from baseline every time; never mutate the baseline.
**Applies to:** alt-meridian, any modeling UI

## 2026-04-24 — Schema-uncertain inserts: stash auxiliary fields in JSON sidecar
**Context:** Rebuild of workspace.html (v2) — user said some columns on `vef_engagements` and `vef_output_snapshots` may not exist yet on every tenant, and SELECTs should read defensively. But INSERTs with unknown columns hard-fail.
**What happened:** The Save Snapshot modal needed to capture stage/phase at time of snapshot per spec, but `stage_at_snapshot` / `phase_at_snapshot` aren't in the documented schema. Similarly the New Analysis modal had an 'Executive Sponsor Email' field with no matching column.
**Root cause:** Reading defensively via `select=*` works because any column order is returned; inserting a non-existent column is a hard PostgREST error.
**Rule going forward:** When a spec requires capturing fields that may not exist as columns: (a) stash them inside an existing JSON column (`input_snapshot._meta`), or (b) serialize into `notes` with a labeled prefix. Never send a speculative column on INSERT — fail-closed beats fail-loud in a demo. Document the location in the commit.
**Applies to:** alt-meridian, supabase

## 2026-04-24 — Direct browser Anthropic API needs the permissive-origin header
**Context:** Meridian AI drawer does direct `fetch` to `api.anthropic.com/v1/messages` from the browser (no backend).
**What happened:** First attempts from a browser silently fail CORS without the explicit opt-in header.
**Root cause:** Anthropic requires `anthropic-dangerous-direct-browser-access: true` for browser-origin calls; without it CORS blocks the preflight.
**Rule going forward:** Browser-direct Anthropic fetches need all four headers: `content-type`, `x-api-key`, `anthropic-version: 2023-06-01`, `anthropic-dangerous-direct-browser-access: true`. Default to prompt-for-key + `localStorage` persistence — never hard-code a key in the HTML.
**Applies to:** alt-meridian, any single-file AI UI

## 2026-04-24 — Full-page re-render breaks scroll and focus for chat drawers
**Context:** Meridian drawer is rendered inside `renderWorkspace`, which is replaced wholesale on every `render()` call. After each message the scroll position reset to top and the input lost focus.
**What happened:** Symptom only showed up once chat had enough messages to scroll. Fix: add an `afterRender()` hook called via `requestAnimationFrame` from the render dispatcher; restores `scrollTop = scrollHeight` on `.mx-body` and refocuses the composer input when not disabled.
**Root cause:** Vanilla full-render pattern loses imperative DOM state (scroll, focus) every frame.
**Rule going forward:** Any SPA that does full-page innerHTML re-renders needs a lightweight `afterRender` hook for imperative state (scroll, focus, intersection observers, etc). Call it via rAF so the new DOM is painted first.
**Applies to:** alt-meridian, single-file SPAs

## 2026-04-24 — Verify 'already done' before re-doing pre-flight fixes
**Context:** VEF Assist build kicked off with three requested pre-flight fixes (is_active rename, input_def dedupe, ARV diagnostic). Git log showed all three already landed on origin/main at 76f0058, d678f5f, 41e25bf before the session started.
**What happened:** Flagged the state + showed the evidence from `grep` + `git show --stat` instead of silently re-doing the work. If I'd run the edits blindly I would have created three duplicate no-op commits (or three near-duplicates with subtly different copy).
**Root cause:** Prompt re-use across sessions. Users describe the same work twice when the prior session's output isn't in their context.
**Rule going forward:** Before starting ANY task that claims to 'fix X at line N', run the sanity triple: (1) `git log --oneline -20`, (2) `grep -n <target> <file>`, (3) `git show --stat <suspect-hash>` on any commits whose subject matches the ask. Report findings before writing code.
**Applies to:** all

## 2026-04-24 — Split chunks on distinct DB shape, not feature boundary
**Context:** VEF Assist Chunk F as originally scoped (create + update + snapshot + prefill + topbar + CSS) projected to 155-170 lines. Over the 150 cap.
**What happened:** Bisected at create/update rather than trimming polish. F1 = create path + helpers + Home trigger; F2 = update path + prefill + snapshot prompt + topbar. Each committed cleanly at ~95 lines. The cut held because create and update have genuinely different DB operations (INSERT + generated id vs PATCH + existing id), different prefill needs (none vs sidecar-unpack), and share only the row-builder and validator — which end up living in F1 and reused from F2.
**Root cause:** The natural fracture line in mixed-op chunks isn't usually "what's polish" — it's "where does the DB shape change." When two halves of a chunk touch different tables or different verbs, that's the split.
**Rule going forward:** When a chunk mixes INSERT + PATCH paths, split by verb. Shared helpers land with the first half; the second half is pure orchestration.
**Applies to:** all

## 2026-04-24 — DOM-injected inline strips beat re-render for confirm affordances
**Context:** VEF Assist Step 3 'Save snapshot before updating?' prompt (Q8 — non-blocking, no nested modal).
**What happened:** First instinct was to add `pendingUpdateConfirm: true` to state and re-render Step 3 to show the strip. That would have wiped focus from the Notes textarea if the user was mid-type. Switched to `vefaUpdateInitiate()` that creates a `<div>` and appends it to `.vefa-body` imperatively. No setState. Idempotent (returns early if `#vefa-update-strip` already exists). Auto-scrolls via `body.scrollTop = body.scrollHeight`.
**Root cause:** Re-rendering a subtree that contains a focused input kills focus regardless of state spread (the DOM node is replaced, not diffed). State-bound React-style thinking is the wrong mental model for vanilla-JS SPAs.
**Rule going forward:** For ephemeral UI that gets added ONCE per user action (confirm strips, flash banners, inline previews) — imperative DOM append is simpler and safer than a state flag + re-render. Idempotency via `document.getElementById` check. Pair with the input-preservation lesson: any time a focused control is in the same subtree you'd otherwise re-render, do it imperatively.
**Applies to:** alt-meridian, single-file SPAs

## 2026-04-24 — Global pool cache for pre-domain fuzzy matcher
**Context:** VEF Assist Step 0 extracts vendor claims and matches them against `vef_value_scenarios` BEFORE the user picks a domain in Step 1. The domain-scoped loader (`loadScenariosForEngagement`) isn't applicable — there's no engagement yet.
**What happened:** First draft put the pool fetch inline in `vefaProcessExtraction` and would re-fetch on every retry. Moved to `state.vefAssist._matchPool`: fetch once per modal session via `sbSelect('vef_value_scenarios')` with no filter; subsequent extracts reuse the cache. Cleared automatically when `makeVEFAssistState()` rebuilds on close.
**Root cause:** Step-0 matching has no domain filter to pin against, so it needs the full table. Repeated extracts (user rephrases their paste) would be wasteful if each re-loaded the pool.
**Rule going forward:** When an operation needs a global table and the user can retry that operation within the same UI session, cache on the session-scoped state object (not on module globals — those leak between sessions). Factory function that rebuilds on close handles lifecycle for free.
**Applies to:** alt-meridian, any session-scoped search UI

## 2026-04-25 — Read-only audit BEFORE editing pays for itself
**Context:** Three known-issue cleanup chunks on workspace.html (class drift, orphaned modal, registry fallback). Pattern: user asked for the audit first, then approved fixes one-shot.
**What happened:** The audit surfaced two facts that would have caused a regression if I'd jumped straight to deletion: (1) the "dead" `STAGES`/`PHASES`/`FU_TRIGGERS` constants inside the orphaned modal section are actually live — referenced by VEF Assist Step 1 and the Deal tab; (2) the existing `evidence_ids` CSV parsing was already correct — what was punted was specifically the *fallback* path, not the parser. Without the audit step I'd have either deleted live constants or rewritten correct code.
**Root cause:** "Orphaned" and "punted" are easy to misread as "delete" and "rewrite." The actual scope is usually narrower.
**Rule going forward:** When a task names "issues to fix," do a structured read-only audit first — for each issue, list (a) what's reachable, (b) what's actually unreachable, (c) shared dependencies. Report findings with line numbers and wait for go. The audit pass also gives you a free verification baseline for the fix.
**Applies to:** all

## 2026-04-25 — Preserve orphan-looking helpers across chunks during rip-and-replace
**Context:** Value Case redesign, six chunks, one file (workspace.html). Chunks 1–4 didn't call `renderScenarioCard` / `renderShadowed` / `evidenceSummary` / `evidenceChip`, but Chunk 5 (collapsible scenario detail) was a plausible reuse site.
**What happened:** Held on retiring the four helpers for four chunks. Chunk 5 ended up building a different compact card (different layout, different per-card state, no Evidence/CFO collapsibles) so the old helpers became truly orphan only at Chunk 5's end. Cleanup at Chunk 6 was −85 / +2. The win was that Chunk 5 plucked `.sc-switch` + `.sc-switch-track` out of the soon-to-be-retired `renderScenarioCard` and reused them — that was trivially obvious only because the parent fn was still in the file.
**Root cause:** "Orphan now" ≠ "orphan for the duration of the rebuild." During active rip-and-replace, anything a future chunk *might* want is conditionally live. Premature deletion turns "obvious to reuse" into "have to re-derive or grep history."
**Rule going forward:** During multi-chunk rebuilds, retire dead helpers in a *terminal QA chunk* — not in the chunk that first orphans them. Two-pass deletion: pass 1 marks "no current callers" (don't act); pass 2 (after the rebuild lands) confirms "no future callers either" and removes.
**Applies to:** alt-meridian, any multi-chunk SPA rebuild

## 2026-04-25 — Audit cleanup-chunk size before scoping; split when the cap forces it
**Context:** The original Chunk 5 was scoped as "Section 4 + Section 5 + QA pass." Once Sections 4+5 were written, the QA cleanup added ~80 lines of orphan-removal — total projected ~190, over the 150-line cap.
**What happened:** Caught the overrun *before* writing the cleanup code by running a pre-implementation grep pass: every orphan helper, every CSS class still referenced, every state field that becomes unused, every dispatch arm whose body is gone. Inventory came in at 4 helpers + 2 state fields + 3 dispatch arms + ~16 dead CSS lines. Splitting cleanup into its own Chunk 6 made both halves clean (Chunk 5 = 112 lines, Chunk 6 = 87 lines).
**Root cause:** "Build + cleanup in one chunk" is the natural mental model, but cleanup is its own kind of work with its own diff cost. That cost is measurable by audit, not by intuition.
**Rule going forward:** Any chunk that includes "remove orphan X" gets preceded by an explicit grep inventory: every token to remove, every CSS class retained, every dispatch arm. If audit + new-feature exceeds the cap, the cleanup gets its own chunk. Don't estimate cleanup cost from memory.
**Applies to:** alt-meridian, all

## 2026-04-25 — Verify branch state before merging — `git fetch` first
**Context:** User asked to merge a feature branch to main. I checked `git branch -a` first and didn't see the named branch — concluded "doesn't exist." Then a later fetch revealed `origin/claude/vef-assist-Qb4q5` did exist on the remote and held exactly the work the user described. I'd also reported `origin/main` was at `62e0e04` when in fact the next fetch updated it to `41e25bf` mid-conversation.
**What happened:** Two false-negative findings reported to the user before any destructive action — caught only because the user pushed back. If I'd just merged `chunk-f3-ZQCdv` (the only feature branch I "saw"), I'd have shipped the wrong work under the wrong commit message.
**Root cause:** `git branch -a` only shows refs you've already fetched. It is not authoritative about what's on the remote. And remote refs change while you're working.
**Rule going forward:** Before any merge / branch-existence claim: `git fetch origin` first, then check. Re-run `git fetch` if more than a few minutes have passed. State the fetch result in the report so the user can sanity-check the timestamp.
**Applies to:** all

## 2026-04-24 — Fuzzy-match token filters: length + stopwords + 'strong' gating
**Context:** Step 0 claim→scenario matcher. Naive token intersection scored every scenario that mentioned common words like "cost" or "time".
**What happened:** Added three filters:
  1. Token length >= 3 (drops "to", "of", "in").
  2. Stopwords set (drops "the", "and", "for", "with"...).
  3. 'Strong' bucket = mechanism_label + value_theme, but only counts tokens of length >= 6 as strong matches (keeps short common words like "cost"/"time" from scoring strong on every row).
  Qualifying rule: hits >= 2 OR strongHits >= 1. Score = `hits*10 + strong*5 - print_priority`.
**Root cause:** English has too many short, generic words for naive intersection to be useful. The second-layer 'strong' gate compensates by weighting specificity.
**Rule going forward:** Any fuzzy text matcher in this codebase needs (a) minimum token length, (b) a stopwords list, (c) a secondary 'strong' signal gated on higher length for categorical fields. Document token-gen as a reusable helper before the second user needs it.
**Applies to:** alt-meridian, any retrieval-without-embeddings UI

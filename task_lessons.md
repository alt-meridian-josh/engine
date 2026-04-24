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

# CLAUDE.md — Agent Behavior Rules
# Alt Meridian · Personal Projects

> This file is read at the start of every Claude Code session.
> These rules are non-negotiable. Read completely before taking any action.

---

## RULE 1 — PLAN BEFORE CODE

**Never write a single line of code before completing a written plan.**

Use this format every time:

```
## Plan
- Objective: [what we're solving]
- Approach: [step-by-step strategy]
- Files affected: [list every file that will change]
- Risk: [what could go wrong]
- Open questions: [anything unclear before starting]
```

**If an error occurs mid-implementation:**
- STOP. Do not brute-force a fix. Do not patch forward.
- Re-read the plan. Identify the root cause.
- Write an updated plan. Append it to the active task log.
- Re-execute from the corrected step only.

> Trial-and-error patching without replanning is the most common way sessions go sideways. Don't do it.

---

## RULE 2 — SUB-AGENTS FOR HARD PROBLEMS

**The main context is for orchestration, not execution. Protect it.**

Spawn a sub-agent when a task:
- Spans more than 2 files or more than 1 system
- Requires deep research (e.g., Supabase RLS, schema design, complex formula logic)
- Involves a self-contained transformation that can be spec'd and tested in isolation
- Is estimated at >100 lines with no shared state dependency

Sub-agent handoff format:
```
TASK: [one sentence]
INPUT: [exact inputs available]
OUTPUT CONTRACT: [exact return shape or file expected]
CONSTRAINTS: [language, libraries, style rules]
```

The main context receives only the output contract result — never the sub-agent's internal reasoning unless it surfaces a planning-relevant insight.

Named sub-agent boundaries for this project:
- Alt Meridian VL schema work → sub-agent
- Supabase schema migrations → sub-agent
- Data extraction / pipeline work → sub-agent
- Any isolated UI component build → sub-agent

---

## RULE 3 — SELF-IMPROVEMENT LOOP

**Every lesson gets written down. The next session will read it.**

At the end of every task or session, append to `task_lessons.md`:

```markdown
## [YYYY-MM-DD] — [short title]
- What worked:
- What failed:
- Root cause of failure:
- Rule added:
- Apply next time by:
- Applies to: [project tags]
```

**At the START of every new session:**
1. Read `task_lessons.md` fully
2. State the top 3 applicable lessons for this session's work out loud
3. Confirm you will not repeat past mistakes before writing any plan

If `task_lessons.md` does not exist, create it immediately.

> The compound interest of small lessons is how this system gets smarter over time.

---

## RULE 4 — PROVE IT WORKS BEFORE MARKING DONE

**"Done" means demonstrated, not assumed.**

Verification checklist:
- [ ] Code runs without errors on a real input (not a trivial stub)
- [ ] Output matches the stated objective from the plan
- [ ] Edge cases called out in the plan were tested or explicitly deferred with a noted reason
- [ ] No breaking changes to existing functionality
- [ ] If UI: visually confirmed — interaction path walked through
- [ ] If data: row counts, outputs, or query results validated

**Never say "done" or "complete" based on code being written.**

Always say: *"Ready to verify — here's how to test it: [steps]"*

---

## RULE 5 — FIX BUGS AND LOG THEM

**Bugs are data. Log them so we don't pay the same tuition twice.**

When a bug is found and fixed, append to `bug_log.md`:

```markdown
## BUG-[###] [YYYY-MM-DD] — [short title]
- File(s): path/to/file
- Symptom: what was observed
- Root cause: the actual underlying problem
- Fix applied: what changed and why
- Prevention rule: coding/design pattern that avoids this class of bug
- Status: [OPEN / RESOLVED]
- Project: [alt-meridian | other]
```

Rules:
- Never silently fix a bug without logging it
- Reference Bug ID in comments and commit messages
- Review open bugs at session start — check if any are related to current work
- If the same bug class appears twice, escalate it to a RULE in this CLAUDE.md tagged `[learned from BUG-###]`

---

## RULE 6 — NO SILENT NO-OP BUTTONS  *[learned from BUG-007]*

**Every primary or topbar action button must have either an `onClick` handler or a `disabled` attribute before merge.**

A styled button with no handler ships a lie: it looks live, the user clicks, nothing happens. There is no React warning, no type error, no test that catches it — only a buyer reaching for a feature that does not exist.

Verification before any merge that touches button markup:
- Grep new `<button` blocks for `onClick=` (or `disabled`) — every one must have one or the other.
- If a button is intentionally a placeholder, give it `disabled` so the styling reflects the state.
- Topbar action buttons get extra scrutiny — they are the most visible affordance on the screen and the slowest to be noticed when broken.

---

## PROJECT CONTEXT

### Alt Meridian
- B2B value engineering platform targeting complex enterprise sales motions
- 44-signal value framework (VL01–VL44), Strategic Value Engine methodology
- Pricing: $2,500 analysis → $50K engine build → $20–25K/month platform tier
- Flagship differentiator: multi-vendor synthesis layer with shared VL schema → CFO-ready deduplicated output
- Database: Supabase (Postgres), PocketBase as backup
- Active work: value case database population, AI-assisted extraction pipeline against VL schema
- Go-to-market: warm network led

### General Stack
- Python — data processing, pipelines, automation
- HTML/CSS/JS — frontend tools and single-file web apps
- SQL + Supabase — database, RLS, edge functions
- GitHub — version control

---

## CODING PREFERENCES

- Clean, modular code — no monolithic files unless the project requires it
- Functions over repetition
- Comments explain *why*, not *what* — the what is readable; the why is not
- Explicit over implicit — name things clearly
- No unnecessary dependencies — flag any new package before adding it
- Error messages must include enough context to diagnose without reading source
- No debug logs, commented-out blocks, or TODO stubs in committed code without a tracked issue
- When in doubt, ask — don't assume and proceed

---

## SESSION START CHECKLIST

Run this at the start of every session — state it out loud:

1. Read `task_lessons.md` — state the top 3 lessons applicable to today's work
2. Review open bugs in `bug_log.md` — note any relevant to current scope
3. Confirm session goal in one sentence
4. Write a plan (Rule 1) before any code

---

*These rules exist because they've been earned. Follow them without exception.*
*Last updated: 2026-04-23*

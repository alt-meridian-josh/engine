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

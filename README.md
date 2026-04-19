# Alt Meridian — Platform Architecture README
*Last updated: 2026-04-18*

---

## Infrastructure

| Item | Value |
|------|-------|
| Supabase project | `kpecdezcolcycgpuqbgs` · us-east-2 |
| GitHub Pages | `joshuawillis910` repo, HTML files at root |
| Email | Resend · `noreply@altmeridian.com` · DNS verified |
| Alert destination | `josh@altmeridian.com` |

---

## HTML Files (deploy all to GitHub Pages root)

| File | Purpose |
|------|---------|
| `index.html` | Marketing site, three entry point cards, COI calculator, sample PDF download |
| `tool.html` | Seller Value Discovery + CFO Audit. **PDF and PPTX export live.** |
| `discover.html` | Buyer Solution Discovery. PDF export live. |
| `fd-admin.html` | FD admin dashboard — Pipeline, Intake, Outcomes, Engine Builds tabs. **Internal use only.** |

### Export Architecture (all client-side, no server needed)
- **PDF**: jsPDF 2.5.1 via cdnjs — wired in `tool.html` and `discover.html`
- **PPTX**: pptxgenjs@3.12.0 bundle via jsDelivr — wired in `tool.html` only
- Three-slide PPTX deck: Cover+Signals+Mechanism+COI / Evidence+CFO / Scenarios
- Button activates after first analysis render (`S.lastStructured` populated)

---

## Database Schema

### Core tables

| Table | Rows | Purpose |
|-------|------|---------|
| `vef_domains` | 22 | Domain definitions (15 active, 13 with scenarios) |
| `vef_value_scenarios` | 151 | Scenarios (127 active_by_default) |
| `vef_evidence_registry` | 144 | Evidence citations backing scenarios |
| `vef_value_signals` | 46 | Buyer signal library |
| `vef_input_definitions` | 315 | Slider definitions with defaults/ranges/sensitivity |
| `vef_builds` | 9 | Engine build registry (3 Active/Production) |
| `vef_engagements` | 7 | FD engagement audit trail |
| `vef_chat_leads` | 4 | Gate email captures from tool sessions |
| `vef_output_snapshots` | 3 | Timestamped calculation snapshots |
| `vef_benchmark_signals` | VIEW | Anonymized aggregate stats by domain/vertical |

### Key columns added (migration: `fd_engagement_schema_v2`)

**`vef_engagements` new columns:**
- `build_id` — FK → `vef_builds.engine_id` (links engagement to specific engine version)
- `intake_source` — `manual | form | tool`
- `intake_date` — date engagement was created
- `fd_week` — current delivery week (0–5+)
- `artifacts_delivered[]` — array: `pdf`, `pptx`, `tool-url`, `proposal-section`
- `next_action` — free-text next step
- `next_action_date` — target date

**`vef_builds` new columns:**
- `client_id` — opaque identifier, prep for RLS scoping
- `client_name` — human-readable client name
- `contract_date` — FD contract signature date
- `contract_value` — engagement value in USD

**`vef_output_snapshots` new columns:**
- `snapshot_label` — `kickoff | champion-session | cfo-review | delivery`
- `build_id` — FK → `vef_builds.engine_id`

---

## Edge Functions

All functions: `verify_jwt: false`

| Function | Version | Purpose |
|----------|---------|---------|
| `value-chat` | v13 | Structured JSON output, evidence tiers, session logging, email capture. `max_tokens: 1500` |
| `engine-data` | v3 | Loads active domain engines |
| `notify` | v2 | Resend email: analysis to prospect + lead alert to Josh |
| `fd-intake` | v1 | Creates engagement row, updates build with client info, sends Josh alert |

### Structured JSON schema (value-chat v13)
- **FORMAT A** — `analysis`: `{ type, title, signals[], mechanism, evidence[], scenarios[], coi, cfo_challenge, follow_up }`
- **FORMAT B** — `text`: `{ type, text }`
- **FORMAT C** — `audit`: `{ type, claimed_total, verified_low, verified_high, components[], narrative }`

---

## FD Engagement SOP Architecture

### Three layers

**Layer 1 — The engine (client deliverable)**
`vef_domains` + `vef_builds` + `vef_value_scenarios` + `vef_input_definitions` + `vef_evidence_registry`
Flip `engine_status` → `Production` to go live.

**Layer 2 — The engagement record (audit trail)**
One `vef_engagements` row per FD client. Maps to SOP phases:
- Kickoff → basic fields + `domain_id`, `build_id`
- Workshop → `scenarios_used[]`, `scenarios_cut[]`, `cfo_objections`
- Delivery → `artifact_purpose`, `language_out`, output snapshots
- Close → `outcome`, `outcome_date`, `deal_value`, `outcome_notes`

**Layer 3 — Artifact stream**
`vef_output_snapshots` + PDF/PPTX exports + tool URL (optionally scoped to `engine_id`)

### Week-by-week → schema mapping

| Week | Activity | Schema action |
|------|----------|---------------|
| W0 | Scoping | Draft `vef_domains` row |
| W1 | Workshop 1 | Build `vef_value_scenarios`, create `vef_builds` (Active) |
| W2 | Evidence/formulas | Fill `vef_evidence_registry`, `vef_input_definitions` |
| W3 | Champion session | Create `vef_engagements`; fill `scenarios_cut[]`, `cfo_objections` |
| W4 | CFO review | Set `artifact_purpose`, `language_out`; write `vef_output_snapshots` |
| W5+ | Deal tracking | Update `deal_stage` weekly |
| Close | Win/loss | Fill `outcome`, `outcome_date`, `deal_value`, `outcome_notes` |

---

## CFO Mode

`tool.html?mode=cfo` opens CFO Audit mode directly. URL param triggers `setMode('cfo')` on load.

CFO audit uses FORMAT C structured output — component-by-component claim verification with T1–T4 evidence tiers, Accept/Adjust/Remove verdicts, and a CFO narrative summary.

---

## Gate / Email Capture

After turn 1, a gate card appears in the chat. User submits email → `notify` edge function fires (Resend email to prospect + alert to Josh) → `vef_chat_leads` row written → session unlocked for continued use.

---

## Auth Gap (known, deferred)

Currently all tool pages use the anon key — no authentication or Row Level Security. Clients accessing the tool are technically on the same key as everyone else.

**Plan:** Add Supabase email login + RLS scoped by `engine_id` / `client_id` before onboarding client #2. `vef_builds.client_id` column is already in place.

Do not ship client-specific URLs without auth in place.

---

## Environment Variables (Supabase Edge Functions)

| Variable | Used by |
|----------|---------|
| `SUPABASE_URL` | All functions (auto-set) |
| `SUPABASE_SERVICE_ROLE_KEY` | All functions (auto-set) |
| `RESEND_API_KEY` | `notify`, `fd-intake` |

---

## Outcome Recording SOP

Every engagement close — win or loss — must be recorded. This data builds `vef_benchmark_signals` and is the primary asset for Phase 3 platform pricing.

**How to record:** Open `fd-admin.html` → Record Outcome tab → select engagement → fill outcome, close date, deal value, CFO objections, close blocker, notes → submit.

Target: recorded within 48 hours of close event.

---

## Domain Coverage (13 active with scenarios)

**RFID variants:** Data Centers (9), Aviation (8), Food Service/QSR (8), Infrastructure & Energy (7), Carriers & Parcel (7), Hospitality (6), Federal/Public Sector (6)

**Cross-vertical:** Location Intelligence/POI (12), Palantir AIP/Enterprise AI (8), BLE/Ambient IoT Cold Chain (6), Value Engineering Services (5), CAT Risk Intelligence (3), Computer Vision Mfg (3)

---

## Brand Colors

| Token | Hex |
|-------|-----|
| Accent (ACC) | `#C84B2F` |
| Ink (INK) | `#0F0F0F` |
| Light BG (LTBG) | `#F9F7F3` |
| Green | `#3A9B60` |
| Amber | `#C4852A` |
| Red | `#BD4242` |

---

## Strategic Phases

| Phase | Timeline | Target |
|-------|----------|--------|
| 1 | 0–60 days | 3 FD clients → $500K–$2M implied value |
| 2 | 3–9 months | Platform ARR $150–250K, 12+ engagements → $2–6M |
| 3 | 9–24 months | 30+ outcomes, cross-vertical benchmarks → $6–15M |
| 4 | 24+ months | 60–80 outcomes, $1–1.5M ARR → $15–25M exit |

---

## Pending Items

- [ ] Deploy `fd-admin.html` to GitHub Pages
- [ ] Deploy updated `tool.html` to GitHub Pages (PPTX now live)
- [ ] Auth layer — Supabase email login + RLS scoped by `client_id` (defer to client #2)
- [ ] Production webhook when engine promoted to Production
- [ ] Wire PDF into `notify` edge function (email attachment on gate submit)
- [ ] FD one-pager for sales

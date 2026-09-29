---
workflow: product-launch-video
flow: automation
storyboard: no
message: "Close the month in 3.1 days, not 12"
audience: "investors — seed/Series A partners reading a data room; finance-ops SaaS thesis"
destination: investors-demo
aspect: 1920x1080
language: en
length: 90s
angle: investors 7 beats (one-liner → problem → product → traction → why now → team → ask)
reveal: early
register: premium
voice: on
style_preset: blue-professional
---

## Intent

Ledgerly reconciles every bank feed, invoice and ledger entry automatically so a finance team closes
month-end in days instead of weeks (site/index.html:27–28). A 90 s restrained investor demo for partners
reading a data room. Chosen concept (pitch round, taken under `--yes`): **4 — "Audited, not animated"**:
the video presents itself like an audited statement — hard cuts only, no motion graphics on the numbers, the
product running at 1× in its own time (four consecutive tier-A windows, never replayed, never sped up), and
every number carries a small footnote marker whose line appears in a bottom rail ("¹ Average month-end close ·
as of 2026-06-30 · company ledger") exactly when the number lands. Promise: "Close the month in 3.1 days,
not 12" (c012 metrics.csv:5 + c007 site/index.html:27).

## Assets

- .media/capture/footage.mp4 — tier A product session (local static server, 3840×2160, 15.3 s): landing → Reconciliation → Auto-match → audit trail → Close September → Lock period. The "product does the work" beat.
- .media/capture/events.jsonl, capture-manifest.json, autozoom.json — click events, capture manifest (Layer-2 gate ran, 0 findings), 3 zoom segments.
- capture/screenshots/full-page.png — landing page plate (tier A still).
- capture/extracted/tokens.json — brand tokens: ink #14213D, accent #2A6F97, muted #5C6B7A, bg #F7F9FB, line #DFE5EC.
- metrics.csv — `--metrics` traction + ask source, rows 2–11, each with `as_of`.
- claims-index.json — 18 verified claims (site + metrics), 0 unverified.

## Customizations

- Investors mode (audiences/investors.md): 7-beat structure; one-liner ≤ 14 words in the first 5 s.
- Product ≤ 10 s (QA-04 default, `reveal: early`); product-frame share target ≥ 40 % (scorecard target, not lint).
- Pattern chain P1 over real data + P9 three traction cards + P3 kickers + P15 without heavy branding; ≤ 1 transition per beat, ζ 1.0, 0.5–0.8 s; concept 4 prefers hard cuts.
- Traction cards bound to `--metrics` rows verbatim with source + date, no rounding; conclusion written on the card.
- Ask card mandatory: EUR 1,500,000 · 500 active accounts · by 2026-12-15 · founders@ledgerly.example.
- VO on, Kokoro EN — flagged `tts_placeholder`; Art. 50 line "Narration is AI-generated.".
- Captions: 16:9 with VO → kicker cards ≤ 7 words per beat + SRT; no burned-in captions.
- Auto-zoom from `autozoom.json`; cursor synthesised.
- Claims index rule: every visible number/quote exists in `claims-index.json` with a source; `unverified` never reaches the screen (QA-12).
- Ship criteria: QA-01…QA-14, scorecard ≥ 80, vision critic mean ≥ 3.0 and no dimension < 2.
- Loudness −16…−18 LUFS (QA-08), target −17; quiet bed under speech.
- 16:9 master only (no `--format`).

## Notes

### Declared vs derived (intake.json)
| Field | Value | Declared / derived | Source |
|---|---|---|---|
| for | investors | declared | `--for` |
| duration | 90 s | declared | `--duration` |
| source | local ./site (static) | declared | `--local` |
| metrics | metrics.csv | declared | `--metrics` |
| yes | true | declared | `--yes` |
| format | 16:9 | derived | brief-contract § 2 |
| reveal | early | derived | default |
| voice | on | derived | default:(investors) |
| preset | blue-professional | derived | workflow Step 2 (brief silent): "investment-research rigor", remixed onto the brand tokens |
| privacy | default | derived | userConfig:privacy |
| budget | USD 25 | derived | default |
| lang | en | derived | English only |
| register | premium | derived | investors mode |

- Evidence: chain step `local` (static site served on 127.0.0.1 by the plugin); every product beat tier A; no reconstruction, no `reconstructed` label needed.
- Seeded demo data: the in-product "Demo workspace - seeded data" chip and the "Synthetic fixture" banner stay in frame. Ledgerly is a fictional company (GS-02 fixture).
- Gaps shown before render: no README, no CHANGELOG, no customer logos, no e2e user flow (the capture covers it); **no sourced why-now** (stays a gap, not invented); no MRR growth rate/window in metrics.csv; "11 hours" (c004) has no date → kept out of traction.
- Stop-list reminder: no "revolutionary", "seamless", "game-changing", "AI-powered" filler; numbers without adjectives.
- Privacy: default profile. Network manifest printed: registry.npmjs.org (bare npx before the pinned-CLI link), us.i.posthog.com (HyperFrames CLI telemetry).
- Music: only fetched pack is upbeat ende.app "Happy Beats / Business Moves"; the restrained CC0 beds are not pinned — bed kept quiet under VO (0.12).
- "Product does the work" is tier A only; "N× speed" labels if any speed-up (none planned); QA-04/QA-05 investor thresholds are vendor-derived defaults; entry into the vendor workflow via this BRIEF only.
- phase_blocked: none. conflicts: none.

### Planning rubric (skills/present/references/planning-rubric.md)
- Q1 product: Ledgerly matches every bank feed, invoice and ledger entry on its own, so a finance team closes month-end in days rather than weeks — source: site/index.html:28 (subhead), site/index.html:27 (h1 "Close the books in 3 days, not 12"); surface web-ui, mode product (product-profile.json)
- Q2 most credible claim: "3.1 days" average month-end close against the stated "12" — claim c012, source metrics.csv:5 (as of 2026-06-30, origin site/index.html:40), baseline c007 site/index.html:27, backed up by quote c008 site/index.html:54 (tier A: the footage shows the close flow itself, but the 3.1-day figure is sourced, not demonstrated). In mode 2 the captured "0 of 7 matched → 7 of 7 matched" after one click (footage 2.94–5.5) gets a new entry with `claim_type: demonstrated`. Out of the traction set: c004 "11 hours" (no date). The MRR has no growth rate or window: TODO(MRR growth rate / window not in metrics.csv), so traction can only take the `number · rate · window` form as 240 active teams (c010, 2026-08-31) · 118% NRR (c011, 2026-06-30).
- Q3 visual hook: one click on Auto-match turns the Nordwell Bank EUR table from "0 of 7 matched" to "7 of 7 matched" row by row, and Close September becomes clickable — footage 2.94–5.5, autozoom segment 1 (re-aims to the Auto-match button at 2.398, scale 2). STAR candidate: Lock period → "September locked" badge, footage 12.81 (autozoom segment 3).
- Q4 show from the product: app.html Reconciliation screen, in order: Auto-match (2.94–5.5), then the Audit trail panel for INV-2026-0418 Coldharbour Packaging (6.46–8.9), then the Close September checklist ticking 5 steps (8.98–11.6), then Lock period and the "September locked" badge (12.81–15.3). Tier A: capture-manifest.json tier A, local static server, OCR/gitleaks gate ran with 0 findings. That is 13.7 s of usable footage (1.6–15.3) against the ≥40 % product-share target (36 s at 90 s), so the rest has to come from `capture_hold` and `capture_drift`, never a replayed window. The data is seeded demo data: the in-product "Demo workspace – seeded data" chip and the "Synthetic fixture" banner stay in frame.
- Q5 shortest satisfying length: 60 s (7-beat demo-day cut) — band investors demo 60–120 s (QA-01). The brief declares 90 s, so delivery must land in 87.3–92.7 s with the 7 beats; the why-now beat has no source: TODO(why-now — no file, metric or URL in the repo states one; it stays a gap and is not invented).
- Q6 register / preset: premium / no preset declared — derived: investors → premium (intake.json derived.register), restrained demo, ≤1 transition per beat, spring ζ 1.0. Visual tokens come from the capture (ink #14213D, accent #2A6F97, bg #F7F9FB, surface #DFE5EC). No font was captured, so the workflow's Step 2 picks the typeface. No `back.out`.
- Q7 audio: a quiet support bed that sits under the voice. VO on (mode default), Kokoro TTS, so `tts_placeholder` plus the Art. 50 line "Narration is AI-generated." on the end card. Bed: `pack:vol-1`, ducked to 0.12 under the voice. The only fetched pack is upbeat "Happy Beats / Business Moves". Of its tracks, vol-10 (60.0 s) and vol-11 (87.6 s) are shorter than the 90 s cut. Among the three that cover it, vol-1 (164 s, −14.8 LUFS, LRA 2.8 LU) is the steadiest (vol-9 LRA 4.7, vol-12 LRA 5.7). No restrained CC0 corporate bed has been fetched yet. Locks: the reveal on the Auto-match flip, the hero entrance on "September locked", a 0.3–0.5 s dropout before it. Target −17 LUFS (band −16…−18).
- Q8 share caption: "Ledgerly closes a finance team's month in 3.1 days, not 12 — raising EUR 1,500,000 to reach 500 active accounts."
- Q9 user flow: Reconciliation "0 of 7 matched" → Auto-match → "7 of 7 matched" → audit trail for one line → Close September checklist → Lock period → "September locked" — source: .media/flow.json steps 3–12, .media/capture/events.jsonl (story-extraction `user_flow: null`, gap no-user-flow; the capture covers it)

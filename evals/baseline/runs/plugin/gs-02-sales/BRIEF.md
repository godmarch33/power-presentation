---
workflow: product-launch-video
flow: automation
storyboard: no
message: "Close the books in 3 days, not 12"
audience: sales — Dana Okafor, Head of Finance, Northbridge Retail Group (a finance lead whose team reconciles month-end by hand)
destination: sales-outreach
aspect: 1920x1080
language: en
length: 60s
angle: sales inverted pyramid, SB7 with two use-cases (60 s)
reveal: early
register: medium
voice: on
style_preset: blue-professional
---

## Intent

A 60-second personalised sales outreach video for Dana Okafor, Head of Finance at Northbridge Retail Group,
about Ledgerly — a web app that matches bank lines to invoices automatically, posts them and runs the month-end
close checklist through to a locked period. Her stated pain: manual month-end reconciliation. Chosen concept
(pitch round, recommendation 3 under `--yes`): **"The life of one line"** — the video follows a single
bank line (Sep 03 Coldharbour Packaging, EUR 2,965.20) the way an auditor would: imported → matched to
INV-2026-0418 → posted "no manual touch" → approved → locked into September, opened by concept 5's memo header
("To: Dana Okafor, Head of Finance, Northbridge Retail Group / Re: manual month-end reconciliation") as the
0–3 s hook card. Promise: "Close the books in 3 days, not 12" — Ledgerly's own sourced claim
(site/index.html:27), never a forecast for Northbridge. Copy authored in English.

## Assets

- .media/capture/footage.mp4 — tier A local capture of site/app.html (3840×2160, 14.27 s): Reconciliation → Auto-match → audit trail → Close September → Lock period; product frames play windows of it.
- .media/capture/events.jsonl — clicks at 1.16, 3.27, 6.52, 8.94, 12.26 s (footage time); drives auto-zoom.
- .media/capture/capture-manifest.json — tier A, chain step local, Layer-2 OCR gate ran (20 frames, gitleaks ok, 0 findings).
- .media/capture/autozoom.json — 3 zooms, 2 re-aims; tracks for 16:9 and 9:16.
- capture/extracted/tokens.json — brand tokens from the landing page (ink #14213d, accent #2a6f97, muted #5c6b7a, bg #f7f9fb).
- prospect.json — prospect record: name, company, role, public site only.
- claims-index.json — sourced claims inventory; 2 declared claims unverified and never shown.

## Customizations

- Sales mode (audiences/sales.md): inverted pyramid hook → why you → pain → show → CTA; SB7 with two use-cases at 60 s; beat roles; 5–7 product beats ≥ 3 s.
- Prospect name and company inside the hook window (QA-03) and on the poster, as `data-var-text` variables. No prospect logo or site capture exists (the .example domain was not fetched) — personalisation is name + company text.
- Pattern chain P5 (cursor UI demo) + P7 (pain → pivot → product) + before/after + P9 (similar-company result) + P15 (logo outro).
- Auto-zoom from events.jsonl; footage windows with `capture_hold` + `capture_drift` for product share ≥ 50 %.
- Extra format: 9:16 via `render --batch`; master 16:9.
- VO on, Kokoro EN offline; captions word-timed, burned-in, SRT always; caption keep-out y ≥ 0.82 (QA-14).
- Loudness: VO-led sales outreach −14 LUFS (QA-08); bed from the first-run media pack at 0.12 under the VO.
- Claims index: every visible number/quote sourced or `unverified` and never shown (QA-12).
- One-step CTA: Reply "yes" — visible for the last 8 s.
- End card per QA-13; "Narration is AI-generated." credit line.
- Ship criteria: QA-01…QA-14, scorecard ≥ 80, vision critic mean ≥ 3.0 and no dimension < 2.

## Notes

### Declared vs derived (from intake.json)

| Field | Value | Declared / derived | Source |
| --- | --- | --- | --- |
| for | sales | declared | --for |
| duration | 60 | declared | --duration |
| source | local ./site | declared | --local |
| prospect | prospect.json | declared | --prospect |
| pain | manual month-end reconciliation | declared | --pain |
| yes | true | declared | --yes |
| format | 16:9 master + 9:16 cut | derived | brief-contract § 2 (sales outreach) |
| reveal | early | derived | default |
| voice | on | derived | default:(sales) |
| preset | blue-professional | derived | workflow Step 2 (brief silent; finance, blue product accent) |
| privacy | default | derived | userConfig:privacy (unset) |
| budget | 25 USD | derived | default |
| brand | none | derived | userConfig:brand_kit_dir (unset) |
| lang | en | derived | English only |

- `--yes` decisions: no interview questions asked; pitch concept 3 taken; autonomous mode (storyboard: no).
- Evidence: chain step **local** (static site served from 127.0.0.1 by record-flow); every product frame is tier A. No tier C.
- Privacy profile: default. Network manifest printed: registry.npmjs.org (only before the pinned CLI link), us.i.posthog.com (HyperFrames CLI telemetry). HeyGen signed out; offline engines used.
- Prospect data: name/company/role/public site only, no LinkedIn; outreach draft must carry GDPR Art. 14 notice and Art. 21(2) opt-out; prospect data purged after 30 days. The "15–25 % replies" figure is unverified vendor data — never quote it.
- The footage shows Ledgerly's seeded "Nordwell Bank EUR" demo workspace — never caption it as Northbridge's data. Northbridge's own close length and volumes are unknown (gaps) — ask, don't state.
- Stop-list: no seamless, all-in-one, supercharge, unlock, empower, game-changing, cutting-edge, innovative, revolutionary, effortless, powerful, streamline, "AI-powered" thesis, "10x" without base.
- Unverified (never on screen, never in VO): "10x faster", "50,000 customers" (claims.json, no source).
- Gaps: no README, no CHANGELOG, no e2e user flow (filled by the capture flow), no customer logos.
- The fixture is synthetic (GS-02): Ledgerly, Harborline Logistics and all numbers are fictional.
- phase_blocked: none. Conflicts: none.
- Cost estimate printed before worker dispatch: ~$18.02 for 12 frames, 4 critics, 1 revision round; ceiling $25.
- Bed: pack:vol-10 ("Happy Beats / Business Moves Vol. 10", Sascha Ende / ende.app, CC BY 4.0, credit line carried); VO Kokoro am_michael.
- QA-13 end-card order needs a URL; no Ledgerly URL, domain or calendar link exists in the sources, so none is invented. Under `--yes` nobody can supply one: the URL clause is waived in QA.md with a snapshot and reported; the user should supply the URL/calendar link for the send version.

### Planning rubric (skills/present/references/planning-rubric.md)
- Q1 product: Ledgerly matches bank lines to invoices automatically, posts them and runs the month-end close checklist through to a locked period. The run is web-ui, confidence high. — source: site/index.html:27-28, site/app.html:77-117
- Q2 most credible claim: "Close the books in 3 days, not 12" — claims c001 + c007, source site/index.html:27 (tier A: the hero text is visible in the footage at 0–1.2 s). This is Ledgerly's own claim. It is not a forecast for Northbridge, whose close length we don't know (gap). For the "similar company" proof beat use the quote in c008, "We went from a 12-day close to under 4. The audit trail is the part our auditors love." (Priya Menon, Controller, Harborline Logistics), source site/index.html:54. The site itself marks it "(fictional)". The outcome the footage shows is "0 of 7 matched → 7 of 7 matched → September locked" (tier A, footage 1.2–14.27). It gets added as a `demonstrated` claim at storyboard time. Never usable: c009 "10x faster" and c010 "50,000 customers" (unverified).
- Q3 visual hook: the 7 "Unmatched" pills flip to green "Matched" as invoice numbers fill in and the progress bar goes 0 → 7 of 7. This is footage 3.27–6.2, autozoom segment 1 pose 2 (focus 0.75,0.25, scale 2). Second hook: the audit-trail panel slides in at 6.52 (segment 2 pose 1).
- Q4 show from the product: the Reconciliation view (Nordwell Bank EUR, seeded demo workspace), Auto-match, the audit trail for Sep 03 Coldharbour Packaging EUR 2,965.20 → INV-2026-0418 ("posted, no manual touch", app.html:161), the Close September checklist and Lock period → "September locked". Tier A, local chain, OCR gate clean. The demo data is Ledgerly's seeded workspace, not Northbridge's. Never show it as the prospect's ledger.
- Q5 shortest satisfying length: 45 s would land the claim and the CTA. The declared 60 s stands. Band: sales outreach 30–60 s (QA-01). ±3 % of 60 s gives 58.2–61.8 s, but the band stops at 60.0 s, so the usable window is 58.2–60.0 s. The app footage has about 13 s of product action (1.2–14.27). To reach a ≥50 % product share with no replays, each of the 5 windows needs `capture_hold` + `capture_drift`.
- Q6 register / preset: medium / no preset declared and no brand kit — derived: sales register (power3, 0.3–0.5 s transitions, no back.out). Base the palette on the product's own tokens (ink #14213d, accent #2a6f97, bg #f7f9fb, muted #5c6b7a — capture/extracted/tokens.json), a light, document-like finance look. TODO(frame.md preset name: chosen in workflow Step 2).
- Q7 audio: a warm, sparse bed under a conversational VO. One dropout of 0.4 s before the STAR reveal. SFX on product clicks only (click @ Auto-match, success @ 7 of 7, click @ Lock). VO on (mode default, Kokoro EN). Bed: pack:vol-1 from music-ende-happy-beats (the only fetched pack, upbeat, set to 0.12 under the VO). It is provisional: the storyboard dispatch confirms the track against its cue grid. Target −14 LUFS (sales outreach row, loudness.md:21).
- Q8 share caption: "Dana — Ledgerly closes the books in 3 days, not 12. Here is one bank line going from unmatched to a locked September, with no manual touch."
- Q9 user flow: Reconciliation "0 of 7 matched" (app.html:77) → Auto-match (app.html:78) → 7 of 7 matched + audit trail "no manual touch" (app.html:156-162) → Close September checklist (app.html:93) → Lock period → "September locked" (app.html:117). Source: .media/flow.json and events.jsonl (clicks at 1.16, 3.27, 6.52, 8.94, 12.26). story-extraction `user_flow` is null (gap `no-user-flow`); the capture fills it.

(Q6 resolved at Step 2: preset `blue-professional`.)

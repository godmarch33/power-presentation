---
workflow: product-launch-video
flow: automation
storyboard: no
message: "Dear dashboard: three commands replace you."
audience: marketing — developers who run batch jobs and want them off their laptop without a web console
destination: hero-launch
aspect: 1920x1080
language: en
length: 45s
angle: PAS (marketing, 30–60 s)
reveal: early
register: high
voice: off
style_preset: code-editorial
---

## Intent

Acme Jobs is a CLI (plus a small HTTP API) that takes a file, runs it as a job on a queue and hands the result back:
`acmejobs submit`, `acmejobs watch`, `acmejobs result` (docs/README.md:11-23). This is a 45 s product-led launch
video for developers, muted-first (voice off, kinetic type carries the meaning). Chosen concept (pitch round, recommendation taken under --yes): **"A letter to the dashboard"** — a dry break-up
letter to the job dashboard; its lines are the kinetic type on cream paper, the real terminal recording is the enclosed
proof, the spec cards are the P.S. Promise: "Dear dashboard: three commands replace you." (runner-up on the end
card: "Three commands, no dashboard: file in, JSON out."). CTA: "Submit my first job" (docs/README.md:9).

## Assets

- .media/capture/footage.mp4 — VHS recording of the repo's own demo.tape (submit → watch → result), 1920×1080, 15.4 s; evidence tier A; the product scenes cut from it
- .media/capture/capture-manifest.json — capture manifest with OCR-timed beats (t_sec per command) and the Layer-2 redaction gate result (ran, 0 findings)
- .media/capture/autozoom.json — home-pose track only (VHS, no events.jsonl: `video_without_events`); camera moves by declared `capture_drift`
- claims-index.json — sourced claims: 202 Accepted (openapi.yaml:21), job id job_7f3k2 (openapi.yaml:61), the README line (docs/README.md:23); "40 ms" latency is unverified and never shown
- /home/dmytrogr/Documents/power-presentation-runs/acmejobs/openapi.yaml — read-only; an api-card built from it is tier B, labelled "from the spec", no latency

## Customizations

- Mode block (audiences/marketing.md): archetype PAS for 45 s; beat roles hook, pain_point, product_intro, feature_showcase, benefit_highlight, cta; 5–7 product beats ≥ 3 s each, every beat a visible state change.
- Pattern chain P7 → P2 → P5 → P4 → P9 → P15 on the non-UI carrier: P2/P11 = the VHS terminal, P9 only with a sourced number, P15 logo-outro (non-ui-products.md).
- Non-UI scene plan (surface `cli`, secondary api/backend, mocks/design, files/docs): terminal/code (tier A, VHS) · api-card (tier B "from the spec") · logo-outro. Design frames are not used: the Figma link is a placeholder with no export (design/README.md).
- Hook element by 3.0 s, no black open, first product frame ≤ 5 s, first outcome ≤ 12 s (QA-03…QA-05); no logo before 3 s.
- Kinetic text ≥ 6 % frame height, one idea per screen, reading floor QA-10, card rules.
- Captions: OFF for the 16:9 master (no VO) — kicker cards instead; SRT always; caption keep-out y ≥ 0.82 (QA-14).
- Music: a first-run media-pack bed, beat-locked; loudness per QA-08 for a music-only mix (loudness.md).
- CTA: exactly one, first person, declared as `data-var-text`.
- Ship criteria: QA-01…QA-14, scorecard ≥ 80, vision critic mean ≥ 3.0 with no dimension < 2.

## Notes

- Declared vs derived: declared `--for marketing`, `--yes`. Derived: duration 45 s (hero-launch band 45–90 s, lower edge, --yes); format 16:9 only; reveal early; voice off (marketing default); source = repo demo.tape (CLI, no URL needed); brand none (userConfig unset → preset palette); preset code-editorial (workflow Step 2, see below); privacy default; budget $25; language en; register high.
- Interview: no question asked — `--yes`. Prod URL slot not needed (non-UI product); audience declared; pitch → the story director's recommendation.
- Evidence: chain step `vhs`, tier A, for every terminal scene. No tier-C reconstruction planned.
- Gaps shown before render: no hero page, no CHANGELOG, no e2e flow, no sourced outcome number, no named quote, no logos; declared "40 ms" POST /jobs latency has no source → unverified, dropped.
- The numbers printed inside the recorded terminal (rows 12480, duration_ms 3120, eu-west-1a) are sample output of the repo's bin/acmejobs; they may appear inside the footage but are never lifted into a headline or stat card.
- Stop-list applies to promise, cards, callouts.
- Privacy profile: default. Network manifest printed: registry.npmjs.org (init; the pinned CLI was linked instead), us.i.posthog.com (HyperFrames CLI telemetry).
- The vendor `product-launch-video` route is entered through this BRIEF only. Preferences were not recorded to cross-project memory: every run-shape value here is a `--yes` default, not a user answer.
- Style preset: code-editorial — a developer tool whose product is a terminal; the preset's warm-navy code surface and mono index voice carry the VHS footage without a palette clash, and the cream paper gives the kinetic cards contrast. Brief was silent; autonomous decision.
- Planning rubric (story director, copied verbatim):
### Planning rubric (skills/present/references/planning-rubric.md)
- Q1 product: Acme Jobs is a CLI with a small HTTP API. It uploads a file, runs it as a job on a queue and prints the finished job as JSON, using three commands: `submit`, `watch`, `result` — source: docs/README.md:13-14, docs/README.md:19-21, openapi.yaml:10-43
- Q2 most credible claim: "Submit a file, watch it run, read the result — three commands, no dashboard." — claim c001, source docs/README.md:23 (tier A: the recording shows the same three commands going from queued to done, c110–c114)
- Q3 visual hook: the recorded `status: running` line turning into `status: done` — footage 6.4 s → 8.5 s (demo.tape:35-37)
- Q4 show from the product: the three commands in the VHS terminal — tier A. Also POST /jobs → 202 and GET /jobs/{jobId} → 200 as spec cards — tier B "from the spec"
- Q5 shortest satisfying length: 45 s — band hero-launch 45–90 s (QA-01)
- Q6 register / preset: high / code-editorial — derived: marketing default register; preset chosen in workflow Step 2 (no --preset, no brand kit)
- Q7 audio: an upbeat bed carries a muted-first cut, with one dropout before the STAR; VO off (mode default); bed pack:happy-beats-business-moves-vol-1 (120.19 BPM, every cut on a whole beat); target −18 LUFS (music-only mix; QA-08 does not say whether a hero launch counts as "music-only cinematic")
- Q8 share caption: "Dear dashboard: three commands replace you. Submit a file, watch it run, read the result as JSON, all from the terminal."
- Q9 user flow: `acmejobs submit --file report.csv` → `acmejobs watch --last` (queued → running → done) → `acmejobs result --last --json` (the finished job) — source: docs/README.md:13-14, docs/README.md:21, demo.tape:26-43
- CTA URL gap: no product URL or real package exists; the end card's URL slot carries the command `acmejobs submit --file report.csv` (docs/README.md:13). TODO(URL).

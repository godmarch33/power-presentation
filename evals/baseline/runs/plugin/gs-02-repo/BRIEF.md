---
workflow: product-launch-video
flow: automation
storyboard: no
message: "Close September's books in 3 days, not 12"
audience: "marketing — finance leads (controllers, CFOs) at mid-size companies who lose weeks to manual month-end reconciliation"
destination: hero-launch
aspect: 1920x1080
language: en
length: 45s
angle: PAS
reveal: early
register: high
voice: off
style_preset: blue-professional
---

## Intent

A 45-second product-led launch video for Ledgerly, made from its own repository (`site/`): Ledgerly
reconciles every bank feed, invoice and ledger entry automatically so finance teams close the month in
days instead of weeks. Viewers are finance leads scrolling a launch page or feed, often muted. The video
shows the real product doing the work — one click on Auto-match turns seven unmatched bank lines into
matched invoices, the audit trail proves it, and September is closed and locked — then invites them to
start a free trial. Concept: the pitch-round recommendation (chosen under `--yes`). Promise
(stated, `site/index.html:27`): "Close the books in 3 days, not 12"; the rewrite comes from the
story director.

## Assets

- `.media/capture/footage.mp4` — tier A (chain step `local`: the repo's static `site/` served on loopback), 3840×2160, 14.97 s: landing → Auto-match (0→7 of 7 matched) → audit trail → Close September checklist → "September locked". Every product beat comes from this clip.
- `.media/capture/events.jsonl` — 5 clicks with target rects (cursor + ripples).
- `.media/capture/capture-manifest.json` — tier A, redaction gate ran (OCR 20 frames, gitleaks ok, 0 findings), flow 14/14 steps.
- `.media/capture/autozoom.json` — zoom ladder: 3 zooms, 2 re-aims.
- `capture/screenshots/full-page.png` — 1x plate of the landing page (hero, stats, proof, pricing, CTA).
- `capture/extracted/tokens.json` — brand colours ink #14213d, accent #2a6f97, muted #5c6b7a, canvas #f7f9fb; no brand fonts.
- `claims-index.json` — every on-screen number/quote with `file:line`; `10x faster` and `50,000 customers` are `unverified` and never shipped.

## Customizations

- Mode `marketing` (`audiences/marketing.md`): archetype PAS for 45 s (agitate = one beat ≤ 3 s); beat roles; 5–7 product beats ≥ 3 s; hook by 3.0 s (QA-03), first product frame ≤ 5 s (QA-04), first outcome ≤ 12 s (QA-05); no logo before 3 s.
- Pattern chain P7 → P2 → P5 → P4 → P9 → P15 (`video-text-pivot`, `cursor-ui-demo`, `zoom-out-workspace-reveal`, `dataviz-countup`, `logo-outro`); auto-zoom from `autozoom.json`.
- Kinetic text ≥ 6 % frame height; one idea per screen; reading floor QA-10; register `high` — GSAP `expo`, transitions 0.15–0.3 s; ASL 2–6 s (QA-09).
- Voice off (marketing default): kicker cards carry the meaning, video works muted. Captions off for 16:9 without VO; SRT always.
- Music: an upbeat `music-ende-happy-beats` pack track via `R run --bgm pack:<track>`, beat-locked; music-only mix → loudness target −18 LUFS unless the story director names one (QA-08).
- CTA in first person, "Start my free trial" (`site/index.html:29`), declared as `data-var-text`. End card 2.5–4.0 s and ≤ 12 % of runtime (QA-13).
- Claims: every visible number/quote has a `claims-index.json` source; `unverified` items never reach STORYBOARD/SCRIPT (QA-12). Ship criteria: QA-01…QA-14, scorecard ≥ 80, vision critic mean ≥ 3.0, no dimension < 2.
- Master 16:9 only (`--format` not given; hero-launch destination).

## Notes

- Declared (typed): `--for marketing`, `--duration 45`, `--repo` (= the working directory), `--yes`. Derived: format 16:9 (destination hero launch), reveal early (default), voice off (marketing), brand none (userConfig unset), preset blue-professional (Step 2 choice, brand blue matches), privacy default, budget $25, language en. Full table: `intake.json`.
- Destination band: hero launch 45–90 s; 45 s is the band's lower edge and the declared duration; QA-01 window 43.65–46.35 s.
- Evidence: every product scene is tier A (own capture of the repo's `site/`). No reconstruction. The product is a synthetic fixture (GS-02): every page shows a "Synthetic fixture: fictional company" banner — the footage keeps it.
- Gaps: no README, no CHANGELOG, no e2e user flow (the capture flow was written from `site/` selectors), no customer logos; declared claims `10x faster` and `50,000 customers` have no source → unverified, dropped.
- Stop-list applies to promise, cards, callouts.
- Privacy profile: default. Network manifest printed: registry.npmjs.org (only a bare npx before init), us.i.posthog.com (HyperFrames CLI telemetry). HeyGen not signed in → local engines (Kokoro ready, MusicGen missing → media-pack bed).
- Entered through this BRIEF only; never bypass `/hyperframes` routing. Autonomous mode (`--yes` → `storyboard: no`).

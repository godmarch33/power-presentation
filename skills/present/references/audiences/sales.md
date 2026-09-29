# Audience mode: `--for sales`

Phase: MVP (all three modes ship in MVP — scope table).

## Goal

Sales is a personalised outreach video built around one prospect: the prospect's name, logo or site sits in the first frame and in the poster. Structure is the "upside-down pyramid" (Gong, 67,149 demos, vendor data): the outcome first, the demo second, one next step last. The user is the GDPR controller for prospect data.

## Length band and destination

- Sales outreach: **30–60 s** (QA-01 band). Rationale in videos < 60 s are watched to the end by 65 % (Vidyard 2024, vendor data, secondary).
- Plugin range 10–180 s; sweet spot 45–90 s (QA-01). Delivered duration = brief ±3 % (QA-01 hard). See [../length-bands.md](../length-bands.md).

## Hook and reveal

- Hard: hook element visible by 3.0 s, no black open (QA-03). Sales hook window must contain the prospect's name and company. Detail in [../hook-timing.md](../hook-timing.md).
- Default: first product frame ≤ 5 s (QA-04), first outcome ≤ 12 s (QA-05).
- Reveal default: `reveal: early`. Pattern P7 "pain → pivot → product" lands at 30–50 % of runtime with a music dropout of 0.4–0.6 s (P7, observation; silence 0.3–0.5 s before reveal).

## Story archetype

Sales skeleton from **hook 3 s → "why you" 7 s → pain 15 s → show 15 s → CTA 5 s** (structure row; timings are the default shape, retuned on GS-02).

Archetype by length (story table, defaults):

| Length | sales |
|---|---|
| 15 s | BAB personalised |
| 30 s | Upside-down pyramid + BAB |
| 60 s | SB7 with 2 use cases |
| 90–120 s | Sparkline with 3 use cases |

Beat roles: `hook`, `pain_point`, `product_intro`, `feature_showcase`, `benefit_highlight`, `social_proof`, `cta`. `--pain` feeds the `pain_point` beat.

## Product beats

5–7 product beats, each ≥ 3 s. Each beat shows a visible state change. Auto-zoom  on `record-flow` clicks (P5).

## Voice, captions, loudness

- Voice: **ON** by default; Kokoro EN offline, cloud TTS as premium (see [../language.md](../language.md)). Tone: conversational, face + voice; pace 150 wpm base; word budget.
- Captions: **ON**, word-timed, burned-in; SRT always. Groups/size; line limits per QA-10; keep-out y ≥ 0.82 (QA-14). See [../captions.md](../captions.md).
- Loudness (QA-08): VO-led → −14 LUFS for social delivery; −16…−18 LUFS for premium VO-led. |I − target| ≤ 1 LU, TP ≤ −1 dBTP on the master. Bed under VO −28…−32 LUFS-S, duck −6…−12 dB, carve 250 Hz–2.5 kHz. See [../loudness.md](../loudness.md).

## Tone, register, transitions

- Register `medium`: GSAP `power3`, transitions 0.3–0.5 s.
- Easing roles, durations, springs, transition ceilings.
- Rhythm: state change every 2–4 s; ASL 4–8 s (QA-09).
- Callouts: ≤ 60 characters, ≤ 30 words per block, a question instead of a statement (Arcade +40 % clicks is an interactive-demo benchmark; transfer to video is an open question in).

## Proof and CTA

- Proof: 1 measurable result of a similar company, 5–10 s. Sourced in `claims-index.json` or `unverified` and not shipped (QA-12).
- CTA: exactly one step with a choice ("Tuesday or Thursday?", `Reply "yes"`), calendar link, visible for the last 8 s (row "CTA"). End card 2.5–4.0 s; ≥ 45 s videos additionally ≤ 12 %; one CTA ≥ 2.5 s; logo → tagline → URL, stagger 0.4 s (QA-13).

## Mode-specific flags

- `--prospect <file>` — prospect record. Minimum and maximum content per **name, company, role, public site**. No LinkedIn scraping (LinkedIn UA §8.2 2025-11-03).
- `--pain <text>` — the pain statement for the `pain_point` beat (writes `--pain` without an argument; the repo passes the statement as text).
- Personalisation level: prospect's site or logo in frame and in the poster = ladder level **L2** (Sendspark). The "15–25 % replies" figure is vendor data (Sendspark/Autobound 2026), unverified on the golden set — never quote it as a promise.
- Personalisable fields (CTA, prospect name, logo) are declared as `data-var-text` / `data-var-src` so a prospect swap is a `--variables` edit without tokens.

## Compliance — the outreach letter

- The email draft carries a GDPR **Art. 14** notice and an **Art. 21(2)** opt-out line. A legitimate-interest assessment template ships with the plugin: [../legitimate-interest.md](../legitimate-interest.md) — a questionnaire the user (the controller) completes; point the user to it in the final report of a sales run, never fill it in for them. The file carries only the usual three-part test and the plugin's own constraints, no legal conclusions.
- Prospect data is purged after **30 days**.
- Delivery hooks (Gmail draft without auto-send, Drive, Notion) are v1 and opt-in.

## Evidence rules

- Tier C (HTML reconstruction) requires explicit user confirmation and the `reconstructed` label in storyboard and run-report. The human-review question before render includes that confirmation.
- Prefer `record-flow` footage (tier A) of the real product with the prospect's data seeded (pre-capture seeding).

## Scorecard targets (scorecard)

- Product-frame share: 100 points at **≥ 50 %** for sales (highest of the three modes).
- Hook speed: 100 at first outcome ≤ 4 s, linear to 0 at 12 s.
- Cadence: ASL 4–8 s (QA-09); no shot > 12 s unless declared continuous camera.
- Ship threshold: 14 gates pass, scorecard ≥ 80, vision critic mean ≥ 3.0, min ≥ 2.

## Pattern composition

`sales`: **P5 and P7 around the `record-flow` recording, the before/after comparison, P9 with a similar company's result, P15 with one CTA** (quoted). Screen Studio (reference #4) is the model for auto-zoom + pain → product pivot.

Mapping: P5 `cursor-ui-demo`, `browser-device-stage`; P7 `video-text-pivot`; before/after `comparison-split`, `before-after-wipe` (wipe 0.8 s `power2.inOut`, hold 2 s — observation); P9 `dataviz-countup`, `mk-progress-stat`, `data-chart`; P15 `logo-outro`. For non-UI products the before/after becomes the SDK integration snippet, P9 the latency counters.

## What `/present` writes into `BRIEF.md` for this mode

Frontmatter: `audience: sales`, `length` in 30–60 s, `aspect` from `--format`, `language`, `reveal: early`, `register: medium`, `voice: true` unless `--voice` is explicitly negated, `style_preset`.

`## Customizations`:
- Upside-down pyramid skeleton (hook → why you → pain → show → CTA) with the archetype for the length; beat roles; 5–7 product beats ≥ 3 s.
- Prospect name/company in the hook window and poster; site/logo in frame (L2) — all as `data-var-*` variables.
- Pattern chain P5 + P7 + before/after + P9 + P15; auto-zoom.
- VO on, Kokoro EN; captions word-timed burned-in + SRT; keep-out y ≥ 0.82 (QA-14).
- Loudness target for VO-led delivery (QA-08); bed/duck values.
- One-step CTA with calendar link, on screen for the last 8 s.

`## Notes`: prospect record limited to name/company/role/site, no LinkedIn; letter draft must carry Art. 14 + Art. 21(2) lines; prospect data retention 30 days; tier C only with explicit confirmation + `reconstructed` label; "15–25 % replies" is unverified vendor data; enter the vendor workflow via this BRIEF only.

## Skeleton status

Reference only. `record-flow.mjs` and `autozoom.mjs` are implemented, `wowprobe.py` is a stub; the golden set holds a synthetic sales fixture with placeholder data only.

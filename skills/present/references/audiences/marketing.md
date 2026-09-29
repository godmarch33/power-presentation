# Audience mode: `--for marketing`

Phase: MVP (all three modes ship in MVP — scope table).

## Goal

Marketing is the product-led launch register: the product is the hero, the copy is kinetic text, and the video must work muted. It is the only mode with voice OFF by default; meaning is carried by kinetic type and kicker cards.

## Length band and destination

Pick the band from the destination, never a single "right" runtime (QA-01 bands, see [../length-bands.md](../length-bands.md)):

| Destination | Band (QA-01) |
|---|---|
| Social cut | 15–30 s; X 15–45 s; LinkedIn 30–90 s |
| Product-page hero loop | 10–20 s, muted |
| Product Hunt | 30–75 s |
| Hero launch | 45–90 s |

Plugin range 10–180 s; sweet spot 45–90 s (QA-01). Delivered duration = brief ±3 % (QA-01 hard).

## Hook and reveal

- Hard: a hook element (problem / promise / thesis) is visible by 3.0 s and there is no black open (QA-03). Detail in [../hook-timing.md](../hook-timing.md).
- Default: first product frame ≤ 5 s (QA-04) and first outcome ≤ 12 s (QA-05) for marketing product-led.
- Hook content: hook element + promise card  (≤ 60 characters, concrete noun + number / deadline / named alternative, zero stop-list words); reading floor per QA-10.
- Reveal default: `reveal: early`. `--reveal story-first` may delay the product within the QA-04 limit (story-first ≤ 25 s applies to investors/narrative); for marketing the pattern P7 pivot lands at 30–50 % of runtime (P7, observation).
- No logo before 3 s (creative checklist).

## Story archetype (story table)

Archetype by length, defaults for:

| Length | marketing |
|---|---|
| 15 s | BAB or Story Spine (cards) |
| 30 s | PAS (agitate = one beat ≤ 3 s) |
| 60 s | PAS or compressed SB7 |
| 90–120 s | Sparkline (P→S ×3, STAR on S2) |

PAS / BAB / Story Spine ≤ 30 s; Sparkline 60–120 s. Beat roles: `hook`, `pain_point`, `product_intro`, `feature_showcase`, `benefit_highlight`, `social_proof`, `cta`. Three acts, one reveal, one CTA.

## Product beats

5–7 product beats, each ≥ 3 s (Navattic/Arcade data conflict, middle value picked). Every beat shows a visible state change, before ≠ after; a beat without one is decoration and is cut.

## Voice, captions, loudness

- Voice: OFF unless `--voice`. With `--voice`: VO Kokoro EN (see [../language.md](../language.md)); pace "promo" 160–180 wpm; VO word budget  (see [../length-bands.md](../length-bands.md)).
- Captions: ON for 9:16 (and 1:1 from v1), word-timed and burned-in; OFF for 16:9 without VO — use kicker cards instead; SRT always. See [../captions.md](../captions.md).
- Loudness (QA-08): target depends on destination and mix type — −14 LUFS for social / VO-led, −18…−20 LUFS for music-only cinematic hero; |I − target| ≤ 1 LU, TP ≤ −1 dBTP, measured on the master. See [../loudness.md](../loudness.md).

## Tone, register, transitions

- Tone: second person, kinetic text.
- Register `high`: GSAP `expo`, transitions 0.15–0.3 s. Easing roles, durations, springs/stagger, one primary transition on 60–70 % of cuts + ≤ 2 accents.
- Rhythm: a visual or audio state change every 2–4 s; ASL 2–6 s (QA-09).
- Auto-zoom on click  (P5) for `record-flow` footage.

## Proof and CTA

- Proof: 1 number + ≤ 6 logos, or 1 quote after the demo, 5–10 s. Every number/logo/quote needs a `claims-index.json` source or it is `unverified` and not shipped (QA-12).
- CTA: exactly one, first person — continuation of the promise ("Start my free trial"); on Product Hunt optionally a gallery slide. Shown on screen ≥ QA-13 threshold and spoken when VO is on. End card 2.5–4.0 s; ≥ 45 s videos additionally ≤ 12 % of runtime; 10–30 s cuts ≤ 4 s absolute; logo → tagline → URL, stagger 0.4 s (QA-13). Second-best promise candidate goes to the end card.

## Mode-specific flags

None beyond the shared set. `--prospect`/`--pain` belong to sales; `--metrics` to investors; `--style cinematic` is investors-only (v1).

## Evidence rules

Capture chain is prod-first. Tier C (HTML reconstruction) is allowed as a last resort and in marketing carries the on-screen label "Screen images simulated". No mockups, stock or 2D characters. Reconstruction does not need the explicit confirmation that sales/investors require, but it is still labelled `reconstructed` in storyboard and run-report.

The product is the hero, not its landing (`capture-chain.md` § 1). A landing-only run — the app lives elsewhere, behind sign-in — records the landing for the hook, promise, CTA and brand, and builds the product beats from the app's own published screenshots: tier-C scenes that perform what the screen does and settle on exactly what the screenshot shows (`capture-chain.md` § 6). The landing's own demo widgets and sections are never product beats. The film answers the essence test (planning rubric: what it is, what I do in it, what it gives back, what changes) on product screens; cards carry the hook, the promise, the CTA and sourced numbers, never what a screen could show (story director, "Product spine").

## Scorecard targets (scorecard)

- Product-frame share: 100 points at ≥ 35 % for marketing.
- Hook speed: 100 at first outcome ≤ 4 s, linear to 0 at 12 s.
- Cadence: ASL inside the QA-09 band (2–6 s) and no shot > 12 s unless declared continuous camera.
- Ship threshold: all 14 gates pass, scorecard ≥ 80, vision critic mean ≥ 3.0 with no dimension < 2.

## Pattern composition

Launch for marketing: **P7 → P2 → P5 → P4 → P9 → P15** (quoted). Teaser variant: P1, P3, P11, P15. Social cut: P6 beat-grid montage (8–15 shots in the first 10 s, hard cuts only) with `whip-pan`. Non-UI products keep the same patterns on a different carrier: P2/P11 = VHS terminal, P9 = latency counters / benchmark charts, P12 = architecture (see `non-ui-products.md`).

Pattern → HyperFrames mapping (table): P1 `camera-journey`; P2 `prompt-type-submit-generate`, `code-typing`; P3 `kinetic-type-beats`, `titlecard-reveal`; P4 `zoom-out-workspace-reveal`; P5 `cursor-ui-demo`, `browser-device-stage`; P6 `beat-pulse-background` + `whip-pan`; P7 `video-text-pivot`; P9 `dataviz-countup`, `mk-progress-stat`, `data-chart`; P15 `logo-outro`. Timings in are observations from 480p contact sheets, not lint values, except P5 which uses.

## What `/present` writes into `BRIEF.md` for this mode

Frontmatter (per HyperFrames `brief-format.md`): `audience: marketing`, `length` from the band, `aspect` from `--format`, `language: en` (no flag), `reveal: early` unless flagged, `register: high`, `voice: false` unless `--voice`, `style_preset` from `--preset`.

`## Customizations` (this mode's deltas the vendor workflow does not know):
- Archetype from the table for the chosen length; beat roles; 5–7 product beats ≥ 3 s.
- Pattern chain P7 → P2 → P5 → P4 → P9 → P15 with the HyperFrames names above; auto-zoom.
- Kinetic text at ≥ 6 % frame height; one idea per screen (C3); cards; reading floor per QA-10.
- Captions: ON for 9:16, OFF for 16:9 without VO, SRT always; caption keep-out y ≥ 0.82 (QA-14).
- Loudness target for the destination (QA-08) and level hierarchy.
- CTA text in first person declared as `data-var-text` so it can change via `--variables`.

`## Notes`: destination band chosen and why (QA-01); stop-list applies to promise, cards, callouts and VO; every number must have a source in `claims-index.json`; tier C scenes carry "Screen images simulated"; the vendor `product-launch-video` route is entered through this BRIEF only — never bypass `/hyperframes` routing.

## Skeleton status

Reference only; nothing in this file executes. `scripts/record-flow.mjs` and `scripts/autozoom.mjs` are implemented; `scripts/wowprobe.py` is a stub until the QA gates land.

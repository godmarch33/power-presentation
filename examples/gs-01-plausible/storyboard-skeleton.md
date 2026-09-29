---
format: 1920x1080
duration: 45s
message: "Your traffic, without the tracking"
arc: Hook → Product → Outcome → Features ×4 → Code → Wrap → CTA
audience: marketing
mode: autonomous
version: v1
reveal: early
register: high
fixture: GS-01 Plausible — storyboard skeleton, golden set; copy is provisional until a run reads the live hero page
---

<!-- Storyboard skeleton for GS-01 (pin hyperframes@0.8.47): the shape a `present --for marketing --duration 45
--url https://plausible.io` run is expected to produce — product-led (QA-04 ≤ 5 s, QA-05 ≤ 12 s), 5–7 product beats
≥ 3 s, ASL 2–6 s (QA-09), end card ≤ 4 s and ≤ 12 % (QA-13), no logo before 3 s. On-screen copy carries no
numbers on purpose: GS-01's sourced numbers come from the live page at capture date (examples/README.md), so a run
replaces these lines with story-extraction.yaml values and adds the claims. Product roles `ui` / `recording` / `code`. -->

## Frame 1 — Hook

- scene: Big type, kinetic, on the first beat
- duration: 3s
- role: hook
- beat: hook
- evidence_tier: C
- src: compositions/frames/01-hook.html
- text: "Your traffic, without the tracking" @ 0.2-3.0
- poster: 1.0s

## Frame 2 — Product: the dashboard

- scene: The live dashboard (record-flow capture, tier A), one page
- duration: 4s
- role: recording
- beat: product_intro
- evidence_tier: A
- src: compositions/frames/02-product.html
- text: "One page. Every visitor." @ 0.5-4.0

Product at 3.0 s (QA-04). First auto-zoom on the first click cluster (MVP exit criterion: ≥ 1 zoom).

## Frame 3 — Outcome: at a glance

- scene: Top pages, sources and goals land one by one on the captured dashboard
- duration: 4s
- role: outcome
- beat: benefit_highlight
- evidence_tier: A
- src: compositions/frames/03-outcome.html
- text: "Top pages, sources, goals — at a glance" @ 0.5-4.0

First outcome at 7.0 s (QA-05).

## Frame 4 — Feature: realtime

- scene: Punch-in on the realtime counter (autozoom segment)
- duration: 5s
- role: recording
- beat: feature_showcase
- evidence_tier: A
- src: compositions/frames/04-realtime.html
- text: "Live visitors, updating as you watch" @ 0.6-5.0

## Frame 5 — Feature: goals

- scene: Cursor opens a goal; conversions appear
- duration: 5s
- role: recording
- beat: feature_showcase
- evidence_tier: A
- src: compositions/frames/05-goals.html
- text: "Goals and conversions, one click away" @ 0.6-5.0

## Frame 6 — Feature: privacy

- scene: The consent-banner-free page state, kicker card
- duration: 4s
- role: ui
- beat: benefit_highlight
- evidence_tier: A
- src: compositions/frames/06-privacy.html
- text: "No cookies, no consent banner" @ 0.5-4.0

## Frame 7 — Feature: sources

- scene: Punch-in on the sources panel
- duration: 5s
- role: recording
- beat: feature_showcase
- evidence_tier: A
- src: compositions/frames/07-sources.html
- text: "See where visitors come from" @ 0.6-5.0

## Frame 8 — Code: one script tag

- scene: Code editor block with the one-line embed
- duration: 4s
- role: code
- beat: feature_showcase
- evidence_tier: A
- src: compositions/frames/08-code.html
- text: "One lightweight script" @ 0.5-4.0

## Frame 9 — Wrap

- scene: The whole dashboard, slow push-in, the promise restated
- duration: 7s
- role: recording
- beat: benefit_highlight
- evidence_tier: A
- src: compositions/frames/09-wrap.html
- text: "Analytics you can read in one glance" @ 0.8-6.5

## Frame 10 — End card

- scene: Logo → tagline → URL, one CTA
- duration: 4s
- role: cta
- beat: cta
- evidence_tier: C
- src: compositions/frames/10-end.html
- cta: "Start my free trial" @ 0.4-4.0
- order: logo -> tagline -> URL
- stagger: 0.4s

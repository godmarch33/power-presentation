---
format: 1920x1080
duration: 45s
message: "Three commands. No dashboard."
arc: Hook → Terminal → Outcome → Terminal → API card → Code → Design preview → Doc → CTA
audience: marketing
mode: autonomous
version: v1
reveal: early
register: high
fixture: GS-03 Acme Jobs (synthetic CLI/API, no UI) — storyboard skeleton, golden set; no fixed duration, 45 s = hero-launch band
---

<!-- Storyboard skeleton for GS-03 (pin hyperframes@0.8.47): a product without a single screen.
Product frames use the non-UI roles `terminal | api | code | design | file` (gate roles) and every non-UI scene
type of the composition table appears once: terminal/code (VHS tape, tier A), api-card, design-frames with the
"Design preview" label, file/doc with a typed excerpt, logo-outro. Numbers on screen come from claims.json (the
OpenAPI status code and the example job id). -->

## Frame 1 — Hook

- scene: Big type on the first beat
- duration: 3s
- role: hook
- beat: hook
- evidence_tier: C
- src: compositions/frames/01-hook.html
- text: "Three commands. No dashboard." @ 0.2-3.0
- poster: 1.0s

## Frame 2 — Terminal: submit

- scene: VHS frames (demo.tape beat 1): the submit command types in, the queue answers
- duration: 6s
- role: terminal
- beat: product_intro
- evidence_tier: A
- src: compositions/frames/02-submit.html
- text: "acmejobs submit --file report.csv" @ 2.0-6.0

Product at 3.0 s (QA-04). Typing at 50 ms/char; the line counts as visible once fully typed.

## Frame 3 — Outcome: queued

- scene: The `job_… queued` answer lands as the outcome card
- duration: 4s
- role: outcome
- beat: benefit_highlight
- evidence_tier: A
- src: compositions/frames/03-queued.html
- text: "Queued in one command" @ 0.5-4.0

First outcome at 9.0 s (QA-05).

## Frame 4 — Terminal: watch

- scene: VHS frames (demo.tape beat 2): status running → done
- duration: 6s
- role: terminal
- beat: feature_showcase
- evidence_tier: A
- src: compositions/frames/04-watch.html
- text: "status: running → done" @ 1.5-6.0

## Frame 5 — API card

- scene: Request, response, status, latency from openapi.yaml against a local mock (tier A)
- duration: 6s
- role: api
- beat: feature_showcase
- evidence_tier: A
- src: compositions/frames/05-api.html
- text: "POST /jobs → 202 Accepted" @ 1.0-6.0

Status code 202 is claim `status-202` (openapi.yaml:21).

## Frame 6 — Code: the result

- scene: Code block (demo.tape beat 3): result --last --json
- duration: 5s
- role: code
- beat: feature_showcase
- evidence_tier: A
- src: compositions/frames/06-result.html
- text: "acmejobs result --last --json" @ 1.2-5.0

## Frame 7 — Design preview

- scene: Static Figma/PNG export of the console in browser-device-stage, labelled
- duration: 5s
- role: design
- beat: feature_showcase
- evidence_tier: C
- src: compositions/frames/07-design.html
- text: "Design preview" @ 0.3-5.0
- text: "The console, in design" @ 0.8-5.0

Never the tier-A "product does the work" scene (design/README.md).

## Frame 8 — Doc: getting started

- scene: docs/README.md scrolls; the typed excerpt lands
- duration: 6s
- role: file
- beat: benefit_highlight
- evidence_tier: A
- src: compositions/frames/08-doc.html
- text: "Submit, watch, read the result" @ 1.0-6.0

## Frame 9 — End card

- scene: Logo → tagline → URL, one CTA
- duration: 4s
- role: cta
- beat: cta
- evidence_tier: C
- src: compositions/frames/09-end.html
- cta: "Install it in one line" @ 0.4-4.0
- order: logo -> tagline -> URL
- stagger: 0.4s

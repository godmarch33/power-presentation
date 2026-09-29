---
format: 1920x1080
duration: 60s
message: "Close the books in 3 days, not 12"
arc: Hook → Product → Metric → Pain → Show ×2 → Outcome → Proof → Benefit → Price → CTA
audience: sales
mode: autonomous
version: v1
reveal: early
register: direct
fixture: GS-02 Ledgerly (synthetic) — storyboard skeleton, golden set; every value is fictional
---

<!-- Storyboard skeleton for the GS-02 fixture (each fixture carries claims.json, a storyboard skeleton
and a CLI pin; pin hyperframes@0.8.47). It is the shape a `present --for sales --duration 60` run is expected to
produce on this fixture: the inverted pyramid (hook 3 s → "why you" → pain → show → CTA), the prospect's
name and company inside the QA-03 window, the product on screen by 5 s (QA-04), the first outcome by 12 s
(QA-05), 5–7 product beats ≥ 3 s, ASL 4–8 s (QA-09), end card 2.5–4 s and ≤ 12 % (QA-13), every number
from claims.json (QA-12), every on-screen text on the reading floor (QA-10). `scripts/wowprobe.py --storyboard`
passes the storyboard gates on this file with the fixture claims — `node scripts/golden-set.mjs verify`. -->

## Frame 1 — Hook: Dana, Northbridge

- scene: Big type on the beat; the prospect's name and company in the first line
- duration: 3.5s
- role: hook
- beat: hook
- evidence_tier: C
- src: compositions/frames/01-hook.html
- text: "Dana, Northbridge closes in 12 days." @ 0.2-3.5
- poster: 1.2s

Cold open on the prospect's own number (claim `close-days-hero`: "3 days, not 12"). No logo before 3 s.

## Frame 2 — Product: the close dashboard

- scene: Real Ledgerly dashboard (local capture of site/, tier A), the month-end close board
- duration: 4.5s
- role: ui
- beat: product_intro
- evidence_tier: A
- src: compositions/frames/02-product.html
- text: "Close the books in 3 days" @ 0.4-4.5

Product on screen at 3.5 s (QA-04 ≤ 5 s). Auto-zoom on the first click cluster.

## Frame 3 — Metric: auto-matched

- scene: The match-rate counter counts up over the reconciliation view
- duration: 4s
- role: metric
- beat: benefit_highlight
- evidence_tier: A
- src: compositions/frames/03-metric.html
- text: "98.5% auto-matched" @ 0.5-4.0

First outcome at 8.0 s (QA-05 ≤ 12 s). Count-up 1.2–2.5 s.

## Frame 4 — Pain: the manual close

- scene: The "before" state on the real product — bank lines and invoices side by side, unmatched (the --pain)
- duration: 5s
- role: ui
- beat: pain_point
- evidence_tier: A
- src: compositions/frames/04-pain.html
- text: "Manual month-end reconciliation" @ 0.5-5.0

## Frame 5 — Show: reconcile

- scene: Recording of the reconcile flow with cursor and punch-ins from autozoom.json
- duration: 8s
- role: recording
- beat: feature_showcase
- evidence_tier: A
- src: compositions/frames/05-reconcile.html
- text: "Bank lines matched to invoices" @ 1.0-4.5

## Frame 6 — Show: audit trail

- scene: A matched line opens its audit trail
- duration: 6s
- role: ui
- beat: feature_showcase
- evidence_tier: A
- src: compositions/frames/06-audit.html
- text: "Every match keeps its audit trail" @ 0.8-4.0

## Frame 7 — Outcome: average close

- scene: The outcome card over the product
- duration: 5s
- role: outcome
- beat: benefit_highlight
- evidence_tier: A
- src: compositions/frames/07-outcome.html
- text: "3.1 days average close" @ 0.5-5.0

Claim `avg-close-days` verbatim (Q2 2026); never blended with the rounded hero value.

## Frame 8 — Proof: Harborline

- scene: Testimonial card, attributed
- duration: 6s
- role: proof
- beat: social_proof
- evidence_tier: C
- src: compositions/frames/08-proof.html
- text: "We went from a 12-day close to under 4." @ 0.6-4.6
- text: "Priya Menon, Controller / Harborline Logistics" @ 1.0-6.0

The numbers inside the quote are covered by the quote's source (claim `testimonial-harborline`).

## Frame 9 — Benefit: hours back

- scene: Benefit card over the product
- duration: 5s
- role: outcome
- beat: benefit_highlight
- evidence_tier: A
- src: compositions/frames/09-benefit.html
- text: "11 hours a week back, per accountant" @ 0.5-5.0

## Frame 10 — Price

- scene: Pricing line, one number
- duration: 4s
- role: metric
- beat: benefit_highlight
- evidence_tier: C
- src: compositions/frames/10-price.html
- text: "From EUR 190 per entity per month" @ 0.5-4.0

## Frame 11 — CTA lead-in

- scene: The product idles behind the CTA line; the CTA stays visible through the end card (last 8 s, sales table)
- duration: 5.5s
- role: ui
- beat: cta
- evidence_tier: A
- src: compositions/frames/11-cta-lead.html
- text: "Reply \"yes\" — Tuesday or Thursday?" @ 0.5-5.5
- voiceover: "Reply yes, and I'll hold Tuesday or Thursday."

## Frame 12 — End card

- scene: Logo → tagline → URL, one CTA
- duration: 3.5s
- role: cta
- beat: cta
- evidence_tier: C
- src: compositions/frames/12-end.html
- cta: "Reply \"yes\" — Tuesday or Thursday?" @ 0.4-3.5
- text: "Close the books in 3 days" @ 0.8-3.5
- order: logo -> tagline -> URL
- stagger: 0.4s

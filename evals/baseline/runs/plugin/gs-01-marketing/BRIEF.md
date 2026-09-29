---
workflow: product-launch-video
flow: automation
storyboard: no
message: "See your ChatGPT visitors in one click. No cookies."
audience: "marketing — site owners, founders and marketers who find Google Analytics overkill and now wonder how much traffic AI tools send them"
destination: hero-launch
aspect: 1920x1080
language: en
length: 45s
angle: "PAS — open on the question (who sent you visitors from ChatGPT?), agitate with 'Google Analytics is overkill' (≤ 3 s), solve with one recorded click on the live dashboard"
reveal: early
register: high
voice: off
---

## Intent

A 45-second hero-launch promo for Plausible Analytics (https://plausible.io), the lightweight, cookie-free,
EU-hosted Google Analytics alternative. It is for site owners, founders and marketers. The chosen concept
(pitch round, concept 3, "Who sent you visitors from ChatGPT?") skips the expected privacy-shield feature
tour. It opens on the question these viewers have right now and answers it with one real, recorded click:
Sources → ChatGPT, and the whole live dashboard redraws for that one source. Promise: "See your
ChatGPT visitors in one click. No cookies." Tone: second person, kinetic type, product-led, and it works muted.

## Assets

- .media/capture/footage.mp4: tier-A prod screencast (record-flow, CDP, 3840x2160, 12.37 s) of plausible.io → "View live demo" → live dashboard → Source "ChatGPT" filter → map/browsers/goals. This is the product beats' only footage.
- .media/capture/events.jsonl, capture-manifest.json, autozoom.json: click events (2.206 s, 6.804 s), redaction gate clean (0 findings), zoom tracks for 16:9 and 9:16.
- capture/: hyperframes capture of https://plausible.io (screenshots, tokens.json, visible-text.txt, asset-descriptions.md). Logo: capture/assets/logo-670e83ee.svg.
- story-extraction.yaml, claims-index.json, hero-page.html: provenance for every on-screen line and number.

## Customizations

- Mode block (audiences/marketing.md): 45 s is in the hero launch band 45–90 s. Archetype PAS with beat roles hook, pain_point, product_intro, feature_showcase, benefit_highlight, social_proof, cta. Aim for 5–7 product beats of ≥ 3 s each, every one with a visible state change. The recorded footage supports exactly 5 non-overlapping windows.
- Pattern chain P7 → P2 → P5 → P4 → P9 → P15, adapted: auto-zoom from autozoom.json. The cursor and click ripple are driven by render-path assemble.
- Kinetic text ≥ 6 % of frame height, one idea per screen, reading floor QA-10.
- Formats: master 1920x1080. The 9:16 (1080x1920) is a `render --batch` cut with the vertical window following focus. Keep the 9:16 punch-in ≤ 1.3× where possible, because at 1.5× the capture is upscaled 1.33×.
- Captions: on for 9:16, off for 16:9 (no VO), SRT always. Caption keep-out y ≥ 0.82 (QA-14).
- Voice off (marketing default). Music-first bed from the media pack music-ende-happy-beats. SFX only on the two recorded clicks and the reveal.
- Claims index: every number, logo or quote on screen has a source in claims-index.json, or it is `unverified` and not shipped (QA-12).
- CTA is first person: "Start my free trial", with "30-day free trial. No credit card required." (hero-page.html:1445) and plausible.io, declared as `data-var-text`. The second-best promise ("Analytics script 54× smaller than Google Analytics", c010) goes on the end card.
- Ship criteria: QA gates QA-01…QA-14, scorecard ≥ 80, and vision critic mean ≥ 3.0 with no dimension < 2.

## Notes

- Declared vs derived: declared `--for marketing`, `--duration 45`, `--format 16:9,9:16`, `--url https://plausible.io`, `--yes`. Derived: reveal early (default), voice off (default, marketing), privacy default (userConfig), budget $25 (userConfig), lang en, register high (marketing), destination hero launch (QA-01 band), preset chosen at workflow Step 2. Full table in intake.json.
- --yes decisions: no questions asked. Pitch = concept 3, the story director's recommendation. Render? = yes.
- Evidence: chain step prod, and every product beat is tier A. No reconstruction, so no "Screen images simulated" label. The dashboard shown is Plausible's public live demo of its own site, plausible.io. The kicker "Live demo · plausible.io's own stats" keeps that honest.
- Privacy profile: default (not `local`). The network manifest printed before the first external call listed registry.npmjs.org, plausible.io and us.i.posthog.com (HyperFrames CLI telemetry).
- HeyGen: signed out, so the run uses local engines (Kokoro ready, MusicGen missing). The bed comes from the media pack.
- Stop-list covers the promise, cards, callouts and VO. The site subhead's "powerful" must never appear on a card.
- Extractor gaps: no-readme, no-changelog and no-user-flow (a URL-only product; the user flow is the recorded .media/flow.json); no-product-name is closed by the tokens.json title and the logo.
- The vendor product-launch-video route is entered through this BRIEF only.

### Planning rubric (skills/present/references/planning-rubric.md)
- Q1 product: Plausible Analytics is a lightweight, cookie-free web analytics dashboard that puts a site's traffic on one page, positioned as an easy-to-use Google Analytics alternative. Source: https://plausible.io (snapshot hero-page.html:855 h1, :862 subhead, :341 "all the important stats on one single page"). The name comes from capture/extracted/tokens.json `title` and capture/assets/logo-670e83ee.svg, which closes the extractor gap `no-product-name` for a URL-only product.
- Q2 most credible claim: "Our script is 54 times smaller than Google Analytics". Claim c010, source https://plausible.io, snapshot hero-page.html:1389 (sourced copy, so it has no tier; tiers cover product material only). Runner-up, and the STAR: the demonstrated one-click Source filter "ChatGPT", which redraws the whole dashboard (.media/capture/events.jsonl click at footage 6.804 s, tier A). The feature line behind it is hero-page.html:966–971 ("See which AI tools like ChatGPT, Perplexity, or Claude send you traffic").
- Q3 visual hook: the live dashboard's before and after around one click. Unfiltered KPI row, graph and Sources list, then a click on "ChatGPT", then the filter chip "Source is ChatGPT" and every KPI and the graph redraw. Capture segment: footage 5.0–9.9 s (autozoom segment 2, zoom-in 6.104 → 6.804 s, focus 0.2587,0.75, scale 2).
- Q4 show from the product: the public live-demo dashboard of plausible.io (KPI row, visitors graph, Sources list, the Source filter, the map / browsers / goals panels), tier A. This is the prod screencast at 3840x2160 with the redaction gate clean (0 findings), 12.37 s long.
- Q5 shortest satisfying length: 45 s, band hero launch 45–90 s (QA-01: 43.65–46.35 s). The footage splits into 5 non-overlapping windows of about 2.4 s each. With capture_hold and drift each becomes a product beat of 3 s or more, about 17 s of product in total (38 %, above the 35 % marketing target). A 6th or 7th product beat would need a new capture, because a window may not be replayed.
- Q6 register / preset: high / no preset declared. Derived: marketing defaults to `register: high` (GSAP expo, 0.15–0.3 s transitions). Brand tokens come from capture/extracted/tokens.json (indigo #5850EC, navy #161E2E / #252F3F, light #F9FAFB / #FFFFFF). The frame.md preset is left to workflow Step 2.
- Q7 audio: an upbeat music-led bed that carries the rhythm of a muted-first cut. The one strong lock is the filtered-dashboard reveal (STAR), with a 0.3–0.5 s dropout before it. SFX are 3–5 per 30 s and only on the two recorded clicks and the reveal. VO is off (marketing default). Bed: pack:vol-10 (60.0 s, the shortest pack track that covers 45 s; it gets trimmed and faded; I have not measured its beat grid, and `render-path run --bgm` supplies the cues). Target −18 LUFS (music-only, no VO; QA-08's −18…−20 row for a marketing hero is the owner's call).
- Q8 share caption: "See which AI tools send your site visitors in one click, with no cookies and a script 54× smaller than Google Analytics." (c010; the AI-tools line is from hero-page.html:971 and "No cookies" from :862.)
- Q9 user flow: plausible.io landing → click "View live demo" (footage 2.206 s) → live dashboard (KPI row, graph, Sources) → click Source "ChatGPT" (6.804 s) → dashboard filtered "Source is ChatGPT", with KPIs and graph redrawn → scroll to map / browsers / goals (9.867 s). Source: .media/flow.json steps 1–12 and .media/capture/events.jsonl lines 2–6.

Gate: Q2, Q4 and Q9 are all answered, with no TODO, so this is not "material too thin". Inputs that were stubs: none (story-extraction, claims-index, capture and autozoom are all real outputs).


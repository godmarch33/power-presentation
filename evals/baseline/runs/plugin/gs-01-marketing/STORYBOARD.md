---
format: 1920x1080
duration: 45s
message: "See your ChatGPT visitors in one click. No cookies."
arc: "PAS — question → promise → agitate (GA is overkill) → solve (one recorded click, 5 product beats) → benefits → proof → CTA"
audience: marketing
mode: autonomous
language: en
version: v1
reveal: early
register: high
music: pack:vol-10
approved: v1
---

## Timeline (director's summary, 45.0 s)

| # | Start | Dur | beat | Gate role | Scene type | Tier | Footage window (+hold) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 0.0 | 2.6 | hook | hook | kinetic-type | — | — |
| 2 | 2.6 | 2.2 | benefit_highlight (promise) | outcome | kinetic-type | — | — |
| 3 | 4.8 | 4.2 | pain_point | recording | product-ui | A | 0.0–4.2 |
| 4 | 9.0 | 4.0 | product_intro | ui | product-ui | A | 4.2–5.8 (+2.4) |
| 5 | 13.0 | 4.6 | feature_showcase (STAR) | ui | product-ui | A | 5.8–7.9 (+2.5) |
| 6 | 17.6 | 4.0 | feature_showcase | ui | product-ui | A | 7.9–9.9 (+2.0) |
| 7 | 21.6 | 4.2 | benefit_highlight | ui | product-ui | A | 9.9–12.3 (+1.8) |
| 8 | 25.8 | 3.8 | benefit_highlight | — | kinetic-type | — | — |
| 9 | 29.6 | 3.0 | benefit_highlight | — | titlecard | — | — |
| 10 | 32.6 | 3.0 | benefit_highlight | — | titlecard | — | — |
| 11 | 35.6 | 5.4 | social_proof | — | quote-card | — | — |
| 12 | 41.0 | 4.0 | cta | cta | logo-outro | — | — |

Product frames 3–7 = 21.0 s of 45.0 s (46.7 %, marketing target ≥ 35 %). Five windows, in recorded order, none
replayed; the footage (tier A, `.media/capture/footage.mp4`, 12.37 s) is used 0.0–12.3.

## Video direction

- **Palette (frame.md, by role).** Ground `bg` #FFFFFF on every card frame. Headlines `text` #252F3F. The one accent
  is `primary` #5850EC: the word "ChatGPT" wherever it appears in card copy, the kicker eyebrow, the CTA button fill.
  Secondary lines `text-muted` #4B5563. Cards and the type rail use `card-bg` / `border` (4 % fill, 20 % border,
  radius `card-lg` 14 px), no shadows. No gradients, no purple-blue "AI" glow, no second accent.
- **Type (frame.md).** Space Grotesk for display, labels and the CTA; Inter for secondary lines and the quote
  attribution. Display weight per frame.md (`h1` 700). Letter-spacing −0.02 em on display.
- **Motion grammar (register high).** Entrances ease-out on the expo family (`expo.out` /
  `power3.out`), exits ease-in (callouts clearing inside a frame), moves ease-in-out; no frame has an outro. Entrances 0.3–0.6 s, the hero landing
  0.6–0.9 s, first movement 0.1–0.3 s after t = 0. No `back.out`, no elastic (register is not playful). Stagger
  60–100 ms. At least three easings across the video (QA-11).
- **Reveal model (no voice-over).** The video is muted-first: every reveal is cued to the bed's bar, not to speech.
  Nothing enters before its `text:` start below; nothing is front-loaded; each frame ends on a held read with one
  sizeable ambient movement (a slow 2–3 % scale drift of the text block or card, never a 1-pixel pulse — QA-07
  measures whole frames).
- **Camera on footage frames is the plugin's** (auto-zoom from `autozoom.json`, the cursor path and click
  ripples, and the declared `capture_drift`). Workers never author a cursor, a ripple or a zoom on the footage.
- **Held beats (rhythm).** The footage holds (`capture_hold`) are the breathers, each carried by a drift. Frame 9
  and 10 are calm titlecards after the fast product run; frame 11 (quote) is the one deliberately still read
  before the CTA.
- **Transitions.** Primary: `crossfade 0.2s` (frames 4, 5, 6, 7, 9, 10, 11 = 7 of 11 cuts). Accents (2):
  `zoom-through 0.3s` into the product (frame 3) and out of it (frame 8). Hard cuts on the beat into frames 2
  and 12.
- **Negative list.** No padlocks, shields, cookie icons, GDPR badges, stock people, icon feature grids, logo sting
  (no logo before frame 12), fake UI, rebuilt dashboard, static screenshots, linear easing, text below 40 px,
  jittery cursor, several reveals. Both motion failure modes are banned: slideshow (everything in at t = 0, then
  frozen) and screensaver (every element floating on its own loop).

## Stage, safe zones and size floors (bind every frame)

- **Two ratios, one file.** Master 1920×1080; the 9:16 cut (1080×1920) is the same frame files reflowed by
  `@container (aspect-ratio < 1)`. Size and place in `cqw` / `cqh` / `cqmin`, never fixed 1920 / 1080 px.
- **Caption keep-out (QA-14).** Nothing but captions at y ≥ 0.82 of the height in either ratio (16:9: y ≥ 885 px;
  9:16: y ≥ 1574 px). Captions are off in 16:9 and on in 9:16; the band stays empty in both.
- **Size floors.** Display (the frame's hero line) ≥ 6 cqh (65 px at 1080p), weight per frame.md. No text
  below 40 px at 1080p in 16:9 and below 40 px in 9:16 — write secondary sizes as `max(3.7cqmin, 40px)`. Every
  declared line ≤ 42 characters, ≤ 2 lines (QA-10). In 9:16, display targets 6 cqh; where a declared line would
  wrap to a third rendered line at 6 cqh (the hook and the promise), step the display down to the largest size
  ≥ 5 cqh that keeps the declared two lines (the 6 % floor conflicts with QA-10's two lines at 1080 px width).
- **Footage stage (frames 3–7, identical in all five).**
  - 16:9: `data-frame-video-x="347" data-frame-video-y="0" data-frame-video-width="1573" data-frame-video-height="885"`
    (a 16:9 box flush to the top and right edges, bottom at 0.819 H). At home pose the dashboard fills canvas
    x ≈ 693–1574.
  - 9:16: `data-frame-video-portrait="0,560,1080,1000"` (full width, y 560–1560, bottom at 0.8125 H).
  - The footage stage has no background of its own (the assembler paints the ground); a 1 px `border` hairline on
    its left edge only.
- **Type rail (frames 3–7).** 16:9: a card x 56–664 px, y 48–860 px, fill #FFFFFF at 0.94 opacity with the
  frame.md `border`, radius 14 px, sitting on top of the stage's left margin. All callouts live inside it,
  text box x 80–640 px (560 px wide). Callout lines are ≤ 17 characters so they set at 6 cqh without a third line.
  9:16: no rail card; the type block sits above the stage, x 60–1020 px, y 200–540 px, on the white ground.
  Stage content that matters is kept right of the rail: every `capture_drift` focus below is chosen so its subject
  lands at stage x ≥ 0.19 (canvas x ≥ 640).
- **Kicker (frames 4–7, one element across three seams).** Text "Live demo / plausible.io's own stats": line 1
  "LIVE DEMO" in `h4-eyebrow` style (Space Grotesk 600, upper, 0.08 em tracking, `primary`), line 2 in Inter 500
  `text-muted`, both `max(3.7cqmin, 40px)`. 16:9 box: x 80, y 72, w 560, h 120 px. 9:16 box: x 60, y 72, w 960,
  h 112 px. Scale 1, opacity 1, static — it never moves between frames 4 and 7; it enters in frame 4 and leaves
  with frame 7's outgoing transition. It is the honesty label: the dashboard is Plausible's own public demo, not
  the viewer's site (claims c110, c112).
- **Hero entrance by 0.5 s (QA-06)** on every frame; no fully static window > 2.0 s.

## Audio plan

- Bed: `pack:vol-10` (ende.app "Happy Beats / Business Moves" vol-10, 60.0 s, CC0/licence in the pack's
  `LICENSES.md`), trimmed to 45.0 s with a short fade-in and a ~1.5 s fade-out ending at 45.0 s. `render-path run
  --bgm pack:vol-10` supplies the credit line and the beat cues. Music-only mix, no VO, no ducking.
- Strong lock: the STAR reveal — filtered dashboard lands at frame 5 local 1.7 s (global 14.7 s). Snap it
  to the nearest downbeat within ±0.15 s once the cues exist (TODO(orchestrator): the beat grid of vol-10 is not
  measured yet; shift frame 5's window start, not the copy, if the lock misses). Secondary locks: hook text
  landing (global 0.3 s) and the CTA button (global 42.2 s).
- Dropout: bed ducks to near-silence for 0.4 s at global 14.25–14.65 s (frame 5 local 1.25–1.65),
  between the click and the reveal; it returns on the `success` cue.
- SFX (kenney pack, product actions only): 5 cues in 45 s — frame 3 `click` 2.21 + `panel` 3.3, frame 5
  `click` 1.0 + `success` 1.7, frame 7 `panel` 0.7. Nothing on card frames.
- Loudness: music-only hero → target −18 LUFS integrated, TP ≤ −1 dBTP (QA-08; −18…−20 row is the
  owner's call).

## Evidence and honesty

- Frames 3–7 are tier A (prod screencast, `capture-manifest.json` tier A, redaction gate 0 findings). No
  reconstruction, so no "Screen images simulated" label and no `reconstructed` key anywhere.
- Card copy carries no dashboard numbers (the live-demo KPIs change daily and belong to plausible.io's own site);
  the numbers visible inside the footage are the product's real UI, not our claims. Every number in card copy
  ("54×", "30-day") and every sourced line is in `claims-index.json` (c010, c033, c038, c101–c112).
- Assets: footage frames declare `assets/footage.mp4` with `data-media-start` = the window start (the plugin
  retargets it to `assets/clips/<frame_id>.mp4`); autozoom sidecars read `.media/capture/events.jsonl`,
  `.media/capture/footage.mp4`, `.media/capture/capture-manifest.json`.

## Frame 1 — How many visitors did ChatGPT send you?

- src: compositions/frames/01-hook-question.html
- duration: 2.6s
- transition_in: cut
- scene: A two-line question slams in on white; "ChatGPT?" lands last in indigo.
- beat: hook
- role: hook
- scene_type: kinetic-type
- blueprint: kinetic-type-beats (Adapt)
- focal: the question
- roles: question = hero
- sfx: none
- asset_candidates:
- asset_note: typographic hook — no product and no logo before 3 s (checklist)
- text: "How many visitors / did ChatGPT send you?" @ 0.3-2.6
- persuasion: Curiosity gap (a question the viewer cannot answer from the tool they have now)

Adapt: keep the kinetic-type-beats signature (the line builds word by word, the key word lands last with its own
move); one line, no swaps.

Scene 1 (0.0–0.3 s): white ground, a thin indigo caret-like rule draws in at the left edge of the text block —
the only element at t = 0, so the frame is never empty. Centered, text block ~70 % of width.
Scene 2 (0.3–1.3 s): "How many visitors" rises in word by word (expo.out, 70 ms stagger), then "did ChatGPT
send you?" follows; "ChatGPT?" enters last, in `primary`, with a short scale-from-1.06 settle. Display `h1`,
centered, two lines, upper-middle third (y ≈ 0.30–0.55).
Scene 3 (1.3–2.6 s): held read; the whole block drifts up 2 % and scales to 1.02 (one sizeable ambient move).
Hard cut out on the beat.

## Frame 2 — See your ChatGPT visitors in one click

- src: compositions/frames/02-promise.html
- duration: 2.2s
- transition_in: cut
- scene: The promise answers the question — one line, "one click" underlined in indigo as it lands.
- beat: benefit_highlight
- role: outcome
- scene_type: kinetic-type
- blueprint: titlecard-reveal (Adapt)
- focal: the promise line
- roles: promise = hero
- sfx: none
- asset_candidates:
- asset_note: typographic promise card — the product arrives in frame 3 (QA-04 at 4.8 s)
- text: "See your ChatGPT / visitors in one click." @ 0.1-2.2
- persuasion: Promise — concrete noun + number, answers the hook

Adapt: titlecard-reveal's single restrained move (slide-up crossfade), then a still read; the underline is the one
accent.

Scene 1 (0.0–0.6 s): "See your ChatGPT" slides up 4 % and fades in (expo.out 0.5 s), "visitors in one click."
follows 0.1 s later. "ChatGPT" in `primary`. Centered, display `h1`, same vertical band as frame 1 so the cut
reads as an answer in the same place.
Scene 2 (0.6–1.2 s): a 6 px `primary` underline draws left→right under "one click" (power2.inOut 0.5 s).
Scene 3 (1.2–2.2 s): held read; block scales 1.00→1.02. Cut.

## Frame 3 — Google Analytics is overkill

- src: compositions/frames/03-landing-live-demo.html
- duration: 4.2s
- transition_in: zoom-through 0.3s
- scene: plausible.io's landing page plays; the camera punches into "View live demo", the click lands and the live dashboard loads — the rail says Google Analytics is overkill.
- beat: pain_point
- role: recording
- scene_type: product-ui
- evidence_tier: A
- capture_window: 0.0-4.2
- blueprint: compose
- focal: assets/footage.mp4
- roles: footage = hero (stage box, plugin camera) · type rail = supporting
- sfx: click @ 2.21, panel @ 3.3
- asset_candidates: assets/footage.mp4 — tier-A screencast of plausible.io, window 0.0–4.2 s: landing hero, click on "View live demo" at 2.206 s, live dashboard loaded from 3.25 s
- text: "Google Analytics / is overkill." @ 0.3-3.0
- handoff_out: footage stage — 16:9 box x 347 y 0 w 1573 h 885 px, 9:16 box 0,560,1080,1000; scale 1 (plugin camera back at home pose at footage 4.206 s); opacity 1; footage continues without a gap into frame 4 (window 4.2). Type rail card — x 56 y 48 w 608 h 812 px (16:9); scale 1; opacity 1; static. Callout text leaves before the cut (out by 3.4 s).
- persuasion: Negative contrast (the named alternative is too much)

Agitate beat (≤ 3 s of copy, PAS) laid over the first product frame: the viewer sees Plausible's own page answer it.

Scene 1 (0.0–0.3 s): stage and type rail are already in place from the zoom-through; the landing page plays at
home pose in the stage (headline "Easy to use and privacy-friendly Google Analytics alternative" is the page's own).
Scene 2 (0.3–1.5 s): in the rail, "Google Analytics" rises in (expo.out 0.5 s), "is overkill." follows 0.12 s
later, `h1` at 6 cqh, `text` colour — no strike-through or red, the words carry it. Plugin camera
starts its punch-in on the "View live demo" button at 1.506 s (scale 2).
Scene 3 (1.5–3.0 s): camera arrives on the button at 2.206 s; the plugin's click ripple fires (`click` SFX). Callout
holds and reads.
Scene 4 (3.0–4.2 s): callout clears (fade + 3 % rise, 0.3 s) as the page turns into the live dashboard (loaded
at 3.25 s, `panel` SFX at 3.3); the camera eases back to home by 4.2 s. The rail stays, empty for 0.8 s — the
dashboard is the subject.

## Frame 4 — Every source, one page

- src: compositions/frames/04-dashboard-all-traffic.html
- duration: 4.0s
- transition_in: crossfade 0.2s
- scene: The live dashboard with every source mixed together; the camera drifts in on the KPI row — this is the "before".
- beat: product_intro
- role: ui
- scene_type: product-ui
- evidence_tier: A
- capture_window: 4.2-5.8
- capture_hold: 2.4
- capture_drift: 0.34,0.16 1.6 @ 1.7-3.6
- blueprint: compose
- focal: assets/footage.mp4
- roles: footage = hero · type rail = supporting · kicker = supporting (persistent)
- sfx: none
- asset_candidates: assets/footage.mp4 — tier-A screencast, window 4.2–5.8 s: unfiltered live dashboard of plausible.io (KPI row, visitors graph, Sources list with Google, ChatGPT, GitHub…)
- text: "Live demo / plausible.io's own stats" @ 0.2-4.0
- text: "Every source, / one page." @ 0.5-4.0
- handoff_in: footage stage — 16:9 box x 347 y 0 w 1573 h 885 px, 9:16 box 0,560,1080,1000; scale 1 (camera home); opacity 1; footage continues from frame 3 at 4.2 s. Type rail card — x 56 y 48 w 608 h 812 px; scale 1; opacity 1; static.
- handoff_out: kicker — 16:9 box x 80 y 72 w 560 h 120 px, 9:16 box x 60 y 72 w 960 h 112 px; scale 1; opacity 1; static (0 px/s). Type rail card — x 56 y 48 w 608 h 812 px; scale 1; opacity 1; static. Footage stage box unchanged (x 347 y 0 w 1573 h 885); the camera is at scale 1.6 on focus 0.34,0.16 at the cut and frame 5 opens at home pose (a deliberate reframe under the crossfade).
- persuasion: Establish the "before" (all traffic, no answer yet)

Scene 1 (0.0–0.5 s): kicker enters in the rail's top slot (eyebrow first, then line 2, 80 ms stagger, expo.out);
the unfiltered dashboard plays at home pose.
Scene 2 (0.5–1.7 s): "Every source," then "one page." rise into the rail's middle (display 6 cqh). The footage
runs to 5.8 s (a still dashboard — the motion is the type and, next, the camera).
Scene 3 (1.6–4.0 s): the window's last picture holds (`capture_hold` 2.4); the plugin drifts the camera to the KPI
row at 1.6× (focus 0.34, 0.16 — "Unique visitors" lands right of the rail) between 1.7 and 3.6 s. Callout holds.

## Frame 5 — One click: now it's only ChatGPT

- src: compositions/frames/05-click-chatgpt-star.html
- duration: 4.6s
- transition_in: crossfade 0.2s
- scene: STAR — the camera punches into the Sources list, the recorded click lands on "ChatGPT", the dashboard redraws for that one source and the camera rises to the new KPI row with the "Source is ChatGPT" chip.
- beat: feature_showcase
- role: ui
- scene_type: product-ui
- evidence_tier: A
- capture_window: 5.8-7.9
- capture_hold: 2.5
- capture_drift: 0.34,0.16 1.6 @ 2.2-3.6
- poster: 4.2
- blueprint: compose
- focal: assets/footage.mp4
- roles: footage = hero · type rail = supporting · kicker = supporting (persistent)
- sfx: click @ 1.0, success @ 1.7
- asset_candidates: assets/footage.mp4 — tier-A screencast, window 5.8–7.9 s: click on Source "ChatGPT" at 6.804 s, dashboard redraws as "Source is ChatGPT" (filtered KPIs, graph and Top referrers from 7.5 s)
- text: "Live demo / plausible.io's own stats" @ 0.0-4.6
- text: "One click." @ 0.2-1.6
- text: "Now it's only / ChatGPT." @ 1.8-4.6
- handoff_in: kicker — 16:9 box x 80 y 72 w 560 h 120 px, 9:16 box x 60 y 72 w 960 h 112 px; scale 1; opacity 1; static. Type rail card — x 56 y 48 w 608 h 812 px; scale 1; opacity 1; static. Footage stage x 347 y 0 w 1573 h 885 (9:16 0,560,1080,1000); camera at home pose at t = 0.
- handoff_out: kicker — same box, scale 1, opacity 1, static. Type rail card — x 56 y 48 w 608 h 812 px; scale 1; opacity 1; static. Footage stage box unchanged; camera at scale 1.6 on focus 0.34,0.16 at the cut (frame 6 opens zoomed on the Sources panel and eases out — the plugin's track).
- persuasion: Show-don't-tell proof — one recorded click, before ≠ after (all traffic → one source)

The STAR, planned first. Before: frame 4's KPI row at 1.6× (all sources). After: the same framing, same
focus, now filtered to ChatGPT with the "Source is ChatGPT" chip — the matched framing makes the change read at a
glance.

Scene 1 (0.0–0.3 s): dashboard at home pose; "One click." pops into the rail's middle slot (display, expo.out
0.4 s) — a 2-word label, it leaves at 1.6.
Scene 2 (0.3–1.0 s): the plugin's punch-in (starts at footage 6.104 → local 0.304, scale 2, focus
0.2587, 0.75) travels to the Sources list; the plugin cursor approaches the "ChatGPT" row on its spring.
Scene 3 (1.0–1.7 s): click on "ChatGPT" (local 1.004, `click` SFX + ripple). Bed dropout 1.25–1.65. The list
blanks and reloads as "Top referrers: chatgpt.com" inside the zoom.
Scene 4 (1.7–2.1 s): filtered dashboard is in (`success` SFX at 1.7, the strong beat lock). "Now it's only
ChatGPT." rises into the rail from 1.8 ("ChatGPT." in `primary`, the hero landing 0.7 s).
Scene 5 (2.1–4.6 s): the window's last picture holds (`capture_hold` 2.5); the plugin drifts the camera up from
the Sources list to the KPI row at 1.6× (focus 0.34, 0.16) between 2.2 and 3.6 s — the filter chip "Source is
ChatGPT" and the redrawn Unique visitors land right of the rail. Held read to the end. Poster at 4.2 s.

## Frame 6 — Which pages they land on

- src: compositions/frames/06-filtered-top-pages.html
- duration: 4.0s
- transition_in: crossfade 0.2s
- scene: Still filtered to ChatGPT, the camera eases out to the whole dashboard, then drifts onto Top pages — the pages AI visitors land on.
- beat: feature_showcase
- role: ui
- scene_type: product-ui
- evidence_tier: A
- capture_window: 7.9-9.9
- capture_hold: 2.0
- capture_drift: 0.65,0.78 1.6 @ 2.1-3.5
- blueprint: compose
- focal: assets/footage.mp4
- roles: footage = hero · type rail = supporting · kicker = supporting (persistent)
- sfx: none
- asset_candidates: assets/footage.mp4 — tier-A screencast, window 7.9–9.9 s: dashboard filtered "Source is ChatGPT" (Top referrers chatgpt.com, Top pages /, /register, /activate)
- text: "Live demo / plausible.io's own stats" @ 0.0-4.0
- text: "Which pages / they land on." @ 0.3-4.0
- handoff_in: kicker — 16:9 box x 80 y 72 w 560 h 120 px, 9:16 box x 60 y 72 w 960 h 112 px; scale 1; opacity 1; static. Type rail card — x 56 y 48 w 608 h 812 px; scale 1; opacity 1; static. Footage stage x 347 y 0 w 1573 h 885 (9:16 0,560,1080,1000).
- handoff_out: kicker — same box, scale 1, opacity 1, static. Type rail card — x 56 y 48 w 608 h 812 px; scale 1; opacity 1; static. Footage stage box unchanged; camera at scale 1.6 on focus 0.65,0.78 at the cut; frame 7 opens at home pose.
- persuasion: Feature-to-benefit translation (source → the pages it feeds)

Scene 1 (0.0–0.9 s): the plugin's track finishes the click segment — the camera eases out from the Sources
panel (2×) to home between footage 8.004 and 8.804 s, revealing the whole filtered dashboard. "Which pages" rises
into the rail at 0.3 s, "they land on." 0.12 s later (display 6 cqh).
Scene 2 (0.9–2.0 s): filtered dashboard at home pose; callout reads.
Scene 3 (2.0–4.0 s): the window's last picture holds (`capture_hold` 2.0); the plugin drifts the camera onto the
Top pages panel at 1.6× (focus 0.65, 0.78) between 2.1 and 3.5 s. Held read.

## Frame 7 — Plus the goals they complete

- src: compositions/frames/07-filtered-map-goals.html
- duration: 4.2s
- transition_in: crossfade 0.2s
- scene: The page scrolls; map, browsers and goals load for ChatGPT visitors only, and the camera settles on the Goals panel.
- beat: benefit_highlight
- role: ui
- scene_type: product-ui
- evidence_tier: A
- capture_window: 9.9-12.3
- capture_hold: 1.8
- capture_drift: 0.43,0.64 1.5 @ 2.5-3.8
- blueprint: compose
- focal: assets/footage.mp4
- roles: footage = hero · type rail = supporting · kicker = supporting (persistent, leaves with this frame)
- sfx: panel @ 0.7
- asset_candidates: assets/footage.mp4 — tier-A screencast, window 9.9–12.3 s: scroll to Map, Browsers and Goals, all filtered "Source is ChatGPT" (Goals: Visit /register, Sign up for a trial, Add a site)
- text: "Live demo / plausible.io's own stats" @ 0.0-4.2
- text: "Plus the goals / they complete." @ 0.4-4.2
- handoff_in: kicker — 16:9 box x 80 y 72 w 560 h 120 px, 9:16 box x 60 y 72 w 960 h 112 px; scale 1; opacity 1; static. Type rail card — x 56 y 48 w 608 h 812 px; scale 1; opacity 1; static. Footage stage x 347 y 0 w 1573 h 885 (9:16 0,560,1080,1000); camera at home pose.
- persuasion: Value stacking (source → pages → conversions, all from one click)

Scene 1 (0.0–0.8 s): the recorded scroll (footage 9.867 s, no zoom — never zooms a scroll) brings Map,
Browsers and Goals up; the panels load with their spinners (`panel` SFX at 0.7 as they fill).
Scene 2 (0.4–2.4 s): "Plus the goals" then "they complete." rise into the rail (display 6 cqh). Panels settled
from ~0.9 s.
Scene 3 (2.4–4.2 s): the window's last picture holds (`capture_hold` 1.8); the plugin drifts the camera onto the
Goals table at 1.5× (focus 0.43, 0.64: goal names and Uniques right of the rail) between 2.5 and 3.8 s. Held read;
the zoom-through out of this frame carries the kicker and rail away.

## Frame 8 — ChatGPT. Perplexity. Claude.

- src: compositions/frames/08-ai-tools.html
- duration: 3.8s
- transition_in: zoom-through 0.3s
- scene: Three AI tool names stack in on the beat, then the line that says what they mean — see which AI tools send you traffic.
- beat: benefit_highlight
- scene_type: kinetic-type
- blueprint: kinetic-type-beats (Adapt)
- focal: the three names
- roles: tool names = hero · benefit line = supporting
- sfx: none
- asset_candidates:
- asset_note: typographic benefit beat — the three tool names are copy from hero-page.html:971, no third-party logos were captured
- text: "ChatGPT." @ 0.2-3.8
- text: "Perplexity." @ 0.6-3.8
- text: "Claude." @ 1.0-3.8
- text: "See which AI tools / send you traffic." @ 1.6-3.8
- persuasion: Rule of three (breadth beyond the one demo)

Adapt: kinetic-type-beats' escalation — three words land one per beat, each with its own move, then the payoff
line.

Scene 1 (0.2–1.4 s): "ChatGPT." lands left-aligned in the upper third (display 8 cqh, `primary`), "Perplexity."
0.4 s later below it, "Claude." 0.4 s after that — each slides in from 6 % left with expo.out 0.4 s. Three stacked
lines, left third to centre.
Scene 2 (1.6–2.4 s): "See which AI tools / send you traffic." rises in to the right of the stack (Inter 500,
`text`, 4.4 cqh), asymmetric 60/40.
Scene 3 (2.4–3.8 s): held read; the stack scales 1.00→1.03, the line holds.

## Frame 9 — No cookies. Just insights.

- src: compositions/frames/09-no-cookies.html
- duration: 3.0s
- transition_in: crossfade 0.2s
- scene: One calm two-line card — no cookies, just insights.
- beat: benefit_highlight
- scene_type: titlecard
- blueprint: titlecard-reveal (Reproduce)
- focal: the two lines
- roles: headline = hero
- sfx: none
- asset_candidates:
- asset_note: typographic benefit card (hero-page.html:862) — no cookie iconography by design (negative list)
- text: "No cookies. / Just insights." @ 0.2-3.0
- persuasion: Friction reduction (no consent banner to build)

Scene 1 (0.2–0.8 s): "No cookies." slides up and fades in, centred (display `h1` 8 cqh); "Just insights." follows
0.3 s later in `primary`.
Scene 2 (0.8–3.0 s): held read; block scales 1.00→1.025.

## Frame 10 — Made and hosted in the EU

- src: compositions/frames/10-made-in-eu.html
- duration: 3.0s
- transition_in: crossfade 0.2s
- scene: A second calm card in the same position — made and hosted in the EU.
- beat: benefit_highlight
- scene_type: titlecard
- blueprint: titlecard-reveal (Reproduce)
- focal: the headline
- roles: headline = hero
- sfx: none
- asset_candidates:
- asset_note: typographic benefit card (hero-page.html:862) — no flags, no maps, no badges
- text: "Made and hosted / in the EU." @ 0.2-3.0
- persuasion: Authority by jurisdiction (where the data lives)

Scene 1 (0.2–0.8 s): "Made and hosted" slides up into the same centred position frame 9 used; "in the EU."
follows 0.3 s later, "EU" in `primary`.
Scene 2 (0.8–3.0 s): held read; block scales 1.00→1.025.

## Frame 11 — Massive users at Hugging Face

- src: compositions/frames/11-proof-quote.html
- duration: 5.4s
- transition_in: crossfade 0.2s
- scene: One customer quote, typographic — Hugging Face's co-founder and CEO.
- beat: social_proof
- scene_type: quote-card
- blueprint: titlecard-reveal (Adapt)
- focal: the quote
- roles: quote = hero · attribution = supporting
- sfx: none
- asset_candidates:
- asset_note: typographic proof — quote c033 and attribution c108 (hero-page.html:1185, :1173, :1176); no avatar or customer logo was captured, so none is used
- text: "We're massive users of Plausible / here at Hugging Face." @ 0.3-5.4
- text: "Clem Delangue / Co-founder and CEO, Hugging Face" @ 1.3-5.4
- persuasion: Social proof (a known AI company uses it)

Adapt: titlecard-reveal's calm proof card without the busy open — one restrained move, then a still read.

Scene 1 (0.0–0.3 s): a large `quote-mark` glyph (frame.md, `primary` at 0.15) fades in top-left of the text block.
Scene 2 (0.3–1.3 s): the quote slides up and fades in, `blockquote` style (Space Grotesk 500, 4.4 cqh, `text`),
centred-left, two lines, card-tinted panel behind it (~60 % of width).
Scene 3 (1.3–2.0 s): attribution fades in below (Inter, `text-muted`, name 600 / role 400).
Scene 4 (2.0–5.4 s): held read; the panel scales 1.00→1.03 over the hold.

## Frame 12 — Start my free trial

- src: compositions/frames/12-end-card.html
- duration: 4.0s
- transition_in: cut
- scene: End card — Plausible logo, the runner-up promise, the one CTA button, the no-card line and the URL.
- beat: cta
- role: cta
- scene_type: logo-outro
- blueprint: logo-assemble-lockup (Adapt)
- focal: CTA button
- roles: CTA button = hero · logo = supporting · tagline = supporting · URL = supporting
- sfx: none
- asset_candidates: assets/logo-670e83ee.svg — Plausible logo from the site header (capture/assets/logo-670e83ee.svg, claim c038)
- text: "Analytics script 54× smaller / than Google Analytics" @ 0.6-4.0
- text: "plausible.io" @ 1.0-4.0
- text: "30-day free trial. / No credit card required." @ 1.6-4.0
- cta: "Start my free trial" @ 1.2-4.0
- order: logo -> tagline -> URL
- stagger: 0.4s
- persuasion: Risk reversal (free trial, no card) + one action

Adapt: the text-clears-mark-blooms lockup, simplified — no push-through; the mark blooms, the lockup builds in the
QA-13 order, the button is the one solid element.

Scene 1 (0.2–0.6 s): Plausible logo blooms from 0.9 scale at the top centre (y ≈ 0.18, ~22 % of width).
Scene 2 (0.6–1.0 s): tagline "Analytics script 54× smaller / than Google Analytics" rises under it (`h3` 4.4 cqh,
`text`, "54×" in `primary`) — the runner-up promise (c010).
Scene 3 (1.0–1.2 s): URL "plausible.io" fades in at the bottom of the lockup (y ≈ 0.74, Space Grotesk 500,
`text-muted`, 4 cqh).
Scene 4 (1.2–1.6 s): the CTA button "Start my free trial" scales in centred (y ≈ 0.52, `cta-button`, `primary`
fill, white label, 5 cqh, pill radius) — the hero; declared `data-var-text`. The support line
"30-day free trial. / No credit card required." follows at 1.6 s under the button (Inter, `text-muted`,
`max(3.7cqmin, 40px)`).
Scene 5 (1.6–4.0 s): held read; the button carries the one ambient move (scale 1.00→1.03 over 2 s). All content
above y = 0.82. No exit animation: the lockup holds to the last frame so the CTA stays fully legible for its
whole 2.8 s (QA-13); the bed's fade-out closes the video.

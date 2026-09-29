---
format: 1920x1080
duration: 60s
message: "Close the books in 3 days, not 12"
arc: Hook → Before → Metric → Auto-match → Audit trail → Benefit → Close checklist → Lock (STAR) → Outcome → Proof → Ask → End card
audience: sales — Dana Okafor, Head of Finance, Northbridge Retail Group (fictional)
mode: autonomous
version: v2
reveal: early
register: medium
language: en
product: Ledgerly
music: none
fixture: GS-02 Ledgerly (synthetic) — plugin-route baseline run; every value is fictional
---

<!-- power-presentation storyboard v2 (agents/story-director.md contract on top of the vendor storyboard format).
     Vendor keys: scene, duration, transition_in, voiceover, blueprint, focal, roles, asset_candidates, sfx, status.
     Plugin keys: beat, role (gate role), scene_type (scene table; `title-card` = a typographic card, which the
     scene table has no row for), evidence_tier, poster, and the on-screen text timeline
     `- text: "…" @ a-b` / `- cta:` / `- order:` / `- stagger:` that wowprobe.py measures for QA-10 / QA-12 / QA-13.
     Footage frames add the story-director contract's footage keys ("Footage windows and holds"):
     `capture_window` (footage seconds this frame plays, 1×), `capture_hold` (seconds the window's last frame holds
     after it) and `capture_drift` (the camera drift during the hold: focus x,y, final scale @ frame-local t0-t1);
     `render-path assemble` cuts the held clip and appends the drift to the camera. `camera` is the prose
     reading of the capture's autozoom plan for the window plus that drift.
     A frame packet carries only its own `## Frame N` block (frame-packets-core.mjs), so every product frame block
     restates its layout and its "Build" lines (footage declaration, autozoom slice); the Video direction below is
     the overview for the assembler and the reviewers.
     v2 answers the v1 critic panel (not ship, mean 1.9): C3 — every product frame is ONE action of the real app on a
     cropped-to-action camera, never the whole marketing page; C4 — every string has a declared size floor, overlays
     sit in a band above the stage, never over product text; C5 — one type system, class names prefixed (`f08-…`);
     C6 — no count-ups, one reveal device per scene, every product frame has footage action + camera, and every
     capture hold is a real camera drift onto the result state; no tween-free second anywhere (QA-11 animation map).
     Every number below is in claims-index.json (QA-12); the fixture's two unverified decoy claims (c029, c030) and
     the site's quarter tag (not an indexed claim) never appear. Durations were set against measured Kokoro am_michael (speed 1.0)
     line lengths so every window ≥ its voice line + 0.8 s: the audio stage should change nothing. -->

## Video direction

- Palette and type (frame.md, blue-professional on the Ledgerly tokens): white canvas `bg`, near-navy `text`
  (#14213d) for headlines and labels, one accent `primary` (#2a6f97) for numerals, the accent line and the CTA pill;
  `text-muted` for attribution and the disclosure. Space Grotesk for every headline, numeral and label, Inter only
  where body copy would be (there is none on screen — captions carry the words). Tinted cards, never shadows.
- Size floors (C4 — sizes given for the 1920×1080 master; type in `cqh` so it keeps its share of the height):
  display ≥ 6 % of the height (≥ 65 px) — hook 96 px, numerals 200 px, quote 68 px, tagline 66 px, CTA 66 px;
  labels ≥ 3.5 % (≥ 38 px) — product labels 52 px, metric lines 52 px, attribution 42 px, URL 44 px, disclosure 38 px.
  No eyebrow chips, no tag pills, no text under 38 px anywhere. ≤ 42 chars per line, ≤ 2 lines (the ` / ` breaks).
  The 9:16 sizes are larger (see the 9:16 bullet).
- Product frames — one layout for all five (C3, C4): a **label band** on top (the accent line at the band station
  x 160, y 44; one label, 52 px Space Grotesk 600 near-navy, left-aligned at x 160, y 58–112) and the **footage
  stage** below it — the approved frame video box `x 280, y 118, w 1360, h 765` (bottom edge 883 px, above the
  caption band y ≥ 0.82 × 1080 = 885.6, QA-14). Nothing is drawn over the stage while the footage plays: no card, no
  dim, no callout on the product's own text (v1 C4 collision). The stage has a 1.5 px `border` outline and 14 px
  radius, no fill (footage renders under the frame layer).
- One label device for every product frame (J — one reveal device per scene): the accent line arrives at the band
  station, then the label's words rise 24 px with a 70 ms stagger (0.45 s, power3.out) on the VO cue named in the
  frame. The motion that carries each capture hold is the plugin's camera drift (`capture_drift`), so no product
  window stands still for 2 s (QA-06 / QA-07). Frame 8 adds one stamp — a check glyph in the band (the STAR).
- **The accent line is the one element that crosses cuts** (J). It is 60×4 `primary` and 60 px wide at every cut,
  and it lives at one of two stations: the **card station** (x 160, y 300 — above the hero of the hook and of every
  card: Frames 1, 3, 6, 9, 10) and the **band station** (x 160, y 44 — above the label of every product frame:
  Frames 2, 4, 5, 7, 8). Frame 1 draws it (0.0–0.3 s). A frame whose predecessor used the other station starts the
  line at the predecessor's station and carries it to its own (0.0–0.4 s, power2.inOut — the frame's first
  movement): F2 300→44, F3 44→300, F4 300→44, F6 44→300, F7 300→44, F9 44→300. Consecutive frames at one station
  (F4→F5, F7→F8, F9→F10) keep it in place. Nothing else resizes it: the ambient movements of the cards are separate
  rules. Every boundary is a hard cut (`transition_in: cut` on all twelve frames), so the line is continuous across
  each cut. Frames 11–12 are a new, centred layout without the line; their shared element is the CTA pill.
- Footage (tier A, `assets/footage.mp4` = `.media/capture/footage.mp4`, 18.27 s, 30 fps CFR, sha256 5b01a5f3…):
  five contiguous, non-overlapping capture windows cut at the capture's own plan (`.media/capture/autozoom.json`
  segments), so each window holds exactly one click and its camera move — W2 2.20–4.70 unmatched workspace (the
  before; the workspace's first frame is 2.167) · W3 4.70–8.30 Auto-match, 7 lines flip (push 4.711, click 5.411,
  7 of 7 at ~7.8) · W4 8.30–11.50 a matched line opens its audit trail (click 9.026) · W5 11.50–15.10 Close
  September, the five-item checklist ticks off (click 12.243, ticks 12.8–14.8) · W6 15.10–18.27 Lock period →
  "September locked" (click 15.860). The landing page (0.0–2.17) is not used: it is marketing copy with every stat at
  once (v1 C3) and carries a second CTA ("Start my free trial"). Each boundary sits before the next segment's
  zoom-in starts (4.711, 8.326, 11.543, 15.160) and before the plugin cursor's next approach (4.933, 8.533, 11.767,
  15.367), so no frame ends chasing a click that belongs to the next frame; at every window end the 16:9 camera is at
  rest (scale 1.0 — each zoom-out ends at 3.997, 7.411, 11.026, 14.243, 17.860) and the cursor is idle. Each held
  picture is its own window's last frame, never a frame of a later window.
- Autozoom slice per product frame = the **capture window** (frame-worker contract for `capture_window`):
  `autozoom.mjs --clip-start <window start> --clip-duration <window length>`; a slice that ran past the window would
  put the next frame's click ripple on a held picture.
- **Capture holds — how they render** (sales product share ≥ 50 %; story-director contract "Footage windows and
  holds", `render-path assemble` since 5d66e1e): (1) the frame declares its footage as usual — `src="assets/footage.mp4"`,
  `data-media-start` = the window start, `data-duration` = the **frame** duration, the stage box as the declaration's
  geometry; (2) assemble cuts `assets/clips/<frame_id>.mp4` = footage[window] + the window's last frame held for
  `capture_hold` (ffmpeg `tpad` clone, CFR 30) and retargets the declaration to it (media start 0, the frame's
  duration); (3) the camera appends the `capture_drift` tween after the window's keys — one sine.inOut move
  from the window's rest pose (scale 1.0) to the declared focus and scale over the whole hold, clamped by autozoom's
  own `clampFocus` / `poseTransform`, so the held picture keeps moving to the cut. The frame therefore paints nothing
  in the stage, extracts no still, and tweens nothing on the footage (frame-worker contract). The plugin's cursor
  sits inside the camera wrapper, so the idle cursor rides the drift and hides at the frame's end. End views below
  are the 16:9 drift's final view in footage fractions (after the clamp). In 9:16 the plugin applies the same focus
  and scale to the `tracks['9:16']` wrapper from wherever that track rests — TODO(render-path): the drift scale is
  not format-aware (at 2.2× the 9:16 window shows ≈ 14 % of the footage width); the intake requests 16:9 only.
- Typographic frames (hook, metric, outcome, proof, ask, end card) are white-canvas cards: one hero element + one
  line, upper 70 % of the canvas, restacking vertically in 9:16. No footage behind them (v1 dimmed-footage collisions).
- 9:16 reflow (frame-worker contract): label band y 120–330 (label 92 px Space Grotesk 600, x 60, up to 2
  lines), stage box `0, 360, 1080, 1200` (the 9:16 autozoom track pans the height-fit footage to each click),
  captions y ≥ 1574. Accent-line stations in 9:16: band x 60, y 100; card centred (x 510–570), y 440. Cards stack
  hero over line, centred; numerals 235 px (the widest, "3.1 days", measures 932 px in Space Grotesk 700 → 74 px side
  margins, inside title-safe). Type in portrait, measured on the 1920 height: **every label ≥ 3.5 % (≥ 68 px)** —
  product labels 92 px, the F3/F6/F9 supporting lines 68 px, the F10 attribution 68 px, the F12 URL 68 px, the
  disclosure 68 px (each re-broken to ≤ 2 lines inside the 960 px column when it does not fit one); numerals keep
  ≥ 6 % (≥ 115 px); a long display line (hook, quote, tagline, CTA) cannot hold 6 % of 1920 (115 px) inside 2 lines
  of a 960 px column, so it keeps ≥ 6 % of the short side (≥ 65 px) and never drops under the 68 px label floor —
  hook 76 px, quote 68 px, tagline 72 px, CTA 72 px, wordmark 120 px. Which side governs display
  text in portrait is not fixed; the intake requests 16:9 only.
- Motion grammar (register medium): entrances power3.out 0.3–0.6 s, hero landings 0.6–0.8 s, the accent
  line's carries power2.inOut, the hold drifts and ambient rules sine.inOut, the camera's zoom-in power3.out and
  zoom-out power2.out (autozoom plan); first movement 0.1–0.3 s after t = 0 (the line carry starts at 0.0), stagger
  70 ms in labels and 0.4 s in the end-card lockup; no back/elastic; no count-ups anywhere (a numeral lands whole —
  v1 C6 ghost numeral). ≥ 3 distinct eases across the video (QA-11). No second without a tween (QA-11 animation map,
  0.5 s buckets, dead zone ≥ 1.0 s): every card's ambient runs to within 0.5 s of its cut, every hold drift runs to
  its cut, and after each voice line ends the next movement starts ≤ 0.9 s later.
- Audio: `music: none` (no bed on disk) and no SFX (no offline pack; clicks carry the cursor ripple only).
  Voice Kokoro am_michael; captions word-timed and burned in, keep-out y ≥ 0.82 (QA-14). Caption spelling (v1 QA-12
  finding — whisper splits "Harborline" into "Harbor Line"): `render-path audio` (since cdaff4b, `lockWordsToScript`)
  re-spells each frame's whisper words against that frame's `voiceover:` line after the voice pass and before
  `captions.mjs build`, merging "Harbor" + "Line" into the script's one word "Harborline" (start of "Harbor", end of
  "Line"). Frame 10's `voiceover:` therefore spells "Harborline" as one word — never change that spelling. Check:
  the audio stage's note reads `captions locked to the script: N word(s)` and frame 10's words in `audio_meta.json`
  carry "Harborline"; if a stage without the lock ran, merge those two words by hand in `audio_meta.json` before the
  captions build.
- Never: stock, fake UI, the landing page as a dashboard, text over product text, text below 38 px (68 px in 9:16),
  count-ups, an opaque still or fill inside a footage stage, numbers without a claim, the quarter tag, the decoy
  claims, a logo before 3 s.

## Frame 1 — Hook: Dana, Northbridge

- scene: Big type on a white canvas — the prospect's name and company and the promise with its number, read without sound by 1.2 s
- duration: 3.2s
- transition_in: cut
- status: outline
- src: compositions/frames/01-hook.html
- voiceover: "Dana, what about a three-day close?"
- blueprint: kinetic-type-beats (Adapt)
- focal: the headline
- roles: headline = cutout · accent line = supporting · underline = supporting · canvas = background
- asset_candidates:
- asset_note: typographic frame
- sfx: none
- beat: hook
- role: hook
- scene_type: title-card
- evidence_tier: A
- poster: 2.8s
- text: "Dana, Northbridge could / close in 3 days, not 12." @ 0.2-3.2

Adapt: keep the statement-build (word groups land on their own beats onto a payoff); drop the token swaps. One
device: word groups rise into place. The copy is the site H1 personalised (claims c001 "3 days", c007 "12"); it
states what Northbridge could do, not what it does today (no prospect fact is invented). `data-var-text` on
"Dana" and "Northbridge".
Scene 1 (0.0–0.3s): white canvas; the accent line (60×4, `primary`) draws left→right at the card station x 160,
y 300 (the first movement). It is the one element that crosses cuts: it stays 60 px wide and Frame 2 carries it up
to the band station — never resize it here.
Scene 2 (0.2–1.2s): 96 px Space Grotesk 700, near-navy, left-aligned at x 160 (cap-top ~y 330): "Dana, Northbridge
could" rises as one group (0.2–0.65 s), "close in 3 days," rises under it (0.5–0.95 s), "not 12." lands last
(0.8–1.2 s); "3 days" is set in the accent colour, "not 12." in `text-muted` — the whole promise is legible at 1.2 s
(QA-03 ≤ 3.0 s). Line 1 measures 1139 px at 96 px (ends x 1299).
Scene 3 (1.2–3.2s): held read; at 2.0 s a separate 4 px accent underline draws under "3 days" (0.6 s, power2.inOut,
done at 2.6 s) — the only movement. Poster at 2.8 s: the underline drawn, name, company and promise settled.
No logo (nothing before 3 s).
9:16: the two lines centred at y 30–45 %, 76 px (≥ 6 % of the short side and ≥ the 68 px label floor; line 1 =
902 px), the accent line at the 9:16 card station (centred, y 440), same beats, poster at 2.8 s.

## Frame 2 — Before: nothing matched

- scene: The real Ledgerly workspace before anything runs — seven bank lines, every status Unmatched; the camera opens tight on "Nothing is matched yet." and pulls back to the whole table, which then holds while the camera drifts gently toward the grey Unmatched column
- duration: 3.1s
- transition_in: cut
- status: outline
- src: compositions/frames/02-before.html
- voiceover: "Today, every line waits for you."
- blueprint: device-surface-showcase (Adapt)
- focal: assets/footage.mp4
- roles: footage = cutout (stage, box 280,118,1360,765) · label = supporting · canvas = background
- asset_candidates: assets/footage.mp4 — record-flow capture, window 2.20–4.70 s (unmatched workspace), render-path assemble plays it from assets/clips/02-before.mp4 (the window + its last frame held 0.6 s)
- sfx: none
- beat: pain_point
- role: ui
- scene_type: product-ui
- evidence_tier: A
- capture_window: 2.20-4.70
- capture_hold: 0.6
- capture_drift: 0.80,0.55 1.04 @ 2.50-3.10
- camera: opens 2× on focus (0.29, 0.25) — segment 1 still holding from the landing click; zoom-out 1.00–1.80 (footage 3.197–3.997) to the full table; at rest 1.80–2.50 (no click in this window — the Auto-match push starts at footage 4.711, in Frame 4); hold drift 2.50–3.10 (plugin, sine.inOut) 1.00 → 1.04 toward the Status column (0.80, 0.55; clamped to 0.52, 0.52)
- text: "Before: nothing matched" @ 0.3-3.1

Adapt: keep the static-tour surface (the real screen held as hero, the camera doing the presenting); no mock chrome.
The pain (`--pain "manual month-end reconciliation"`) is shown as the product's own before-state — 0 of 7 matched,
every status Unmatched — never as numbers in an overlay (G: footage values are UI, not claims).
Layout: label band — accent line 60×4 `primary` at the band station (x 160, y 44), label 52 px Space Grotesk 600
near-navy at x 160, y 58–112; stage box 280,118,1360,765 with a 1.5 px `border` outline, 14 px radius, no fill;
nothing over the stage.
Build: declare the approved footage `src="assets/footage.mp4" data-media-start="2.2" data-duration="3.1"` (the frame
duration) with the stage box as its geometry (x 280, y 118, w 1360, h 765, fit cover); autozoom sidecar for the
window: `--clip-start 2.2 --clip-duration 2.5`. `render-path assemble` cuts the held clip, retargets the declaration
and appends the hold drift from `capture_drift` — this frame extracts no still, paints nothing inside the stage and
tweens nothing on the footage.
Scene 1 (0.0–1.0s): the stage opens at 2× on the top-left of the workspace — "Nordwell Bank EUR / Imported this
morning. Nothing is matched yet." reads large; the accent line carries up from the hook's card station (x 160,
y 300) to the band station (x 160, y 44) (0.0–0.4 s, power2.inOut); on "Today" the label "Before: nothing matched"
rises into the band (0.3–0.75 s).
Scene 2 (1.0–1.8s): the camera eases out to the whole table — seven lines, seven grey Unmatched pills, the empty
Invoice column, "0 of 7 matched" and its empty bar.
Scene 3 (1.8–3.1s): the whole before-state at rest while "waits for you" is said; from 2.5 s the held picture drifts
gently toward the grey Unmatched column (end view x 0.04–1.00, y 0.04–1.00) — the column Frame 4's hold closes in on
once it reads Matched.
9:16: label band on top ("Before:" / "nothing matched", 92 px), accent line carried from the 9:16 card station
(centred, y 440) to the band station (x 60, y 100); the portrait track follows (0.29, 0.33) → rest at focus x 0.29;
the plugin applies the hold drift on that track from its rest pose.

## Frame 3 — Metric: auto-matched

- scene: One number on white: 98.5 % of transactions auto-matched — the promise the next frame proves
- duration: 3.9s
- transition_in: cut
- status: outline
- src: compositions/frames/03-match-rate.html
- voiceover: "Ninety-eight point five percent, auto-matched."
- blueprint: kinetic-type-beats (Adapt)
- focal: the numeral
- roles: numeral = cutout · line = supporting · bar = supporting · accent line = supporting · canvas = background
- asset_candidates:
- asset_note: typographic frame (value sourced at site/index.html:36, claim c002, also visible on the capture's landing page 0.0–2.17 s)
- sfx: none
- beat: benefit_highlight
- role: metric
- scene_type: metrics / chart
- evidence_tier: A
- text: "98.5%" @ 0.3-3.9
- text: "of transactions auto-matched" @ 0.7-3.9

Adapt: the numeral is the payoff beat, landing whole — no count-up, no ring (v1 C4/C6: the ring stroke cut through
the digits and the count-up left a ghost numeral). One device: rise.
Scene 1 (0.0–0.4s): white canvas; the accent line (60×4, `primary`) starts at the band station (x 160, y 44), where
Frame 2 left it, and carries down to the card station (x 160, y 300) (0.0–0.4 s, power2.inOut). It stays 60 px wide.
Scene 2 (0.3–1.2s): "98.5%" rises from a 40 px offset behind a mask, 200 px Space Grotesk 700 in the accent colour,
left-aligned at x 160, cap-top at y 330 (0.3–1.0 s, power3.out); on "auto-matched" the line "of transactions
auto-matched" rises under it, 52 px near-navy (0.7–1.2 s).
Scene 3 (1.2–3.9s): held read; one ambient movement — a 12 px bar-track (accent-light) under the line fills to
98.5 % of its 900 px width (1.2–3.4 s, sine.inOut; it ends 0.5 s before the cut, so no tween-free second). The
numeral never changes value.
9:16: accent line carried from the 9:16 band station (x 60, y 100) to the card station (centred, y 440); numeral
235 px centred at y 32 % (675 px wide), the line 68 px centred under it in 2 lines ("of transactions" /
"auto-matched"), bar under the line.

## Frame 4 — Auto-match: one click

- scene: The recorded click on Auto-match; the seven bank lines flip to Matched one by one, invoices filling in, the counter to 7 of 7 — then the hold drifts in on the result
- duration: 6.6s
- transition_in: cut
- status: outline
- src: compositions/frames/04-auto-match.html
- voiceover: "Click Auto-match, and every bank line finds its own invoice while you watch."
- blueprint: agent-progress-theater (Adapt)
- focal: assets/footage.mp4
- roles: footage = cutout (stage, box 280,118,1360,765) · label = supporting · canvas = background
- asset_candidates: assets/footage.mp4 — record-flow capture, window 4.70–8.30 s (Auto-match push and click, lines flip), render-path assemble plays it from assets/clips/04-auto-match.mp4 (the window + its last frame, footage ≈ 8.267 s, held 3.0 s)
- sfx: none
- beat: feature_showcase
- role: recording
- scene_type: product-ui
- evidence_tier: A
- capture_window: 4.70-8.30
- capture_hold: 3.0
- capture_drift: 0.66,0.50 1.58 @ 3.60-6.60
- camera: zoom-in 0.01–0.71 onto Auto-match (0.75, 0.25), click 0.71 s (ripple, on the spoken "Auto-match"); holds 2× to 1.91; zoom-out 1.91–2.71 to the full table; at rest 2.71–3.60; hold drift 3.60–6.60 (plugin, sine.inOut) 1.00 → 1.58 toward the counter and the Status column (0.66, 0.50)
- text: "Auto-match, one click" @ 0.2-6.6

Adapt: keep the single-trigger shape — one click hands the frame to the machine and the receipt cascades in (here the
real rows flipping); drop loaders and status phrases, the product's own counter and pills are the theatre.
Layout: label band — accent line 60×4 `primary` at the band station (x 160, y 44), label 52 px Space Grotesk 600
near-navy at x 160, y 58–112; stage box 280,118,1360,765 with a 1.5 px `border` outline, 14 px radius, no fill;
nothing over the stage.
Build: declare the approved footage `src="assets/footage.mp4" data-media-start="4.7" data-duration="6.6"` (the frame
duration) with the stage box as its geometry (x 280, y 118, w 1360, h 765, fit cover); autozoom sidecar for the
window: `--clip-start 4.7 --clip-duration 3.6`. `render-path assemble` cuts the held clip (the window, then its own
last frame held — never a frame of Frame 5's window), retargets the declaration and appends the hold drift from
`capture_drift` — this frame extracts no still, paints nothing inside the stage and tweens nothing on the footage.
Scene 1 (0.0–1.3s): the accent line carries up from Frame 3's card station (x 160, y 300) to the band station
(0.0–0.4 s, power2.inOut); the camera pushes from the whole table onto the Auto-match button (0.01–0.71 s) while
"Click Auto-match" is said; the plugin's cursor arrives and its ripple marks the click at 0.71 s, on "Auto-match";
the label "Auto-match, one click" rises into the band (0.2–0.65 s). At 2× the counter and the first rows'
Invoice/Status cells fill the stage: "1 of 7" at ~1.1 s, "2 of 7" at ~1.3 s, the bar starts to fill.
Scene 2 (1.3–3.6s): rows 3–7 flip every ~0.35 s (3 at ~1.7, 4 at ~2.1, 5 at ~2.5, 6 at ~2.7) while the camera eases
back to the whole table (1.91–2.71 s); "7 of 7 matched" at ~3.1 s, the bar full at ~3.3 s. The Sep 07 row keeps the
product's own highlight to the window's end.
Scene 3 (3.6–6.6s): the hold — the window's last picture (every line Matched, every invoice filled, "7 of 7
matched", the Sep 07 row still highlighted as the product left it; its fade belongs to Frame 5's window and plays
there) while the camera drifts in on the counter and the Status column through "while you watch" (~4.1–4.9 s) and
keeps closing in to the cut: end view x 0.34–0.98, y 0.18–0.82 — the counter and full bar, the greyed Auto-match
button, the Invoice and Status columns of all seven rows.
9:16: label band on top ("Auto-match," / "one click", 92 px); the portrait track follows (0.89, 0.33) → rest at
focus x 0.84; the plugin applies the hold drift on that track from its rest pose.

## Frame 5 — Audit trail: every match

- scene: A matched line is opened; its audit trail slides in beside the table — imported, matched, posted, approved — and the hold drifts in until the four steps read large
- duration: 6.9s
- transition_in: cut
- status: outline
- src: compositions/frames/05-audit-trail.html
- voiceover: "Open any line, and its audit trail is already there, from the bank feed to approval."
- blueprint: camera-journey (Adapt)
- focal: assets/footage.mp4
- roles: footage = cutout (stage, box 280,118,1360,765) · label = supporting · canvas = background
- asset_candidates: assets/footage.mp4 — record-flow capture, window 8.30–11.50 s (row click, audit panel opens), render-path assemble plays it from assets/clips/05-audit-trail.mp4 (the window + its last frame, footage ≈ 11.467 s, held 3.7 s)
- sfx: none
- beat: feature_showcase
- role: ui
- scene_type: product-ui
- evidence_tier: A
- capture_window: 8.30-11.50
- capture_hold: 3.7
- capture_drift: 0.82,0.39 2.2 @ 3.20-6.90
- camera: zoom-in 0.03–0.73 onto the clicked line (0.51, 0.50), ripple at 0.73; holds to 1.93; zoom-out 1.93–2.73; at rest 2.73–3.20; hold drift 3.20–6.90 (plugin, sine.inOut) 1.00 → 2.20 toward the audit panel (0.82, 0.39; clamped to 0.77, 0.39)
- text: "Audit trail on every match" @ 1.4-6.9

Adapt: keep sub-shape (A) "action roundtrip" — dive to the clicked line, a beat fires (the panel slides in), travel
to the consequence (the trail), land. The first two legs are the capture's plan; the landing move is the hold
drift onto the panel.
Layout: label band — accent line 60×4 `primary` at the band station (x 160, y 44), label 52 px Space Grotesk 600
near-navy at x 160, y 58–112; stage box 280,118,1360,765 with a 1.5 px `border` outline, 14 px radius, no fill;
nothing over the stage.
Build: declare the approved footage `src="assets/footage.mp4" data-media-start="8.3" data-duration="6.9"` (the frame
duration) with the stage box as its geometry (x 280, y 118, w 1360, h 765, fit cover); autozoom sidecar for the
window: `--clip-start 8.3 --clip-duration 3.2`. `render-path assemble` cuts the held clip, retargets the declaration
and appends the hold drift from `capture_drift` — this frame extracts no still, paints nothing inside the stage and
tweens nothing on the footage.
Scene 1 (0.0–1.4s): the accent line is already at the band station (Frame 4 left it there) — no carry; the Sep 07
row highlight left by the Auto-match run finishes its own fade (0.03–0.23 s — footage 8.33–8.53, the first time it
is shown); the camera dives onto "Sep 03 · Coldharbour Packaging · INV-2026-0418 · Matched"; the ripple marks the
click at 0.73 s; the audit panel starts sliding in from the right edge at 0.83 s (complete 1.37 s).
Scene 2 (1.4–3.2s): on "its audit trail" the label "Audit trail on every match" rises into the band (1.4–1.85 s);
the camera eases back (1.93–2.73 s) to the table with the open panel — four steps with their dots: Bank line
imported · Matched to INV-2026-0418 · Posted to the ledger · Approved for close.
Scene 3 (3.2–6.9s): the hold — the camera drifts in on the audit panel through "from the bank feed to approval"
(~3.9–5.6 s) and keeps closing in to the cut: end view x 0.55–1.00, y 0.16–0.62 of the footage — the whole panel,
title to "Controller review - kept for the auditors". At 2.2× the four step titles read at ≈ 40 px (≈ 3.7 % of
1080, over the 38 px / 3.5 % floor) and the panel title at ≈ 50 px; they pass 38 px from ≈ 6.2 s.
9:16: label band on top ("Audit trail on" / "every match", 92 px); the portrait track dives to (0.51, 0.50) → rest
at focus x 0.51; the plugin applies the hold drift on that track from its rest pose.

## Frame 6 — Benefit: hours back

- scene: One number on white: 11 hours saved per accountant, per week
- duration: 3.8s
- transition_in: cut
- status: outline
- src: compositions/frames/06-hours-back.html
- voiceover: "That's eleven hours a week back, per accountant."
- blueprint: kinetic-type-beats (Adapt)
- focal: the numeral
- roles: numeral = cutout · line = supporting · rule = supporting · accent line = supporting · canvas = background
- asset_candidates:
- asset_note: typographic frame (value sourced at site/index.html:44, claim c004)
- sfx: none
- beat: benefit_highlight
- role: outcome
- scene_type: metrics / chart
- evidence_tier: A
- text: "11 hours" @ 0.3-3.8
- text: "saved per accountant, per week" @ 0.7-3.8

Adapt: same card grammar as Frame 3 (one system), the numeral lands whole — no count-up.
Scene 1 (0.0–0.4s): white canvas; the accent line (60×4, `primary`) starts at the band station (x 160, y 44), where
Frame 5 left it, and carries down to the card station (x 160, y 300) (0.0–0.4 s, power2.inOut). It stays 60 px wide.
Scene 2 (0.3–1.2s): on "eleven hours" "11 hours" rises behind a mask, 200 px Space Grotesk 700 accent, left at x 160,
cap-top y 330 (0.3–1.0 s, power3.out); "saved per accountant, per week" rises under it, 52 px near-navy (0.7–1.2 s).
Scene 3 (1.2–3.8s): held read; one ambient movement — a separate 6 px `accent-light` rule under the line draws from
0 to the line's width (812 px) (1.4–3.3 s, sine.inOut; it ends 0.5 s before the cut). The accent line does not grow.
9:16: accent line carried from the 9:16 band station (x 60, y 100) to the card station (centred, y 440); numeral
235 px centred at y 32 % ("11 hours" = 922 px → 79 px side margins), the line 68 px under it in 2 lines ("saved per
accountant," / "per week"), the rule under the line.

## Frame 7 — Close September: the checklist runs

- scene: The recorded click on Close September; the close checklist opens and its five items tick off one after another until Lock period lights up — then the hold drifts in on the finished list
- duration: 7.3s
- transition_in: cut
- status: outline
- src: compositions/frames/07-close-checklist.html
- voiceover: "Then Close September runs the close checklist for you, step by step, until nothing is left open."
- blueprint: agent-progress-theater (Adapt)
- focal: assets/footage.mp4
- roles: footage = cutout (stage, box 280,118,1360,765) · label = supporting · canvas = background
- asset_candidates: assets/footage.mp4 — record-flow capture, window 11.50–15.10 s (Close September click, checklist ticks), render-path assemble plays it from assets/clips/07-close-checklist.mp4 (the window + its last frame, footage ≈ 15.067 s, held 3.7 s)
- sfx: none
- beat: feature_showcase
- role: ui
- scene_type: product-ui
- evidence_tier: A
- capture_window: 11.50-15.10
- capture_hold: 3.7
- capture_drift: 0.50,0.48 1.68 @ 3.60-7.30
- camera: zoom-in 0.04–0.74 onto Close September (0.25, 0.75), ripple at 0.74; holds to 1.94; zoom-out 1.94–2.74 to the open modal; at rest 2.74–3.60; hold drift 3.60–7.30 (plugin, sine.inOut) 1.00 → 1.68 toward the checklist modal (0.50, 0.48)
- text: "Ledgerly runs the checklist" @ 1.0-7.3

Adapt: the trigger beat is the real click; the "receipt cascade" is the product's own checklist ticking
(12.8–14.8 s of footage), no invented loaders.
Layout: label band — accent line 60×4 `primary` at the band station (x 160, y 44), label 52 px Space Grotesk 600
near-navy at x 160, y 58–112; stage box 280,118,1360,765 with a 1.5 px `border` outline, 14 px radius, no fill;
nothing over the stage.
Build: declare the approved footage `src="assets/footage.mp4" data-media-start="11.5" data-duration="7.3"` (the frame
duration) with the stage box as its geometry (x 280, y 118, w 1360, h 765, fit cover); autozoom sidecar for the
window: `--clip-start 11.5 --clip-duration 3.6`. `render-path assemble` cuts the held clip, retargets the declaration
and appends the hold drift from `capture_drift` — this frame extracts no still, paints nothing inside the stage and
tweens nothing on the footage.
Scene 1 (0.0–1.0s): the accent line carries up from Frame 6's card station (x 160, y 300) to the band station
(0.0–0.4 s, power2.inOut); the camera pushes onto the "Close September" button bottom-left and the ripple marks the
click at 0.74 s; the modal "Close September — Ledgerly runs the close checklist for this entity." opens at 0.83 s.
Scene 2 (1.0–3.6s): on "runs the close checklist" the label "Ledgerly runs the checklist" rises into the band
(1.0–1.45 s); the items tick at ~1.3, 1.8, 2.3, 2.8 and 3.3 s (Bank feeds reconciled · Invoices matched and posted ·
Accruals booked · Intercompany balances cleared · Audit trail complete for every line) while the camera eases back
to the whole modal (1.94–2.74 s); "Lock period" turns solid at ~3.35 s.
Scene 3 (3.6–7.3s): the hold — the camera drifts in on the finished checklist: five ticks, Lock period ready; "until
nothing is left open" (~5.2–6.3 s) lands as the view closes in; end view x 0.20–0.80, y 0.18–0.78 — the whole
Close September modal, five green ticks and the solid Lock period button.
9:16: label band on top ("Ledgerly runs" / "the checklist", 92 px); the portrait track follows (0.11, 0.67) → rest
at focus x 0.16; the plugin applies the hold drift on that track from its rest pose.

## Frame 8 — Lock the period (STAR)

- scene: The STAR — the recorded click on Lock period; the dark "September locked" pill appears and the month is closed; the hold drifts in on the locked checklist
- duration: 6.8s
- transition_in: cut
- status: outline
- src: compositions/frames/08-lock-period.html
- voiceover: "Lock the period, and September is closed. It stays closed for your auditors."
- blueprint: cursor-ui-demo (Adapt — workflow-approve-press)
- focal: assets/footage.mp4
- roles: footage = cutout (stage, box 280,118,1360,765) · label = supporting · check glyph = supporting · canvas = background
- asset_candidates: assets/footage.mp4 — record-flow capture, window 15.10–18.27 s (Lock period click → "September locked", file end), render-path assemble plays it from assets/clips/08-lock-period.mp4 (the window + the file's last frame, footage ≈ 18.233 s, held 3.63 s)
- sfx: none
- beat: feature_showcase
- role: recording
- scene_type: product-ui
- evidence_tier: A
- capture_window: 15.10-18.27
- capture_hold: 3.63
- capture_drift: 0.47,0.54 1.68 @ 3.17-6.80
- camera: zoom-in 0.06–0.76 onto Lock period (0.35, 0.71), ripple at 0.76; holds 2× to 1.96 — the "September locked" pill lands in the zoomed view at 0.83; zoom-out 1.96–2.76; at rest 2.76–3.17; hold drift 3.17–6.80 (plugin, sine.inOut) 1.00 → 1.68 toward the pill row (0.47, 0.54)
- text: "Lock the period" @ 0.3-6.8

The one STAR moment, planned first: the press is the climax. The click lands on the spoken word "period"
(whisper on the synthesised line: "period" 0.57–1.05 s; click at 0.76 s) and the product answers with its own dark
pill — no overlay competes with it.
Adapt: keep the approve-press payoff (the press, then the state flips and a check stamps); the press and the flip are
real footage, the check glyph is the label device's stamp, drawn in the band, never on the product.
Layout: label band — accent line 60×4 `primary` at the band station (x 160, y 44), label 52 px Space Grotesk 600
near-navy at x 160, y 58–112, a 40 px accent check glyph at the label's right end; stage box 280,118,1360,765 with a
1.5 px `border` outline, 14 px radius, no fill; nothing over the stage.
Build: declare the approved footage `src="assets/footage.mp4" data-media-start="15.1" data-duration="6.8"` (the frame
duration) with the stage box as its geometry (x 280, y 118, w 1360, h 765, fit cover); autozoom sidecar for the
window: `--clip-start 15.1 --clip-duration 3.167` (to the file's end). `render-path assemble` cuts the held clip,
retargets the declaration and appends the hold drift from `capture_drift` — this frame extracts no still, paints
nothing inside the stage and tweens nothing on the footage.
Scene 1 (0.0–1.0s): the accent line is already at the band station (Frame 7 left it there) — no carry; the camera
pushes onto "Lock period" at the modal's foot; on "Lock the period" the label "Lock the period" rises into the band
(0.3–0.75 s); the ripple marks the click at 0.76 s, on "period"; at 0.83 s "Lock period" greys and the dark
"September locked" pill appears beside it, large at 2×.
Scene 2 (1.0–3.17s): the zoom holds on the pill while the VO says "September is closed" (~1.3–2.8 s); the camera
eases back to the whole modal (1.96–2.76 s): five ticks, the pill, the greyed button; at 2.80 s, on "It stays
closed", the check glyph stamps at the label's right end (SVG stroke draw 0.5 s, power3.out).
Scene 3 (3.17–6.8s): the hold — the camera drifts in on the locked checklist; "for your auditors" (~3.7–4.7 s) rides
the move; end view x 0.17–0.77, y 0.24–0.84 of the footage — the modal title, the five ticks, the greyed Lock period
button and the dark "September locked" pill; the product's stale footer notice "September is ready to lock."
(y ≥ 0.87) stays framed out.
9:16: label and check above the stage ("Lock the period", 92 px); the portrait track pushes to (0.35, 0.67) → rest
at focus x 0.35; the plugin applies the hold drift on that track from its rest pose.

## Frame 9 — Outcome: average close

- scene: One number on white: 3.1 days, the average month-end close of Ledgerly customers
- duration: 4.3s
- transition_in: cut
- status: outline
- src: compositions/frames/09-average-close.html
- voiceover: "Customers close in three point one days on average."
- blueprint: kinetic-type-beats (Adapt)
- focal: the numeral
- roles: numeral = cutout · line = supporting · rule = supporting · accent line = supporting · canvas = background
- asset_candidates:
- asset_note: typographic frame (value sourced at site/index.html:40, claim c003)
- sfx: none
- beat: benefit_highlight
- role: outcome
- scene_type: metrics / chart
- evidence_tier: A
- text: "3.1 days" @ 0.3-4.3
- text: "average month-end close" @ 0.7-4.3

The measured value verbatim (c003 "3.1 days"); it is never blended with the hero "3 days" or set against "12" as a
before/after (GS-02 README: one source per value). No quarter tag (not an indexed claim — v1 QA-12 finding).
Scene 1 (0.0–0.4s): white canvas; the accent line (60×4, `primary`) starts at the band station (x 160, y 44), where
Frame 8 left it, and carries down to the card station (x 160, y 300) (0.0–0.4 s, power2.inOut). It stays 60 px wide.
Scene 2 (0.3–1.2s): on "three point one days" "3.1 days" rises behind a mask, 200 px Space Grotesk 700 accent, left at
x 160, cap-top y 330 (0.3–1.0 s, power3.out); "average month-end close" rises under it, 52 px near-navy (0.7–1.2 s).
Scene 3 (1.2–4.3s): held read; one ambient movement — a separate 6 px `accent-light` rule under the line draws from
0 to the line's width (1.4–4.0 s, sine.inOut; it ends 0.3 s before the cut, and Frame 10's quote rises 0.4 s after
it). The accent line does not grow; it stays at the card station for Frame 10.
9:16: accent line carried from the 9:16 band station (x 60, y 100) to the card station (centred, y 440); numeral
235 px centred at y 32 % ("3.1 days" = 932 px → 74 px side margins), the line 68 px under it (one line, ≈ 815 px),
the rule under the line.

## Frame 10 — Proof: Harborline

- scene: A similar company's result as a quote card — 12-day close to under 4 — attributed
- duration: 5.4s
- transition_in: cut
- status: outline
- src: compositions/frames/10-proof.html
- voiceover: "Harborline Logistics went from a twelve-day close to under four."
- blueprint: titlecard-reveal (Adapt)
- focal: the quote
- roles: quote = cutout · quote mark = background · attribution = supporting · rule = supporting · accent line = supporting · canvas = background
- asset_candidates:
- asset_note: typographic frame (quote sourced at site/index.html:54, claim c028)
- sfx: none
- beat: social_proof
- role: proof
- scene_type: title-card
- evidence_tier: A
- text: "We went from a 12-day close to under 4." @ 0.4-5.4
- text: "Priya Menon, Controller / Harborline Logistics" @ 1.0-5.4

The quote's first sentence verbatim (c028; its numbers are covered by the quote's source); the attribution as the
source gives it, one word "Harborline" — on screen and in the captions: the voiceover above spells it as one word,
and `render-path audio` locks the whisper words to it ("Harbor" + "Line" → "Harborline") before the captions build
(see Video direction, Audio). v1 shipped this frame as ~16 px unstyled text top-left because its class names started
with a digit — prefix every class and id (`f10-quote`, `f10-attr`) and hold the sizes below.
Adapt: keep the title-card rise (the line rises and settles); the delta is the oversized quote mark above it. One
device: rise — the quote and the attribution both rise.
Scene 1 (0.0–0.4s): a hard cut, like every card boundary; the accent line (60×4, `primary`) is already at the card
station (x 160, y 300) — Frame 9 left it there, so it is continuous across the cut; a 154 px accent quote mark
(frame.md quote-mark, 15 % opacity) sits above it at x 160, ink y ~200–260.
Scene 2 (0.4–1.5s): the quote rises under the accent line, 68 px Space Grotesk 500 near-navy, one line (1328 px),
left at x 160, cap-top ~y 340 (0.4–1.1 s, power3.out); the attribution rises the same way under it (24 px, 0.5 s,
power3.out, 1.0–1.5 s), 42 px `text-muted`, two lines at y ~450–550.
Scene 3 (1.5–5.4s): held read; a separate 4 px accent rule grows under the attribution from 0 to 480 px (1.8–5.4 s,
sine.inOut — it runs to the cut) — the one ambient movement.
9:16: the accent line at the 9:16 card station (centred, y 440); quote 68 px in 2 lines ("We went from a 12-day
close" ≈ 918 px / "to under 4."), centred at y 35 %; attribution 68 px under it in 2 lines ("Priya Menon,
Controller" / "Harborline Logistics"); the rule under the attribution.

## Frame 11 — The ask

- scene: The one step, in the one solid element: Reply "yes" — Tuesday or Thursday? It stays on screen through the end card (last 8 s)
- duration: 4.8s
- transition_in: cut
- status: outline
- src: compositions/frames/11-reply-yes.html
- voiceover: "Reply yes, and I'll hold Tuesday or Thursday for you."
- blueprint: cta-morph-press (Adapt)
- focal: the CTA pill
- roles: CTA pill = cutout · canvas = background
- asset_candidates:
- asset_note: typographic frame
- sfx: none
- beat: cta
- role: cta
- scene_type: title-card
- evidence_tier: A
- text: "Reply \"yes\" — Tuesday or Thursday?" @ 0.3-4.8

Adapt: keep the press (the pill lands, presses once); no morph from another element. The pill is a
`data-var-text` variable. It is the first-person CTA, shown and spoken; the end card repeats the same pill
in the same place, so the CTA is on screen from 51.6 s to 59.6 s (the last 8 s). No accent line here: the ask
opens a new, centred layout (the line ends with Frame 10); the pill is the element that crosses into Frame 12.
Scene 1 (0.0–0.3s): white canvas.
Scene 2 (0.3–1.2s): the cta-button pill (accent fill, white 66 px Space Grotesk 600, radius pill, padding 28×56 px;
text 1181 px) lands centred at y 560 (0.3–0.9 s, power3.out); as it settles, on "yes", it presses once (scale
0.97 → 1.0, 0.9–1.15 s).
Scene 3 (1.2–4.8s): held read; on "Tuesday" and then "Thursday" (~2.0 s and ~2.6 s) each day word tints to
accent-light-on-white for 0.4 s inside the pill; then the pill breathes once, 1.00 → 1.02 (3.0–3.9 s) → 1.00
(3.9–4.8 s), sine.inOut — it runs to the cut and ends at rest, so Frame 12's pill matches it exactly.
9:16: the pill centred at y 960 (50 %), the text 72 px in 2 lines (`Reply "yes" —` / `Tuesday or Thursday?`,
≈ 750 px wide), the same press, tints and breathe.

## Frame 12 — End card

- scene: Logo → tagline → URL above the carried CTA pill, the narration disclosure under them
- duration: 3.5s
- transition_in: cut
- status: outline
- src: compositions/frames/12-end.html
- voiceover: "Ledgerly. Close the books in three days."
- blueprint: logo-assemble-lockup (Adapt)
- focal: the wordmark
- roles: wordmark = cutout · tagline = supporting · URL = supporting · CTA pill = supporting · disclosure = supporting · canvas = background
- asset_candidates:
- asset_note: typographic frame, no logo file in the fixture, the wordmark is typeset, no Ledgerly URL in the sources (TODO(fixture): "ledgerly.example" is the reserved-domain placeholder)
- sfx: none
- beat: cta
- role: cta
- scene_type: logo-outro
- evidence_tier: A
- cta: "Reply \"yes\" — Tuesday or Thursday?" @ 0.0-3.5
- text: "Ledgerly" @ 0.3-3.5
- text: "Close the books in 3 days, not 12" @ 0.7-3.5
- text: "ledgerly.example" @ 1.1-3.5
- text: "Narration is AI-generated." @ 1.5-3.5
- order: logo -> tagline -> URL
- stagger: 0.4s

Adapt: keep the lockup order (wordmark, then tagline, then URL settle into place); drop the letter-by-letter
assembly — one reveal device on this card (J): every element rises 24 px (0.5 s, power3.out) on one 0.4 s stagger.
No logo file, so the wordmark is type. Tagline = the site H1 verbatim (the runner-up to the personalised hook;
claims c001, c007).
Scene 1 (0.0–0.3s): the CTA pill is already on screen at Frame 11's exact place and scale (centred, y 560, scale
1.0) — the shared element across the cut; nothing else.
Scene 2 (0.3–2.0s): the lockup rises on the 0.4 s stagger — the wordmark "Ledgerly" at y 200, 96 px Space Grotesk 700
near-navy (0.3 s); the tagline "Close the books in 3 days, not 12" at y 320, 66 px (0.7 s); the URL
"ledgerly.example" at y 410, 44 px accent (1.1 s) — logo → tagline → URL (QA-13); then "Narration is AI-generated."
at y 820, 38 px `text-muted` (1.5 s; above the caption band, clear of the CTA), the same rise.
Scene 3 (2.0–3.5s): held end card; outro in the last 0.6 s only: the whole card settles, scale 1.0 → 0.985
(2.9–3.5 s, power2.in) — nothing fades, every string stays at full opacity to the last frame.
9:16 (centred column, tops in px of 1920): wordmark 120 px at y 300; tagline 72 px at y 480 (2 lines: "Close the
books in" / "3 days, not 12", to ≈ y 640); URL 68 px at y 680; the pill centred at y 960 (as in Frame 11, ≈ y
853–1067); disclosure 68 px at y 1200 (2 lines "Narration is" / "AI-generated." if one line overflows the 960 px
column, to ≈ y 1350) — everything above the 9:16 caption band (y ≥ 1574). Same stagger and rise.

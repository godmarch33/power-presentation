---
format: 1920x1080
duration: 45s
message: "Close September's books in 3 days, not 12"
arc: PAS (45 s) — promise → evidence → before (pain, in product) → click 1 match → pivot stat → click 2 audit → click 3 close → click 4 lock (STAR) → pivot stat → quote → CTA
audience: marketing
mode: autonomous
language: en
version: v1
reveal: early
register: high
music: pack:happy-beats-business-moves-vol-1
approved: v1
---

# Ledgerly — "Every cut is a click" (45 s, 16:9 master)

Concept (pitch round, recommendation 4 under `--yes`): the real product closes September on screen in four clicks,
and the edit is built on those clicks. Every product cut lands on a click from the tier-A capture, a small kicker pill
names the click ("Click 1 · Auto-match"), and the camera only ever moves where the cursor went (autozoom) or
drifts in on the result the click produced. No stock images, metaphors or dashboard fly-through, and no fake UI. The
footage has 15 s of real material; the other 30 s are held results, two pivot stats from the site's own copy, one
quote and the end card.

## Stage, safe areas and size floors (binds every frame)

- Stage 1920×1080, `container-type: size`, units in `cqw`/`cqh` (frame.md container law). Safe pad 5cqw (96 px) left/right, 4cqh (43 px) top.
- **Caption keep-out:** nothing is drawn at y ≥ 0.82 H (≥ 886 px). No overlay text, pill, button or decorative element may sit there, and there is no bottom progress bar (frame.md's 3 px strip is dropped for this reason). Footage pixels may fill the keep-out; overlays may not.
- **Size floors:** kinetic headlines ≥ 96 px (Space Grotesk 700, well above 6 % of H = 65 px). Stat numerals ≥ 220 px. Card labels and quote ≥ 56 px. The kicker pill is 44 px. The one exception is the disclosure chip (below), 28 px, a legal line like an AI credit. No other text is below 40 px.
- **Lines:** ≤ 42 characters per line and ≤ 2 lines per text element (QA-10). ` / ` in a `text:` bullet is the line break.
- **Palette/type:** frame.md frontmatter verbatim: canvas #FFFFFF, ink #14213D headlines, primary #2A6F97 for numerals, eyebrows, CTA and kicker accent, muted #5C6B7A body. Space Grotesk for display, numerals and chrome; Inter for body. Tinted cards with no shadows. Atmosphere (dot grid, concentric rings) appears only on Frame 1 and Frame 11.
- **Motion (register high):** GSAP `expo.out` entrances and `expo.in` exits. Transitions 0.15–0.3 s. No `back.out` (register is not playful, QA-11) and no linear easing on anything visible. Hero entrances land on the beat; `render-path audio` owns the cut grid (120.19 BPM, beat ≈ 0.499 s, bar ≈ 2.0 s).
- **Look treatment:** none. No grain, glow, vignette or light leak on any frame.
- **Footage plate:** `assets/footage.mp4` (tier A, 3840×2160 capture of a 1920×1080 viewport) is always full-bleed (box x 0, y 0, w 1, h 1) at camera scale ≥ 1.0. The camera comes from the frame's autozoom slice (1.5–2×, ease-out in / ease-in-out re-aim) and then its `capture_drift`. The plugin cursor is drawn from `autozoom.json` (cursor path, click ripples) inside the zoom wrapper.

## Honesty rule — synthetic fixture (binds every frame)

Ledgerly is a synthetic fixture (GS-02): a fictional company with invented numbers, and the captured app shows seeded demo data.

- The footage's own banner ("Synthetic fixture: Ledgerly is a fictional company…", top 0–3.2 % of the footage) is never masked, blurred, cropped by a layout box or covered by an overlay. At camera scale 1.0 it must be fully visible. Only a zoom or a declared drift may carry it out of frame.
- **Disclosure chip, on every frame, fixed:** the text "Synthetic fixture · fictional numbers" in a pill at box x 0.655 W, y 0.040 H, w 0.309 W, h 0.052 H (x 1258–1851 px, y 43–99 px). Style: Inter 500, 28 px, #5C6B7A on rgba(255,255,255,0.88), border 1.5 px rgba(42,111,151,0.2), radius 100 px. Scale 1, opacity 1, static; it never animates across a cut. It sits above every footage camera move (outside the zoom wrapper). On typographic frames it sits on the canvas in the same box.
- The "Demo workspace - seeded data" chip in the captured app is part of the footage and stays.
- Every number on screen comes from `claims-index.json` (sourced from `site/index.html` or demonstrated by the tier-A footage). The two unverified declared claims (c009, c010) never appear on screen.

## Kicker pill — fixed chrome (Frames 4, 6, 7, 8)

The click counter: box x 0.036 W, y 0.040 H, w 0.30 W, h 0.060 H (x 69–645 px, y 43–108 px). It is a pill #14213D with white Space Grotesk 600 at 44 px. "Click N" is in #9CC3DA and the label in white, e.g. "Click 1 · Auto-match". It enters by expo.out clip-reveal left→right over 0.25 s and exits by fade-up 0.2 s at its declared end. It sits outside the zoom wrapper and is the same box on every frame that has one.

## Frame 1 — Promise

- src: compositions/frames/01-promise.html
- duration: 2.5s
- transition_in: cut
- scene: The promise punches in word by word on white; the "12" is struck through as "3 days" lands
- beat: hook
- role: hook
- scene_type: kinetic-type
- blueprint: kinetic-type-beats (Adapt)
- persuasion: Negative contrast (named alternative: the 12-day close)
- focal: headline
- roles: headline = cutout · atmosphere = background
- asset_candidates:
- asset_note: typographic hook; no captured asset carries the promise better than type, and no logo appears before 3 s
- sfx: none
- text: "Close September's books / in 3 days, not 12" @ 0.15-2.5
- text: "Synthetic fixture · fictional numbers" @ 0-2.5

Adapt: keep the kinetic-type-beats signature (the key word swaps in place), but use one line pair, not a montage.
Scene 1 (0.0–0.55s): the white canvas is live from frame 0 (no black open). A 3×3 primary dot grid sits faint at the right, and the disclosure chip is already in its fixed box. "Close September's books" rises word by word on expo.out, ink, Space Grotesk 700 at about 120 px, left-aligned at x 0.08 W, baseline y 0.42 H. Every word of both lines is in by 0.55 s.
Scene 2 (0.55–1.6s): line 2 "in 3 days, not 12" lands under it. "3 days" is in primary #2A6F97. "12" is ink and a 6 px primary strike draws across it left→right (0.3 s, expo.out) on the beat.
Scene 3 (1.6–2.5s): hold still; the stillness is the read. A slow 1.00→1.02 push on the headline group only. No logo and no wordmark.

## Frame 2 — Evidence: 3.1 days

- src: compositions/frames/02-evidence.html
- duration: 2.028s
- transition_in: cut
- scene: One cobalt numeral counts up to 3.1 days with its label beneath: the promise, already measured
- beat: benefit_highlight
- role: outcome
- scene_type: kinetic-type
- blueprint: titlecard-reveal (Adapt)
- persuasion: Statistical proof
- focal: stat numeral
- roles: stat numeral = cutout
- asset_candidates:
- asset_note: typographic outcome card; the number is sourced copy (site/index.html:40), not a product screen
- sfx: none
- text: "3.1 days" @ 0.15-2.0
- text: "average month-end close, Q2 2026" @ 0.35-2.0
- text: "Synthetic fixture · fictional numbers" @ 0-2.0

Adapt: keep the near-still title card, and replace the blur-snap with a fast count-up.
Scene 1 (0.0–0.7s): "3.1 days" at stat-num scale (about 240 px, Space Grotesk 700, primary) counts 0.0→3.1 on expo.out, centred-left at x 0.08 W, y 0.30–0.55 H. A 60×4 accent line sits above it.
Scene 2 (0.35–2.0s): the label "average month-end close, Q2 2026" (Inter 500, 56 px, muted) fades up under the numeral and holds. The cut at 2.0 s is a hard cut into the product on the beat.

## Frame 3 — Before: nothing matched

- src: compositions/frames/03-before.html
- duration: 2.995s
- transition_in: zoom-through 0.3s
- scene: The real reconciliation screen arrives: seven bank lines, every one Unmatched; the camera drifts to the Auto-match button
- beat: pain_point
- role: ui
- scene_type: product-ui
- evidence_tier: A
- blueprint: cursor-ui-demo (Adapt)
- persuasion: Pain agitation, shown in the product rather than told
- focal: assets/footage.mp4
- roles: footage = background (full-bleed, undimmed)
- asset_candidates: assets/footage.mp4 — tier-A capture, window 2.20-3.45 s, Nordwell Bank EUR table with 0 of 7 matched
- capture_window: 2.20-3.45
- capture_hold: 1.75
- capture_drift: 0.78,0.24 1.6 @ 1.3-2.9
- sfx: none
- handoff_out: footage plate — box x 0 y 0 w 1 h 1 (full-bleed); camera scale 1.6, focus 0.78,0.24 (footage fractions); opacity 1; motion: drift fully settled, velocity 0 at the cut; cursor at 0.84,0.23 moving toward the Auto-match button at 0.893,0.219
- text: "7 bank lines. None matched." @ 1.2-3.0
- text: "Synthetic fixture · fictional numbers" @ 0-3.0

Adapt: keep cursor-ui-demo's first look at a live surface, where the cursor is already on its way. Nothing is clicked yet; this is the "before".
Scene 1 (0.0–1.25s): the footage plays window 2.20–3.45 s at 1× with the camera at home (scale 1.0). The whole table is in frame: "Nordwell Bank EUR", "Imported this morning. Nothing is matched yet.", "0 of 7 matched", seven grey "Unmatched" pills, and the footage banner on top. The plugin cursor glides in from the left toward the toolbar.
Scene 2 (1.2–3.0s): the window's last picture holds, and the camera drifts (expo.inOut) to focus 0.78,0.24 at 1.6×, framing "0 of 7 matched", the empty progress bar, the Auto-match button and the top four Unmatched pills. At 1.2 s the kicker line "7 bank lines. None matched." slides up in ink Space Grotesk 600 at 64 px on a white 92 % tinted card at box x 0.05 W, y 0.64 H, w 0.40 W, h 0.12 H (above the keep-out), reads, and holds to the cut.

## Frame 4 — Click 1: Auto-match

- src: compositions/frames/04-automatch.html
- duration: 4.993s
- transition_in: cut
- scene: One click on Auto-match and the seven pills flip to Matched down the table, invoice ids appearing, until the counter reads 7 of 7
- beat: feature_showcase
- role: ui
- scene_type: product-ui
- evidence_tier: A
- blueprint: agent-progress-theater (Adapt)
- persuasion: Show-don't-tell proof
- focal: assets/footage.mp4
- roles: footage = background (full-bleed, undimmed)
- asset_candidates: assets/footage.mp4 — tier-A capture, window 3.45-6.10 s, Auto-match click and the Unmatched to Matched cascade
- capture_window: 3.45-6.10
- capture_hold: 2.35
- capture_drift: 0.70,0.47 1.5 @ 2.7-4.9
- sfx: click @ 0.13, success @ 2.36
- handoff_in: footage plate — box x 0 y 0 w 1 h 1 (full-bleed); camera scale 1.6, focus 0.78,0.24 (footage fractions); opacity 1; motion: at rest at the cut, then the autozoom slice re-aims (ease-in-out 0.13 s) onto Auto-match at 0.75,0.25 scale 2.0 for the click at frame-local 0.134; cursor at 0.84,0.23 moving toward 0.893,0.219
- handoff_out: footage plate — box x 0 y 0 w 1 h 1; camera scale 1.5, focus 0.70,0.47; opacity 1; motion: drift settled, then the plate exits LEFT with push-slide (0.25 s) into Frame 5
- text: "Click 1 · Auto-match" @ 0.05-1.6
- text: "One click. 7 of 7 matched." @ 2.9-5.0
- text: "Synthetic fixture · fictional numbers" @ 0-5.0

Adapt: agent-progress-theater's trigger → working theater → receipt. The theater is the real product; nothing is drawn over the rows.
Scene 1 (0.0–0.4s): continuous with Frame 3's camera. The kicker pill clips in (fixed box). The cursor clicks Auto-match at 0.134 s with a click ripple and the click SFX. The button greys out.
Scene 2 (0.4–2.4s): the autozoom slice holds the punch on the toolbar for at most 1.0 s. The status column of rows 1–3 flips grey→green inside that framing while the counter climbs "1 of 7… 3 of 7" and the bar fills. The camera then eases out to home (0.8 s) so rows 4–7 flip in full view; the last flip and "7 of 7 matched" land at 2.36 s with the success SFX. Keep the zoom-out finished by 2.0 s at the latest so the last three rows flip at 1×.
Scene 3 (2.65–5.0s): the window's last picture holds (the full table, all green, with invoice ids INV-2026-0412…0430 set in bold). The camera drifts to focus 0.70,0.47 at 1.5×: the counter, the full bar and all seven green pills. At 2.9 s "One click. 7 of 7 matched." slides up on the same white card box as Frame 3 (x 0.05 W, y 0.64 H, w 0.40 W, h 0.12 H) and holds.

## Frame 5 — Pivot: 98.5 %

- src: compositions/frames/05-pivot-match-rate.html
- duration: 3.506s
- transition_in: push-slide LEFT 0.25s
- scene: The footage slides away and one number takes the frame: 98.5 % of transactions matched without a human touch
- beat: benefit_highlight
- role: metric
- scene_type: kinetic-type
- blueprint: video-text-pivot (Adapt)
- persuasion: Feature-to-benefit translation
- focal: stat numeral
- roles: stat numeral = cutout
- asset_candidates:
- asset_note: typographic pivot; the footage exits with the push-slide transition, so this frame carries no clip (no window is replayed)
- sfx: none
- handoff_in: footage plate enters from the push-slide only (owned by the transition, not by this frame); this frame's own layers start empty on white; disclosure chip static in its fixed box, opacity 1
- text: "98.5%" @ 0.3-3.5
- text: "of transactions auto-matched / without a human touch" @ 0.8-3.5
- text: "Synthetic fixture · fictional numbers" @ 0-3.5

Adapt: keep the video-text-pivot handover (the clip proved it, the number lands it). The clip leaves through the transition and does not share the frame.
Scene 1 (0.0–1.1s): white canvas. "98.5%" counts up 0.0→98.5 on expo.out, primary, about 260 px, left at x 0.08 W, y 0.26–0.54 H, and settles by 1.1 s.
Scene 2 (0.8–3.5s): the label (Inter 500, 56 px, ink/muted two-tone: "auto-matched" in ink) fades up beneath on two lines and holds still.

## Frame 6 — Click 2: the audit trail

- src: compositions/frames/06-audit-trail.html
- duration: 4.992s
- transition_in: cut
- scene: Click one matched line and its audit trail slides in: imported, matched to INV-2026-0418, posted with no manual touch, approved for close
- beat: feature_showcase
- role: ui
- scene_type: product-ui
- evidence_tier: A
- blueprint: cursor-ui-demo (Adapt)
- persuasion: Risk reversal (every automatic match is explained)
- focal: assets/footage.mp4
- roles: footage = background (full-bleed, undimmed)
- asset_candidates: assets/footage.mp4 — tier-A capture, window 6.10-8.60 s, Coldharbour Packaging row click and the audit trail panel
- capture_window: 6.10-8.60
- capture_hold: 2.5
- capture_drift: 0.80,0.40 1.7 @ 2.55-4.9
- sfx: click @ 0.72
- handoff_out: footage plate — box x 0 y 0 w 1 h 1 (full-bleed); camera scale 1.7, focus 0.80,0.40; opacity 1; motion: drift settled, velocity 0 at the cut; hard cut to Frame 7, which reframes (a new framing on a cut, not a continuous move)
- text: "Click 2 · Audit trail" @ 0.05-1.6
- text: "Every match leaves a receipt." @ 2.6-5.0
- text: "Synthetic fixture · fictional numbers" @ 0-5.0

Adapt: one workflow step shown end to end. The cursor picks one line and the proof opens beside it.
Scene 1 (0.0–1.2s): the footage opens at home. The autozoom slice punches in (0.7 s) on the Coldharbour Packaging row at 0.51,0.50, 2.0×, arriving on the click at 0.72 s with a ripple and the click SFX. The row highlights and the table column narrows as the panel slides in from the right (0.72–1.17 s, the app's own motion).
Scene 2 (1.2–2.5s): the hold is at most 1.0 s, then an ease-out to home so the whole panel is in view: "Audit trail - INV-2026-0418", Coldharbour Packaging EUR 2,965.20, four trail steps.
Scene 3 (2.5–5.0s): the last picture holds and the camera drifts to 0.80,0.40 at 1.7× so the four trail steps read large; "Posted to the ledger — no manual touch" sits near the centre of the framing. At 2.6 s "Every match leaves a receipt." slides up on the white card, but at box x 0.05 W, y 0.64 H, w 0.40 W, h 0.12 H it covers only table columns, never the panel.

## Frame 7 — Click 3: Close September

- src: compositions/frames/07-close-september.html
- duration: 5.004s
- transition_in: cut
- scene: Close September opens the close checklist and five steps tick green one after another until Lock period wakes up
- beat: feature_showcase
- role: ui
- scene_type: product-ui
- evidence_tier: A
- blueprint: device-surface-showcase (Adapt)
- persuasion: Friction reduction
- focal: assets/footage.mp4
- roles: footage = background (full-bleed; the app's own modal dim stays as captured)
- asset_candidates: assets/footage.mp4 — tier-A capture, window 8.70-12.10 s, Close September click and the five-step checklist ticking
- capture_window: 8.70-12.10
- capture_hold: 1.6
- capture_drift: 0.36,0.68 1.6 @ 3.45-4.95
- sfx: click @ 0.75
- handoff_in: footage plate — box x 0 y 0 w 1 h 1 (full-bleed); camera at the autozoom slice's first pose (home, scale 1.0, focus 0.5,0.5); opacity 1; motion: the slice re-aims toward Close September at 0.25,0.75, arriving at 2.0× for the click at frame-local 0.75
- handoff_out: footage plate — box x 0 y 0 w 1 h 1; camera scale 1.6, focus 0.36,0.68 (footage fractions); opacity 1; motion: drift settled, velocity 0 at the cut; cursor resting on Lock period at 0.345,0.71
- text: "Click 3 · Close September" @ 0.05-1.6
- text: "5 checks. All green." @ 3.4-5.0
- text: "Synthetic fixture · fictional numbers" @ 0-5.0

Adapt: keep the surface completing its loop inside its real interface. The ticks are the app's own; nothing is overlaid on the checklist.
Scene 1 (0.0–1.2s): the camera travels to the Close September button (bottom-left) and the cursor clicks at 0.75 s. The overlay sheet "Close September — Ledgerly runs the close checklist for this entity." opens centre-screen.
Scene 2 (1.2–3.4s): the hold is at most 1.0 s after the click, then an ease-out to home so the sheet is fully in frame before tick 3. The five ticks land at 1.20, 1.72, 2.24, 2.76 and 3.28 s (Bank feeds reconciled → Invoices matched and posted → Accruals booked → Intercompany balances cleared → Audit trail complete for every line), and Lock period becomes active at 3.28 s.
Scene 3 (3.4–5.0s): the last picture holds and the camera drifts to 0.36,0.68 at 1.6×, framing ticks 3–5, Lock period and "September is ready to lock.". "5 checks. All green." slides up on the white card at box x 0.62 W, y 0.64 H, w 0.34 W, h 0.12 H (right side, clear of the sheet's left column and the button).

## Frame 8 — Click 4: September locked (STAR)

- src: compositions/frames/08-september-locked.html
- duration: 5.503s
- transition_in: cut
- scene: Lock period, the bed drops out for a breath, and a dark pill reads September locked; the camera leans in on it
- beat: benefit_highlight
- role: ui
- scene_type: product-ui
- evidence_tier: A
- blueprint: compose
- persuasion: Show-don't-tell proof (the month is visibly closed)
- focal: assets/footage.mp4
- roles: footage = background (full-bleed; modal dim as captured)
- asset_candidates: assets/footage.mp4 — tier-A capture, window 12.10-14.95 s, Lock period click and the September locked pill
- capture_window: 12.10-14.95
- capture_hold: 2.45
- capture_drift: 0.46,0.68 1.8 @ 2.9-5.2
- dropout: 0.4 @ 0.67
- sfx: success @ 0.8
- poster: 4.2
- handoff_in: footage plate — box x 0 y 0 w 1 h 1 (full-bleed); camera scale 1.6, focus 0.36,0.68 (footage fractions); opacity 1; motion: at rest at the cut, then the autozoom slice pushes to Lock period at 0.345,0.71, 2.0×, arriving at frame-local 0.67; cursor resting on Lock period
- handoff_out: footage plate — box x 0 y 0 w 1 h 1; camera scale 1.8, focus 0.46,0.68; opacity 1; motion: drift settled, then the plate exits LEFT with push-slide (0.25 s) into Frame 9
- text: "Click 4 · Lock period" @ 0.05-1.5
- text: "Closed. Locked. Audit-ready." @ 2.9-5.3
- text: "Synthetic fixture · fictional numbers" @ 0-5.3

Compose: the one reveal of the video (STAR, planned first). Motion is restraint and one push.
Scene 1 (0.0–0.67s): continuous with Frame 7's framing. The camera pushes in to 2.0× on Lock period. The bed has dropped out: 0.4 s of silence ends on the click.
Scene 2 (0.67–2.85s): click at 0.67 s with the ripple, click SFX and success SFX at 0.8 s as the bed returns on the beat. The dark "September locked" pill appears beside the greyed Lock period button (the app's own state). The hold is at most 1.2 s, then an ease-out toward home.
Scene 3 (2.85–5.3s): the last picture holds and the camera drifts in to 0.46,0.68 at 1.8×, centring the five green ticks and the "September locked" pill. At 2.9 s the STAR line "Closed. Locked. Audit-ready." enters word by word (expo.out) in ink Space Grotesk 700 at 88 px on a white card at box x 0.05 W, y 0.10 H, w 0.52 W, h 0.13 H (top band, clear of the pill) and holds. The poster is taken at 4.2 s.

## Frame 9 — Pivot: 11 hours back

- src: compositions/frames/09-pivot-hours.html
- duration: 3.495s
- transition_in: push-slide LEFT 0.25s
- scene: The locked month slides away and one number lands: 11 hours saved per accountant, every week
- beat: benefit_highlight
- role: metric
- scene_type: kinetic-type
- blueprint: dataviz-countup (Adapt)
- persuasion: Future pacing (the week after the close)
- focal: stat numeral
- roles: stat numeral = cutout
- asset_candidates:
- asset_note: typographic pivot; sourced copy (site/index.html:44), no product screen and no replayed window
- sfx: none
- text: "11 hours" @ 0.3-3.5
- text: "saved per accountant, / every week" @ 0.8-3.5
- text: "Synthetic fixture · fictional numbers" @ 0-3.5

Adapt: one statistic counts up; no chart and no second stat.
Scene 1 (0.0–1.0s): white canvas. "11 hours" counts 0→11 (the integer steps on expo.out), primary, about 240 px, left at x 0.08 W, y 0.26–0.54 H.
Scene 2 (0.8–3.5s): the two-line label (Inter 500, 56 px, ink) fades up beneath and holds. Layout mirrors Frame 5 so the two pivots rhyme.

## Frame 10 — Proof: the controller's quote

- src: compositions/frames/10-quote.html
- duration: 6.002s
- transition_in: cut
- scene: A pull quote on white: we went from a 12-day close to under 4, and the audit trail is what the auditors love
- beat: social_proof
- scene_type: kinetic-type
- blueprint: compose
- persuasion: Social proof (a named controller, marked fictional as on the site)
- focal: quote
- roles: quote = cutout · rings = background
- asset_candidates:
- asset_note: typographic proof card (frame.md Pull Quote treatment); the quote and attribution are verbatim from site/index.html:54, including "(fictional)"
- sfx: none
- text: "We went from a 12-day close to under 4." @ 0.3-6.2
- text: "The audit trail is the part / our auditors love." @ 2.3-6.2
- text: "Priya Menon, Controller / Harborline Logistics (fictional)" @ 0.9-6.2
- text: "Synthetic fixture · fictional numbers" @ 0-6.2

Compose on frame.md treatment 4 (Pull Quote), placed left-of-centre rather than centred so it reads as a continuation of the pivots.
Scene 1 (0.0–0.9s): a 15 %-opacity primary quote mark at quote-mark scale sits at top-left. Sentence 1 (Space Grotesk 500, 64 px, ink) rises line by line from x 0.08 W, y 0.24 H. "12-day" and "under 4" are in primary.
Scene 2 (0.9–2.3s): the attribution fades up below (Space Grotesk 600, 44 px, uppercase-free, muted, two lines) at y 0.66–0.76 H, above the keep-out.
Scene 3 (2.3–6.2s): sentence 2 rises under sentence 1 (same style, "audit trail" in primary), echoing Frame 6. Everything then holds still, with only the faint concentric rings breathing 1.00→1.02 behind the text.

## Frame 11 — End card: Start my free trial

- src: compositions/frames/11-end-card.html
- duration: 3.982s
- transition_in: zoom-through 0.3s
- scene: The Ledgerly wordmark, the runner-up promise, and one solid CTA pill: Start my free trial
- beat: cta
- role: cta
- scene_type: logo-outro
- blueprint: cta-morph-press (Adapt)
- persuasion: Risk reversal (a free trial, first person)
- focal: CTA pill
- roles: wordmark = supporting · tagline = supporting · CTA pill = cutout · rings = background
- asset_candidates:
- asset_note: typographic end card; the repository has no logo file, so the wordmark "Ledgerly" is set in type (Space Grotesk 700) and not redrawn as a mark
- sfx: none
- text: "Ledgerly" @ 0.2-4.0
- text: "Month-end close: 3 days, not 12" @ 0.6-4.0
- cta: "Start my free trial" @ 1.0-4.0
- order: logo -> tagline -> CTA
- stagger: 0.4s
- text: "Synthetic fixture · fictional numbers" @ 0-4.0

Adapt: keep cta-morph-press's identity condensing into the one thing you click. There is no URL: the repository names no public domain (gap `no-url`), so the third staggered slot is the CTA.
Scene 1 (0.0–0.6s): white canvas with concentric closing rings (frame.md atmosphere), centred. The wordmark "Ledgerly" (Space Grotesk 700, 110 px, ink) lands centre at y 0.30 H at 0.2 s.
Scene 2 (0.6–1.0s): the tagline "Month-end close: 3 days, not 12" (Space Grotesk 500, 64 px, ink; "3 days" in primary) at y 0.45 H at 0.6 s.
Scene 3 (1.0–4.0s): the wordmark's underline condenses into the solid primary CTA pill "Start my free trial" (Space Grotesk 600, 56 px, white on #2A6F97, radius 100 px) at y 0.58–0.68 H, landing at 1.0 s. It is declared `data-var-text` and holds still to the end: 3.0 s on screen. Nothing sits below y 0.82 H.

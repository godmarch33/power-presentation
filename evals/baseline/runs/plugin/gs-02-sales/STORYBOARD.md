---
format: 1920x1080
duration: 60s
message: "Close the books in 3 days, not 12"
arc: Memo hook → promise → before (0 of 7) → one click (STAR) → one line's trail → match rate → close → lock → similar-company proof → the question → Reply "yes"
audience: sales
mode: autonomous
language: en
version: v1
reveal: early
register: medium
music: pack:vol-10
approved: v1
---

# Ledgerly for Dana Okafor — "The life of one line" (sales outreach, 60 s)

Archetype: sales upside-down pyramid (outcome first, demo second, one step last), built as SB7 with two use-cases (60 s row).
Use-case 1 is "match": frames 3–6. Use-case 2 is "close": frames 7–9. The concept follows one bank line (Sep 03 Coldharbour
Packaging) from import to a locked September, and a left-hand rail names the line's current stage.

## Global rules (bind every frame)

### Stage, safe area, caption band

- Master canvas 1920×1080 (16:9); the 9:16 cut is a reflow of the same frames in a 1080×1920 host (`render --formats 16:9,9:16`).
- Caption band: y ≥ 0.82 of frame height (QA-14 keep-out) in both formats. Captions are ON (sales), word-timed and burned in.
  Nothing else goes in that band: no chrome, no progress strip, no footage UI, no CTA, no credit line.
- frame.md's progress strip moves from the bottom edge to the top edge: y 0–0.003, full width, 3 px, colour #2A6F97.
- 16:9 product stage box (every footage frame): x 0.250–0.950, y 0.060–0.760 (1344×756 px, exactly 16:9). Radius 14 px,
  1.5 px border rgba(42,111,151,0.2), no shadow. The footage fills the box, and the camera (autozoom + capture_drift) moves
  inside it. The stage box does not move, scale or fade across footage→footage cuts (frames 3→4→5 and 7→8→9): scale 1,
  opacity 1, static.
- 16:9 left rail, "the life of one line": x 0.050–0.220, y 0.200–0.640. Five stops in a vertical column, evenly spaced:
  Imported · Matched · Posted · Closing · Locked. Each stop is a 20 px circle plus a label in Space Grotesk 600, 30 px.
  The active stop is #2A6F97 (filled dot, label #2A6F97). Done stops have a filled dot #2A6F97 with the label #14213D.
  Upcoming stops have a hollow dot and the label #5C6B7A (never #9A9A9A — contrast). A 2 px connector line
  rgba(42,111,151,0.2) fills with #2A6F97 up to the active stop. The rail is static across footage→footage cuts
  (scale 1, opacity 1). Only the active stop changes, with a 0.4 s power3.out fill.
- 16:9 demo chip (every footage frame): the pill "Ledgerly demo data", x 0.050, y 0.690–0.740, h ≈ 50 px, fill
  rgba(42,111,151,0.08), Inter 500 26 px #2A6F97, static across footage→footage cuts.
- 16:9 callout (at most one per footage frame): a tag-pill of Space Grotesk 600, 34 px, #14213D on #FFFFFF with a 1.5 px
  rgba(42,111,151,0.2) border. It is anchored inside the stage box next to the drift focus, never over the focus element
  itself and never below y 0.76.
- 9:16 reflow (1080×1920): the rail becomes a horizontal row at y 0.050–0.120, x 0.05–0.95. All five dots are shown, and
  only the active label is printed, Space Grotesk 600, 40 px. The stage box is x 0.040–0.960, y 0.150–0.790, with the footage
  on the autozoom 9:16 camera track. The demo chip sits top-right in the rail row (y 0.125–0.145). Callouts sit inside
  the stage box. Cards reflow per frame.md "Aspect-Ratio Behavior" (stacked, centred). Nothing goes in y ≥ 0.82.

### Type floors

- Display (hook memo lines, promise, metric numeral, question, end-card tagline) ≥ 64 px @1080p, Space Grotesk 600–700,
  −0.02em (frame.md h1/h2).
- Any load-bearing line ≥ 1.4cqw (27 px). Captions ≥ 42 px. No text below 26 px anywhere (the demo chip is the floor).
- Reading floor per QA-10: max(1.2 s, chars/20), ≤ 42 characters per line, ≤ 2 lines. Every on-screen text is a
  `- text:` bullet in its frame.

### Palette, fonts, motion

- frame.md tokens verbatim: bg #FFFFFF, ink #14213D, accent #2A6F97 (the only accent), muted #5C6B7A, positive #059669 only
  inline. Space Grotesk + Inter only. No shadows. Atmosphere (rings, dot grid, diagonal panel) on frames 1, 2 and 12 only.
- Register medium: enters power3.out, exits power2.in, moves power2.inOut, transitions 0.3–0.5 s, no `back.out`, no
  `linear`, no tween < 0.2 s (QA-11). Auto-zoom (1.5–2×).
- The pointer is synthesised from events.jsonl with the spring (the capture has cursor: none).

### Evidence, data and the fixture banner

- All footage is tier A: a local-chain capture of site/app.html, .media/capture/footage.mp4, 14.27 s, the Layer-2 OCR gate
  clean. Every footage window is used once, in footage order, never replayed.
- The footage shows Ledgerly's seeded "Nordwell Bank EUR" demo workspace. It is never captioned, labelled or narrated as
  Northbridge's data. The "Ledgerly demo data" chip stays on every footage frame.
- Fixture banner decision: the capture's own top banner ("Synthetic fixture: Ledgerly is a fictional company. Seeded demo
  data …", footage y 0–0.03) stays in the picture. No overlay may cover it, no mask may hide it, and it is not cropped at
  1×. It leaves the view only during the 1.5–2× punch-ins, and the demo chip carries the disclosure through those.
- Prospect personalisation is text only (no Northbridge logo or site capture exists). It uses the `data-var-text`
  variables `prospect_name` = "Dana Okafor", `prospect_role` = "Head of Finance", `prospect_company` = "Northbridge Retail
  Group", `cta_label` = "Reply “yes”". No frame states a Northbridge fact such as close length or volumes.
- Wordmark: no Ledgerly logo file exists. "Ledgerly" is set as a typographic wordmark in Space Grotesk 700 #14213D and
  never appears before 3 s.

## Frame 1 — Memo to Dana

- src: compositions/frames/01-memo-hook.html
- duration: 3.007s
- transition_in: cut
- scene: A white memo sheet types its header — To: Dana Okafor, Head of Finance, Northbridge Retail Group; Re: manual month-end reconciliation
- voiceover: "Dana, a note on month-end."
- beat: hook
- role: hook
- scene_type: kinetic-type
- blueprint: typewriter-reveal
- focal: the "Re:" line
- roles: hero = memo sheet, support = To / company lines, accent = 60×4 px #2A6F97 rule above the sheet
- sfx: none
- poster: 2.2
- asset_candidates:
- asset_note: typographic hook card. Personalisation is text only via data-var-text (no prospect logo or site capture exists).
- text: "To: Dana Okafor, Head of Finance" @ 0.2-3.007
- text: "Northbridge Retail Group" @ 0.4-3.007
- text: "Re: manual month-end reconciliation" @ 0.7-3.007

Ground #FFFFFF with frame.md's clipped diagonal accent panel on the right ~30 % (cover atmosphere). The memo sheet is a
card-tinted block, x 0.08–0.64, y 0.20–0.70.

- 0.0–0.2: the sheet is already on screen (no black open). The accent rule draws left→right 0.3 s power3.out.
- 0.2: "To: Dana Okafor, Head of Finance" types in (h2, 64 px, #14213D) at about 60 characters per second, with a caret.
- 0.4: "Northbridge Retail Group" rises 12 px and fades in 0.4 s (h3 48 px, #5C6B7A).
- 0.7: "Re: manual month-end reconciliation" types in (h2, 64 px, "Re:" in #2A6F97). It is done by 1.3 and holds.
- 2.2: the poster moment: all three lines settled, name and company legible.
- No Ledgerly wordmark or logo in this frame.

## Frame 2 — The promise

- src: compositions/frames/02-promise.html
- duration: 1.637s
- transition_in: crossfade 0.4s
- scene: The memo clears and one line lands — Month-end in 3 days, not 12
- beat: benefit_highlight
- role: outcome
- scene_type: kinetic-type
- blueprint: titlecard-reveal
- focal: the numerals "3" and "12"
- roles: hero = promise line
- sfx: none
- asset_candidates:
- asset_note: typographic outcome card. It is a 27-character cut of Ledgerly's own line "Close the books in 3 days, not 12" (site/index.html:27, claims c001 and c007), not a forecast for Northbridge. It is shortened so it reads inside the beat-locked 1.637 s window.
- text: "Month-end in 3 days, not 12" @ 0.0-1.637

Centred h1, Space Grotesk 700 at 80 px, #14213D. The "3" and "12" are in #2A6F97.

- 0.0: the line is already set at the cut and rides in on the 0.4 s crossfade with a 16 px rise (power3.out), so it is
  readable for the whole window.
- 0.5–0.9: a thin #2A6F97 strike draws through "12" left→right. Only "12" is struck, never "3".
- The frame holds to the cut. It has no voiceover: the bed carries this beat, and the promise reads on its own (muted-first).

## Frame 3 — Nothing matched yet

- src: compositions/frames/03-before-unmatched.html
- duration: 5.735s
- transition_in: zoom-through 0.4s
- scene: The Reconciliation view at 1× — Nordwell Bank EUR, seven bank lines, every pill grey "Unmatched", 0 of 7 matched
- voiceover: "Is your team still matching bank lines to invoices by hand?"
- beat: pain_point
- role: ui
- scene_type: product-ui
- evidence_tier: A
- capture_window: 1.4-3.0
- capture_hold: 4.135
- capture_drift: 0.70,0.46 1.5 @ 1.8-5.2
- blueprint: device-surface-showcase
- focal: the column of grey "Unmatched" pills and the "0 of 7 matched" counter
- roles: hero = footage in the stage box, support = rail (Imported active), callout, demo chip
- sfx: none
- asset_candidates: assets/footage.mp4 — tier A capture, window 1.4-3.0 (app loaded, nothing matched, pointer moving to Auto-match)
- text: "Ledgerly demo data" @ 0.0-5.735
- text: "Imported" @ 0.3-5.735
- text: "0 of 7 matched" @ 2.0 +3.735

This is the "before" state, pain shown in the product itself. The footage plays 1.4–3.0 at 1× (the app has just loaded:
"Imported this morning. Nothing is matched yet."). It then holds its last picture while the camera drifts toward the
counter and the pill column.

- 0.0: the stage box and rail are in place; the rail's "Imported" stop fills (0.4 s).
- 2.0: the callout "0 of 7 matched" pops beside the counter (focus about x 0.68, y 0.22 of the footage). It enters 0.4 s
  power3.out and holds to the cut.
- 1.8–5.2: the drift to focus (0.70, 0.46) at 1.5× brings the seven grey pills and the amounts to readable size.
- The voice asks the question over the grey pills. Nothing on screen claims how Northbridge works.

## Frame 4 — One click (STAR)

- src: compositions/frames/04-automatch-star.html
- duration: 6.003s
- transition_in: cut
- scene: Auto-match is clicked; the seven pills flip to green "Matched" top to bottom as invoice numbers fill in, and the counter runs 0 → 7 of 7
- voiceover: "One click, and every line finds its invoice."
- beat: product_intro
- role: ui
- scene_type: product-ui
- evidence_tier: A
- capture_window: 3.0-6.3
- capture_hold: 2.703
- capture_drift: 0.70,0.46 1.5 @ 3.5-5.8
- dropout: 0.4
- blueprint: cursor-ui-demo
- focal: the pill column flipping green, then the "7 of 7 matched" counter
- roles: hero = footage (the cascade), support = rail (Matched active), callout, demo chip
- sfx: click @ 0.27, success @ 2.55
- asset_candidates: assets/footage.mp4 — tier A capture, window 3.0-6.3 (Auto-match click at 3.27, seven matches 3.52-5.50)
- text: "Ledgerly demo data" @ 0.0-6.003
- text: "Matched" @ 0.3-6.003
- text: "7 of 7 matched" @ 2.7 +3.303

THE STAR MOMENT, the one reveal of the video. The bed drops out for 0.4 s before this cut and comes back on it
(`dropout: 0.4`). A synthetic pointer presses Auto-match at 0.27 (footage 3.27), and the click cue lands on it. The camera
follows the capture's autozoom: a punch-in on the button and the first rows at 2×, then an ease-out to 1× so all seven rows
flip in view (footage 3.52–5.50, one row every 0.33 s). The rail's "Matched" stop fills at 0.3.

- 2.55: the seventh pill turns green and the counter reads "7 of 7 matched". The success cue lands on it.
- 2.7: the callout "7 of 7 matched" enters (0.4 s power3.out).
- 3.3–6.0: the held last picture drifts to (0.70, 0.46) at 1.5×, showing the green column and the invoice numbers. The
  voice is silent after 3.0 so the result breathes.

## Frame 5 — One line, start to finish

- src: compositions/frames/05-one-line-trail.html
- duration: 8.173s
- transition_in: cut
- scene: The Sep 03 Coldharbour Packaging line is opened; its audit trail slides in — imported, matched to INV-2026-0418, posted with no manual touch, approved for close
- voiceover: "Follow one line: matched on amount and payment reference, posted to the ledger, approved. No manual touch."
- beat: feature_showcase
- role: ui
- scene_type: product-ui
- evidence_tier: A
- capture_window: 6.3-8.3
- capture_hold: 6.173
- capture_drift: 0.83,0.45 1.8 @ 2.2-7.6
- blueprint: device-surface-showcase
- focal: the audit-trail panel, "Posted to the ledger — no manual touch" row
- roles: hero = footage (audit trail), support = rail (Posted active), callout, demo chip
- sfx: click @ 0.22
- asset_candidates: assets/footage.mp4 — tier A capture, window 6.3-8.3 (row Sep 03 clicked at 6.52, audit-trail panel opens)
- text: "Ledgerly demo data" @ 0.0-8.173
- text: "Posted" @ 0.3-8.173
- text: "Posted — no manual touch" @ 2.6 +5.3

This is the concept's spine, the life of one line. The pointer clicks the Sep 03 row at 0.22 (footage 6.52). The capture's
autozoom punches in on the row at 2×, and the audit-trail panel slides in on the right. The rail steps from "Matched"
(done) to "Posted" at 0.3.

- 2.0: the footage window ends. The held picture drifts right to the audit trail, focus (0.83, 0.45) at 1.8×, where the
  four trail entries become legible: "Bank line imported", "Matched to INV-2026-0418", "Posted to the ledger — Account
  4010 Packaging - no manual touch", "Approved for close — Controller review - kept for the auditors".
- 2.6: the callout "Posted — no manual touch" enters beside the "Posted to the ledger" entry, left of it and never over it.
- 5.4: a 2 px #2A6F97 underline (overlay, no text) slides 0.5 s power2.inOut from the "Posted to the ledger" entry
  down to the "Approved for close" entry as the voice says "approved", the second state change of the hold.
- The voice names the steps as the drift passes them. It does not read the panel word for word.

## Frame 6 — The match rate

- src: compositions/frames/06-match-rate.html
- duration: 5.515s
- transition_in: blur-crossfade 0.4s
- scene: One metric card — 98.5% of transactions auto-matched without a human touch
- voiceover: "By Ledgerly's own count, ninety-eight point five percent match that way."
- beat: benefit_highlight
- role: metric
- scene_type: metrics/chart
- blueprint: dataviz-countup
- focal: the numeral 98.5%
- roles: hero = metric numeral, support = label
- sfx: none
- asset_candidates:
- asset_note: typographic metric card (frame.md metric-card). The value is c002, site/index.html:36, verbatim with no rounding.
- text: "98.5%" @ 0.3-5.5
- text: "of transactions auto-matched / without a human touch" @ 0.8-5.5

A single frame.md metric-card, centred on #FFFFFF: the metric-value numeral "98.5%" at 160 px, Space Grotesk 700, #2A6F97,
with the Inter 36 px #5C6B7A label beneath it on two lines.

- 0.3: the numeral counts up from 0.0% to 98.5% over 1.4 s, power3.out (count-up 1.2–2.5 s). The last value is exact.
- 0.8: the label fades up.
- 1.8–5.5: hold, with a 3 px #2A6F97 bar-track under the label filling to 98.5 % by 2.4.
- The voice names the source ("Ledgerly's own count") so the number is not read as Northbridge's.

## Frame 7 — Close September

- src: compositions/frames/07-close-september.html
- duration: 4.307s
- transition_in: crossfade 0.4s
- scene: Close September is pressed; the close sheet opens and its checklist starts ticking itself — bank feeds reconciled, invoices matched and posted
- voiceover: "Once everything matches, close September."
- beat: feature_showcase
- role: ui
- scene_type: product-ui
- evidence_tier: A
- capture_window: 8.3-10.3
- capture_hold: 2.307
- capture_drift: 0.47,0.45 1.6 @ 2.1-4.0
- blueprint: agent-progress-theater
- focal: the close sheet's checklist
- roles: hero = footage (close sheet), support = rail (Closing active), callout, demo chip
- sfx: click @ 0.64
- asset_candidates: assets/footage.mp4 — tier A capture, window 8.3-10.3 (Close September clicked at 8.94, first two checks tick)
- text: "Ledgerly demo data" @ 0.0-4.307
- text: "Closing" @ 0.3-4.307
- text: "Ledgerly runs the checklist" @ 1.4-4.307

Use-case 2 opens. The pointer travels to "Close September" (bottom-left of the table) and clicks at 0.64 (footage 8.94).
The capture's autozoom is on the button at 2× and eases back to 1× as the close sheet opens. The first two checks tick at
footage 9.39 and 9.91 (frame-local 1.09, 1.61). The rail steps to "Closing" at 0.3.

- 1.4: the callout "Ledgerly runs the checklist" enters above the sheet's title, inside the stage box.
- 2.0–4.307: the window's last picture (two of five checks ticked) holds while the camera drifts to the checklist,
  (0.47, 0.45) at 1.6×.

## Frame 8 — The checklist finishes

- src: compositions/frames/08-checklist-ticks.html
- duration: 3.692s
- transition_in: cut
- scene: The remaining checks tick — accruals booked, intercompany balances cleared, audit trail complete for every line — and Lock period turns active
- voiceover: "The close checklist ticks itself off."
- beat: feature_showcase
- role: ui
- scene_type: product-ui
- evidence_tier: A
- capture_window: 10.3-12.1
- capture_hold: 1.892
- capture_drift: 0.40,0.62 1.5 @ 1.9-3.6
- blueprint: device-surface-showcase
- focal: the last three ticks and the Lock period button
- roles: hero = footage (checklist), support = rail (Closing active), demo chip
- sfx: none
- asset_candidates: assets/footage.mp4 — tier A capture, window 10.3-12.1 (checks 3-5 tick, Lock period enabled at 11.47)
- text: "Ledgerly demo data" @ 0.0-3.692
- text: "Closing" @ 0.0-3.692

This frame continues exactly where frame 7's footage window stopped (footage 10.3, two checks done), so the cut resumes the
same picture. The checks tick at footage 10.43, 10.95 and 11.47 (frame-local 0.13, 0.65, 1.17). The last one lands when "Lock period" turns from pale to solid blue.

- 1.8–3.692: hold on the finished checklist, drifting to (0.40, 0.62) at 1.5× so the ticks and the Lock period button share
  the view.
- The rail stays on "Closing" (static). No callout: the ticks are the state change.

## Frame 9 — September locked

- src: compositions/frames/09-september-locked.html
- duration: 5.585s
- transition_in: cut
- scene: Lock period is pressed and the dark pill "September locked" appears beside it
- voiceover: "Then lock the period, and every line keeps its trail for the auditors."
- beat: benefit_highlight
- role: ui
- scene_type: product-ui
- evidence_tier: A
- capture_window: 12.1-14.2
- capture_hold: 3.485
- capture_drift: 0.44,0.70 1.8 @ 2.3-5.4
- blueprint: video-text-pivot
- focal: the "September locked" pill
- roles: hero = footage (lock), support = rail (Locked active, all five stops filled), callout, demo chip
- sfx: click @ 0.16
- asset_candidates: assets/footage.mp4 — tier A capture, window 12.1-14.2 (Lock period clicked at 12.26, "September locked" shown)
- text: "Ledgerly demo data" @ 0.0-5.585
- text: "Locked" @ 0.3-5.585
- text: "September locked" @ 1.0 +4.585

The pointer clicks "Lock period" at 0.16 (footage 12.26). The capture's autozoom is at 2× on the button, and the dark
"September locked" pill appears beside it. The rail's last stop "Locked" fills at 0.3. The connector line is now fully
#2A6F97: the line's life is complete.

- 1.0: the callout "September locked" enters above the pill (0.4 s power3.out).
- 1.4–2.1: the capture's own zoom-out plays. 2.1–5.585: the held picture drifts back in to (0.44, 0.70) at 1.8× on the "Lock
  period · September locked" pair, a slow settle to close the product section.

## Frame 10 — Harborline's close

- src: compositions/frames/10-proof-quote.html
- duration: 5.99s
- transition_in: zoom-through 0.5s
- scene: Pull quote — "We went from a 12-day close to under 4. The audit trail is the part our auditors love." Priya Menon, Controller, Harborline Logistics (fictional)
- voiceover: "Here's how Harborline Logistics puts it."
- beat: social_proof
- scene_type: quote
- blueprint: titlecard-reveal
- focal: "12-day close to under 4"
- roles: hero = quote, support = attribution
- sfx: none
- asset_candidates:
- asset_note: typographic pull quote (frame.md Pull Quote treatment). Quote c008 is verbatim from site/index.html:54, with the attribution exactly as the source prints it, including "(fictional)". No logo exists for Harborline.
- text: "“We went from a 12-day close to under 4.”" @ 0.4-5.99
- text: "“The audit trail is the part / our auditors love.”" @ 1.6-5.99
- text: "Priya Menon, Controller, / Harborline Logistics (fictional)" @ 2.2-5.99

frame.md Pull Quote: centred, faint concentric rings behind (atmosphere is allowed on a quote card per the preset table),
and a 15 %-opacity #2A6F97 quote mark.

- 0.4: sentence one (blockquote, Space Grotesk 500, 64 px, #14213D) fades up 0.5 s power3.out. "12-day" and "under 4" are in
  #2A6F97.
- 1.6: sentence two fades up beneath it (same style, 2 lines).
- 2.2: the attribution (Space Grotesk 500, 30 px, uppercase-free, #5C6B7A) fades in on two lines.
- It holds to 5.99 with a slow 1.00→1.03 scale on the ring group. The audit-trail sentence calls back to frame 5.

## Frame 11 — The question for Northbridge

- src: compositions/frames/11-question.html
- duration: 6.014s
- transition_in: crossfade 0.4s
- scene: A question to Dana's team — How many days does Northbridge's close take today? — then the reply pill appears
- voiceover: "We don't know Northbridge's numbers, so here's the real question."
- beat: cta
- scene_type: kinetic-type
- blueprint: kinetic-type-beats
- focal: the question, then the "Reply “yes”" pill
- roles: hero = question, support = CTA pill
- sfx: none
- handoff_out: CTA pill "Reply “yes”" — box x 0.400 y 0.640 w 0.200 h 0.085 (768×691 px, 384×92 px), fill #2A6F97, label Space Grotesk 600 44 px #FFFFFF, radius 100 px, scale 1, opacity 1, motion static (0 px/s) at the cut
- asset_candidates:
- asset_note: typographic ask card. It asks, never states, Northbridge's close length (a gap). The prospect company comes from data-var-text prospect_company.
- text: "How many days does / Northbridge's close take today?" @ 0.4-6.014
- text: "Reply “yes”" @ 1.2-6.014

Why you, as a question (a question beats a statement). Centred h2, Space Grotesk 600, 72 px, #14213D, two lines, block
centred at y 0.40. "Northbridge's" is in #2A6F97.

- 0.4: the question rises 16 px and fades in 0.5 s power3.out.
- 1.2: the CTA pill scales 0.96→1 and fades in 0.4 s power3.out at x 0.40–0.60, y 0.640–0.725 (no SFX; density). From here
  the CTA stays on screen to the end of the video (the last 8 s rule).
- 1.6–6.014: hold. The pill does not move.

## Frame 12 — Reply "yes"

- src: compositions/frames/12-end-card.html
- duration: 3.5s
- transition_in: crossfade 0.4s
- scene: End card — Ledgerly wordmark, tagline "11 hours saved per accountant, per week", the Reply "yes" pill, and the AI-narration credit line
- voiceover: "More than a few? Just reply yes."
- beat: cta
- role: cta
- scene_type: end-card
- blueprint: titlecard-reveal
- focal: the "Reply “yes”" pill
- roles: hero = CTA pill, support = wordmark + tagline, colophon = credit line
- sfx: none
- handoff_in: CTA pill "Reply “yes”" — box x 0.400 y 0.640 w 0.200 h 0.085 (768×691 px, 384×92 px), fill #2A6F97, label Space Grotesk 600 44 px #FFFFFF, radius 100 px, scale 1, opacity 1, motion static (0 px/s) at the cut
- asset_candidates:
- asset_note: typographic end card. The wordmark is typeset (no logo file exists). The tagline is c004 (site/index.html:44). No Ledgerly URL exists in the sources (gap), so the reply CTA is the one step.
- text: "Ledgerly" @ 0.3-3.5
- text: "11 hours saved per accountant, per week" @ 0.7-3.5
- cta: "Reply “yes”" @ 0.0-3.5
- text: "Narration is AI-generated." @ 1.1-3.5
- order: logo -> tagline -> CTA
- stagger: 0.4s

frame.md Closing / CTA: centred, concentric closing rings behind. The CTA pill is the element handed in from frame 11. It
sits in exactly the same box, fully visible from 0.0, and does not move, so the crossfade dissolves everything except it.

- 0.3: the "Ledgerly" wordmark (Space Grotesk 700, 72 px, #14213D) fades up at y 0.30.
- 0.7: the tagline (h3, Inter 500, 40 px, #5C6B7A) fades up at y 0.44. "11 hours" is in #2A6F97.
- 1.1: the credit line "Narration is AI-generated." (Inter 400, 26 px, #5C6B7A) fades in at y 0.77, centred, above the
  caption band.
- The voice speaks the CTA ("just reply yes") while the pill holds. The whole card holds to 3.5 with no further motion
  except a slow 1.00→1.02 on the rings.

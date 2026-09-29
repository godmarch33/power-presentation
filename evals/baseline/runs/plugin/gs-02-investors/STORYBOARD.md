---
format: 1920x1080
duration: 90s
message: "Close the month in 3.1 days, not 12"
arc: One-liner → Problem → Product (4 tier-A exhibits at 1×, one outcome card) → Traction → Why now → Team → Ask
audience: investors
mode: autonomous
language: en
version: v1
reveal: early
register: premium
music: pack:vol-1
approved: v1
---

# Ledgerly — "Audited, not animated" (investors, 90 s)

Concept 4 (taken under `--yes`): the video reads like an audited statement. Hard cuts only. Numbers
never count, morph or fly; they are simply there, like figures on a printed page. The product runs at 1× in
its own time: four contiguous, never-replayed, never-sped-up windows of one tier-A recording (footage
1.7–5.9, 5.9–8.25, 8.25–12.1, 12.1–15.3), shown as Exhibits A–D. Every number carries a superscript marker
whose footnote line lands in the rail along the bottom of the page at the moment the number lands.

## Statement page — geometry and motion that bind every frame

Canvas 1920×1080, 16:9 master. Colours and type exactly per `frame.md` frontmatter: ground #FFFFFF, ink
#14213D (headlines, never accent-coloured), accent #2A6F97 (numerals, footnote markers, the only accent),
muted #5C6B7A (rail text, labels), hairline #DFE5EC. Space Grotesk for display, numerals and markers
(`font-variant-numeric: tabular-nums`); Inter for rail text and labels. No logo or wordmark before frame 13.
No shadows, no gradients, no atmosphere panels (this is a statement, not a cover).

Fixed elements (identical box on every frame, so they hold across every cut — no per-frame handoff needed):

1. Footnote rule — a 1 px hairline, colour #DFE5EC, opacity 1, box x 0.05W, y 0.765H, w 0.90W, h 1 px. Present
   from 0.0 s to the end of every frame, never animates, never moves (scale 1, motion none).
2. Footnote rail — text box x 0.05W, y 0.775H, w 0.90W, h 0.040H (ends at y 0.815H). Inter 400, 28 px, muted
   #5C6B7A, one line per entry. Entries sit in three fixed columns: column 1 x 0.05W, column 2 x 0.36W,
   column 3 x 0.67W, each w 0.28W; a frame with one entry uses column 1. The marker (¹ … ⁹) is Space Grotesk
   600 in accent #2A6F97. An entry enters with opacity 0 → 1 over 0.30 s, `power2.out`, no translate.
3. Caption keep-out (QA-14): nothing at y ≥ 0.82H. There is no progress bar and no burned-in caption band
   (16:9 with VO → kicker text + SRT).

Exhibit layout (frames 3, 5, 6, 7 — the product frames):

- Exhibit box: x 0.05W, y 0.07H, w 0.68W, h 0.68H (1306×734 px, 16:9), radius 14 px, border 1.5 px
  rgba(42,111,151,0.20), no shadow, overflow hidden. The footage fills the box (the whole capture frame, the
  in-product "Demo workspace - seeded data" chip and the "Synthetic fixture" banner stay visible). The camera
  (autozoom plus the declared `capture_drift`) moves inside the box; the box itself never moves.
- Margin note: x 0.76W, y 0.12H, w 0.20W (384 px), top-aligned; Space Grotesk 600, 36 px, ink #14213D,
  line-height 1.2, ≤ 2 lines of ≤ 18 characters. Numerals in it are accent #2A6F97. Enters opacity 0 → 1 over
  0.35 s `power2.out`; a replacing note hard-swaps (the old one is gone in the same frame the new one lands).
- Synthetic cursor from the frame's `<frame_id>.autozoom.json` (spring), 1× timing, no speed labels
  (nothing is sped up).

Card layout (every frame that is not an exhibit):

- Headline block x 0.05W, top y 0.30H, w ≤ 0.78W, left-aligned; Space Grotesk 700, 80 px (4.2cqw), ink,
  line-height 1.08, tracking −0.02em. Numerals inside it are accent #2A6F97.
- Section eyebrow (frames 8, 10, 11, 12 only): x 0.05W, y 0.18H, Space Grotesk 600, 28 px, uppercase,
  tracking 0.08em, accent.
- Ambient motion (keeps QA-06 `maxStaticSec` ≤ 2.0 without animating a number): the whole page content group
  except the rule and the rail scales 1.000 → 1.020 over the frame's full duration, `sine.inOut`, origin at
  the headline's left edge. Nothing else moves.
- Text enters opacity 0 → 1 over 0.35 s `power3.out`, headlines with an 8 px rise; numerals never translate,
  never count up. No exits: the hard cut is the exit. No `back.out` (register premium, QA-11). No tween
  shorter than 0.25 s.

Transitions: every `transition_in` is `cut` (concept 4; ≤ 1 transition per beat).

## Footnote register (every marker, its rail line and its claim)

| Marker | Rail line | Claim |
| --- | --- | --- |
| ¹ | Avg. month-end close · as of 2026-06-30 (frame 1); Avg. close · as of 2026-06-30 (frame 8) | c012 metrics.csv:5 |
| ² | Prior close, company site · undated | c007 site/index.html:27 |
| ³ | Exhibit A · real time · seeded demo data | c101 demonstrated, events.jsonl:5, footage 2.94–5.5 |
| ⁴ | Auto-match rate · as of 2026-08-31 | c013 metrics.csv:6 |
| ⁵ | Active accounts · as of 2026-08-31 | c010 metrics.csv:3 |
| ⁶ | NRR · as of 2026-06-30 | c011 metrics.csv:4 |
| ⁷ | Customer quote, company site · undated | c008 site/index.html:54 |
| ⁸ | Team · as of 2026-09-01 | c018 metrics.csv:11 |
| ⁹ | Ask terms · as of 2026-09-01 | c014–c017 metrics.csv:7–10 |

Numbers are copied verbatim from `claims-index.json`; no rounding, no reformatting. Never add a
number, date or logo that is not in this table.

## Audio plan

- Voice: Kokoro `am_michael` (investors default), flagged `tts_placeholder`; the Art. 50 line
  "Narration is AI-generated." sits on the end card. Pace 130–145 wpm, a 0.8–1.2 s pause at each cut.
- Bed: `pack:vol-1` (ende.app "Happy Beats / Business Moves" vol. 1, the steadiest track that covers 90 s),
  ducked to 0.12 under the voice; master −17 LUFS (QA-08 band −16…−18). No restrained CC0
  corporate bed is fetched yet.
- Locks: the "7 of 7 matched" reveal in frame 3 (frame-local 3.9 s) and the "September locked" hero
  entrance in frame 7 (frame-local 0.75 s). A 0.4 s bed dropout at frame 7 local 0.30–0.70,
  just before the badge lands.
- SFX only on product actions, declared per frame in `sfx:`: five cues across frames 3–7.

## Frame 1 — One-liner

- src: compositions/frames/01-one-liner.html
- duration: 5.493s
- transition_in: cut
- beat: hook
- role: hook
- scene_type: title-card
- scene: The promise set as the first line of a statement, two footnotes land in the rail
- voiceover: "Ledgerly customers close the month in three point one days, not 12."
- blueprint: titlecard-reveal
- focal: the headline, with "3.1 days" in accent
- roles: headline, footnote-rail
- sfx: none
- text: "Close the month in / 3.1 days¹, not 12²" @ 0.3-5.493
- text: "¹ Avg. month-end close · as of 2026-06-30" @ 0.7-5.493
- text: "² Prior close, company site · undated" @ 1.1-5.493
- asset_candidates:
- asset_note: typographic beat — the promise is the image; no captured asset fits a statement line

1. 0.0 s — white page, the footnote rule already drawn (no black open, QA-03).
2. 0.3 s — the headline lands in two lines (card layout, 80 px); "3.1 days" and "12" in accent, markers ¹ ²
   in accent at 0.5 em. It is the hook element (visible well before 3.0 s).
3. 0.7 s — rail column 1: "¹ Avg. month-end close · as of 2026-06-30". 1.1 s — rail column 2: "² Prior close,
   company site · undated". Page drifts 1.000 → 1.020. Hard cut out.

## Frame 2 — Problem

- src: compositions/frames/02-problem.html
- duration: 3.893s
- transition_in: cut
- beat: pain_point
- scene_type: title-card
- scene: One plain line states the manual work the product removes
- voiceover: "Without it, someone ticks off every line by hand."
- blueprint: kinetic-type-beats
- focal: the headline
- roles: headline
- sfx: none
- text: "Every bank line, / matched by hand" @ 0.3-3.893
- asset_candidates:
- asset_note: typographic beat — the pain is stated, not staged; no stock or fake UI (markers)

1. 0.3 s — headline lands, ink, two lines. No number, so the rail stays empty (only the rule).
2. Source of the premise: site/index.html:28 ("reconciles … automatically") and :43 ("without a human touch").
   The VO does not read the card: the card says what, the voice says who and when. Hard cut to Exhibit A.

## Frame 3 — Exhibit A: Auto-match

- src: compositions/frames/03-auto-match.html
- duration: 9.0s
- transition_in: cut
- beat: product_intro
- role: ui
- scene_type: product-ui
- evidence_tier: A
- capture_window: 1.7-5.9
- capture_hold: 4.8
- capture_drift: 0.70,0.22 1.6 @ 4.4-8.6
- scene: The real Reconciliation screen goes from 0 of 7 matched to 7 of 7 after one click, at 1×
- voiceover: "Recorded at normal speed, on seeded data: seven bank lines, one click, all seven matched."
- blueprint: device-surface-showcase
- focal: the matched-count and the status column flipping row by row
- roles: exhibit, margin-note, footnote-rail, cursor
- sfx: click @ 1.24
- text: "Before: / 0 of 7 matched" @ 0.3-3.8
- text: "After one click: / 7 of 7 matched³" @ 3.9-9.0
- text: "³ Exhibit A · real time · seeded demo data" @ 4.1-9.0
- asset_candidates: assets/footage.mp4 — tier-A screen recording 3840x2160, window 1.7–5.9 (Reconciliation, Auto-match)

1. 0.0–4.2 s — footage 1.7–5.9 at 1× in the exhibit box: "Nordwell Bank EUR — 0 of 7 matched". The
   camera from autozoom segment 1 re-aims to the Auto-match button (arrives footage 3.098); the synthetic
   cursor clicks it at local 1.24 (footage 2.943). Rows flip Unmatched → Matched one by one, the bar fills; the
   counter reads "7 of 7 matched" at about local 3.8 (footage 5.5). Zoom-out completes at local 3.24.
2. 0.3 s — margin note "Before: / 0 of 7 matched". 3.9 s — hard swap to "After one click: / 7 of 7 matched³"
   (the reveal; bed lock). 4.1 s — rail column 1 "³ Exhibit A · real time · seeded demo data".
3. 4.2–9.0 s — the last footage frame (all seven Matched, invoices INV-2026-0412…0430 visible) holds while the
   camera drifts to the counter and the Auto-match button area (0.70, 0.22) at 1.6×, local 4.4–8.6, ease
   `power1.inOut`. STATE CHANGE: 0 of 7 → 7 of 7. This is the demonstrated claim c101.

## Frame 4 — Outcome: the match rate

- src: compositions/frames/04-match-rate.html
- duration: 6.304s
- transition_in: cut
- beat: benefit_highlight
- role: metric
- scene_type: metrics/chart
- scene: One figure generalises the exhibit — the auto-match rate across the book, dated
- voiceover: "Overall, ninety-eight point five percent of transactions match with no human touch."
- focal: the numeral 98.5%
- roles: metric-numeral, label, footnote-rail
- sfx: none
- text: "98.5%⁴" @ 0.3-6.304
- text: "of transactions matched / without a human touch" @ 0.7-6.304
- text: "⁴ Auto-match rate · as of 2026-08-31" @ 0.7-6.304
- asset_candidates:
- asset_note: typographic metric card — the number is sourced (metrics.csv:6), not recorded; no asset shows it

1. 0.3 s — "98.5%⁴" as a static accent numeral, Space Grotesk 700 at 160 px, x 0.05W, top y 0.30H; it appears,
   it does not count (concept 4).
2. 0.7 s — label below it (Inter 400, 40 px, ink, two lines) and rail column 1 "⁴ Auto-match rate · as of
   2026-08-31". First outcome at 18.39 s (QA-05 ≤ 20 s for investors). Hard cut back to the exhibit.

## Frame 5 — Exhibit B: Audit trail

- src: compositions/frames/05-audit-trail.html
- duration: 8.5s
- transition_in: cut
- beat: feature_showcase
- role: ui
- scene_type: product-ui
- evidence_tier: A
- capture_window: 5.9-8.25
- capture_hold: 6.15
- capture_drift: 0.82,0.40 1.8 @ 2.5-7.9
- scene: One matched line opens its audit trail — imported, matched, posted, approved
- voiceover: "Open any line, and the trail your auditor asks for is already there."
- blueprint: device-surface-showcase
- focal: the Audit trail panel for INV-2026-0418
- roles: exhibit, margin-note, footnote-rail, cursor
- sfx: click @ 0.56
- text: "Every match keeps / its audit trail" @ 0.9-8.5
- text: "Exhibit B · real time · seeded demo data" @ 0.9-8.5
- asset_candidates: assets/footage.mp4 — tier-A screen recording 3840x2160, window 5.9–8.25 (row Sep 03 opens its audit trail)

1. 0.0–2.35 s — footage 5.9–8.25 at 1×. Autozoom segment 2 zooms to the Sep 03 Coldharbour Packaging row
   (arrives footage 6.459); the cursor clicks it at local 0.56; the Audit trail panel for INV-2026-0418 opens
   on the right (four steps: bank line imported, matched, posted to the ledger, approved for close).
2. 0.9 s — margin note "Every match keeps / its audit trail" and rail column 1 "Exhibit B · real time · seeded
   demo data" (no number on this exhibit, so no marker).
3. 2.35–8.5 s — the last footage frame holds; the camera drifts from the zoomed row to the panel (0.82, 0.40)
   at 1.8×, local 2.5–7.9, `power1.inOut`, so the four audit steps become legible. STATE CHANGE: no panel →
   the line's full trail.

## Frame 6 — Exhibit C: Close checklist

- src: compositions/frames/06-close-checklist.html
- duration: 8.0s
- transition_in: cut
- beat: feature_showcase
- role: ui
- scene_type: product-ui
- evidence_tier: A
- capture_window: 8.25-12.1
- capture_hold: 4.15
- capture_drift: 0.50,0.45 1.5 @ 4.0-7.6
- scene: Close September opens the checklist and every step ticks on its own
- voiceover: "Close the month, and the checklist runs on its own."
- blueprint: agent-progress-theater
- focal: the checklist ticks landing one after another
- roles: exhibit, margin-note, footnote-rail, cursor
- sfx: click @ 0.73
- text: "Close checklist, / run by Ledgerly" @ 0.8-8.0
- text: "Exhibit C · real time · seeded demo data" @ 0.8-8.0
- asset_candidates: assets/footage.mp4 — tier-A screen recording 3840x2160, window 8.25–12.1 (Close September checklist)

1. 0.0–3.85 s — footage 8.25–12.1 at 1×. The camera re-aims to the Close September button (autozoom segment 2,
   arrives footage 8.975); the cursor clicks it at local 0.73; the "Close September" sheet opens and its
   checklist ticks one step after another (footage ~9.4–11.6, local ~1.2–3.4); "Lock period" becomes active.
2. 0.8 s — margin note "Close checklist, / run by Ledgerly"; rail column 1 "Exhibit C · real time · seeded demo
   data".
3. 3.85–8.0 s — the last frame (every step ticked, Lock period enabled) holds; the camera drifts to the sheet
   (0.50, 0.45) at 1.5×, local 4.0–7.6, `power1.inOut`. STATE CHANGE: open checklist → all steps ticked.
4. Bed: dropout begins in the next frame, not here.

## Frame 7 — Exhibit D: Lock period (STAR)

- src: compositions/frames/07-lock-period.html
- duration: 9.5s
- transition_in: cut
- beat: feature_showcase
- role: ui
- scene_type: product-ui
- evidence_tier: A
- capture_window: 12.1-15.3
- capture_hold: 6.3
- capture_drift: 0.47,0.71 1.8 @ 3.4-9.2
- poster: 5.5
- scene: Lock period — the "September locked" badge lands; the month is closed with its trail attached
- voiceover: "Lock the period, and September is closed, with its trail attached."
- blueprint: device-surface-showcase
- focal: the "September locked" badge
- roles: exhibit, margin-note, footnote-rail, cursor
- sfx: click @ 0.71, success @ 0.75
- text: "September locked, / trail attached" @ 1.0-9.5
- text: "Exhibit D · real time · seeded demo data" @ 1.0-9.5
- asset_candidates: assets/footage.mp4 — tier-A screen recording 3840x2160, window 12.1–15.3 (Lock period, September locked)

The STAR moment — the only one. Planned first.

1. 0.0–3.2 s — footage 12.1–15.3 at 1×. Autozoom segment 3 pushes in on the Lock period button (arrives
   footage 12.809); bed dropout local 0.30–0.70; the cursor clicks at local 0.71; the dark "September locked"
   badge appears at local ~0.75 (hero entrance, bed lock); camera eases back out by local 2.7.
2. 1.0 s — margin note "September locked, / trail attached"; rail column 1 "Exhibit D · real time · seeded
   demo data".
3. 3.2–9.5 s — the final footage frame holds; the camera drifts to the badge (0.47, 0.71) at 1.8×, local
   3.4–9.2, `power1.inOut`. The poster (5.5 s) is this settled close-up: checklist ticks above, "Lock period" and
   "September locked" side by side. STATE CHANGE: open period → locked. Demonstrated text claim c102.

## Frame 8 — Traction

- src: compositions/frames/08-traction.html
- duration: 9.547s
- transition_in: cut
- beat: social_proof
- role: metric
- scene_type: metrics/chart
- scene: Three dated figures in three tinted cards, each footnoted in the rail column beneath it
- voiceover: "240 finance teams now close on Ledgerly, and they expand: net revenue retention is 118 percent."
- focal: the three accent numerals, left to right
- roles: eyebrow, metric-card x3, footnote-rail
- sfx: none
- text: "Traction: teams stay and expand" @ 0.2-9.547
- text: "240⁵ / active teams" @ 0.3-9.547
- text: "⁵ Active accounts · as of 2026-08-31" @ 0.5-9.547
- text: "3.1 days¹ / average close" @ 2.4-9.547
- text: "¹ Avg. close · as of 2026-06-30" @ 2.6-9.547
- text: "118%⁶ / net revenue retention" @ 7.3-9.547
- text: "⁶ NRR · as of 2026-06-30" @ 7.5-9.547
- asset_candidates:
- asset_note: dashboard beat (frame.md treatment 2) — figures come from metrics.csv, not from any captured asset

1. 0.2 s — eyebrow "Traction: teams stay and expand" (the conclusion written on the chart).
2. Three `metric-card`s (4 % accent fill, 20 % accent border, 14 px radius, no shadow) at x 0.05W, 0.36W,
   0.67W, each w 0.28W, top y 0.30H, h 0.34H; numeral Space Grotesk 700, 120 px, accent; label Inter 400, 34 px,
   ink. Left to right: 240 active teams (0.3 s, spoken at 0.0), 3.1 days average close (2.4 s, on the spoken
   "close"), 118% net revenue retention (7.3 s, spoken at 7.33). They appear, never count. Until 7.3 s the third
   card slot is an empty tinted card, so the row's geometry never shifts.
3. Each card's rail entry lands 0.2 s after it, in the rail column directly beneath that card. Marker ¹ is
   reused on purpose: the same figure, the same footnote.
4. TODO(MRR growth rate / window not in metrics.csv): MRR (c009, EUR 45,600) stays off screen — traction is
   shown only where `number · rate · window` can be honoured.

## Frame 9 — Controller quote

- src: compositions/frames/09-controller-quote.html
- duration: 6.5s
- transition_in: cut
- beat: social_proof
- scene_type: quote-card
- scene: A controller's own words, verbatim, footnoted as undated site copy
- blueprint: titlecard-reveal
- focal: the quote
- roles: quote, attribution, footnote-rail
- sfx: none
- text: "“We went from a 12-day close / to under 4.”⁷" @ 0.3-6.5
- text: "Priya Menon, Controller, / Harborline Logistics (fictional)" @ 0.8-6.5
- text: "⁷ Customer quote, company site · undated" @ 0.8-6.5
- asset_candidates:
- asset_note: quote card — no customer photo or logo exists (gap no-logos); type only

1. 0.3 s — the first sentence of quote c008, verbatim, Space Grotesk 500, 64 px, ink, in the card layout;
   "12" and "4" stay ink (they are the customer's words, not our figures).
2. 0.8 s — attribution, Inter 400, 32 px, muted, 2 lines; rail column 1 "⁷ Customer quote, company site ·
   undated". No voice: the viewer reads it in silence under the bed (never read the screen).

## Frame 10 — Why now

- src: compositions/frames/10-why-now.html
- duration: 5.5s
- transition_in: cut
- beat: why_now
- scene_type: title-card
- scene: The why-now line of the statement is left blank on purpose, because nothing sourced supports one
- voiceover: "Why now? We have not sourced that claim yet, so this line stays blank."
- blueprint: titlecard-reveal
- focal: the "intentionally left blank" line
- roles: eyebrow, headline, footnote-rail
- sfx: none
- text: "Why now" @ 0.3-5.5
- text: "This line is intentionally / left blank." @ 0.8-5.5
- text: "No sourced why-now claim on file" @ 1.0-5.5
- asset_candidates:
- asset_note: typographic beat — the beat is a stated gap; nothing may be shown in its place

TODO(why-now — no file, metric or URL in the repo states one): this card keeps the investor 7-beat structure
without inventing a market claim. Replace it only with a sourced item (a dated market figure or a regulatory
date with a URL) added to `claims-index.json`.

1. 0.3 s — eyebrow "Why now". 0.8 s — headline "This line is intentionally / left blank." in muted #5C6B7A
   (not ink: it is a blank line, not a claim). 1.0 s — rail column 1 "No sourced why-now claim on file".

## Frame 11 — Team

- src: compositions/frames/11-team.html
- duration: 5.0s
- transition_in: cut
- beat: team
- scene_type: title-card
- scene: The team in one dated line
- voiceover: "Two founders, both former finance controllers."
- blueprint: titlecard-reveal
- focal: the headline
- roles: eyebrow, headline, footnote-rail
- sfx: none
- text: "Team" @ 0.3-5.0
- text: "2 founders⁸, both former / finance controllers" @ 0.5-5.0
- text: "⁸ Team · as of 2026-09-01" @ 0.7-5.0
- asset_candidates:
- asset_note: typographic beat — no founder photos or names exist (gap)

1. 0.3 s — eyebrow "Team". 0.5 s — headline, "2" in accent. 0.7 s — rail column 1 "⁸ Team · as of 2026-09-01".
2. TODO(founder names and one credential per founder — metrics.csv:11 gives one combined line only).

## Frame 12 — The Ask

- src: compositions/frames/12-the-ask.html
- duration: 9.0s
- transition_in: cut
- beat: cta
- scene_type: title-card
- scene: The ask as a statement entry — amount, milestone, deadline, contact, dated
- voiceover: "We are raising one and a half million euros to reach 500 active accounts by December fifteenth."
- blueprint: titlecard-reveal
- focal: EUR 1,500,000
- roles: eyebrow, amount, milestone, contact, footnote-rail
- sfx: none
- text: "The Ask" @ 0.3-9.0
- text: "EUR 1,500,000 ⁹" @ 0.5-9.0
- text: "⁹ Ask terms · as of 2026-09-01" @ 0.7-9.0
- text: "to reach 500 active accounts / by 2026-12-15" @ 3.3-9.0
- text: "founders@ledgerly.example" @ 6.2-9.0
- asset_candidates:
- asset_note: typographic ask card — all four terms verbatim from metrics.csv rows 7–10

1. 0.3 s — eyebrow "The Ask". 0.5 s — "EUR 1,500,000⁹", Space Grotesk 700, 120 px, accent, top y 0.26H. 0.7 s —
   rail column 1 "⁹ Ask terms · as of 2026-09-01".
2. 3.3 s — milestone and deadline (spoken "500" at 3.5), Space Grotesk 500, 48 px, ink, two lines, y 0.44H.
   6.2 s — contact, Inter 500, 40 px, ink, y 0.62H. Values verbatim (no rounding, the date stays ISO on screen).

## Frame 13 — End card

- src: compositions/frames/13-end-card.html
- duration: 4.0s
- transition_in: cut
- beat: cta
- role: cta
- scene_type: logo-outro
- scene: Wordmark, tagline and the one call to action, then the AI-narration disclosure
- voiceover: "Write to founders at ledgerly dot example."
- blueprint: titlecard-reveal
- focal: the CTA line
- roles: logo, tagline, cta, disclosure
- sfx: none
- text: "Ledgerly" @ 0.0-4.0
- text: "Month-end close in days, not weeks" @ 0.4-4.0
- cta: "Raising EUR 1,500,000 / founders@ledgerly.example" @ 0.8-4.0
- order: logo -> tagline -> URL
- stagger: 0.4s
- text: "Narration is AI-generated." @ 1.2-4.0
- asset_candidates:
- asset_note: end card per QA-13 — no logo file was captured (asset catalog empty), so the wordmark is set in Space Grotesk 700

1. 0.0 s — "Ledgerly" wordmark, Space Grotesk 700, 72 px, ink, centred at y 0.30H (first logo of the video).
2. 0.4 s — tagline (the runner-up promise, site/index.html:28), Inter 400, 40 px, muted, y 0.42H.
3. 0.8 s — the one CTA as a solid accent pill (`cta-button`), Space Grotesk 600, 40 px, white on #2A6F97, two
   lines, y 0.52H; held 3.2 s (QA-13 ≥ 2.5 s). Spoken by the VO.
4. 1.2 s — "Narration is AI-generated." in the rail position (x 0.05W, y 0.775H), Inter 400, 24 px, muted —
   not a CTA, not a tagline. End card 4.0 s = 4.4 % of runtime (QA-13).

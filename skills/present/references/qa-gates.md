# QA gates, scorecard, vision critic (Quality standard)

Phase: gates QA-01…QA-14, scorecard and in-session critic = MVP; critic calibration, pairwise
regressions, nightly CI = v1. Producer: `scripts/wowprobe.py` (implemented 2026-09-20; exit 3 when a
measured gate fails) → `QA/wowprobe.json` with `gates_failed` / `not_measured`; `hyperframes check --json
--frame-check` → `QA/check.json`; `animation-map.mjs` → `animation-map.json` (QA-11); post-render contact
sheet + 12 keyframes (`wowprobe.py`, ffmpeg) → `QA/contact-sheet.png`, `QA/frames/`; pre-render frames at
the same sampling points → `hyperframes snapshot --at`. Run by `/power-presentation:present-qa`. The
storyboard gates read the plugin keys and the `- text: "…" @ start-end` timeline described in
`agents/story-director.md`; waivers are `QA.md` bullets `- QA-xx <subject>: <reason> (snapshot: <png>)`.

**Ship definition:** all 14 gates pass, scorecard ≥ 80/100, critic mean ≥ 3.0/4 with no
dimension < 2. "Passed `check`" alone is not a criterion. A **hard** gate always blocks; a
**default** gate can be overridden by the brief (`reveal`, `register`, `duration`) and the override
is recorded in `run-report.json.brief_overrides`. A **waiver** is a documented skip citing a snapshot
in `QA.md`. For non-UI products a product frame is any role `terminal|code|api|diagram|design|file`,
not only `ui|demo|recording`.

## 1. Ship gates

| ID | Rule | Threshold | Measurement | Type |
| --- | --- | --- | --- | --- |
| QA-01 | Duration | brief ±3 %; inside the destination band (§ 2) | `ffprobe format=duration` | ±3 % hard; band default |
| QA-02 | Composition valid | `ok:true`, 0 errors after triage; a `data-layout-allow-*` waiver cites a snapshot in `QA.md` | `hyperframes check --json --frame-check` | hard |
| QA-03 | Hook ≤ 3 s | hook element (problem/promise/thesis) visible by 3.0 s; no black frame (YAVG < 26/255) without an element in the first second | `wowprobe.py` signalstats + role `hook` | hard |
| QA-04 | First product frame | ≤ 5 s marketing/sales; ≤ 10 s investors (research G6, vendor data); `reveal: story-first` up to 25 s | frame role in `STORYBOARD.md` + critic marks | default |
| QA-05 | First outcome | ≤ 12 s marketing/sales; ≤ 20 s investors | role `outcome\|metric` | default |
| QA-06 | Motion sidecar | hero `appearsBy` ≤ 0.5 s; `maxStaticSec` 2.0 (end card: QA-13 ceiling); 0 `motion_*` findings | `*.motion.json` via `check` | hard |
| QA-07 | Frozen share | ≤ 25 % of runtime, window ≤ 2.5 s (end card per QA-13); declared holds subtracted — a frame's `hold:` from its start, or `capture_hold: <s>`, the held tail after its `capture_window` | `freezedetect=n=0.001:d=1.0` | default |
| QA-08 | Loudness | \|I − target\| ≤ 1 LU, TP ≤ −1 dBTP; target −14 (social, VO), −16…−18 (VO premium/investors), −18…−20 (music-only, cinematic hero); master, not transcode | `ebur128=peak=true` (EBU R 128-2023) | hard |
| QA-09 | Cadence | ASL 2–6 s marketing, 4–8 s sales/investors; shot ≤ 12 s unless declared continuous camera | `gt(scene,0.25)` in `wowprobe.py` | default |
| QA-10 | Reading floor | text ≥ max(1.2 s, chars/20 cps) — English,; ≤ 42 chars/line, ≤ 2 lines | `STORYBOARD.md` timeline | hard |
| QA-11 | Easing lint | 0 `linear` on enters/exits, 0 tweens < 0.2 s, ≥ 3 easings, stagger ±20 % of median; `back.out` only with `register: playful` | `animation-map.mjs` | default |
| QA-12 | Truth of numbers | every visible number is in `claims-index.json` with `source` (writes `claims.json`; same artifact — names it `claims-index.json`, the GS-02 fixture file is `claims.json`) | regex over storyboard + frame HTML | hard |
| QA-13 | End card | 2.5–4.0 s; ≥ 45 s videos additionally ≤ 12 % of runtime; 10–30 s cuts ≤ 4 s absolute; one CTA ≥ 2.5 s; logo→tagline→URL, stagger 0.4 s | last frame of `STORYBOARD.md` | default |
| QA-14 | Contrast, captions, fonts | WCAG AA 4.5:1 (3:1 large text; ≥ 7:1 display is advice, not a gate); caption keep-out y ≥ 0.82; `document.fonts.check` for every declared face; whisper `--language en` | `check --caption-zone`, `check.json` | hard |

Gate owners (by the "measurement" column, mirrored in `wowprobe.py` `GATES[].owner`): ffmpeg/`wowprobe.py`
QA-01 (`ffprobe format=duration` on the master), QA-03, QA-07, QA-08, QA-09; `STORYBOARD.md` — QA-04, QA-05,
QA-10, QA-12, QA-13; HyperFrames — QA-02, QA-06, QA-11, QA-14. Note: the checklist lists QA-01 under the
storyboard group (the planned duration can be pre-checked from the timeline), but the gate itself is measured by
ffprobe post-render.
Investor notes: "product ≤ 10 s → 100, 25 s → 0" and "≥ 40 % product runtime" are scorecard targets,
not lint failures; the ≤ 12 % end-card share does not apply under 45 s (12 % of 20 s = 2.4 s < 2.5 s).
Rhythm (a state change every 2–4 s) is; QA-09 measures cuts only.

## 2. Length bands for QA-01 (plugin accepts 10–180 s; working zone 45–90 s)

| Destination | Band |
| --- | --- |
| Social cut | 15–30 s; X 15–45 s; LinkedIn 30–90 s |
| Product-page hero loop | 10–20 s, muted |
| Product Hunt | 30–75 s |
| Hero launch | 45–90 s |
| Sales outreach | 30–60 s |
| Investors demo | 60–120 s; data-room cut ≤ 180 s |

## 3. Proxy scorecard 0–100 (`wowprobe.py`; trend in `evals/results/trend.tsv`)

≥ 80 → candidate for the critic; 60–79 → automatic scene revision; < 60 → re-plan the storyboard.

| Metric | Weight | 100 points when |
| --- | --- | --- |
| Hook speed (to first outcome) | 15 | ≤ 4 s, linear to 0 at 12 s; investors: 100 at product ≤ 10 s, linear to 0 at 25 s |
| Product-frame share | 15 | ≥ 50 % sales, ≥ 35 % marketing, ≥ 40 % investors |
| Liveliness | 15 | 100 − 2 × frozen % |
| Cadence | 10 | ASL inside the QA-09 band and shot ≤ 12 s; −10 per second outside |
| Beat lock | 10 | ≥ 80 % of reveals within ±0.15 s and hero enters within ±0.10 s of a cue |
| Loudness | 10 | inside QA-08 tolerance; −10 per LU; 0 when TP > 0 |
| Reading comfort | 10 | 100 − 10 × reading-floor violations (QA-10) |
| Craft lint | 10 | 100 − 5 × (animation-map flags + `check` warnings) |
| Ending discipline | 5 | end card per QA-13; otherwise 50/0 |

## 4. Vision critic — 3 votes, 7 dimensions, adversarial

Input: contact sheet 1920×1080 (6 columns, 1 frame/s, timecodes) + 12 frames 960×540 taken at
frame 0, +0.5 s, scene midpoints, ±0.2 s around cuts; plus storyboard, brief and `wowprobe` JSON.
The critic never sees the worker's explanations. Scale 0–4; **pass = mean ≥ 3.0 and minimum ≥ 2**;
3 votes, `ship` by majority. Agents: `critic-design` (C3, C6), `critic-readability` (C4),
`critic-pacing` (C1, C7), `critic-brand` (C5); C2 is fed by `claims-auditor` and the tier record.
Cost of one 3-vote pass: $0.10 Sonnet, $0.26 Opus, $0.05 Haiku. Works under (PNG read
in session, no API key). Calibration before it may block CI: Spearman ≥ 0.7 against human labels
on 28 videos (22 references + 6 brag renders), 2 labelers, third on disagreement — v1.

| Dim | 4 | 0 |
| --- | --- | --- |
| C1 Hook clarity | category and benefit clear by 3 s without sound | logo/black until ≥ 8 s |
| C2 Product credibility | tier A/B material or tier C labelled `reconstructed` | lorem ipsum, foreign brand, unlabelled mockup |
| C3 One idea per scene | one focus, line limits per QA-10 | ≥ 3 text blocks, a whole dashboard |
| C4 Readability | hero text not below the size, nothing clipped | text < 2 % of frame height, overlaps |
| C5 Brand | palette, font, logo exactly per `frame.md` preset and brand kit | recoloured logo, foreign gradient |
| C6 Motion craft | a shared element holds position across the cut, enters "in motion" | pops, everything already in place |
| C7 Ending and CTA | one CTA, logo→tagline→URL, length per QA-13 | no CTA, wall of text, card longer than the QA-13 ceiling |

## 5. Creative checklist (story-director, before render)

1. Hook: promise ≤ 60 chars, noun + number/deadline/alternative; no logo before 3 s.
2. One idea per screen: one focus, one claim; line limits per QA-10; copy authored in English.
3. Show the product: ≥ 1 real-product scene or its non-UI equivalent; every highlight has before ≠ after.
4. No generic phrases: stop-list and replacement formula.
5. Reading floor per QA-10; split the scene instead of speeding text up.
6. Easing: ease-out on enters, ease-in on exits, no `back.out`; auto-zoom  (QA-11).
7. End card per QA-13: one CTA shown and, with VO, spoken.

## 6. After the run (protocol)

Gate failure or scorecard 60–79 → scene auto-fix; < 60 → storyboard. One revision round by default,
a second only by flag within `budget_usd`. `run-report.json` records `gates_failed`,
waivers with snapshots, synthetic assets and the disclosure line (run-report-schema.md).

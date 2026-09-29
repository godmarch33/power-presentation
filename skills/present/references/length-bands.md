# Length bands, duration gate and VO word budget

Phase: MVP.

## Range

- The plugin accepts `--duration 10–180` s (QA-01).
- Working zone / sweet spot: **45–90 s** (QA-01 note).
- There is no single "right" runtime: the band comes from the destination.

## Destination bands (QA-01 table)

| Destination | Band | Typical mode |
|---|---|---|
| Social cut | 15–30 s; X 15–45 s; LinkedIn 30–90 s | marketing |
| Hero loop on the product page | 10–20 s, muted | marketing |
| Product Hunt | 30–75 s | marketing |
| Hero launch | 45–90 s | marketing |
| Sales outreach | 30–60 s | sales |
| Investors demo | 60–120 s; data-room cut ≤ 180 s | investors |

Mode defaults when `--duration` is omitted: there is no single default per mode; `/present` asks (interview question) or picks the band's lower edge and prints the decision under `--yes`.

## QA-01 gate

| Part | Rule | Type | Measured by |
|---|---|---|---|
| Duration vs brief | delivered duration = brief duration **±3 %** | **hard** | `ffprobe format=duration` |
| Band | inside the destination band above | default (overridable by the brief, recorded in run-report) | same |

Worked example: a 45 s brief must land in 43.65–46.35 s. A 20 s brief allows 19.4–20.6 s.

## Interactions with other gates

- End card length depends on total runtime (QA-13): 2.5–4.0 s; ≥ 45 s videos additionally ≤ 12 % of runtime; 10–30 s cuts ≤ 4 s absolute. The 12 % rule is not applied under 45 s because 12 % of 20 s = 2.4 s < 2.5 s (note).
- Product beats (marketing/sales): 5–7 beats × ≥ 3 s — that alone is 15–21 s of product time, which is why a 15 s cut uses a card-based archetype (story table).
- Cadence bands scale with mode, not length: ASL 2–6 s marketing, 4–8 s sales/investors (QA-09).
- Freeze share ≤ 25 % of runtime, window ≤ 2.5 s (QA-07) — declared holds are subtracted.
- Story archetype is chosen by length and audience (story table): 15 s / 30 s / 60 s / 90–120 s rows.

## VO word budget

Base pace 150 wpm; investor 130–145 wpm; promo 160–180 wpm; ≤ 18 words per phrase; 0.8–1.2 s pause on scene change.

Word budget at that pace:

| Duration | ≈ words |
|---|---|
| 60 s | ≈ 125 |
| 90 s | ≈ 190 |
| 120 s | ≈ 255 |

Rules that ride with the budget:
- Copy is authored in English; limits are counted in characters.
- Cards; on-screen text hold per QA-10 with the language's cps (see [captions.md](captions.md) for the cps table).
- The VO never reads the screen; every number in VO is also on screen because 85 % of feed video is watched muted (Digiday 2016, publisher self-reports, order of magnitude only).
- Frames 0–3 s contain a headline — this is what satisfies QA-03 when there is no VO.

## Baselines (measured 2026-09-18, for calibration only)

- brag examples: 20–23 s, end card 4–6 s (20–29 % of runtime) — fails QA-13.
- Vendor product-launch route: 41.8 s, end card 8 s (19 %) — fails QA-13.
- References: Linear Agent 0:55, Cursor 3 1:30, Screen Studio 0:45, ElevenLabs Reception 0:33 (table, observation).

## Skeleton status

Duration is measured by `scripts/wowprobe.py` (stub, exits 64 until the QA gates land). The band choice is written into `intake.json` / `BRIEF.md` `length` by `/present` (see `brief-schema.md`).

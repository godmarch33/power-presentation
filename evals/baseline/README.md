# Baseline — three routes on the MVP golden set

**Status: harness ready 2026-09-20; 2 of 7 runs measured (brag / GS-02, plugin / GS-02)** — see the table at the bottom for what has actually
been measured. The plan is one line: `/brag`, the raw HyperFrames route
and this plugin, one autonomous pass each on GS-01…GS-03, compared by `wowprobe` + `check` + the critic, budgeted at
≈ 1 day and $60–120 of tokens. The result is the `baseline` table below; this
directory holds the protocol, the raw runs (git-ignored) and the measured JSON.

## Protocol

1. **Fixtures** — `node scripts/golden-set.mjs build && node scripts/golden-set.mjs verify` (3/3 ok).
2. **Runs** — one autonomous pass per (route, fixture), no human touches beyond what the route itself asks:

   | Route | Fixtures | How | Notes |
   |---|---|---|---|
   | `brag` | GS-02 only | `/brag` on `examples/gs-02-ledgerly/site` (brag reads a local static site; no URL capture) | tone `polished`, `--duration` left to brag (15–25 s law); its own `check` gate |
   | `hyperframes` | GS-01…GS-03 | `/hyperframes` → `product-launch-video`, brief written by hand from the fixture README (audience, length, URL / repo), then the workflow's own steps | the vendored copy at `v0.8.47` (`vendor/`); `HYPERFRAMES_SKIP_SKILLS=1` |
   | `plugin` | GS-01…GS-03 | `/present --for <mode> --duration <n> … --yes` (fixture README invocation) | **blocked**: nothing renders yet (the render / frame-worker path is not wired), so this row stays `not_run` |

   Each run's deliverables go to `evals/baseline/runs/<route>/<gs>/`: `final.mp4` (the delivered master — for brag
   the mp4 *before* the poster bake, so QA-03 sees the real open), `STORYBOARD.md` when the route wrote one in the
   plugin contract, `QA/check.json`, `animation-map.json`, `notes.md` (tokens, wall time, what the route was told).
3. **Measure** — `node scripts/baseline.mjs measure` runs `wowprobe.py` post-render on every `final.mp4`
   (`--target-lufs` −14 for the marketing / sales cuts — the "social / VO" row; `--destination` per fixture;
   `--brief-duration` = the fixture length, so QA-01 reads against the golden brief, not the route's own choice),
   keeps the contact sheets for the critic and writes `baseline.json` + `trend.tsv`.
   `node scripts/baseline.mjs table` prints the markdown block of that table.
4. **Critic** — three votes on each contact sheet (`/power-presentation:present-qa post-render`), recorded next to the
   run as `QA/critic.json`; pairwise A/B against the previous best is v1.

What the table can and cannot say: the ffmpeg gates (QA-01/03/07/08/09) are measured for every route; the
storyboard gates need a storyboard in the plugin contract (brag has none — those gates are `not_measured` for it,
exactly as the research baseline of 2026-09-18 could only measure the ffmpeg side of the brag examples); the
HyperFrames gates need `check.json` / `animation-map.json` from the composition.

## Reference numbers already on file (research, 2026-09-18 — not this harness)

A study of 2026-09-18 measured brag's six shipped examples and HeyGen's vendor outputs with the
prototype probe: brag 20–23 s, 0 cuts, 54–69 % frozen, −24…−28.5 LUFS, end cards 20–29 % of runtime; the vendor's
`website-to-hyperframes` demo 41.8 s, 10 cuts / 3.8 s ASL, 0 % frozen, −20.6 LUFS, 14 `content_overlap` errors on
`check`. Those numbers set the bar on 2026-09-18; the baseline line below is the
same measurement on the golden set, by this repo's probe.

## Baseline (measured by `scripts/baseline.mjs`; brag 2026-09-20, plugin / GS-02 v2 2026-09-27)

| Route | Fixture | Dur (s) | Cuts / ASL | Longest shot | Frozen % | Black open | LUFS / LRA / TP | First product / outcome | check | Gates failed | Not measured | Scorecard |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| brag | GS-02 | 20.0 | 0 / 20.0 | 20.0 | 46.2 | no | -24.2 / 1.3 / -3.3 | — / — | ok | QA-01, QA-03, QA-07, QA-08, QA-09, QA-11 | QA-04, QA-05, QA-06, QA-10, QA-12, QA-13 | 21.5 (45/100 measured) |
| hyperframes | GS-01 | — | — | — | — | — | — | — | — | *not_run* | — | — |
| hyperframes | GS-02 | — | — | — | — | — | — | — | — | *not_run* | — | — |
| hyperframes | GS-03 | — | — | — | — | — | — | — | — | *not_run* | — | — |
| plugin | GS-01 | — | — | — | — | — | — | — | — | *not_run* | — | — |
| plugin | GS-02 | 59.6 | 11 / 5.0 | 7.3 | 0.0 | no | -14.4 / 3.5 / -1.4 | 3.2 / 6.3 | ok | none | none | 84.1 (90/100 measured) |
| plugin | GS-03 | — | — | — | — | — | — | — | — | *not_run* | — | — |

Reading the measured rows (`runs/<route>/gs-02/notes.md` has the run facts; `QA/wowprobe.json` the full gate table):

- **brag / GS-02** — a 20 s polished-tone brag pass on the Ledgerly site, `check` clean (0 errors). Against the golden
  brief it fails **six gates**: QA-01 (20 s vs the 60 s sales brief, outside the 30–60 s band — brag's 15–25 s law),
  QA-03 (no storyboard, so no `hook` role by 3 s can be shown — the black-open half passes: hook copy is on screen
  at 0.25 s), QA-07 (46 % frozen: brag's fast-in-then-hold holds — five windows of 1.0–1.9 s), QA-08 (−24.2 LUFS vs
  −14 with the bed at brag's 0.35 policy — the same −24…−28 LUFS the research measured on brag's own examples),
  QA-09 (0 hard cuts: brag's crossfades never trip `gt(scene,0.25)`, so ASL = the whole runtime), QA-11 (`back.out`
  on the cards without `register: playful`). QA-02 and QA-14 pass; the storyboard gates and the beat lock are
  `not_measured` (brag writes no storyboard; no cuts or timed entrances to lock). Scorecard 21.5 over the 45 points
  that could be measured (liveliness 7.7, cadence 0, loudness 0, craft lint 85).
- **plugin / GS-02** (v2, 2026-09-27) — the 60 s sales cut through `scripts/render-path.mjs`: Kokoro VO, 12 frames
  (5 footage frames on held clips of the seeded Ledgerly app with the auto-zoom camera and a hold drift), burned-in
  captions, no bed by design, 16:9 master + the 9:16 reflow. **No gate fails and nothing is unmeasured**: 11
  cuts at a 5.0 s ASL (longest 7.3 s), 0 % frozen, −14.4 LUFS, hook copy at 0.2 s, product at 3.2 s, outcome at 6.3 s,
  `check` ok in both formats. Scorecard **84.1** over 90 measured points: product share 100 (51.5 %), liveliness,
  cadence, loudness, reading comfort and ending at 100, hook speed 71.2 (first outcome at 6.3 s), craft lint 0 (168
  raw animation-map flags + 13 `check` warnings; the QA-11 gate passes). **Vision critic: SHIP** — 2 of 3 votes pass,
  mean 3.05 (C1 3/3/3, C2 4/4/4, C3 3/2/3, C4 3/3/3, C5 2/3/4, C6 2/1/2, C7 4/4/4; `QA/critic.json`). Open critic
  notes: motion craft is the weak dimension (frame 5's hold drift reaches 2.2×, above the 1.5–2× zoom band — now
  clamped by `render-path`; the hook reads fully built at the baked poster frame 0); the fixture app's amber
  "synthetic" banner is off-palette. v1 (2026-09-26, scorecard 74.1, critic mean 1.9) is superseded.
- **plugin / GS-01, GS-03** and **hyperframes / GS-01…GS-03** — `not_run`. The raw-HyperFrames passes are the next
  step of this baseline (the vendored workflow + a hand-written brief per fixture, ≈ 1–2 h of agent time each).

What this first row already says: the brag route's measured profile on the golden set matches the
2026-09-18 research numbers (holds instead of cuts, quiet bed, short cut), so the bar ("frozen share and shots per
minute are what separate generated-looking output from references") is confirmed on a fixture the plugin controls,
by the plugin's own probe. The `baseline` line is this table; it is updated as rows land.

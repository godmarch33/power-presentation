# GS-02 investors (Ledgerly, local site + metrics.csv) — unattended rerun, 2026-09-27 18:05–19:06

`node scripts/autonomous-run.mjs --run gs-02-investors` at f99f240, `bwrap` isolation, throttle `nice 10, cpus
0-3,5-7,16-19,21-23`, `POWER_PRESENTATION_MAX_AGENTS=2`. Invocation: `--for investors --duration 90 --local ./site
--metrics metrics.csv --yes`. The first pass (13:51–15:31, at 53c8aa6) delivered nothing; its six defects (F1–F6
below) were fixed before this rerun.

**Outcome: delivered and ships.** `ledgerly-investors_16x9.mp4`, 90.27 s (0.3 % off the brief), Kokoro VO + pack
bed + SRT. 16:9 master: post-render `gates_failed: []` (14/14), scorecard 82.1 at run time (beat lock 57.7, craft
lint 0 under the old formula) — **91.6 re-scored with the craft-lint option-3 formula (5b51383)**: craft lint 93.6
(196 flags = 155 collision (weight 0) + 38 paced-slow + 3 offscreen over 173 tweens → 1.27 weighted per 10 tweens;
the 17 check warnings are all benign codes). Vision critic SHIP 3/3 votes, mean 3.57, lowest dimension 2 (one
design vote on C3/C6: traction numbers laid out dashboard-style, some big numbers only fade in; the other two votes
gave 3–4, so no revision round). `mode.investors` has the metrics file, the ask card (frame 12), traction
verbatim and the TTS-placeholder flag; 21/21 claims confirmed against `metrics.csv` / the site. Product first at
9.4 s (≤ 10), first result at 18.4 s (≤ 20), −17.2 LUFS.

$17.13 (ok), 97 turns, 3666 s session wall; `run-report.json` `time.wall_s` 2826 s (first stamp → last).
Wall-time target missed at the 2-agent cap (accepted until the BIOS fix). Stage seconds (`pp-stages.json`): frames 1147,
storyboard 832, verify 212 (3 passes), pitch 156, review 125, audio 87, render 73, brief 68, capture 60, inspect 27,
intake 25, deliver 24, assemble 14.

Content decisions the run made and reported (not defects): "Why now" is left blank on purpose (no dated, sourced
reason in the inputs); MRR (no period), "11 hours saved" (no date) and per-founder credentials are omitted; the
118 % retention figure has a date but no period; the end card says "Narration is AI-generated." The only installed
music pack is upbeat, which the run called off-tone for investors. HyperFrames telemetry went to
`us.i.posthog.com` — expected outside the `privacy=local` profile, and disclosed.

## First-pass defects (fixed before this rerun) and whether they held

| # | Defect (first pass) | Fix | This rerun |
| --- | --- | --- | --- |
| F1 | Staged plugin dropped `vendor/**/*.test.mjs` → drift, `--allow-drift` | 1b4c73f | no drift |
| F2 | QA-01 note said only "trim windows"; four ~65 s VO rewrites | 1612d26 | audio 87 s, 90.27 s on the first render |
| F3 | A 10.6 s footage window clipped a camera zoom to a 0.163 s tween → QA-11 | 4af8739 | QA-11 pass |
| F4 | A worker linked cdnjs gsap 3.12.5; only jsDelivr was localised | 60b1caa | egress = telemetry only |
| F5 | QA-11 staggers measured per tween, not per element | dbc5444 | QA-11 pass, no waiver |
| F6 | A ≥ 90 s render was sent to the background; the headless session ended with it | dd27210 | foreground, 73 s |

## Still open from this rerun

- The **cost estimate was pessimistic**: `render-path cost --estimate` said ~$30.25 for 13 frames ("OVER the default
  ceiling") and the run cost $17.13; GS-01 and GS-03 cost $18.13 / $19.15. Calibrated since (`COST_CALIBRATION`,
  × 0.63 → ~$19.06 for 13 frames).
- The run predates the wow features (bed automation, carve, beat snap, motion blur); GS-02 sales and the
  GS-03 rerun carry them.

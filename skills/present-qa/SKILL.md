---
name: present-qa
description: "Run the wow quality standard on a /present project: hyperframes lint and check, snapshot contact sheet, wowprobe gates QA-01…QA-14, the 0–100 scorecard, and the 3-vote vision critic panel (critic-design, critic-readability, critic-pacing, critic-brand, claims-auditor). Writes QA/wowprobe.json, QA/check.json, QA/contact-sheet.png and waivers in QA.md. Part of power-presentation; usually invoked by /present before render and again on the rendered master. Use when the user asks to check, verify, QA, score or review a video project, or whether it is ready to render or ship."
argument-hint: "[pre-render|post-render] [--yes]"
allowed-tools: Read, Glob, Grep, Write, Bash(npx hyperframes *), Bash(python3 *scripts/*.py *), Bash(node *scripts/*.mjs *), Bash(ffprobe *), Bash(ffmpeg *), Agent(power-presentation:critic-design), Agent(power-presentation:critic-readability), Agent(power-presentation:critic-pacing), Agent(power-presentation:critic-brand), Agent(power-presentation:claims-auditor)
---

# present-qa — 14 gates, a scorecard and three votes

The project is a run workspace, `<repo>/power-presentation-out/<name>/` (`/present` § 0a) — never the repository
root. Find it before anything else: the one folder under `power-presentation-out/` (several: the one the user names,
else the most recently changed, and say which); run every command as `cd "<P>" && …` with its absolute path, so
`--project .` below means that workspace.

Inside a `/present` run, `/present` § 0b holds here too: no text between tool calls — the user sees the plugin's
progress bar (`hooks/progress.sh`), the questions the run needs and its final report, never your working notes.

Status (v0.1.0, 2026-09-20): `hyperframes lint | check | snapshot` are real and `scripts/wowprobe.py`
is **implemented** — it measures every gate whose inputs it is given, writes `QA/wowprobe.json`
(`gates_failed`, `not_measured`, `gates`, `waivers`, `brief_overrides`, `scorecard`, `measurements`),
builds `QA/contact-sheet.png` + `QA/frames/*.png` from a master, and exits 3 when a measured gate fails.
A gate whose input is missing is `not_measured` with the reason — report it as "not measured", never as
passed. The critic agents are real prompts.

Arguments: `$ARGUMENTS` — `pre-render` (default when no master exists) or `post-render`.
Rules and thresholds: [`../present/references/qa-gates.md`](../present/references/qa-gates.md);
bands: [`length-bands.md`](../present/references/length-bands.md),
[`hook-timing.md`](../present/references/hook-timing.md),
[`loudness.md`](../present/references/loudness.md),
[`captions.md`](../present/references/captions.md).

"Wow" = all 14 binary gates pass, scorecard ≥ 80/100, vision critic mean ≥ 3.0/4 with no
dimension < 2, ship by majority of 3 votes. "Passed `check`" alone is not the criterion.

## 1. Run order ("Verify", timeouts)

```bash
npx hyperframes lint --json                                  # ≤ 10 s; stop-list → fail
npx hyperframes check --json --frame-check \
  --caption-zone "x0=0;y0=.82;x1=1;y1=1;severity=error" \
  > QA/check.json                                            # 180 s cap; keep-out y ≥ 0.82 (QA-14)
npx hyperframes snapshot --at <0,0.5,scene-midpoints,cut±0.2>  # ≤ 10 s; sampling points
HYPERFRAMES_SKILL_BOOTSTRAP_DEPS=1 node ~/.claude/skills/hyperframes-animation/scripts/animation-map.mjs . \
  --out .hyperframes/anim-map                                 # QA-11 input (animation-map.json); needs @hyperframes/producer once
# pre-render (storyboard + check groups):
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/wowprobe.py --storyboard STORYBOARD.md --claims claims-index.json \
  --check QA/check.json --animation-map .hyperframes/anim-map/animation-map.json --mode <mode> \
  [--reveal story-first] [--register playful] [--srt captions/en.srt] --out QA/wowprobe.json
# post-render (adds the ffmpeg group on the master; builds the contact sheet + 12 keyframes):
python3 ${CLAUDE_PLUGIN_ROOT}/scripts/wowprobe.py --video renders/final/<master>.mp4 --storyboard STORYBOARD.md \
  --claims claims-index.json --check QA/check.json --animation-map .hyperframes/anim-map/animation-map.json \
  --mode <mode> --target-lufs <QA-08 target> --destination <band> [--cues <track>.music-cues.json] \
  --out QA/wowprobe.json --sheet QA/contact-sheet.png --frames-dir QA/frames \
  --trend ${POWER_PRESENTATION_DATA:-.}/evals/results/trend.tsv --label <fixture-or-project>
```

Exit 0 = every measured gate passed; 3 = `gates_failed` non-empty (the list is in the JSON); 1 = ffmpeg /
input failure; 2 = usage. `--target-lufs` has no default: pick it from the QA-08 row for the destination
and mix (−14 social/VO, −16…−18 VO premium/investors, −18…−20 music-only) and record the choice.
`--brief-duration` defaults to the storyboard `duration:`; `--destination` to the mode's band. The
storyboard must declare its on-screen text as `- text: "…" @ start-end` bullets and the end card's
`- cta:`, `- order:`, `- stagger:` (agents/story-director.md) — QA-10, QA-12 and QA-13 are measured from
those bullets and nothing else. Waivers live in `QA.md` as `- QA-xx <subject>: <reason> (snapshot: <png>)`.

- `check` counts only when `lint.ok` is true and `layout.samples` is non-empty.
- Motion sidecars `*.motion.json` run inside `check`: hero `appearsBy` ≤ 0.5 s, `maxStaticSec` 2.0,
  0 `motion_*` findings (QA-06).
- Fonts: every visible face declared in `frame.md` with a real `@font-face` (the `## Staged fonts` rules
  `render-path packets` writes from `assets/fonts/`; never a Google Fonts fetch), `document.fonts.check`
  passes (QA-14); whisper runs as `large-v3|turbo --language en`. The script-coverage lint,
  glyph probe and `.en`-model lint were withdrawn on 2026-09-19 — English only.
- Contact sheet contract: 1920×1080, 6 columns, 1 frame/s with timecodes,
  plus 12 frames at 960×540 taken at frame 0, +0.5 s, scene midpoints and ±0.2 s around cuts
  → `QA/contact-sheet.png`. Owner: `scripts/wowprobe.py` builds the post-render sheet (1920 wide,
  320×180 tiles, one row per 6 s — the height follows the runtime, says 1920×1080) and
  the 12 960×540 keyframes (`QA/frames/NN-at-<t>s.png`, listed under `keyframes` in the JSON) from the
  master with ffmpeg; `snapshot --at` supplies the pre-render frames at the same sampling points and
  never writes `QA/contact-sheet.png`.

## 2. Gates by pass (QA-01…QA-14, table)

Which pass a gate belongs to follows its "measurement" column, not a choice made here:

| Pass | Gates | Measured on |
|---|---|---|
| pre-render | QA-02 check ok; QA-04 first product frame; QA-05 first result; QA-06 motion sidecar; QA-10 reading floor; QA-11 easing lint; QA-12 claims truth; QA-13 end card; QA-14 contrast/captions/fonts | `check --json`, `STORYBOARD.md` roles and timeline, `animation-map.mjs`, `claims-index.json`, frame HTML |
| post-render | QA-01 duration ±3 % and destination band; QA-03 hook ≤ 3.0 s and no black open (YAVG < 26/255); QA-07 freeze share; QA-08 loudness on the **master**; QA-09 cadence | `ffprobe`, `signalstats`, `freezedetect`, `ebur128`, scene detection in `wowprobe.py` |

- **Hard** gates always block shipping: QA-01 (±3 %), QA-02, QA-03, QA-06, QA-08, QA-10, QA-12,
  QA-14. **Default** gates (QA-01 band, QA-04, QA-05, QA-07, QA-09, QA-11, QA-13) may be overridden
  by the brief (`reveal`, `register`, `duration`) and the override is recorded in `run-report.json`.
- A waiver (`data-layout-allow-*`) is valid only with a snapshot cited in `QA.md` (QA-02).
- For non-UI products the product frame roles are `terminal|code|api|diagram|design|file`, not only
  `ui|demo|recording`.
- QA-12: run `power-presentation:claims-auditor` — every visible number, logo and quote must be in
  `claims-index.json` with a `source`; otherwise `unverified` → not shipped, and `gaps` are shown
  before render. Investors: traction numbers verbatim from `--metrics` with source and date;
sales: prospect record limits.

`QA/wowprobe.json` (`{gates_failed, not_measured, gates, waivers, brief_overrides, scorecard, …}`, schema
in `scripts/README.md`) and the trend line (`--trend`) are written **only by `scripts/wowprobe.py`**.
Never create or edit `QA/wowprobe.json` by hand — a hand-written all-pass file would unlock
`present-render` on nothing. Pre-render the ffmpeg gates are `not_measured` by construction; hand the
claims-auditor JSON to the run-report step as an attachment (it is not written into `wowprobe.json`).

## 3. Scorecard (0–100, 9 metrics)

Owned by `wowprobe.py`; weights and 100-point conditions are the table — do not restate them,
cite by name: hook speed 15, product-frame share 15, liveliness 15, cadence 10, beat lock 10,
loudness 10, reading comfort 10, craft lint 10, end-card discipline 5. Verdict bands:
≥ 80 → candidate for the critic; 60–79 → auto-revision of the failing scenes; < 60 → back to the
storyboard. Investors: product ≤ 10 s → 100, linear to 0 at 25 s, and ≥ 40 % product share, are
scorecard targets, not lint failures (QA-04 note).

## 4. Vision critic — three votes

Dispatch the panel in parallel — every vote in one message, in the foreground (`/present` § 0b). Every critic is adversarial: it receives only
`QA/contact-sheet.png`, the 12 snapshot frames, `STORYBOARD.md`, `BRIEF.md` and `QA/wowprobe.json`
— never the frame-worker's explanations. Each returns JSON
`{dimension, score (0–4), evidence (frame timecode), fix}` per dimension it owns:

| Agent | Dimensions (table anchors) |
|---|---|
| `critic-pacing` | C1 hook clarity, C7 ending and CTA; cadence QA-09 |
| `critic-design` | C3 one idea per scene, C6 motion craft |
| `critic-readability` | C4 readability; QA-10 floor, QA-14 contrast |
| `critic-brand` | C5 brand per `frame.md` preset and brand kit; QA-14 fonts, logo integrity |
| `claims-auditor` | QA-12 numbers; C2 product credibility via evidence tier per scene and `reconstructed` labels |

Before dispatch run `node ${CLAUDE_PLUGIN_ROOT}/scripts/critic.mjs prepare --project .` (it refuses when the
contact sheet, the 12 key frames or the briefing files are missing or off-spec). Write each agent's JSON to
`QA/critic/vote-<n>/<agent>.json`, then `node ${CLAUDE_PLUGIN_ROOT}/scripts/critic.mjs tally --project .` writes
`QA/critic.json` (exit 0 = ship, 3 = not ship) — the file `run-report.json` copies.
A vote = one complete C1–C7 sheet assembled from the panel. Pass = mean ≥ 3.0 and minimum ≥ 2;
`ship` by majority of three votes; the panel runs three times, one vote per pass.
The critic reads PNGs in session without an API key, so it also works under `--privacy local`.
Calibration (Spearman ≥ 0.7 vs 28 labelled videos), pairwise A/B regressions and
nightly CI are v1.

## 5. Loop, review protocol, budget

- One revision round by default; a second only by flag and with `budget_usd` left.
- Failed gate or scorecard 60–79 → the scene goes to auto-fix via `/power-presentation:present-edit` (inside a
  `/present` run: a new foreground dispatch of that frame's worker with the finding, `/present` § 7a step 6);
  < 60 → storyboard replanning by `story-director`.
- Human review before render: storyboard with pitch → `hyperframes snapshot` sketch → one-scene
  look (host composition render) → one question "render?". Silence or `--yes` = continue. For
  `investors`/`sales` with tier-C material the same question includes confirming the `reconstructed`
  label. Frame comments and approvals bind to `version` and the render hash.
- Report (when invoked on its own; inside a `/present` run these stay in `QA/*.json` and `run-report.json`, and
  `/present`'s final report carries them — § 0b): gates table (pass/fail/not measured), scorecard, three vote sheets,
  waivers, and the exact `gates_failed` list that goes into `run-report.json`. Post-render: loudness
  LUFS/dBTP vs the QA-08 target for the brief's destination.

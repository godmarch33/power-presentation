# GS-03 marketing (Acme Jobs: CLI + API, no UI) — unattended rerun, 2026-09-27 20:51–22:19

`node scripts/autonomous-run.mjs --run gs-03-marketing` at ebe4a0d, `bwrap` isolation, throttle `nice 10, cpus
0-3,5-7,16-19,21-23`, `POWER_PRESENTATION_MAX_AGENTS=2`. Invocation: `--for marketing --yes` from the repository
root (the fixture's `bin/`, `demo.tape`, `openapi.yaml`, `docs/`, `design/`, `claims.json`). The first pass
(15:38–16:49, at 6a70d7b) delivered but failed the corrected QA-14 afterwards (a coral ✱ at 2.71:1); this rerun is
also the **first pass with the run workspace**.

**Outcome: delivered and ships.** `acmejobs-marketing_16x9.mp4`, 45.0 s, music only (Happy Beats Vol. 1, CC BY 4.0).
Post-render `gates_failed: []` (14/14, QA-14 included), scorecard **91.1** (craft lint 95.1, beat lock 76.4,
liveliness 59.4), vision critic ship 3/3 votes, mean 3.67, lowest 2 (one brand vote: an off-palette brown word, the CTA
text dark on coral for contrast). Story: "A letter to the dashboard" — the real VHS recording of `submit` → `watch` →
`result` and two request/response cards from the OpenAPI spec labelled "from the spec"; 15 on-screen claims sourced,
the declared "40 ms" (no source) kept off screen.

**Workspace: `root_leaks: []`.** Every file of the pass is in `power-presentation-out/acmejobs-marketing/`; the run
directory (standing in for the user's repository) holds only the inputs, the harness files and the workspace.

$25.55 — missed by $0.55 (a second render: the first failed QA-07 at 49 % frozen; six text-only scenes got
slow motion → 20.4 %). 5254 s session wall (wall-time target missed at the 2-agent cap); `time.wall_s` 4232 s. Stage seconds:
frames 1448, storyboard 1070, verify 351 (5 passes), review 139, capture 62, render 48 (2), deliver 37, intake 26,
inspect 14, brief 5, assemble 4 (6 passes).

## What this pass shows / leaves open

- The QA-07 freeze share is only measured on the master, so a type-heavy storyboard costs a whole render round
  (here 49 % → 20.4 % after the fix; GS-02 sales had the same round). A pre-render freeze estimate from the animation
  map (frames with no active tween) would catch it at `verify` — open.
- Terminal text reads small (≈ 2 % of the frame height) in the three terminal scenes without a camera zoom.
- No landing page, CHANGELOG, outcome number, quote or logo in the repository → no proof section; the end card points
  to the documented command, not a URL.
- The record directory was re-collected after `collect()` stopped merging passes (f64bedb).

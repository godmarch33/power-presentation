---
name: present-render
description: "Render the current /present project with HyperFrames and assemble the deliverables: 16:9 master plus 9:16 via render --batch, delivery quality, timeouts, background render-worker for long or 60 fps renders, poster baked into frame 0, SRT, share copy and run-report.json. Part of power-presentation; usually invoked by /present after the QA gates pass, or by present-edit after a change. Use when the user says render, export, final, deliver, or asks for the mp4 of a project that already passed present-qa."
argument-hint: "[--fast|--final] [--format 16:9,9:16] [--yes]"
allowed-tools: Read, Glob, Grep, Bash(npx hyperframes *), Bash(node *scripts/*.mjs *), Bash(bash *scripts/*.sh *), Bash(git *), Agent(power-presentation:render-worker)
---

# present-render — from a passed QA to deliverables

The project is a run workspace, `<repo>/power-presentation-out/<name>/` (`/present` § 0a) — never the repository
root. Find it before anything else: the one folder under `power-presentation-out/` (several: the one the user names,
else the most recently changed, and say which); run every command as `cd "<P>" && …` with its absolute path, so
`--project .` below means that workspace.

Inside a `/present` run, `/present` § 0b holds here too: no text between tool calls — the user sees the plugin's
progress bar (`hooks/progress.sh`), the questions the run needs and its final report, never your working notes.

Status (v0.1.0, 2026-09-20): `npx hyperframes render` calls are real, `scripts/poster-bake.sh` and
`scripts/share-copy.mjs` are **implemented**; there is **no run-report writer at all yet**
([`run-report-schema.md`](../present/references/run-report-schema.md) defines the fields, so the
Deliver step must say `run-report.json: not produced`); `--fast`/`--final` and the scene cache are
**v1**; the `render-worker` agent exists and the toolchain is installed by the SessionStart hooks into `${CLAUDE_PLUGIN_DATA}/toolchain` — `hyperframes render` is refused by the guard until `doctor.json` carries a passing gate (`node ${CLAUDE_PLUGIN_ROOT}/scripts/toolchain.mjs doctor`).
Report every stub as "not done"; never fake a deliverable.

Arguments: `$ARGUMENTS`

## 0. Preconditions (refuse to render otherwise)

- `QA/check.json` exists and is `ok: true` from `hyperframes check --json --frame-check`, counted
  only when `lint.ok` is true and `layout.samples` is non-empty (QA-02).
- `QA/wowprobe.json` (written only by `scripts/wowprobe.py`, never by hand) has an empty
  `gates_failed` for the gates measurable before render, or every failure has a waiver in `QA.md`
  citing a snapshot (QA-02). `wowprobe.py` is implemented: run `present-qa pre-render` first; the
  pre-render file has the ffmpeg gates under `not_measured` — that is expected, `gates_failed` is what
  gates the render.
- `STORYBOARD.md` carries `approved: v<N>` and `git diff --name-only` is inside
  `renders/edit-scope.json`. The `PreToolUse` guard hook enforces the same three checks
  (dry-run in the skeleton).
- Tier-C material for `sales`/`investors` has the user's explicit confirmation and the
  `reconstructed` label; an OCR secret hit from capture blocks render until confirmed.
- Under `--privacy local`: local render only; `cloud render`, `publish`, HeyGen and cloud
  TTS are refused — see [`../present/references/privacy-local.md`](../present/references/privacy-local.md).
- Version pin: run `npx hyperframes@<pin>` with the pin from `${CLAUDE_PLUGIN_ROOT}/scripts/lib/versions.mjs`
  (0.8.47, range 0.8.x); the project's `hyperframes.json` carries the same pin.

## 1. Choose the render path

| Case | Path | Bash timeout |
|---|---|---|
| Video < 90 s at 30 fps | foreground `npx hyperframes render` | 600 s (`render`) |
| Video ≥ 90 s **or** `--fps 60` | dispatch `power-presentation:render-worker` (background agent) | worker owns its own timeout |
| `--fast` (v1) | cut-only from the scene cache into `renders/draft/` — `scripts/render-scenes.mjs` stub, | — |
| `--final` (v1) / MVP default | full `index.html`, `--quality delivery`, into `renders/final/` | 600 s |

- 60 fps doubles render time and is allowed only with `--quality delivery`.
- Read `npx hyperframes doctor --json`: when the capture path reports `software gpu`, warn the user
  that the render takes ×2–3 longer before starting (inside a `/present` run: one line in its final report instead). Thresholds per hardware class are the
  table; do not promise a time the table does not give.
- The background worker appends a line to `renders/manifest.json` and ends with a one-line summary;
  the `PostToolUse` `asyncRewake` hook (`hooks/render-rewake.sh`) wakes the session with that
  summary. Do not poll; continue with other work or wait for the rewake.

## 2. Render commands (pipeline "Render")

```bash
# 16:9 master (MVP default; fps 30 unless the brief says 60)
npx hyperframes render --quality delivery --output renders/final/<name>_16x9.mp4
# 9:16: one row per format in a batch file; the 9:16 window follows the auto-zoom focus
# the row schema of renders/formats.json is not specified (only says "one row per format");
#            the skeleton assumes one HyperFrames `--batch` row per format (variables + output name).
npx hyperframes render --batch renders/formats.json --output "renders/final/{name}.mp4" --batch-concurrency 1 --json
# a single scene look for the human review protocol: host composition only
npx hyperframes render -c hosts/NN.html --quality draft -o renders/draft/scene-NN.mp4
```

- `--batch` is never combined with `--variables`; each row is one format's variable set
  (CLI contract). 1:1 is v1 — refuse it politely in MVP.
- The 9:16 window itself comes from the capture's `autozoom.json` → `tracks['9:16']` (its own
  height-fit wrapper geometry and keyframe ladder on the same focus as the master,
  `scripts/autozoom.mjs`). A batch row only swaps variables; the 9:16 host composition must mount
  that track on its product frames (frame-worker contract) — a 16:9 composition rendered at
  1080×1920 is a letterbox, not the cut. how the 9:16 host is assembled from the
  16:9 frames (second `index.html` vs. a variable-selected ladder) is not specified.
- Never point `-c` at a `<template>` file (95 s timeouts). Never edit `index.html` by hand here;
  assemble/transitions/captions are script-owned.
- After the run, read the summary's second line (capture path, GPU mode, per-stage timings) and
  keep it for `run-report.json`.
- Record the `sha256` of every output mp4 in the manifest entry's `sha256` map (per format) plus
  `index_sha256` (schema in `agents/render-worker.md`, JSON Lines); two renders on one machine must
  be byte-identical — a mismatch is a bug report, not a retry.

## 3. Deliverables

For each `--format`: `mp4`; poster from the strongest frame baked into frame 0 with ffmpeg overlay —
`bash ${CLAUDE_PLUGIN_ROOT}/scripts/poster-bake.sh --video <mp4> --storyboard STORYBOARD.md --json`
(implemented: the storyboard's `poster:` key, else the hook frame's settled point — sales posters thus
carry the prospect's name and company,; `--at <s>` / `--poster <png>` override; frame count,
duration and audio are verified unchanged; writes `<stem>.poster.png` + `.jpg`; needs it for
`prefers-reduced-motion` and silent autoplay). **Run the post-render `present-qa` on the master before
the bake**, then bake (the bake re-encodes video at CRF 18 and copies audio, so QA-08 holds; QA-03 sees
the poster on frame 0). SRT per language (always); `share-copy.txt` with per-platform
variants — `node ${CLAUDE_PLUGIN_ROOT}/scripts/share-copy.mjs init --mode <mode> --product <name>
[--prospect prospect.json] [--synthetic-voice] [--music-credit "<line>"] [--tier-c]` writes the skeleton
with the mandatory lines, you write the copy per [`../present/references/share-copy.md`](../present/references/share-copy.md),
then `share-copy.mjs lint share-copy.txt --mode <mode> --claims claims-index.json` must exit 0
(stop-list, QA-12 numbers, lines); `run-report.json` per
[`../present/references/run-report-schema.md`](../present/references/run-report-schema.md)
(version pins, model mix, tokens est/actual, time per stage, capture backend, evidence tier per
scene, `reconstructed`, `synthetic {voice, presenter, broll}`, `tts_placeholder`, licence table,
egress hosts, loudness vs QA-08 target, `gates_failed`, waivers, cost).

Post-render gates run on the **master**, not a transcode: QA-01 duration (±3 %), QA-07 freeze
share, QA-08 loudness (`ebur128`), QA-09 cadence, QA-03 black open — hand the mp4 to
`/power-presentation:present-qa post-render`. Synthetic voice or avatar adds the EU AI Act Art. 50
disclosure line to `share-copy.txt`, captions and `run-report.json`. For `sales`, the
outreach draft carries the GDPR Art. 14 notice and Art. 21(2) opt-out. Delivery
hooks to Drive/Notion/Gmail and `publish` are v1 — not in this skeleton.

## 4. Version and report

Commit `v<N>: render <formats>` after the post-render gates pass; append to `renders/manifest.json`.
Reply (when invoked on its own; inside a `/present` run nothing is said here — the items go to `run-report.json` and
`/present`'s final report, § 0b) with: output paths, duration vs brief (QA-01), loudness vs target (QA-08), the render summary
line, actual cost vs the estimate printed before dispatch, the poster moment and its reason
(`poster-bake.sh --json`), the share-copy lint result, and the deliverables that have no producer yet
(`run-report.json: not produced`).

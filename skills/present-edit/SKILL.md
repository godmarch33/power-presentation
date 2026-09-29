---
name: present-edit
description: "Apply one edit to an existing /present video project (CTA or headline text, a scene's voice-over line, scene length, music, theme, a replaced clip). Classifies the request with the edit matrix before any tool call, states the price and re-render scope, edits exactly one artifact, commits v<N>, then re-runs QA. Part of power-presentation; usually invoked by /present after the first render. Use when the user asks to change, tweak, shorten, swap or fix something in a video that already has a STORYBOARD.md and index.html."
argument-hint: "<what to change, in plain words> [--yes]"
allowed-tools: Read, Glob, Grep, Edit, Write, AskUserQuestion, Bash(git *), Bash(npx hyperframes *), Bash(node *scripts/*.mjs *)
---

# present-edit — one artifact per step

The project is a run workspace, `<repo>/power-presentation-out/<name>/` (`/present` § 0a) — never the repository
root. Find it before anything else: the one folder under `power-presentation-out/` (several: the one the user names,
else the most recently changed, and say which); run every command as `cd "<P>" && …` with its absolute path, so
`--project .` below means that workspace.

Skeleton status (v0.1.0): the classification, pricing and one-artifact rule below are real
instructions. Per-scene re-render (`scripts/render-scenes.mjs`, `scripts/scene-key.mjs`) is a
**v1 stub** that exits 64 with `NOT IMPLEMENTED`; in MVP every frame edit costs a full
render of `index.html`. Never report a partial re-render as done.

Request: `$ARGUMENTS`

## 1. Classify BEFORE the first tool call

Read [`../present/references/edit-matrix.md`](../present/references/edit-matrix.md) and map the
request to exactly one class from the edit table. Do not open any project file until the class,
the artifact and the price are stated to the user in one short message (the user asked for the edit, so this is
the answer they wait for; after it, `/present` § 0b holds — no text between tool calls, one short result at the end):

| Class | The ONE artifact the model may touch | Deterministic steps (scripts, not the model) | Re-render scope |
|---|---|---|---|
| CTA / headline text | none — `--variables` on `data-var-text` / `data-var-src` fields | `lint` | scene N (MVP: full render) |
| VO text of scene N | line N of `SCRIPT.md` | TTS of that line → sync-durations → assemble → transitions → captions | scene N (MVP: full render) |
| Shorten a scene | `duration` of that scene in `STORYBOARD.md` | assemble → transitions → captions | scene N + 2 joins (MVP: full render) |
| Swap music | `audio_meta.json` | remux only | none |
| Change theme | `frame.md` | — | all scenes (full render) |
| Replace a clip | `assets/` | stage-assets, `check` | scene N (MVP: full render) |

State the price in the same message: the measured per-scene times in the table are **v1**
numbers (they need); in MVP quote "full render of `index.html`" and the render
threshold for the user's hardware class (do not restate the numbers — point to). Token cost:
CTA/text edits are 0 tokens (`--variables`); a VO line costs TTS time plus the line rewrite.
A request that spans two classes is two edits, done one after the other.

If the class is ambiguous, ask one question (AskUserQuestion); `--yes` picks the cheapest class
that satisfies the literal request and prints the decision (convention).

## 2. Edit exactly one named artifact

- The model edits with a search/replace in **one file**. Assemble, transitions, captions,
  concat and every other global consequence are computed by scripts, never hand-edited.
- Frame HTML under `compositions/frames/` is edited only for the "theme"/"replace clip"
  follow-ups the matrix names; never edit a neighbouring frame (frame-worker contract).
- Before editing, write the declared change set to `renders/edit-scope.json` (the list of paths
  this edit may touch). The `PreToolUse` guard hook compares `git diff --name-only` against it and
  refuses `hyperframes render` when the diff is wider. In the skeleton the hook runs in
  dry-run mode and only logs what it would refuse (see `hooks/README.md`).
- Text/CTA edits go through `npx hyperframes render --variables '{"cta":"..."}'` (or
  `--variables-file`) against the declared `data-composition-variables`; no frame file changes.
Copy must respect the reading floor QA-10 and the stop-list.
- A VO line rewrite stays inside the word budget for the scene's duration and is written
  in English, then re-synthesised by the audio scripts (Kokoro EN).

## 3. Re-render scope

- **MVP:** every frame-affecting edit = full `index.html` render via
  `/power-presentation:present-render` (timeout 600 s). Music swap is a remux and
  needs no render.
- **v1 (stub):** `node ${CLAUDE_PLUGIN_ROOT}/scripts/render-scenes.mjs --scenes NN` renders
  `hosts/NN.html`, joins with `ffmpeg concat -c copy`, mixes audio once, and prints
  "re-rendered N, reused M" from the content-hash cache
  (`node ${CLAUDE_PLUGIN_ROOT}/scripts/scene-key.mjs` — sha256 of frame HTML ‖ assets ‖ `frame.md`
  ‖ variables ‖ CLI version ‖ fps/quality/resolution ‖ capture path). Until it lands, calling it
  prints `NOT IMPLEMENTED …` and exits 64: fall back to the MVP path and say so.
- Never run `render -c` on a `<template>` file — it hangs to the timeout.

## 4. Verify, version, report

1. Re-run `/power-presentation:present-qa` on the affected scope; a failed gate or a scorecard of
   60–79 sends the scene back to auto-fix, < 60 sends it to the storyboard. One revision round
   by default; a second one only by flag and with budget left.
2. Diff the look against the previous version with
   `npx hyperframes compare <prev-project-or-html> <current> --at <s> --out QA/compare.png`.
3. Bump `version:` in the storyboard frontmatter, then run the stages with
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/render-path.mjs <stage> --project . --request "<the user's request>"`:
   after every passed gate (verify, render, deliver) it commits `v<N>: <request>` in the project's own
   repository — `init` made it one; a project nested in another repository is not committed.
   `render` appends the render sha256 to `renders/manifest.json`. The user's "render?" yes is
   `render-path.mjs approve --project . --request "<request>"`: `approved: v<N>` in the storyboard (what
   the guard hook checks) and a `renders/approvals.jsonl` line bound to the storyboard, index and master
   sha256.
4. Reply with: class, artifact edited, what was re-rendered (or "MVP: full render"), gates status,
   the new version tag, and the updated `run-report.json` cost line.

## What this skill never does

- Edits two artifacts in one step or "fixes on the side".
- Bypasses `/hyperframes` routing or the `product-launch-video` workflow.
- Claims a per-scene re-render or cache hit before is implemented.
- Uses cloud render or `publish` under `--privacy local`.

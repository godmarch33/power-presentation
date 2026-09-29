# Edit matrix — classify before the first tool call

Phase: classification and full render = MVP; per-scene re-render, content-hash cache, `--fast` =
v1. Used by `/power-presentation:present-edit`. Scripts `render-scenes.mjs` (v1) and
`scene-key.mjs` (v1) are stubs; `scene-key.mjs` implements the key function for real.

## 1. Rule of the loop

The model edits **one named artifact per step**; every global consequence (assemble, transitions,
captions, concat) is computed by scripts, never by hand. Before the first tool call the request is
classified with the table below and the answer **names its price and scope**. In MVP every
frame edit costs a full `index.html` render — time; the per-scene prices in the last
column are the measured v1 targets, not what MVP delivers.

## 2. Edit classes and the invalidation matrix

| Edit | Artifact the model touches | Deterministic steps (scripts) | Re-render scope (v1) | Measured per scene (v1) | MVP cost |
| --- | --- | --- | --- | --- | --- |
| CTA / headline text | none — `--variables` (`data-var-text` / `data-var-src`) | `lint` | scene N | 6.1 s, 0 tokens | `--variables` + full render |
| VO text of scene N | line N of `SCRIPT.md` | TTS of that line → sync-durations → assemble → transitions → captions | scene N | 10–20 s + TTS | full render |
| Shorten a scene | `duration` in `STORYBOARD.md` | assemble → transitions → captions | scene N + 2 joins | 5.7 s | full render |
| Swap music | `audio_meta.json` | remux | none | 0.13 s | remux only, no render |
| Change theme | `frame.md` | — | all scenes | full render | full render |
| Replace a clip | `assets/` | stage-assets, `check` | scene N | 6–10 s | full render |

Classification output (say it before acting):
`class=<row> · artifact=<file> · scope=<scene N | joins | all | none> · cost=<MVP: full render ≈ band | remux>`.
If a request spans two rows, split it into two steps and two commits.

## 3. Partial re-render and cache (v1)

- `hyperframes render` has no frame-range flag (0.8.46). Partial render = one host composition per
  scene, `hosts/NN.html`, rendered separately and joined with `ffmpeg concat -c copy` under identical
  stream parameters; audio is mixed once. Never run `-c` on a `<template>` file: 95 s of timeouts.
- Measured: one scene 3.3 s (5.9 s wall), concat 0.04 s.
- Renders are byte-identical (SHA-256) on the same machine, so the cache is keyed on content:
  `sha256(frame HTML ‖ assets ‖ frame.md ‖ variables ‖ CLI version ‖ fps/quality/resolution ‖ capture path)`
  — implemented by `scripts/scene-key.mjs`.
- Cached scenes skip Chrome; the run prints "re-rendered N, reused M".
- `--fast` = cut-only from cache into `renders/draft/`; `--final` = full `index.html` with
  `--quality delivery` into `renders/final/`.
- Exit criterion for v1: a scene ≤ 6 s re-renders with bytes SHA-256-identical to the full render.

## 4. Versioning and approval

- After every accepted gate and every edit: git commit `v<N>: <request>` and one line in
  `renders/manifest.json` with the scene keys.
- Diff between versions: `npx hyperframes compare`.
- The model edits by search/replace in **one** file; the `PreToolUse` guard rejects `render` when
  `git diff --name-only` is wider than the declared set (`renders/edit-scope.json`) or when
  `STORYBOARD.md` carries no `approved: v<N>` (`hooks/guard-render.sh`, dry-run in the skeleton).
- Approval is bound to the version hash: `STORYBOARD.md` opens in Studio, frame comments and approvals
  reference `version` and the render hash. Studio feedback may arrive in
  `.hyperframes/frame-comments.json` — read it before the chat reply, apply only the named frames,
  delete the file (HyperFrames brief-contract § 1). The review page as an Artifact is v1.

## 5. What an edit may never do

- Touch a neighbouring frame from a frame packet — the worker is confined to its own file (orchestration).
- Re-introduce a stop-list word or an unsourced number (QA-12) — both are lint failures.
- Change `message`/`audience` in `STORYBOARD.md` without updating `BRIEF.md` first (brief-schema.md § 4).
- Skip the gates: an edit that changes a frame re-runs `/power-presentation:present-qa` before render (QA-02).

## 6. Budget note

One critic revision round is the default; a second round is taken only by flag and only while
`budget_usd` remains. The estimate "$ tokens / $ media / minutes" is printed before each round.

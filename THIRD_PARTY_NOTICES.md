# Third-party notices

The `power-presentation` plugin is MIT-licensed (see `LICENSE`). It builds on, ports
from, or calls the third-party components below. Licences were cross-checked against
the repositories' `LICENSE` files on 2026-09-18. The plugin package
ships **no music** and stays ≤ 5 MB; media packs are fetched on first run into
`${CLAUDE_PLUGIN_DATA}` with their own `LICENSES.md`.

## Summary table

| Component | Licence | Relationship | Consequence for the plugin |
|---|---|---|---|
| brag (latent-spaces/brag) v0.2.2 | MIT, © 2026 Shunit Haviv Hakimi | files ported + ideas harvested (reference-only base) | copy with notice; this file |
| HyperFrames (heygen-com/hyperframes) CLI, skills, registry | Apache-2.0 | runtime dependency; pinned `0.8.47`, declared range `0.8.x` | npm dependency; keep NOTICE when editing skills |
| `product-launch-video` workflow (part of HyperFrames) | Apache-2.0 | entered via `BRIEF.md`; vendored **unmodified** at upstream tag `v0.8.47` in `vendor/product-launch-video/` (2026-09-20) | `vendor/LICENSE-hyperframes` + `vendor/NOTICE` travel with the copy |
| HeyGen cloud (publish, TTS, BGM, cloud render) | proprietary, per credit | optional, off under `--privacy local` | offline path is mandatory |
| Kokoro-82M | Apache-2.0 | EN text-to-speech, separate toolchain download | — |
| whisper.cpp | MIT | captions / transcription (`large-v3\|turbo --language en`) | — |
| Playwright | Apache-2.0 | `record-flow` web/Electron capture (`page.screencast`); `playwright@1.63.0` + its Chromium installed into `${CLAUDE_PLUGIN_DATA}/toolchain` | — |
| chrome-headless-shell (Chrome for Testing) | Chromium: BSD-3-Clause and others (Google's Chrome for Testing terms) | build `152.0.7977.30` downloaded by `scripts/toolchain.mjs` through `@puppeteer/browsers` (the same download HyperFrames makes) into `${CLAUDE_PLUGIN_DATA}/toolchain/chrome` | not bundled, not linked |
| `ffmpeg-static` / `ffprobe-static` (npm) | the wrapped ffmpeg build is GPL-2.0+ (built with libx264) | **only when ffmpeg/ffprobe are not on PATH**: installed into the toolchain and exported as `HYPERFRAMES_FFMPEG_PATH` / `HYPERFRAMES_FFPROBE_PATH` | subprocess only, not bundled in the package |
| VHS (charmbracelet/vhs) | MIT | terminal recordings for CLI products | — |
| ffmpeg | LGPL-2.1+/GPL-2+ (build-dependent) | system binary called as a subprocess (encode, ebur128, concat) | not bundled, not linked |
| Kenney / OpenGameArt SFX | CC0 1.0 | media pack fetched at first run; `assets/sfx-analysis.json` describes the Kenney subset | pack + `LICENSES.md` |
| Sascha Ende / ende.app tracks ("Happy Beats / Business Moves") | CC BY 4.0 (ende.app standard licence) | media pack fetched at first run; only cue metadata in `assets/cue-presets/` | credit line required; **Content ID forbidden**; not bundled |
| Pixabay SFX | Pixabay Content License | runtime only through `media-use` | **never redistributed** (no standalone distribution) |
| MusicGen weights | CC-BY-NC | **not used** | excluded from commercial output |

---

## brag — MIT

Repository: https://github.com/latent-spaces/brag — version 0.2.2 (checked 2026-09-18).
Relationship: **reference only**, not a dependency.

Files taken into this plugin (each carries an attribution header or a note in
`assets/ATTRIBUTION.md`):

- `scripts/analyze_music_cues.py` — ported verbatim from `skills/brag/scripts/analyze_music_cues.py`
  (requires `librosa` at runtime; optional dependency, see `README.md`).
- `assets/sfx-analysis.json` — from `skills/brag/assets/sfx/sfx-analysis.json`
  (analysis of Kenney CC0 sounds; sounds not included).
- `assets/cue-presets/*.music-cues.json` — from `skills/brag/assets/music/cues/`
  (beat/cue metadata for ende.app CC BY 4.0 tracks; tracks not included).

Ported as text, with attribution in each file (completed 2026-09-20):

- `scripts/poster-bake.sh` — brag's poster recipe from `references/step-4-deliver.md`: the settled
  frame pulled with `-frames:v 1`, then `overlay=0:0:enable='eq(n,0)'` on frame 0 only with
  `-crf 18 -preset slow -pix_fmt yuv420p -c:a copy -movflags +faststart` (frame 0 is what Slack / X /
  Discord thumbnail from). The pick order (storyboard `poster:` key → hook settled point → edge scan)
  is the plugin's.
- `skills/present/references/share-copy.md` + `scripts/share-copy.mjs` — the share-copy mechanism
  (`share-copy.txt` as the canonical caption, 1–3 sentences, no "excited to share", variants kept
  apart); the per-tone templates were rewritten as per-mode templates.
- `skills/present/references/planning-rubric.md` — the 9-question rubric from
  `references/step-1-inspect.md` with Q2 changed from "funniest or most impressive" to "most credible /
  valuable claim"; Q6 "tone" became register / preset.
- `scripts/wowprobe.py` QA-10 + `skills/present/references/captions.md` — the reading-time floor
  from `references/step-2-plan.md` ("fast-in, then hold — never fast-in, then gone"; ~0.8 s for a
  1–3-word label, ~0.3 s per word with a ~1.2 s minimum) restated with the plugin's numbers
  (max(1.2 s, chars / 20 cps), ≤ 42 chars per line, ≤ 2 lines).

Ideas harvested with attribution and no text copied: beat-lock tolerances (~0.15 s for reveals,
~0.10 s for entrances — `wowprobe.py` `BEAT_LOCK`), the SFX volume policy (`assets/sfx-analysis.json`),
cross-agent symlink packaging (v1) and the benchmark-suite idea (`examples/`).

```
MIT License

Copyright (c) 2026 Shunit Haviv Hakimi

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## HyperFrames — Apache-2.0

Repository: https://github.com/heygen-com/hyperframes. Relationship: **dependency**.
The plugin is a first-class HyperFrames route: it writes
`BRIEF.md`, enters the `product-launch-video` workflow and adds its deltas; it
never wraps the CLI around the routing.

- Pinned version: `0.8.47`; declared compatible range: `0.8.x`
  (`scripts/lib/versions.mjs`). Each project pins the CLI in
  `hyperframes.json` and calls `npx hyperframes@<pinned>`.
- Installed by the `SessionStart` hooks into `${CLAUDE_PLUGIN_DATA}/toolchain` together
  with chrome-headless-shell, Playwright and (when missing) ffmpeg
  (`scripts/toolchain.mjs`, 2026-09-20).
- The `product-launch-video` workflow, its scripts (`assemble-index`, `audio`,
  `build-frame`, `captions`, `frame-packets`, `stage-assets`, `transitions`) and its
  `sub-agents/frame-worker.md` are Apache-2.0 parts of HyperFrames. An **unmodified** copy
  taken from tag `v0.8.47` (commit `415967befabf9f9f389921937275c93ba417253a`) lives in
  `vendor/product-launch-video/` for determinism and offline entry
  (`vendor/README.md`); HyperFrames' `LICENSE` from the same commit is `vendor/LICENSE-hyperframes`
  and `vendor/NOTICE` records the attribution (upstream ships no NOTICE file at that commit).
  The copy is never edited — `scripts/vendor-workflow.mjs check` fails on any change; any
  modified skill file would have to keep the Apache-2.0 notice.
- HyperFrames' own cloud features (HeyGen publish, cloud render, TTS, BGM) are
  proprietary, per-credit, optional, and refused under `--privacy local`.

Apache License 2.0 text: https://www.apache.org/licenses/LICENSE-2.0

## Kokoro-82M — Apache-2.0

English TTS. Downloaded into `${CLAUDE_PLUGIN_DATA}`
(~354 MB, an MVP dependency), never bundled. It is the EN voice of the
zero-account path.

## Piper — not used (2026-09-19)

Piper (piper1-gpl, GPL-3.0) was listed for RU/UK text-to-speech while the plugin planned three
languages. The decision of 2026-09-19 makes the video English only, so Piper is not
part of the toolchain and is never spawned; Kokoro (Apache-2.0) is the only VO engine in MVP and
v1. Kept here as a note so the earlier listing is not mistaken for a live dependency.
## whisper.cpp — MIT

Transcription / word timings for captions and SRT. Always invoked with an
explicit `--language en` and a `large-v3|turbo` model (the former `.en`-model lint
was withdrawn on 2026-09-19 with the one-language decision).

## Playwright — Apache-2.0

Capture backend for web and Electron products: `page.screencast.start({size, quality,
onFrame})` at 1920×1080 / DPR 2, then ffmpeg libx264 CRF 18. `recordVideo` is
banned. Requires Playwright ≥ 1.59; the toolchain pins `1.63.0`
(`scripts/lib/versions.mjs`) and installs its Chromium + headless shell under
`${CLAUDE_PLUGIN_DATA}/toolchain/ms-playwright`.

## chrome-headless-shell — Chrome for Testing

The headless Chrome build HyperFrames renders with (`152.0.7977.30` for `hyperframes@0.8.47`).
`scripts/toolchain.mjs install` downloads it with `@puppeteer/browsers` (a HyperFrames
dependency) into `${CLAUDE_PLUGIN_DATA}/toolchain/chrome` and exports
`HYPERFRAMES_BROWSER_PATH`; this is the same artifact `hyperframes browser ensure` fetches into
`~/.cache/hyperframes`. Chromium is BSD-3-Clause with third-party components under their own
licences; Chrome for Testing binaries are distributed by Google. Not bundled in the package.

## ffmpeg-static / ffprobe-static — GPL ffmpeg builds (conditional)

npm wrappers around static ffmpeg / ffprobe binaries (the builds include libx264, so they are
GPL-2.0+). `scripts/toolchain.mjs install` adds them **only when `ffmpeg` / `ffprobe` are not
on PATH** (or with `--with-ffmpeg`) and points HyperFrames at them through
`HYPERFRAMES_FFMPEG_PATH` / `HYPERFRAMES_FFPROBE_PATH`. Called as subprocesses, never linked,
never shipped in the plugin package.

## VHS — MIT

https://github.com/charmbracelet/vhs. Terminal recordings for CLI products
(`Hide`/`Show`, `Wait /regex/`, deterministic PNG frames). A recorded
VHS session counts as evidence tier A.

## ffmpeg — LGPL / GPL (build-dependent)

System binary called as a subprocess for encoding, `ebur128` loudness (QA-08),
`concat -c copy` (v1) and `wowprobe.py` measurements (QA-03, QA-07, QA-09).
Not bundled, not linked.

## Kenney / OpenGameArt SFX — CC0 1.0

Fetched at first run into `${CLAUDE_PLUGIN_DATA}/media-packs/` with `LICENSES.md`.
`assets/sfx-analysis.json` is brag's analysis of the Kenney subset; the
sounds themselves are not in the package. Details: `assets/ATTRIBUTION.md`.

## Sascha Ende / ende.app tracks — CC BY 4.0

"Happy Beats / Business Moves" series, ende.app standard licence
(https://ende.app/en/standard-license). Fetched at first run, never bundled; only
`assets/cue-presets/*.music-cues.json` metadata ships. Every delivery using one of
these tracks carries the credit line
`Music: "<title>" by Sascha Ende / ende.app (CC BY 4.0)` in the description and in
`run-report.json`; Content ID registration is forbidden.

## Pixabay SFX — Pixabay Content License

Resolved **at runtime only** through the `media-use` skill. Never packed or
redistributed with the plugin — the licence forbids standalone distribution.

## MusicGen weights — CC-BY-NC

**Not used.** The non-commercial clause excludes commercial output, so music generation
stays off unless explicitly requested by flag.

# assets/ — what ships inside the plugin package

**Policy (MVP):** the plugin package is ≤ 5 MB and contains **no music**.
Media packs are downloaded on first run into `${CLAUDE_PLUGIN_DATA}/media-packs/`
together with a `LICENSES.md`; an asset with an unknown licence blocks `render`.
The package therefore carries only small **analysis metadata**, never the
audio it describes.

Measured size of this directory at skeleton time (2026-09-18): **704 KB** (`du -sk`),
about 14 % of the ceiling. CI fails the build if the whole package exceeds 5 MB or
if any `*.mp3|*.wav|*.ogg|*.m4a` file is committed (`.github/workflows/ci.yml`).

## What lives here

| Path | What it is | Source / licence | Used by |
|---|---|---|---|
| `sfx-analysis.json` | Loudness, brightness and high-frequency-risk analysis of 228 Kenney SFX files (the `.ogg` files themselves are **not** included) plus a "prefer / avoid / timing" volume policy | Ported from brag v0.2.2 (MIT); analysed sounds are Kenney CC0 — see `ATTRIBUTION.md` | SFX selection in the audio step: cue types and density, selection by low `highFrequencyRisk`; SFX level 6–10 dB below VO (via `references/loudness.md`) |
| `cue-presets/<track>.music-cues.json` | Full-track beat grid and strong-cue metadata (`beats[]`, `strongCues`, tempo, 25 s planning window) for five ende.app tracks; the `.mp3` files are **not** included | Ported from brag v0.2.2 (MIT); the tracks are Sascha Ende / ende.app CC BY 4.0 — see `ATTRIBUTION.md` | Beat-lock of reveals and entrances (`scripts/analyze_music_cues.py` regenerates them; brag tolerances ≈ 0.15 s reveal / 0.10 s entrance) |
| `ATTRIBUTION.md` | Credit lines and licence notes for the two items above | — | Copied into `run-report.json` licence table |

`sfx-analysis.json` keeps its original `sourceRoot: "skills/brag/assets/sfx"` field; the
plugin resolves the referenced `.ogg` paths against
`${CLAUDE_PLUGIN_DATA}/media-packs/sfx/` once the CC0 pack is fetched.

## What is fetched at first run (not here)

To be fetched into `${CLAUDE_PLUGIN_DATA}/media-packs/` (the SessionStart hook's
async install is meant to cover media packs). The toolchain installer (`scripts/toolchain.mjs`)
reserves the directory but does not fetch anything yet: no pack manifest (URLs, checksums,
licences) exists — the rows below are the intended packs, and the fetch lands with the
BGM / SFX work:

| Pack | Licence | Condition |
|---|---|---|
| Kenney / OpenGameArt SFX subset (the `.ogg` files that `sfx-analysis.json` describes) | CC0 | pack at first run |
| ende.app "Happy Beats / Business Moves" tracks (the `.mp3` files that `cue-presets/` describe) and CC0 cinematic/corporate beds | CC BY 4.0 / CC0 | pack at first run; credit line "Music: … by Sascha Ende / ende.app" in the description; Content ID forbidden |
| Pixabay SFX | Pixabay Content License | **never packed** — resolved at runtime through `media-use` only (no standalone redistribution) |
| Fonts scraped from a product site (Klim etc.) | restricted / unknown | **never** — substituted with OFL fonts; `--fonts-licensed` for the owner |

Each pack lands with its own `LICENSES.md`. MusicGen weights (CC-BY-NC) are not used.
Kokoro (~354 MB) voices are toolchain, not media — same
`${CLAUDE_PLUGIN_DATA}` root, separate subdirectory — not installed by
`toolchain.mjs` either (`hyperframes doctor` lists Kokoro as an optional check).

## Rules for adding files here

1. No audio, video or font binaries. Only metadata, JSON and Markdown.
2. Every file needs a row above and, if third-party, an entry in `ATTRIBUTION.md` and
   `THIRD_PARTY_NOTICES.md`.
3. Re-check `du -sk assets` and keep the whole package ≤ 5 MB.

# Loudness targets and audio level hierarchy

Phase: MVP.

## QA-08 gate (hard)

| Item | Value |
|---|---|
| Integrated loudness | \|I − target\| ≤ **1 LU** |
| True peak | ≤ **−1 dBTP** |
| Where to measure | the **master**, never a platform transcode |
| Tool | `ffmpeg -af ebur128=peak=true` per EBU R 128-2023 |
| Type | **hard** — blocks shipping |

Target by destination and mix type (QA-08):

| Mix / destination | Target (LUFS) | Typical mode |
|---|---|---|
| Social / YouTube, VO-led | **−14** | marketing social, sales outreach |
| VO-led premium / investor | **−16 … −18** | investors, premium sales |
| Music-only cinematic hero | **−18 … −20** | marketing hero loop / cinematic |

The chosen target is written to `run-report.json` next to the measured I and TP so a waiver is auditable. `/present` passes the story director's planning-rubric Q7 target to `render-path verify` / `deliver` as `--target-lufs <n>`; without it render-path picks the row from the mix — VO-led by mode (−14 marketing/sales, −16 investors), music-only with no VO −18. QA-08 words the row "music only, cinematic hero"; whether it covers a marketing hero launch, and which point of −18…−20 is the default, is the owner's call.

## Why the master, not the transcode

Platforms normalise loudness (Spotify), and YouTube transcodes of the reference films measure −25…−29 LUFS (Linear Agent −28.9, Cursor 3 −27.3 — table, observation) while Framer Agents reads −11.7 with a +2.6 peak and Arc −9.8 / +1.2. Those numbers were taken with `ebur128` on 480p copies and are **not** comparable with the QA-08 master gate (intro). Measured 2026-09-18 baselines (s6/s9): brag examples −24…−28.5 LUFS; vendor product-launch route −20.6 LUFS.

## Measurement command (QA-08)

```bash
ffmpeg -nostats -i renders/master-16x9.mp4 -af ebur128=peak=true -f null - 2>&1 | tail -n 12
```

Read `I:` (integrated, LUFS) and `Peak:` (true peak, dBTP) from the summary block; `scripts/wowprobe.py` does the parsing.

Scorecard: "Loudness" weight 10 — 100 inside the QA-08 tolerance, −10 per LU outside, 0 when TP > 0 dBTP.

## Level hierarchy

| Layer | Level |
|---|---|
| VO | −16 … −14 LUFS-S |
| Music bed under VO | −28 … −32 LUFS-S |
| SFX | 6–10 dB below VO |
| Ducking | −6 … −12 dB; attack ≤ 60 ms; release 200–500 ms |
| Carve (EQ notch in the bed for the voice) | 250 Hz – 2.5 kHz |

Investor default: quiet bed under speech. Mixing of bed/VO/SFX in HyperFrames is done with the `hyperframes-audio` skill (ducking, carve, gain, limiter) — the plugin declares the targets in `BRIEF.md`, it does not re-implement the mixer.

## Music-first and SFX

- The bed is chosen **before** the storyboard because the beat grid sets reveal and cut timing; beat grid via `hyperframes beats`; beat locks from `scripts/analyze_music_cues.py` (ported from brag, MIT) with tolerances: reveals ±0.15 s, entrances ±0.10 s; 1–3 strong locks per 15–25 s.
- SFX: whoosh 0.2–0.6 s before motion; pop/click ≤ 0.4 s on landing; riser starts at climax − riser length; bass impact on the hero; 3–5 cues per 30 s (2–3 for polished), never one per stagger element; dropout / silence **0.3–0.5 s** before the reveal. Cue choice from `assets/sfx-analysis.json` with low `highFrequencyRisk`.
- Mute-proof: the video must work without sound.

## Sources of music and licences

- No music ships in the plugin package (≤ 5 MB). Media packs (CC0 Kenney/OpenGameArt SFX, CC BY 4.0 ende.app tracks with a credit line and no Content ID — the upbeat "Happy Beats / Business Moves" and the restrained `music-ende-calm` underscores that stand in for's cinematic/corporate beds) are fetched on first run into `${CLAUDE_PLUGIN_DATA}/media-packs/` with `LICENSES.md`. `node ${CLAUDE_PLUGIN_ROOT}/scripts/media-packs.mjs list` names the fetched tracks; `render-path run --bgm pack:<track>` mounts one with its credit line and beat cues. The bed comes from these packs — a missing MusicGen or HeyGen never means "no bed".
- Pixabay SFX only at runtime via `media-use`, never redistributed; MusicGen (CC-BY-NC) not used silently.
- Unknown licence blocks render.

## Skeleton status

`wowprobe.py` measures QA-08 on the master. The media packs are fetched by `media-packs.mjs fetch` (the SessionStart hook does not fetch them); the pinned packs are the ende.app "Happy Beats / Business Moves" music (upbeat), the ende.app `music-ende-calm` underscores (restrained, the investor default: "The Turning Point", "Minimalist (Neutral Focus)", "Between Hours", "Morning Light") and the Kenney SFX. The calm pack is import only — ende.app downloads need a free account, so the plugin never fetches it (`fetch --pack music-ende-calm` names the song pages, `--from-dir` imports). no CC0 source for's cinematic/corporate beds is named; the calm ende.app pack (CC BY 4.0) stands in (owner decision 2026-09-27). `scripts/analyze_music_cues.py` is a verbatim port from brag and needs the optional `librosa` dependency (see README).

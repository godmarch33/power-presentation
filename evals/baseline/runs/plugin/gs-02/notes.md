# plugin / GS-02 — run notes (2026-09-20 … 2026-09-26)

- Route: this repository's render path (`scripts/render-path.mjs` stages `brief` → `audio` → `packets` → `frames` →
  `assemble` → `verify` → `render` → `deliver`) with the vendored `product-launch-video` workflow (HyperFrames 0.8.47),
  driven by Claude in the implementation sessions, on `examples/gs-02-ledgerly` in `sales` mode, 16:9 only.
- Inputs: `BRIEF.md`, `STORYBOARD.md` (12 frames), `SCRIPT.md`, `frame.md`, the record-flow capture of the Ledgerly
  site (`assets/footage.mp4`, 3840×2160, 9.4 s) with its `events.jsonl` for the auto-zoom camera. VO: Kokoro, 12 lines;
  captions word-timed by whisper `small.en`, burned in; no music bed (beat lock not measured).
- Frames: written by frame-worker subagents from the packets; the footage frames (02, 04, 05, 06, 07, 09, 11) declare
  the approved video that the vendor assembler hoists and `applyCamera` wraps.
- Human / agent touches outside the stage runner (all in implementation sessions): frames 01 / 03 / 07 / 09 revised
  on 2026-09-23 for the pre-render gates (QA-06 sidecars, QA-11 motion); frames 07 / 09 root ground made transparent
  on 2026-09-26 (it hid the background footage once the hoist fix left one video per frame).
- Stage wall time summed over all 36 stage runs in `.hyperframes/pp-stages.json` (every retry included): audio 65.5 s,
  assemble 3.5 s, verify 336.7 s, render 154.2 s, deliver 84.3 s. The final chain: verify 65.6 s (`check` 60.2 s),
  render 32.7 s, deliver 14.0 s on 16 of 32 threads at nice 10 (`POWER_PRESENTATION_NICE` / `_CPUSET`).
- Token cost not metered separately (implementation sessions).
- `final.mp4` = `renders/final/gs-02_16x9.mp4` after loudnorm and the poster bake (the bake replaces frame 0 only).

## v2 (2026-09-27) — ships

- Story v2 (story director): hook with the prospect, product at 3.2 s, first metric at 6.3 s, one app action per
  footage frame on a held clip with a hold drift, AI-disclosure line on the end card. Frames: 12 frame-workers (two
  batches); the orchestrator fixed three portrait stage boxes (packets lacked the storyboard direction — now copied
  in by `render-path packets`), frame 10's portrait type sizes and the frame 11/12 pill wrap.
- `render-path assemble → verify → render → deliver`, `--formats 16:9,9:16`: check ok in both hosts, render 55 s
  wall per format, `gates_failed []`, scorecard 84.1.
- Vision critic (`critic.mjs`, 3 votes × 5 Sonnet agents, 621 s, 1.78 M subagent tokens): SHIP 2/3, mean 3.05;
  vote 2 failed on C6 = 1. Votes in `QA/critic/vote-*/` (git-ignored), tally in `QA/critic.json`.
- Token cost not metered separately (implementation session).

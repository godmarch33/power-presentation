# GS-01 — Plausible (web analytics), marketing 45 s

**Phase: MVP.** Golden-set fixture GS-01. CLI pin `hyperframes@0.8.47`, range `0.8.x`.

| Field | Value |
|---|---|
| Product | Plausible — web analytics, class `web-ui` |
| Mode | `--for marketing` |
| Length | 45 s — inside the "Hero launch 45–90 s" band; ±3 % is a hard gate |
| Formats | 16:9 master + 9:16 via `render --batch`; the 9:16 window follows the auto-zoom focus |
| Source | real production URL `https://plausible.io`, real dashboard — capture tier **A** |
| Capture | `record-flow`: `footage.mp4` (Playwright `page.screencast`, 1920×1080 @ DPR 2, libx264 CRF 18), `events.jsonl`, `capture-manifest.json` |
| Auto-zoom | clusters from `events.jsonl` with the auto-zoom defaults; cursor synthesised from the log |
| Voice | off (marketing is the only mode with voice off by default; `--voice` turns it on) |
| Captions | off for 16:9 without VO (kicker cards carry the copy); on for 9:16; SRT always |
| Story | product-led marketing: hook ≤ 3 s (QA-03), first product frame ≤ 5 s (QA-04), first result ≤ 12 s (QA-05), 5–7 product beats ≥ 3 s each |
| Archetype at 45 s | between the "30 s: PAS" and "60 s: PAS or compressed SB7" rows of the story table — the table has no 45 s row; the story director picks one |
| CTA | exactly one, first person (example: "Start my free trial"), on screen for the QA-13 end-card window |
| Scorecard target | product-frame share ≥ 35 % (marketing) |

## Invocation

```bash
/present --for marketing --duration 45 --format 16:9,9:16 --url https://plausible.io
```

## What this directory contains

- `README.md` — this file.
- `expected-brief.md` — the `BRIEF.md` skeleton the `present` skill is expected to write before entering the
  `product-launch-video` workflow. Values that only a live run can decide are left as
  `<decided at run time>`.
- `storyboard-skeleton.md` — the expected storyboard shape (product-led, 10 frames, 45 s); its copy carries no
  numbers on purpose (GS-01's sourced numbers come from the live page at capture date).
- `flow.json` — the `record-flow` steps for the public demo dashboard (`https://plausible.io/plausible.io`): tab
  clicks (`button:has-text("Entry pages")`, …), scrolls and waits.

Built locally by `node scripts/golden-set.mjs build --only gs-01` into `evals/fixtures/gs-01/` (git-ignored):
`footage.mp4` (3840×2160), `events.jsonl`, `capture-manifest.json`, `autozoom.json`, the preview `index.html`,
`wowprobe.pre.json`. Baseline renders: `evals/baseline/README.md`.

## Expected checks on this fixture

- Nightly eval `evals/render-plausible-45s/` (v1) — mp4 + `run-report.json`.
- Per-PR eval `evals/trigger-marketing-url/` uses the same prompt shape.
- MVP exit criteria: cursor from `events.jsonl`, ≥ 1 auto-zoom, first product frame within QA-04,
  `capture_size_below_output` = 0.

## Status

Measured 2026-09-20 (`golden-set.mjs build` + `verify`): 11.9 s of tier-A footage, 12 events / 5 clicks, 2 auto-zoom
segments, cursor path synthesised, `capture_size_below_output` = 0, OCR gate ran with 0 findings — the four
capture criteria hold; the storyboard skeleton passes the paper gates (scorecard 87.5). `wowprobe.py` is
implemented; nothing renders yet, so the ffmpeg / HyperFrames gates wait for the baseline render.

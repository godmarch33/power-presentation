# examples/ — golden-set fixtures (GS-01…GS-06)

**Status: MVP set complete on 2026-09-20 (roadmap item 7).** These directories hold the light, git-friendly part of
the golden set: READMEs, `claims.json`, `prospect.json` / `metrics.csv`, a synthetic landing page, a VHS tape with its
mock CLI, an OpenAPI stub, doc/design placeholders, a `flow.json` for `record-flow` and a **storyboard skeleton** per
fixture. The heavy part (recordings, VHS frames, auto-zoom, the pre-render probe — the ≈ 120 MB `evals/fixtures/`
set) is built locally and git-ignored:

```bash
node scripts/golden-set.mjs list                       # what exists, what is built
node scripts/golden-set.mjs verify                     # offline: classes, story + claims, storyboard gates, capture criteria when built
node scripts/golden-set.mjs build [--only gs-02,gs-03] # GS-01 from https://plausible.io/plausible.io (network), GS-02 from a local server over site/, GS-03 via vhs
```

Measured 2026-09-20 on this machine: `build` = 12 s (GS-02), 19 s (GS-01, 11.9 s of 3840×2160 footage, 12 events / 5
clicks, 2 auto-zoom segments, `capture_size_below_output` = 0, OCR gate clean), 24 s (GS-03, 15.3 s VHS session +
154 frames); `verify` passes 3/3 with `gates_failed: 0` on paper (scorecards on paper: 87.5 / 82.2 / 79.2 — the
hook-speed metric is what holds GS-03 under 80, its first outcome lands at 9 s).
The heavy fixtures have no hosting yet — every developer builds them locally.

Each fixture carries a `claims.json` (GS-01 excepted: a real product whose sourced numbers come from the live capture
at capture date), a storyboard skeleton and the CLI pin (`hyperframes@0.8.47`, range `0.8.x`,
`scripts/lib/versions.mjs`); a CLI bump requires a re-baseline. The set grows from 3 fixtures in
MVP to 6 in v1.

## Storyboard skeletons

`examples/<gs>/storyboard-skeleton.md` is the shape a `/present` run is expected to produce on the fixture, written in
the plugin's `STORYBOARD.md` contract (`agents/story-director.md`): vendor keys + `role`, `beat`, `evidence_tier`,
`poster:` and the `- text: "…" @ start-end` timeline. `scripts/wowprobe.py --storyboard` passes the storyboard gates
(QA-04, QA-05, QA-10, QA-12, QA-13) on every skeleton with the fixture claims — that is the "3/3 fixtures:
gates_failed: 0" exit criterion *on paper*; the ffmpeg and HyperFrames gates wait for a render.

## Golden set (table)

| ID | Product | Mode and length | Material | Phase | Directory |
|---|---|---|---|---|---|
| GS-01 | Plausible (web analytics) | marketing 45 s | real URL and dashboard; `record-flow` recording (tier A) | MVP | `gs-01-plausible/` |
| GS-02 | Ledgerly | synthetic B2B SaaS, sales 60 s | `claims.json`: 7 sourced numbers + 1 sourced quote + 2 decoy numbers; `prospect.json`; `metrics.csv` for the investors run; storyboard skeleton | MVP | `gs-02-ledgerly/` |
| GS-03 | CLI/API without UI | marketing, not a single screen (45 s in the skeleton) | VHS tape + mock CLI (`bin/acmejobs`) + OpenAPI + Figma link + `docs/`; `claims.json` (status code, example id, 1 decoy); frame roles `terminal`, `code`, `api`, `design`, `file` | MVP | `gs-03-cli-api/` |
| GS-04 | Product at the mock-up stage | marketing 30 s | Figma/PNG frames only, labelled "Design preview", no live UI | v1 | — (not created yet) |
| GS-05 | Sprout | mobile 30 s 9:16 | `simctl`/`adb` recording, brand kit | v1 | — (not created yet) |
| GS-06 | Northwind | investors 90 s | `metrics.csv` with sources + PDF deck | v1 | — (not created yet) |
| N1/N2 | negative cases | — | prompts that must not trigger the plugin | MVP | `../evals/no-trigger-vacation/` (N1); `../evals/no-trigger-readme-section/` (N2) |

The non-UI fixture is part of MVP on purpose: products without UI (backend, CLI, mocks, files) are a brief requirement,
not an extension. Minimal `design-frames` and `file / doc` scenes are verified on GS-03; a whole product made of
mock-ups is GS-04 in v1.

## MVP exit criteria that run on these fixtures (roadmap table)

- All 3/3 fixtures: `gates_failed: 0` (QA-01…QA-14), scorecard and vision critic above the thresholds.
- GS-01 recording: cursor synthesised from `events.jsonl`, ≥ 1 auto-zoom, first product frame within QA-04,
  lint `capture_size_below_output` = 0.
- GS-02: personalisation and outreach letter; an `--for investors --metrics` run on GS-02 shows traction
  numbers and the ask card (the full investors fixture GS-06 is v1). The former RU run (Piper VO) was
  withdrawn on 2026-09-19 — the video is English only.
- GS-03: like the other two fixtures, `gates_failed: 0` with the scorecard and the vision critic above the thresholds.
  Its frames come from the non-UI scenes (terminal, code, api, file); a `design` frame needs a source that is not
  named yet — reported by `golden-set verify`, not required. The API card is tier B from the spec unless the run
  calls the product's own server.
- Autonomous run time and tokens within budget (45 min wall time, $25).

## Baseline

The first baseline compares `/brag`, the raw HyperFrames route and this plugin on GS-01…GS-03; its result is
the `baseline` table. Protocol and state: `../evals/baseline/README.md`.

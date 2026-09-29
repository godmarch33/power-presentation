# Changelog

All notable changes to `power-presentation`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [semver](https://semver.org/).
The `version` in `.claude-plugin/plugin.json` pins the plugin for marketplace users, so every release bumps it.

## Unreleased

## 0.3.1 — 2026-09-29

### Added

- Public repository on GitHub: CI with CodeQL and Dependabot, issue and pull-request templates, labels as code,
  a contributing guide, a code of conduct and a security policy.

### Changed

- The code carries no comments; the docs, prompts, tests and output files no longer reference internal planning
  documents. The README is rewritten as a short user guide.
- `guard-render` reports failed gates by name: `storyboard-approved`, `edit-scope`, `capture-clean`,
  `toolchain-ready`.
- JSON outputs drop the fields that pointed at planning documents; golden-set checks are named `product-class`, `claims`, `claims-sourced`,
  `metrics` and `prospect-hook`; the autonomous-run verdict reports `wall` and `cost`.
- CI runs on `main` and pull requests only, with least-privilege tokens, SHA-pinned actions and ffmpeg installed
  so the media tests run.

### Fixed

- The toolchain tests no longer depend on a system ffmpeg.

## 0.3.0 — 2026-09-28

### Added

- The running product is the first story source: `record-flow` writes `screens.jsonl` (titles, headings, actions
  and values of every flow step) and `extract-story --screens` turns them into features and demonstrated claims.
- Source precedence for facts: the working product, then the repository, then the landing page.
- Hero-feature scoring favours what the product does over the landing headline.
- Landing-only runs find the app the landing links to and recommend recording it with a demo account.
- The essence test: the storyboard must show what the product is; the critics read it back from the contact sheet.
- `/present` without parameters scans the project first and asks at most four questions in one form.
- `model_mix: economy` for smaller subscriptions (Sonnet only, no critic panel, two agents at a time) and a
  `critic` switch; an interrupted run resumes on the next `/present`.
- A progress bar for headless runs.

## 0.2.0 — 2026-09-28

The first release that renders end to end: the GS-02 sales fixture ships as a 16:9 master and a 9:16 cut with
every quality gate green.

### Added

- The render path (`scripts/render-path.mjs`): audio, frame packets, frames, assembly, verification, render and
  delivery, with a cost estimate before dispatch, stage timing, approvals, versions and per-frame review comments.
- Capture: `record-flow` for web and Electron (prod → staging → local → recording, three-layer redaction with an
  OCR + gitleaks gate, seeded demo data), `record-terminal` for CLI products via VHS, and `autozoom` for camera
  moves, a synthetic cursor and the 9:16 window.
- `/present --repo`: the repository alone is the source — dev server, built app, static site, VHS tapes or the
  README's commands; a product behind a landing page is recorded from its app.
- Quality: `wowprobe.py` measures the 14 gates and the scorecard on the master; a three-vote vision critic panel
  reviews both formats; a draft preflight render catches frozen frames and late hooks early.
- Audio: offline Kokoro voice-over with a per-line cache, first-run music and SFX packs with beat-locked cuts,
  voice ducking and loudness normalisation per destination.
- Brand kits, font staging and pinning, a media ledger that refuses unlicensed assets, a network audit and the
  `--privacy local` profile, sales prospect data retention, share-copy lint and `run-report.json`.
- A toolchain installer with a doctor gate, the vendored HyperFrames workflow, the golden set (GS-01…GS-03),
  a baseline harness, plugin evals and an unattended-run harness.
- The user sees a progress bar instead of the orchestrator's reasoning; every file of a run lives in
  `power-presentation-out/<name>/`.

## 0.1.0 — 2026-09-18

- Initial plugin skeleton: the `/present` skill and its references, agents, hooks, the inspect and extract
  scripts, eval cases and golden-set fixtures.

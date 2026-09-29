# GS-02 via `--repo` (the Ledgerly site as a repository) — unattended pass, 2026-09-27 22:22–23:38

`node scripts/autonomous-run.mjs --run gs-02-repo` at 8849b5d, `bwrap` isolation, throttle `nice 10, cpus
0-3,5-7,16-19,21-23`, `POWER_PRESENTATION_MAX_AGENTS=2`. Invocation: `--for marketing --duration 45 --repo --yes`; the
run directory holds only the fixture's `site/` and `claims.json` (no README: the fixture README is the answer key) —
no URL, no `--local`. The first pass of `/present --repo` (repo-source.mjs d43820e, SKILL § 4a 71a8d2f).

**Outcome: delivered and ships; `expect` ok, `root_leaks: []`.**
- `expect`: `intake.json` `source.kind = repo`; `source-plan.json` routes `web-ui → local-static` (tier A: `site/`
  served from loopback and recorded — the four clicks Auto-match → audit trail → Close September → Lock period).
- Every file of the pass is in `power-presentation-out/ledgerly-repo-marketing/`; the run directory holds the inputs,
  the harness files and the workspace only.
- `ledgerly-repo-marketing_16x9.mp4`, 45 s, music only (CC BY bed + 5 SFX, −18.0 LUFS). Post-render `gates_failed: []`
  (14/14; QA-13 waived — the repository names no public URL; QA-11 waived — see below), scorecard **92.6**, vision critic
  ship 3/3, mean 3.48, lowest 1 (one readability vote: the solid caption cards cover table cells).
- The declared "10x faster" and "50,000 customers" (no source in the repository) never reached the screen or the copy.
- **$21.02 — met**; 4536 s session wall (wall-time target missed at the 2-agent cap). Stage seconds: frames 1258,
  storyboard 772, review 577, verify 435 (6 passes), render 85 (2), deliver 50, capture 49, brief 39, intake 26,
  inspect 22, assemble 13 (5).

## Plugin defects this pass surfaced

| # | Defect | Fix |
| --- | --- | --- |
| R1 | QA-11 read a quote's two separate 2-line reveals (0.1 s each, 0.5 s apart) as one uneven stagger — a fix round and a waiver | 2d524db (`_stagger_runs()`: split at a beat gap) |

Open: see-through caption cards over the recorded table were fixed by the orchestrator from snapshots (no gate measures
text over footage); two proof cards hold still ≈ 2.5 s (QA-07 passed). This pass predates `render-path preflight`
(a243ffc), so its second render was not caught before approval.

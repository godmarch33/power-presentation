# evals/ — plugin eval suite

**Status: per-PR tier running (2026-09-20, roadmap item 8).** Six cases are wired and load with `claude plugin eval`;
the four negative / trigger cases and the storyboard case were run on 2026-09-20 on a Claude subscription (no API
key needed — each run is a `claude` child on the operator's own credential; results below). The nightly render case
fails until the render path lands.

Format: Claude Code plugin evals (`case.yaml`, `schema_version: "1.1"`), documented at
<https://code.claude.com/docs/en/plugin-evals>. Requires Claude Code ≥ 2.1.269.
This is **not** the skill-creator `evals/evals.json` format; the eval harness is built
from the native plugin-eval cases here instead. Every run and every `llm`/`baseline` grader is a billed
model call; the suite uses only free graders (`tool_used`, `regex`, `file_exists`), as the per-PR tier requires.

## Cases

| Case | Tag(s) | Phase | What it checks | Golden set |
|---|---|---|---|---|
| `trigger-marketing-url/` | `trigger`, `per-pr` | MVP | A marketing request with a prod URL and two formats fires `present`; reply names BRIEF / storyboard / intake | GS-01 |
| `trigger-investors-metrics/` | `trigger`, `per-pr` | MVP | An investor-demo request mentioning `metrics.csv` fires `present` and answers in investors mode | — |
| `no-trigger-vacation/` | `no-trigger`, `per-pr` | MVP | Negative case N1: a vacation-planning prompt fires no `present*` skill (`min: 0, max: 0, arm: both`) | N1 |
| `no-trigger-readme-section/` | `no-trigger`, `per-pr` | MVP | Negative case N2: a README edit that *talks about* a launch video is a writing task — no `present*` skill, no render; reply contains the section text | N2 |
| `storyboard-ledgerly/` | `storyboard`, `per-pr` | MVP | Sales run on the GS-02 fixture with `--prospect`: keeps "Ledgerly", states the GDPR Art. 14 / Art. 21(2) letter rule | GS-02 |
| `render-plausible-45s/` | `nightly`, `render` | **v1** | Full GS-01 render: an mp4 under `renders/` and a `run-report.json` exist | GS-01 |

## Results (2026-09-20, `claude` 2.1.278, `--ablation none --runs 1`, subscription credential)

| Selection | Cases | Pass | Cost | Wall | Notes |
|---|---|---|---|---|---|
| `--case 'no-trigger-*'` | N1 `no-trigger-vacation`, N2 `no-trigger-readme-section` | 2/2 | $0.48 | 72 s | `tool_used: Skill` min 0 / max 0 held in both; N2's `answers-with-readme-text` regex matched |
| `--case 'trigger-*'` | `trigger-marketing-url`, `trigger-investors-metrics` | 2/2 | $3.37 | 561 s | `trigger-investors-metrics`: 15 turns, $1.20, 160 s; `trigger-marketing-url`: 1 turn, **$2.18, 401 s** (the skill's single turn reads the whole plugin — the "< $2 per PR" budget is already exceeded by one case; open: raise the budget or cap the read with `max_turns` / a leaner skill preamble) |
| `--case storyboard-ledgerly` | `storyboard-ledgerly` | 1/1 | $2.36 | 595 s | 22 turns; all three graders passed (`present` fired, "Ledgerly" kept, GDPR Art. 14 / Art. 21 stated) |

Per-PR tier total on 2026-09-20: **5/5 cases, $6.21, ≈ 20 min** on `--runs 1 --ablation none` — above the "< $2" budget;
the two expensive cases are the ones that let the skill read the whole plugin (`trigger-marketing-url`, one 401 s
turn) and dispatch the story director (`storyboard-ledgerly`). Open: either raise the per-PR budget to ≈ $7
or cap those cases (`max_turns`, a leaner skill preamble).

`--case` takes **one** glob (the last flag wins): `*trigger-*` selects the four per-PR trigger / no-trigger cases at
once — that is what `npm run eval:smoke` runs. Raw JSON of every run lives in `evals/results/<name>-<date>.json`
(git-ignored) next to the HTML report.

## Cadence

| When | Phase | What runs | Budget / flags |
|---|---|---|---|
| Every PR | MVP | Trigger + storyboard cases, free graders only (`file_exists`, `regex`, `tool_used`) | `--ablation none`, < $2 per run |
| Every HyperFrames CLI bump | MVP | `hyperframes lint` / `check` / `render` on the golden set; re-baseline after an upgrade | pin `hyperframes@0.8.47`, range `0.8.x` (`scripts/lib/versions.mjs`) |
| Nightly | v1 | Renders of GS-01 and GS-03 (GS-06 once it exists) | `--runs 1 --max-cost-usd 40 --threshold 0.8` |
| Weekly | v1 | Full two-arm run (`--ablation with-without`) with pairwise comparison | pairwise regressions are v1 |

A render case writes `QA/{wowprobe.json,check.json,contact-sheet.png}`; a full 60 s pass is ≈ 2 min and ≈ $0.10 of
judge tokens. The first baseline on the three MVP fixtures (GS-01, GS-02, GS-03) compares three routes — brag,
raw HyperFrames, this plugin — and is budgeted at 1 day and $60–120 of tokens; its result is recorded
in `evals/baseline/`, not here.

## Running

```bash
# per-PR smoke (what package.json `eval:smoke` runs): the four trigger + no-trigger cases, one run, one arm
claude plugin eval . --trust-plugin --ablation none --runs 1 --no-publish --case '*trigger-*'

# storyboard case (needs the Agent tool, granted by the case; no Bash/Write needed)
claude plugin eval . --trust-plugin --ablation none --runs 1 --no-publish --case storyboard-ledgerly

# nightly (v1) — Bash/Write/Edit must be granted on the CLI; on Linux install bubblewrap + socat first
claude plugin eval . --trust-plugin --no-publish --tag nightly --runs 1 --max-cost-usd 40 --threshold 0.8 \
  --allow-tools Bash Write Edit
```

Put the target (`.`) before `--tag`, `--allow-tools` and `--json`. Results land in `evals/results/<timestamp>/`
(`aggregate-result.json`, `report.html`); the directory is git-ignored. Scorecard trends (`evals/results/trend.tsv`)
are appended by `scripts/wowprobe.py --trend` (implemented 2026-09-20); the baseline harness writes its own
`evals/baseline/trend.tsv`.

Runs are isolated: no user settings, hooks, CLAUDE.md, MCP servers or memory load, and the eval directory is hidden
from the agent. The storyboard case therefore inlines the prospect record in its prompt instead of pointing at
`examples/gs-02-ledgerly/prospect.json`. If a two-arm run reports "ablation requested but no plugin resolved",
uncomment `plugins: ["../.."]` in the affected `case.yaml`.

## Fixtures

The heavy golden-set fixtures (`evals/fixtures/`, ≈ 120 MB: recordings, VHS frames, auto-zoom) are built
locally by `node scripts/golden-set.mjs build` and git-ignored; `examples/` holds the light part for GS-01…GS-03
(READMEs, claims, storyboard skeletons, flows — see `examples/README.md`) and `node scripts/golden-set.mjs verify`
checks both parts. The ≈ 120 MB set has no hosting yet, so CI does not fetch it.
The three-route baseline lives in `evals/baseline/`.

## Adding a case

`claude plugin eval init --bare <name>` writes a blank `prompt.md` + `graders/criteria.md`; this suite prefers the
single-file `case.yaml` form. Keep per-PR cases on free graders; put anything that needs a judge (`llm`, `baseline`)
behind the `nightly` tag.

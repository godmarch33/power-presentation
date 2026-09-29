# Contributing to power-presentation

Thanks for helping. `power-presentation` is a Claude Code plugin — skills, agent prompts, hooks
and dependency-free Node / Python scripts — on top of the HyperFrames CLI. This guide covers
how to set up, what a pull request needs, and the conventions the repository already follows.
The same rules, written for coding agents, are in [`AGENTS.md`](AGENTS.md).

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Security problems go
through [`SECURITY.md`](SECURITY.md), never a public issue.

## Before you start

- **Bugs and small fixes**: open a pull request directly, or an issue first if you are unsure.
- **New behaviour, new flags, new gates**: open a
  [feature request](https://github.com/godmarch33/power-presentation/issues/new/choose) first and
  wait for the maintainer's go-ahead before writing code.
- Issues labelled [`good first issue`](https://github.com/godmarch33/power-presentation/labels/good%20first%20issue)
  and [`help wanted`](https://github.com/godmarch33/power-presentation/labels/help%20wanted) are
  ready to pick up — comment on the issue so nobody duplicates the work.

## Development setup

Requirements: **Node ≥ 22**, **Claude Code ≥ 2.1.269**, `python3`, `bash`. Optional, for the tests
that skip without them: `ffmpeg` / `ffprobe`, `tesseract`, `gitleaks`, Playwright with Chromium.

```bash
git clone https://github.com/godmarch33/power-presentation.git
cd power-presentation

# run Claude Code with the plugin loaded from this checkout
claude --plugin-dir .
```

There is nothing to `npm install`: the plugin has **no npm dependencies and no lockfile** on
purpose (with a lockfile Claude Code runs `npm ci` on every cache copy). The heavy toolchain
(HyperFrames CLI, chrome-headless-shell, Playwright, optional Kokoro / whisper) is installed per
machine into `${CLAUDE_PLUGIN_DATA}` by the `SessionStart` hooks or by
`node scripts/toolchain.mjs install` — see [`scripts/README.md`](scripts/README.md).

## Checks — what CI runs

Run these before you push; the `ci` workflow runs the same on every pull request and a pull
request merges only when it is green.

```bash
npm test                                  # node --test "scripts/*.test.mjs" (unit + fixture tests; python unittest inside)
claude plugin validate --strict .         # manifest, skills, agents, hooks
node scripts/vendor-workflow.mjs check    # vendored HyperFrames workflow still matches its provenance
node scripts/golden-set.mjs verify        # golden set, light (offline) part
python3 -m py_compile scripts/*.py
for f in workflows/*.js; do node --check "$f"; done
for f in hooks/*.sh scripts/*.sh; do bash -n "$f"; done
```

While iterating, run one file: `node --test scripts/<name>.test.mjs`. A change to the HyperFrames
pin (`scripts/lib/versions.mjs`) or to `vendor/` also triggers the heavier `pin-bump` workflow,
which installs the real toolchain.

## Making a change

1. Fork the repository and branch from `main` (`fix/…`, `feat/…`, `docs/…`).
2. Keep the pull request small and focused — one script, one stage or one doc section. Several
   small commits are welcome; each one should leave the tree working.
3. Every script change comes with its test in the `*.test.mjs` (or `test_*.py`) file next to it.
4. Update the docs in the same pull request: the `README.md` status table, `scripts/README.md`,
   and a line under `## Unreleased` in [`CHANGELOG.md`](CHANGELOG.md) (Keep a Changelog format).
5. Open the pull request with the template filled in; the maintainer reviews it (see
   [`.github/CODEOWNERS`](.github/CODEOWNERS)) and squash-merges it.

### Commit messages

One imperative summary line, then a short body saying what changed and what is still open:

```
record-flow: skip unchanged steps in screens.jsonl

The per-step screen record is written only when the URL or the visible
headings change; footage_t_sec stays on each entry. 1 new test.
```

## Conventions

- **Scripts** are `.mjs` ES modules with a `node:test` file next to them; Python scripts have
  `test_*.py` (`unittest`). No third-party runtime dependencies.
- **Hooks** stay `bash -n` clean and run in dry-run mode unless `POWER_PRESENTATION_HOOKS_ENFORCE=1`.
- **Exit codes**: `0` ok, `1` runtime failure, `2` usage error, `3` a gate failed, `64` not
  implemented ([`scripts/README.md`](scripts/README.md#exit-code-convention)).
- **Nothing big in the package**: captures, renders, fixtures, eval results and music are
  git-ignored; CI fails the build above 5 MB or on any bundled audio file.
- **English only** in video copy, voice-over and captions, and in code and docs.
- **No comments in the code**: clear names and small functions instead; explanations go into the docs.
- **The plugin stays universal**: a product used in an example or a golden-set fixture is an
  illustration, never a template — no product-specific wording or thresholds in `skills/` or `agents/`.
- **Unknowns are never invented**: when a behaviour is undecided, ask in the issue instead of guessing.

## Labels

Issues and pull requests are triaged with four label families: `type/…` (bug, feature, docs,
chore, question), `area/…` (one per pipeline stage — intake, inspect, capture, story, render,
qa-gates, deliver — plus hooks, toolchain, evals, ci), `priority/…` and `status/…` for triage
state. `good first issue` and `help wanted` mark issues open to newcomers. The labels are defined
in [`.github/labels.json`](.github/labels.json); a change there is applied by the `labels` workflow.

## License

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE),
the same licence as the project.

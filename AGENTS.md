# AGENTS.md — rules for every agent working on this repository

These rules apply to any coding agent (Claude Code and its subagents, or any other tool
that reads `AGENTS.md`) and to every human contributor that edits this repository. Claude Code
loads it through `.claude/CLAUDE.md` (`@../AGENTS.md`); a root `CLAUDE.md` is refused by
`claude plugin validate --strict`, so keep it there. They are development-time rules for
*this repo*; the runtime prompts in `agents/*.md` (story director, frame workers, critics)
run inside a user's project and are not covered here. How to open a pull request is in
[`CONTRIBUTING.md`](CONTRIBUTING.md).

A maintainer may keep machine-specific rules in a git-ignored `AGENTS.local.md` next to this
file; `.claude/CLAUDE.md` imports it when it exists.

## 1. Small iterations, one commit each

- **Work in small, self-contained iterations** (one script, one stage, one doc section,
  one test file — roughly 15–30 minutes of work at most) and **commit after every one**.
  A commit is the unit of progress; uncommitted work is treated as lost.
- **Commit before any long or heavy step** (a toolchain install, a Kokoro / whisper run,
  a `hyperframes render`, a golden-set build, an eval run) — never after. The step's
  outputs land in git-ignored directories anyway (`evals/baseline/runs/`,
  `evals/fixtures/`, `renders/`, `*.mp4`).
- **Commit a working tree, not a broken one**: run the smallest relevant check first
  (`node --test scripts/<name>.test.mjs`, `node --check`, `bash -n`, `python3 -m
  py_compile`). If a check cannot run yet, say so in the commit message rather than skip
  the commit — a committed half-step with an honest message beats an uncommitted one.
- **Never batch documentation for "the end"**: the README / CHANGELOG / `scripts/README.md`
  line for a script is part of the same iteration as the script (or the very next commit).
- Commit messages: one imperative summary line, then a short body of what changed and what
  is still open. An agent ends it with the attribution line its session provides.
- Changes land on `main` through a pull request with a green `ci` run (the `main` ruleset
  enforces it; see `CONTRIBUTING.md`). The full suite is `npm test`
  (`node --test "scripts/*.test.mjs"`).

## 2. Where the plan lives

- `CHANGELOG.md` `Unreleased` records what landed; open work is tracked in GitHub issues.
- A fact nobody has decided is never invented: ask in the issue, or leave the behaviour
  unchanged and say so in the pull request.

## 3. Conventions that already hold

- No npm dependencies, no lockfile (with a lockfile Claude Code runs `npm ci` on every cache copy).
- Scripts are `.mjs` with a `node --test` file next to them; Python scripts have
  `test_*.py`; hooks are `bash -n` clean and dry-run unless `POWER_PRESENTATION_HOOKS_ENFORCE=1`.
- Everything big or per-run stays out of the package (5 MB limit): captures, renders,
  fixtures, eval results are git-ignored.
- English only in copy, VO and captions; the code and docs are English too.
- No comments in the code: names and small functions carry the meaning; the docs explain the rest.

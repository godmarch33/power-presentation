# hooks/ — power-presentation hooks

Phase: MVP. Scope: SessionStart doctor + async install, PostToolUse lint on frames,
PreToolUse render guard, asyncRewake on background render, plus the owner's progress
line (2026-09-27); quality gate QA-02.

**Status.** The SessionStart pair is real (2026-09-20): `session-start.sh` probes the
toolchain, seeds the vendored workflow and exports the environment; the async
`toolchain-install.sh` installs `hyperframes@0.8.47`, chrome-headless-shell, Playwright
and (when missing) a static ffmpeg into `${CLAUDE_PLUGIN_DATA}/toolchain` and writes the
doctor gate (`scripts/toolchain.mjs`). The three tool hooks keep their
**dry-run / enforce** switch: unset or `0` (default) = each hook evaluates what it would
do, writes that to stderr and exits 0; `POWER_PRESENTATION_HOOKS_ENFORCE=1` = enforce.

## Events

| Event | Matcher | Script | Timeout | What it does |
|---|---|---|---|---|
| `SessionStart` | `startup\|resume\|clear` | `session-start.sh` | 60 s | Synchronous, no network. (0) `node scripts/toolchain.mjs adopt` — a data dir without a toolchain (a new install of the plugin) links the ready one of another install (`~/.claude/plugins/data/power-presentation*`). (1) `node scripts/toolchain.mjs status` → one context line: toolchain state under `${CLAUDE_PLUGIN_DATA}` (hyperframes `0.8.47`, chrome-headless-shell, Playwright `1.63.0`, ffmpeg), the saved `doctor.json` gate, missing core skills, vendored-vs-installed workflow drift. (2) `node scripts/vendor-workflow.mjs seed` — copies `vendor/product-launch-video` into `~/.claude/skills/` when that skill is absent and returns the JSON form with `reloadSkills: true`; never overwrites (opt-out `POWER_PRESENTATION_NO_SEED_WORKFLOW=1`). (3) `node scripts/toolchain.mjs env` appended to `$CLAUDE_ENV_FILE`: `POWER_PRESENTATION_DATA`, toolchain `PATH`, `HYPERFRAMES_BROWSER_PATH`, `PLAYWRIGHT_BROWSERS_PATH`, static-ffmpeg paths, `HYPERFRAMES_SKIP_SKILLS=1`; under `CLAUDE_PLUGIN_OPTION_PRIVACY=local` also `HYPERFRAMES_NO_TELEMETRY=1`, `DO_NOT_TRACK=1`, `HYPERFRAMES_NO_UPDATE_CHECK=1`, `POWER_PRESENTATION_PRIVACY=local`. (4) Says whether the async installer runs. Without node ≥ 22 it only says so. |
| `SessionStart` | `startup\|resume\|clear` | `toolchain-install.sh` | none (`async: true`) | Background. Runs `node scripts/toolchain.mjs install --if-needed --quiet --json` — returns at once when the toolchain is ready or another install holds the lock; otherwise installs into `${CLAUDE_PLUGIN_DATA}/toolchain` and reports the result as `additionalContext` on the next turn (ready summary, or the failure + log path). Skipped silently under `POWER_PRESENTATION_NO_AUTO_INSTALL=1`, under privacy=local (the network manifest must be confirmed first: `toolchain.mjs manifest`, then `install --confirm-network`), and without node ≥ 22. Media packs are not fetched: no pack manifest exists yet (`assets/README.md`). |
| `PreToolUse` | `Bash` | `guard-render.sh` | 200 s | Only for commands matching `hyperframes[@ver] render`. The project is the run workspace the command names (`project-root.sh`: a leading `cd <dir> &&`, the `render <dir>` argument, `--project <dir>`), else the session cwd. Gates: `check-ok` — `QA/check.json` has `ok: true` (QA-02); `storyboard-approved` — `STORYBOARD.md` contains `approved: v<N>`; `edit-scope` — `git diff --name-only HEAD` + untracked files ⊆ `renders/edit-scope.json` `.files[]` (the bookkeeping render-path exempts — stage clock, progress line and its tmp file, tokens, egress log — is not an edit); `capture-clean` — no `capture-manifest.json` under the project (depth ≤ 4) is `blocked: true` or unscanned (`layer2_ocr_gate.ran != true` without `confirmed: true`) (added 2026-09-20); `toolchain-ready` — `${CLAUDE_PLUGIN_DATA}/doctor.json` has `gate.ok: true` for the pinned CLI (the gate is written by `scripts/toolchain.mjs install` / `doctor`; added 2026-09-20). Enforce: prints a `deny` decision. |
| `PostToolUse` | `Edit\|Write` | `lint-frame.sh` | 30 s | Only when `tool_input.file_path` matches `**/compositions/frames/*.html`. Enforce: runs `hyperframes lint <project-root> --json` (25 s cap) and keeps the findings whose `file` is the edited frame; exits 2 with them so the report reaches Claude. It lints the project, not the file: CLI 0.8.x lints a project directory only (a file path answers "Not a directory", checked on 0.8.46). |
| `PostToolUse` | `Bash` (`asyncRewake: true`) | `render-rewake.sh` | 10 s | Only for `hyperframes render` that ran in the background `render-worker` agent or with `run_in_background`; the project is resolved as in `guard-render.sh` (`project-root.sh`). When `renders/manifest.json` changed, enforce mode exits 2 with a one-line summary, which wakes Claude. |
| `PostToolUse` + `Stop` | `Bash\|Agent\|Task\|Write\|Edit` (PostToolUse) | `progress.sh` | 5 s | Informational, always on (owner request 2026-09-27: the `/present` user sees a progress bar, not the orchestrator's narration). `scripts/progress.mjs --hook` finds the run — the `power-presentation-out/<name>/` workspace the tool call names (a linear scan of the path fields: command, file_path, path, prompt, description — never a Write's content); the session then remembers it in `<plugin data>/progress-sessions/<session_id>`, so its `Stop` and calls that name no path follow the same run and no other session does (another session stays silent while the owner showed a line in the last 45 min); a run followed without being named shows only a new stage, count or Done — computes its line from the stage clock, the frame files and the critic votes, and prints `{"systemMessage": "▕██████░░░░▏ 48%  Building the frames · 6/10  21 min", "suppressOutput": true}` only when the line changed (`.hyperframes/progress.json`); Claude Code shows it as `⎿ PostToolUse:Bash says: …` / `⎿ Stop says: …`. Checked live on 2.1.283: a subagent's PostToolUse notice and a `SubagentStop` notice are not shown, so a subagent's call (`agent_id` in the input) stays silent and records nothing — the main session's next tool call or its `Stop` (the end of every turn, also the short turn after a background worker finished) shows the change. The wrapper skips node unless the input mentions `power-presentation-out` or the session follows a run, and execs node (a timeout stops it). Off with `POWER_PRESENTATION_PROGRESS=0`. |

All hooks use **exec form** (`"command": "${CLAUDE_PLUGIN_ROOT}/hooks/x.sh", "args": []`),
so the plugin-root placeholder needs no quoting. No `if` rules are declared:
`if` is best-effort, and a `Bash(npx hyperframes render *)` prefix rule would
miss the pinned `npx hyperframes@0.8.47 render` form the plugin uses.
Each script filters its own input instead and exits 0
immediately when the call is out of scope, so the per-call cost on unrelated
tools is one JSON parse.

Changes to `hooks/` need `/reload-plugins` or a restart; `SKILL.md` edits do not.

## Dry-run vs enforce

| | dry-run (`POWER_PRESENTATION_HOOKS_ENFORCE` unset / `0`) | enforce (`=1`) |
|---|---|---|
| session-start / toolchain-install | not affected: they probe, seed, export and install regardless (nothing blocks; opt-outs are `POWER_PRESENTATION_NO_AUTO_INSTALL=1` and `POWER_PRESENTATION_NO_SEED_WORKFLOW=1`) | same |
| guard-render | evaluates the five gates (check-ok, storyboard-approved, edit-scope, capture-clean, toolchain-ready), logs `would DENY: …` or `gates pass`, prints nothing | prints the PreToolUse `deny` JSON when any gate fails; nothing when all pass (normal permission flow) |
| lint-frame | logs `would run hyperframes lint <project-root> --json` and the frame it would filter for | runs the project lint; exit 2 with the frame's findings (or the report tail when they cannot be attributed), on timeout, or when the CLI is missing (the frame is unverified, so the hook does not stay silent); exit 0 with a note when the frame is clean but other files fail |
| render-rewake | logs `would exit 2 to wake Claude with: …` | exits 2 with the summary line |
| progress | not affected: it only prints the progress notice (opt-out `POWER_PRESENTATION_PROGRESS=0`) | same |

Set the variable for the Claude Code process (for example in your shell before
`claude --plugin-dir …`); hooks inherit the process environment. It is not a
`userConfig` option on purpose: the tool hooks must stay harmless by default while
their gates are still being calibrated.

## stdin / stdout / exit-code contract

Every hook reads the event JSON from stdin (`session_id`, `cwd`,
`hook_event_name`, `tool_name`, `tool_input`, `tool_response`, `duration_ms`,
`agent_type`, `source`, …) and parses it with `jq` when installed, otherwise
with a `python3 -c` fallback. Without both, a hook logs that it cannot read its
input and exits 0 (guard-render in enforce mode denies with an explanatory
reason instead of guessing). Diagnostics always go to stderr.

| Script | stdout | exit 0 | exit 2 | other |
|---|---|---|---|---|
| session-start.sh | one plain-text line (SessionStart injects plain stdout into context), or the JSON form `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"…","reloadSkills":true}}` right after seeding the workflow | always | never | never |
| toolchain-install.sh | nothing (nothing to do / skipped), or `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"…"}}` with the install result (delivered on the next turn — async) | always | never | never |
| guard-render.sh | nothing, or exactly one `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"…"}}` | always (the deny travels in the JSON) | never (a dry-run must not be able to block) | never |
| lint-frame.sh | nothing | out of scope / dry-run / lint ok | enforce: lint failed, timed out, or CLI missing — stderr shown to Claude (tool already ran; nothing is blocked) | never |
| render-rewake.sh | nothing | out of scope / unchanged / dry-run | enforce: background render finished and `renders/manifest.json` changed — stderr summary wakes Claude | never |
| progress.sh | nothing, or one `{"systemMessage":"<progress line>","suppressOutput":true}` when the run's line changed | always | never | never (errors are swallowed: the hook never fails a tool call) |

Rules the scripts follow (see the official hooks reference): stdout is parsed
as JSON only when it starts with `{`, so guard-render never mixes text into
stdout; `exit 1` would be a non-blocking error and is never used; a timed-out
PreToolUse hook does **not** block, which is why guard-render does only cheap
file/git checks and reads the saved `QA/check.json` instead of re-running
`hyperframes check` (check takes up to 180 s; the 200 s budget leaves room for a
future version that re-runs it).

## Project files the gates read (QA-02)

| File | Written by | Read by | Notes |
|---|---|---|---|
| `QA/check.json` | `present-qa` skill: `hyperframes check --json --frame-check` | guard-render `check-ok` | `ok: true` required (QA-02, hard gate); waivers (`data-layout-allow-*`) must cite a snapshot in `QA.md` |
| `STORYBOARD.md` | story-director / human review | guard-render `storyboard-approved` | needs an `approved: v<N>` line (frontmatter key or `- approved: v3` bullet). HyperFrames keeps unknown frontmatter keys under `globals.extra`, so the key is parser-safe. Key name is a skeleton assumption. |
| `renders/edit-scope.json` | `present-edit` skill before an edit step | guard-render `edit-scope` | `{"version":"v<N>","files":["compositions/frames/03-proof.html"]}` (project-relative). The file itself is exempt from the diff check; everything else in the diff (including `QA/` and `renders/` outputs) must be declared or committed (`v<N>: <request>` after each gate). The file name and schema are the plugin's own; the rule is "reject when git diff is wider than the declared set". |
| `**/capture-manifest.json` (default `.media/capture/`) | `scripts/record-flow.mjs` | guard-render `capture-clean` | `blocked: true` (a Layer-2 OCR hit) or `redaction.layer2_ocr_gate.ran != true` without `confirmed: true` (gate skipped or tesseract missing) refuses the render until record-flow is re-run with `--confirm-findings` after a human read `redaction-findings.json`. No manifest = nothing to check (tier-C reconstruction). |
| `renders/manifest.json` | `render-worker` agent / `present-render` skill | render-rewake | JSON Lines: one object per accepted render with scene keys; the hook relays the last non-empty line. Entry schema: the skeleton schema in `agents/render-worker.md`. |
| `${CLAUDE_PLUGIN_DATA}/doctor.json` | `scripts/toolchain.mjs install` / `doctor` | guard-render `toolchain-ready` | schema `power-presentation/doctor@0.1`: `hyperframes` (CLI version), `gate.ok` (all required checks ok: Node, Memory, Disk, Frames cache, Archive extractor, /dev/shm, FFmpeg, FFprobe, Chrome), `gate.failed[]`, `gate.optional_missing[]`, `raw` (the CLI report). A report for another CLI version, a failed gate or no report refuses the render with the fixing command. The data dir is `CLAUDE_PLUGIN_DATA` (hooks) or `POWER_PRESENTATION_DATA` (exported by session-start). |

## Manual testing

```bash
cd ~/Documents/power-presentation
bash -n hooks/*.sh

# SessionStart context line against a throw-away data dir (nothing on the machine changes:
# the seed goes to $HOME/.claude/skills only when product-launch-video is absent there)
echo '{"source":"startup","cwd":"'"$PWD"'"}' | CLAUDE_PLUGIN_ROOT=$PWD CLAUDE_PLUGIN_DATA=$(mktemp -d) hooks/session-start.sh

# privacy=local → env exports land in CLAUDE_ENV_FILE; no automatic download
tmp=$(mktemp); echo '{"source":"startup"}' | CLAUDE_PLUGIN_ROOT=$PWD CLAUDE_PLUGIN_DATA=$(mktemp -d) CLAUDE_PLUGIN_OPTION_PRIVACY=local CLAUDE_ENV_FILE=$tmp hooks/session-start.sh; cat "$tmp"

# the async installer, by hand (≈ 1.7 GB, ~1 min on a fast line) — or the script directly:
node scripts/toolchain.mjs status            # what is there; exit 3 when not ready
node scripts/toolchain.mjs manifest          # hosts an install contacts
node scripts/toolchain.mjs install           # install / repair; `doctor` alone re-runs the gate

# guard-render: dry-run logs the verdict; enforce prints the deny JSON
echo '{"cwd":"'"$PWD"'","tool_name":"Bash","tool_input":{"command":"npx hyperframes@0.8.47 render index.html --quality delivery"}}' | hooks/guard-render.sh
echo '{"cwd":"'"$PWD"'","tool_name":"Bash","tool_input":{"command":"npx hyperframes render index.html"}}' | POWER_PRESENTATION_HOOKS_ENFORCE=1 hooks/guard-render.sh

# lint-frame: out-of-scope file → silent exit 0; frame file → dry-run note
echo '{"cwd":"'"$PWD"'","tool_name":"Write","tool_input":{"file_path":"/x/README.md"}}' | hooks/lint-frame.sh; echo "exit=$?"
echo '{"cwd":"'"$PWD"'","tool_name":"Write","tool_input":{"file_path":"/x/compositions/frames/01-hook.html"}}' | hooks/lint-frame.sh; echo "exit=$?"

# render-rewake: foreground render → exit 0; render-worker agent + fresh manifest → would wake
echo '{"cwd":"'"$PWD"'","tool_name":"Bash","agent_type":"power-presentation:render-worker","duration_ms":30000,"tool_input":{"command":"npx hyperframes render index.html"},"tool_response":{"interrupted":false}}' | hooks/render-rewake.sh; echo "exit=$?"
```

Debugging inside Claude Code: `claude --debug` (log at
`~/.claude/debug/<session-id>.txt`) or `claude --debug-file <path>`;
`CLAUDE_CODE_DEBUG_LOG_LEVEL=verbose` adds matcher details; `/hooks` lists the
plugin's hooks under "Plugin Hooks". Validate the manifest and hooks with
`claude plugin validate --strict .`.

## Dependencies

- `bash` ≥ 4 (arrays, `[[ =~ ]]`), `git` (guard-render `edit-scope` gate).
- `jq` **or** `python3` — JSON in/out. Neither is bundled; both are common.
- `timeout` (coreutils) — optional; caps the npx probe (20 s) and lint (25 s).
- `node` ≥ 22 — `session-start.sh` and `toolchain-install.sh` run `scripts/toolchain.mjs`
  and `scripts/vendor-workflow.mjs`; without it they only report (Node 22+ is
  the prerequisite the hook cannot install). `npm` for the install itself.
- `hyperframes` CLI — `${CLAUDE_PLUGIN_DATA}/toolchain/node_modules/.bin/hyperframes`
  (installed by the async hook; also first on `PATH` for later Bash commands), else
  `hyperframes` on PATH, else `npx --no-install hyperframes`. Layout of the data dir:
  `node scripts/toolchain.mjs paths` prints it.

## Not done yet (tracked TODOs)

- Media packs: no pack manifest (URLs, licences) exists yet, so the async installer
  does not fetch `${CLAUDE_PLUGIN_DATA}/media-packs/` (`assets/README.md` lists the intended
  packs).
- Upgrade check: `npx hyperframes@latest upgrade --project . --check`
  on `resume` (network; must be skipped under privacy=local). The saved `doctor.json` already
  carries the CLI's own update notice (`gate.version_notice`), which the pin ignores.
- Kokoro (voice) and whisper.cpp (captions) are optional `doctor` checks; since
  2026-09-20 the async installer also runs the `tts` / `whisper` steps (venv + smoke synthesis,
  whisper.cpp build + `small.en`), but their failure never blocks the gate.
- render-rewake for raw `run_in_background` renders polls only 8 s (10 s hook
  budget); the intended path is the `render-worker` agent.
- A `PostToolUseFailure` wiring for failed renders is not added; failures inside `render-worker` are reported by the agent's
  own summary.
- guard-render resolves the project root from stdin `cwd`; commands that `cd`
  elsewhere or pass `--project` are not followed.

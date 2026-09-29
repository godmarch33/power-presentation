---
name: present
description: "Make a wow-effect product presentation video for marketing, sales or investors from a repo, a production URL, a recording, or a product without UI (CLI, API, SDK, data, mocks, docs). Prod-first capture, storyboard, HyperFrames render, 14 QA gates, English only. Use for product, promo, launch, demo, pitch, sales-outreach or investor videos. Not for generic video editing."
argument-hint: "--for marketing|sales|investors [--repo [<path>] | --url <prod-url>] [--duration 45] [--format 16:9,9:16] [--voice] [--brand <dir|json>] [--preset <name>] [--reveal early|story-first] [--privacy local] [--model-mix economy|all-sonnet|opus-orchestrator|all-opus] [--critic|--no-critic] [--resume|--new] [--yes] [--verbose]"
allowed-tools: Read, Glob, Grep, Write, AskUserQuestion, Agent, Bash(npx hyperframes *), Bash(hyperframes capture *), Bash(node *scripts/*.mjs *), Bash(python3 *scripts/*.py *)
---

# /present — wow-effect product video on top of HyperFrames

The plugin is a thin orchestration layer: it writes `BRIEF.md`, enters the HyperFrames
`product-launch-video` workflow and adds its deltas — audience modes, capture, gates, and
the v1 scene cache. It never bypasses `/hyperframes` routing.

Arguments received: `$ARGUMENTS`

## 0. Status — read before promising anything

**Status: MVP render path wired (2026-09-27).** Inspect, Capture, the story director, the render path
(`scripts/render-path.mjs`: audio → packets → frames → assemble → verify → render → deliver, 16:9 and the 9:16
reflow), the QA gates, the vision-critic tally and Deliver are real — GS-02 (sales, 60 s) went through them. Still
stubs that exit with code 64 and print `NOT IMPLEMENTED: …, planned for v1`: the v1 scene cache
(`render-scenes.mjs`, `scene-key.mjs`) and the Workflow scripts (`pitch-panel`). When a step hits a
stub: report the exit, stop that step, and never fabricate its output file.

| Step | Backing script / component | State |
| --- | --- | --- |
| Inspect | `scripts/inspect-project.mjs`, `scripts/extract-story.mjs` | implemented: `product-profile.json`, `story-extraction.yaml` with provenance, `claims-index.json` with `unverified` + `gaps` |
| Capture | `scripts/record-flow.mjs`, `scripts/autozoom.mjs` | implemented for web/Electron: `footage.mp4` + `events.jsonl` + `capture-manifest.json`, three-layer redaction, `autozoom.json` (16:9 + 9:16); VHS backend for `cli`: `scripts/record-terminal.mjs` (the repo's tape, same gate and manifest) |
| Pitch round + storyboard | agent `story-director` | real (MVP); Workflow `pitch-panel` v1 stub |
| Audio, frames, assembly, render, deliver | `scripts/render-path.mjs` + the vendored `product-launch-video` scripts, agent `frame-worker` | real — § 7a |
| QA gates + scorecard (QA-01…QA-14) | `scripts/wowprobe.py`, `hyperframes check` | real, pre- and post-render |
| Vision critic | `scripts/critic.mjs` + agents `critic-pacing`, `critic-design`, `critic-readability`, `critic-brand`, `claims-auditor` | real — § 7a step 8 |
| Edit loop | `/power-presentation:present-edit`, `render-path approve` / versions | classification + versions real; per-scene re-render v1 stub |

## 0a. The run workspace — the only place a run writes

The directory `/present` starts in — or the `<path>` of `--repo <path>` (§ 4a) — is `REPO`, the user's project. The run **reads** it and **writes nothing into it**:
no scaffold, no `index.html`, `package.json`, `CLAUDE.md`, `AGENTS.md`, `assets/` or `node_modules` link there — a
HyperFrames scaffold in the repository root would meet the project's own files (the assembler rewrites `index.html`).
Every file of the run — intake, capture, story, frames, audio, QA, renders, the final video — lives in `P`:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/workspace.mjs --repo "<REPO>" [--for <mode>] [--prospect <file>] --json
```

It prints `{ repo, project, name }`: `P` = `<REPO>/power-presentation-out/<product>-<mode>/` (a second run of the same
video reuses the folder — the next version); the workspace's own `.gitignore` keeps it out of the user's
repository, and `render-path init` gives `P` its own git for the versions. From here on:

- **Every Bash command runs as `cd "<P>" && …`** with the absolute path (the shell may reset its directory between
  calls), so `--project .`, `intake.json`, `.media/…`, `capture/`, `QA/`, `renders/` in this skill all mean `P`.
- Commands that read the product take **`--repo "<REPO>"`** (absolute): Inspect, `extract-story`, `record-terminal`,
  `record-flow --local`.
- Paths the user typed (`--local ./site`, `--metrics`, `--prospect`, `--claims`, `--brand`, `--recording`) are
  relative to `REPO`: write them to `intake.json` as absolute paths and pass them that way.
- Every agent dispatch names `PROJECT_DIR=<P>` (absolute) and `REPO_DIR=<REPO>` (read-only).
- The deliverables end in `<P>/renders/final/` (`<name>_16x9.mp4`, the SRT, the poster) next to `<P>/share-copy.txt`
  and `<P>/run-report.json`; say those absolute paths in the final message.


## 0b. What the user sees — a progress bar, not your reasoning

The person who typed `/present` reads the transcript. For the whole run they see **a progress bar, the few questions
the run needs, and the result**, never your working notes (owner decision 2026-09-27). This binds every section below;
only `--verbose` (§ 1) lifts it.

- **No text between tool calls.** Do not announce the next step, sum up a tool result, relay what a worker or critic
  returned, describe a snapshot, name a failed gate or say what you will fix. Your analysis stays in your thinking,
  the findings stay in the files the stages already write (`QA/*.json`, `run-report.json`), and the fix goes straight
  into the next tool call. Make the next tool call with no text before it. A turn that only waits ends with no text.
- **The bar is the plugin's, not yours.** After every tool call and at the end of every turn the `hooks/progress.sh`
  hook shows the run's progress line as a notice whenever it changed, e.g. `▕██████████░░░░░░░░░░▏ 48%  Building the frames · 6/10  21 min`,
  computed by `scripts/progress.mjs` from the stage clock (`R time --begin/--end`, § 7a) and the files the stages
  write. Never type a bar or a percentage yourself; bracket every stage so the bar moves. Your last call before the
  report is `node ${CLAUDE_PLUGIN_ROOT}/scripts/progress.mjs --project "<P>" --finish` (the bar reads Done, 100 %).
- **Tool labels are part of the transcript.** A Bash `description` or an agent `description` names the step in a few
  words ("Stage: verify", "Frame 05", "Critic vote 2 · pacing"), never a finding or a plan.
- **Agents run in the foreground, all at once.** Frame workers (§ 7a step 5), a fix round (step 6) and the critic panel
  (step 8) go out as one message with every `Agent` call (in batches of the profile's `agents_at_once`, or of the
  operator's agent cap when your context states one), without `run_in_background`: the run waits once and the
  transcript shows one agent group, not a notice and a reply per agent. A fix goes to a new foreground dispatch of
  that frame's worker (packet + the finding), not to a running background agent. The only background agent is the
  interactive long render of § 12.
- **What you may write**, each short and in plain words, nothing else:
  1. a question the run needs: the § 2 form after the scan, the pitch choice (§ 6), a non-empty network manifest to
     confirm (§ 3), a Layer-2 capture block (§ 5), a tier-C confirmation, the budget stop (§ 7a step 3), a
     media licence the ledger cannot read (§ 8), the one review question (§ 9) — with the facts the answer needs, and no
     account of how you got there;
  2. the required notices, one line each and at most six in all: the decisions `--yes` took and the hosts
     the run contacts (before the first external call), the story gaps that stay open (once
     § 4 is done), a concept video (§ 4), the cost estimate before the workers (§ 7a step 3);
  3. a stop — the step that cannot go on (an exit 3 you cannot fix, a stub's exit 64) and what the user can do, in
     at most three lines;
  4. the final report (§ 7a step 9). Every other "say so" in this skill (a capture planned from a partial flow, a
     degraded gate, no auto-zoom) goes into `run-report.json` and that report, not into the transcript.

## 1. Parse flags → `intake.json`

**Resume before anything else** (owner decision 2026-09-28 — on a smaller subscription a run can stop at a usage limit;
a closed session or a restart stops it too, and nothing on disk is lost): `node ${CLAUDE_PLUGIN_ROOT}/scripts/workspace.mjs
--repo "<REPO>" --unfinished --json` lists the runs of this project that started and never finished. One such run, and
`$ARGUMENTS` is empty, `--resume`, or its `intake.json` `arguments_raw` → **continue it**: `P` is its `project`; do not
stamp `time --begin intake` (that starts a new run); read `intake.json` and the files on disk, write one line
"Continuing <name> from <label> (<percent> %)" (a § 0b notice) and re-enter the stage it names — `R time --begin` that
stage and redo it; every earlier stage's output stays (the voice synthesis is reused, only missing frame files get a
worker, only missing critic votes get a critic, a capture whose manifest is not blocked is kept). Other arguments, or
several unfinished runs → one question: which run to continue, or a new run (`--new`). No unfinished run, or `--new` →
a new run, below.

Your first action creates the workspace (§ 0a) and starts the stage clock: `cd "<P>" && node
${CLAUDE_PLUGIN_ROOT}/scripts/render-path.mjs time --project . --begin intake` (stage times, § 7a). Parse `$ARGUMENTS` into the table below. Write `intake.json` (schema:
[references/brief-schema.md](references/brief-schema.md)) with every flag marked **declared**
(typed by the user) or **derived** (default, userConfig, repo, interview) plus its source
requires the same split inside `BRIEF.md`. Write `model_mix` and `critic` (`on` / `off`) into `intake.json` too, then
read the run's profile once: `R profile --project .` (`scripts/lib/run-profile.mjs`). It binds every dispatch of the
run: the `Agent` call of the story director carries `model: <roles.story_director>`, each frame worker `model:
<roles.frame_worker>`, each critic `model: <roles.critics>` (the call's `model` wins over the agent file's); at most
`agents_at_once` agents run at a time when it is set; `critic: off` leaves out § 7a step 8; `critic_votes` is
`critic.mjs prepare --votes`.

| Flag | Values | Default when absent | Phase |
| --- | --- | --- | --- |
| `--for` | `marketing\|sales\|investors` | the § 2 form | MVP |
| `--duration` | `10–180` seconds | recommended from the mode's band, see [length-bands.md](references/length-bands.md) | MVP |
| `--format` | `16:9,9:16` (`1:1` v1) | derived from destination (brief-contract § 2); master is always 16:9, 9:16 is a `render --batch` cut | MVP / 1:1 v1 |
| `--reveal` | `early\|story-first` | `early` (QA-04 defaults apply; `story-first` may delay the product up to the QA-04 ceiling) | MVP |
| `--voice` | flag | on for `sales`/`investors`, off for `marketing` | MVP |
| `--url` / `--staging-url` / `--local` / `--recording` | source | auto-detect, else one question | MVP |
| `--repo [<path>]` | the repository is the source: scan it and make the video from it (§ 4a); `<path>` defaults to `REPO`, the directory `/present` starts in | — (not a flag — the owner's extension of `--local` and, 2026-09-27) | MVP |
| `--brand` | `<dir\|json>` | userConfig `brand_kit_dir` | MVP |
| `--preset` | `blue-professional\|code-editorial\|cartesian\|editorial-forest` | chosen by workflow Step 2 when the brief is silent | MVP |
| `--style` | `cinematic` (investors only) | — | v1 |
| `--privacy` | `local` | userConfig `privacy` | MVP |
| `--budget` | `<usd>` | userConfig `budget_usd` (threshold 25) | MVP value / v1 stop |
| `--yes` | flag | — | MVP |
| `--model-mix` | `economy\|all-sonnet\|opus-orchestrator\|all-opus` | userConfig `model_mix` (`opus-orchestrator`) — `economy` = Sonnet for every role, no critic panel, at most 2 agents at a time: the profile for smaller subscriptions | MVP |
| `--critic` / `--no-critic` | flag | userConfig `critic` (`auto`: on, off in `economy`) | MVP |
| `--resume` / `--new` | flag | resume an unfinished run when the arguments match (above) | MVP |
| `--verbose` | flag | off: the user sees the progress bar, the questions and the result (§ 0b); on: you may narrate the run, for plugin development | MVP |
| `--prospect` / `--pain` | `<file>` / `<text>` | — (sales only); `--pain` takes the pain statement as text (GS-02, `storyboard-ledgerly`) | MVP |
| `--metrics` | `<csv\|xlsx>` | — (investors only) | MVP |
| `--deck` | `<pdf\|pptx>` | — | v1 |
| `--recipe` | `<name>` | — (a named recipe) | v1 |

A v1/v2 flag passed today is recorded under `phase_blocked` in `intake.json` and reported, not
silently dropped. Mode flags on the wrong mode (`--metrics` with `--for sales`) are reported as
conflicts before any question.

## 2. Scan first, then one form of questions (owner decision 2026-09-28)

A user may type `/present` with no parameters. Before any question, look at the project — both commands read only, and
while the workspace has no name yet (it is named after the audience) their files go to the scan folder:

```bash
S=$(node ${CLAUDE_PLUGIN_ROOT}/scripts/workspace.mjs --repo "<REPO>" --scan)        # <REPO>/power-presentation-out/.scan/
node ${CLAUDE_PLUGIN_ROOT}/scripts/inspect-project.mjs --repo "<REPO>" [--url <url>] --out "$S/product-profile.json"
node ${CLAUDE_PLUGIN_ROOT}/scripts/repo-source.mjs plan --repo "<REPO>" --profile "$S/product-profile.json" \
  [--mode <mode>] [--url <url> --hero "$S/capture/extracted/page.html"] --out "$S/source-plan.json"
node ${CLAUDE_PLUGIN_ROOT}/scripts/interview.mjs --project "$S" --json                # reads "$S/intake.json" (the flags)
```

Write the typed flags first as `$S/intake.json` (`{"declared": {…}}`); with a declared `--url`, capture its page into
`$S/capture` before the plan (§ 4a). `interview.mjs` returns the form: **at most four questions in one AskUserQuestion
call** — the audience (`--for` missing), where the product is (this repository / another repository / only online —
asked only when the scan found no product app here), the landing page (online at the URL the repository names, its
landing directory, another URL, none) and how to show the product (raise it with the repository's own start, online,
its screenshots, a reconstruction). Each question already offers what the scan found, recommended first; ask them in
the user's language, pass `ask` to AskUserQuestion as it is, and map each answer back through the option's `value`
(a typed "Other" is the URL or path for that field). What the scan settled on its own is in `decided` — write it to
`intake.json` as derived, with its reason. Nothing open → no question.

Then create the workspace with the audience (§ 0a), move `product-profile.json`, `source-plan.json` and `capture/` from
`$S` into `P` (§ 4 reuses them) and write `intake.json` there:

- `product`: this repository → `REPO` as it is; another repository → that path is `REPO_DIR` (read only; `P` stays
  where it was created) — run the profile and the plan again on it; only online → the URL is the product's (`url_role:
  product`, prod).
- `landing`: a URL → `--url` for the message (the § 4 capture); the local directory → the plan's local landing
  (`combined`, `message.source: local-static`); another repository's path → capture `file://<path>/index.html`; none →
  no message source.
- `demo`: raise it → the `combined` / demo route of § 4a (`demo.how`); online → `record-flow --url`; screenshots → the
  plan's `fallback` (tier B); reconstruction → tier C (`sales` / `investors` confirm); a recording → `--recording
  <path>` (tier B). For a landing-only URL (`from: landing-screenshots`) the screenshots and the reconstruction are the
  app screens the landing publishes (§ 4a "Landing only"). When the landing links to the app (`app_url`), recording the
  app is the recommended answer (the working product is the first source): `needs_account` means sign in with
  `<P>/.demo-account.json` — without that file say so and take the question's `yes` answer instead.

The only other questions of a run are the **pitch choice** (§ 6) and those a stop needs (§ 0b). `--yes` takes
each question's `yes` answer when it has one (an answer that needs nothing from the user — the recommended one may
need a demo account), else its recommended first option, and prints the decisions.

## 3. Privacy profile and the network manifest

`--privacy local` (or userConfig `privacy=local`) enables the profile — the single definition
lives in [references/privacy-local.md](references/privacy-local.md). Before the **first external
call** — in every profile, right after `intake.json` is written (§ 1) and before Inspect — print the network
manifest: `node ${CLAUDE_PLUGIN_ROOT}/scripts/render-path.mjs manifest --project .` (`--project .` is the run
directory; the command reads `intake.json` and the flags and needs no HyperFrames scaffold). It lists the hosts the
run would contact; exit 3 under the profile when it is not empty. Wait for confirmation (`--yes` prints it and goes
on); under the profile the manifest must be empty and cloud render, `publish`, HeyGen and cloud TTS are
refused. External calls are logged to `.media/egress.jsonl`.

## 4. Inspect the product

```bash
cd "<P>" && node ${CLAUDE_PLUGIN_ROOT}/scripts/inspect-project.mjs --repo "<REPO>" --out product-profile.json
```

Implemented — when § 2's scan already wrote `product-profile.json` into `P`, keep it (run it again only when the form
moved the source to another repository). Pass `--url <prod-url>` when the user declared one (a declared URL is a web-surface
signal). Exit 0 = profile written (also when ambiguous), 1 = repo unreadable, 2 = usage.
The profile carries `surface` ∈ `web-ui|mobile|desktop|cli|api/backend|library/sdk|data/ml|mocks/design|files/docs`
from the documented signals (frontend framework, `openapi.*`, `Dockerfile`, `bin` in `package.json`,
`*.ipynb`, Figma links, only `.md` or datasets) plus the extras (`bin/`, `pyproject` entry points,
`mocks/`, `docs/`, `data/`, VHS `*.tape`) and labelled heuristics; `confidence` (`high|medium|low`),
`secondary` classes, `scenes` (the plan from the table, outro last), `capture.backend` and
`capture.needs_url`, `mode` (`product|concept|unknown`) and `question`. Then:

- Copy `surface` into `intake.json.surface` and the scene plan into the brief notes (brief-schema.md).
- `capture.needs_url === false` ⇒ a product without UI: the normal case, needs no URL, takes its
  scenes from [references/non-ui-products.md](references/non-ui-products.md)
  the prod-URL interview slot stays free.
- `mode: "concept"` ⇒ say so to the user explicitly: the repository holds
  neither UI nor runnable code; design frames carry "Design preview" and never count as the
  tier-A product scene.
- `ambiguous: true` ⇒ the question rides in the § 2 form (`surface`, last); a full form, or `--yes`, takes
  `question.default` and prints the decision.
- The detector never opens `.env*`, `*.pem`, fixtures or key files (read allowlist,
  `read_policy` in the profile); nothing else in this step may either.

### 4a. The repository's own source plan — every run, and the product behind a landing page

A repository often holds both the marketing site and the product; a declared `--url` is usually the landing. The
video must show the product doing the work, so the source plan runs in **every** run whose `REPO` is a repository (it
reads only), right after the profile. With `--repo [<path>]` the repository is the whole source (the user asked for a
video *of this repository*): `REPO` is `<path>` (default: the directory `/present` started in; `workspace.mjs --repo
<path>` puts `P` under it). With a declared `--url`, save the page first (`hyperframes capture <url> -o capture
--skip-vision`, the § 4 hero capture brought forward) and hand it over:

```bash
cd "<P>" && node ${CLAUDE_PLUGIN_ROOT}/scripts/repo-source.mjs plan --repo "<REPO>" --profile product-profile.json \
  --mode <mode> [--url <declared url> --hero capture/extracted/page.html] --out source-plan.json
```

It reads the repository (never writes) and lists every way it can show its product — dev servers (runnable only when
their dependencies are installed; the plugin never installs into the repository), built apps, static sites, the
production URL it declares (`package.json` homepage, `CNAME`) or mentions (a README "live / demo" link), VHS tapes,
OpenAPI specs, the commands its README documents with their output, and **the product app behind a landing page**: the
app's screens (file-system router), the backend it needs (API env names, loopback ports, `file:line`), the documented
way to raise it and stop it (Makefile `up` / `docker-up` / `dev`, compose, Procfile), its own browser walkthroughs
(e2e tests: the paths they visit) and screenshots — and `url_role` (the URL is the product's `landing` — its H1 is the
one of a landing site in the repository, or it reads like a marketing page — or the `product` app, or `unknown`); then
one `routes[]` entry per scene class, most direct first. Record `intake.json` `source: { "kind": "repo"|"url",
"value": …, "plan": "source-plan.json" }` and `evidence_plan` from the routes, then follow them in § 5:

- `combined` (a landing — the declared URL, or a landing site in the repository — **and** a product app): the landing is
  the **message** — hook, promise, CTA, brand tokens and stills from the § 4 capture (`message`); the app is the
  **demo** — the product scenes (QA-04 product frames come from it, never from the landing). The form's `demo` question
  (§ 2; under `--yes` its default) settled whether to raise the product with `demo.start.command`; when `demo.sign_in` is
  set, sign in with the account in `<P>/.demo-account.json`, and without one record what a fresh sign-up sees. Then run `demo.how` with `<REPO>` / `<P>` filled in: the run-copy, the start **from the copy** in the background
  (Bash timeout 600 s; under `--privacy local` a start that `installs` is refused — take the fallback), wait until the
  app answers on `demo.port` (a `curl` loop, ≤ 180 s), write `.media/flow.json` from `demo.flows` (the paths and
  selectors those files and the app's pages use — sign in first with the account the user named, never one you made up;
  record-flow masks password fields) across the `demo.screens` that carry the story, record, and **always** stop what
  you started (`demo.start.stop`, else the PIDs). The app does not come up, or the start fails → `fallback` (the
  product's own screenshots, tier B, labelled "product screenshots") and one line in the run report.
- `local-dev` / `local-build` / `local-static` / `prod-url` / `vhs-tape`: run the route's `how` with `<REPO>` and `<P>`
  filled in (a dev server runs from `<P>/.source`, the `run-copy` of the repository, so its caches never land in it);
  the flow rules of § 5 apply unchanged.
- `readme-commands`: terminal cards of the documented commands with the output the README shows, labelled "from the
  docs" (tier B, `file:line` per command) — never run them; `api-spec`: api cards from the spec (§ 5); `code`: code
  scenes from the README usage block; `scene-plan`: the scenes of the profile.
- `reconstruction` (tier C): only with the `web-source` / `product-demo` question answered (or its default under
  `--yes`); in `sales` / `investors` it needs the user's explicit yes (`needs_confirmation`).
- **Landing only** (`url_role: landing`, or the extractor's `product.app_url.differs_from_page: true`, and no product
  app in the repository): the landing recording is the **message** only — never the product scenes, and its demo
  widgets (a "press it" button, a chat mock) are never the STAR. The product scenes stand on the app's own screens,
  in this order (`capture-chain.md` § 1): the app online with the user's demo account → `--recording` → the
  product's own screenshots the landing publishes (tier B) → an exact reconstruction of them (tier C, § 6 of that
  file). Under `--yes` in `marketing` the product beats are reconstructions from the published screenshots
  (label, no confirmation); `sales` / `investors` use the stills and ask. A landing that publishes no product screen
  leaves nothing to rebuild: the reply and the run report say the product itself was not shown (capture-chain § 6). Write both in `evidence_plan`: `message`
  (the landing, tier A) and `demo` (the step and tier the product scenes stand on).
- A `--url` / `--staging-url` that is the product app itself (`url_role: product`) still wins for the web capture
  (prod-first); the story and every other class still come from the repository.

When the declared URL is a landing and the repository holds the product, the landing is the message and the app is
the demo.

Then extract the story with `extract-story.mjs`:

```bash
cd "<P>" && node ${CLAUDE_PLUGIN_ROOT}/scripts/extract-story.mjs --repo "<REPO>" --profile product-profile.json \
  [--url <prod-url> --hero capture/extracted/page.html] [--claims <declared claims.json>] [--metrics <csv>] \
  --out story-extraction.yaml --claims-out claims-index.json
```

Implemented. Exit 0 = both files written (gaps are normal output), 1 = runtime failure, 2 = usage
error or a refused fetch, 3 = `--strict` with an unverified declared claim. Sources rank by the source
precedence (`references/planning-rubric.md`, owner decision 2026-09-28; order reversed for facts)
e2e tests → README → CHANGELOG → hero page → testimonials, the working product above them all (§ 5) — while the
promise, the CTA and the brand name stay landing-first; **every field in
`story-extraction.yaml` carries `file:line` (relative to the repo) or the hero-page URL** (plus
`snapshot: <file>:<line>` when a saved copy exists); a field without a source is a `gaps` entry,
never a value. The hero feature is the owner's score (2026-09-28: the H1 never outweighs the product)
an action of the running product +3, a heading of its screen +2, the README example (when it names the product) +2,
the latest `Added` in CHANGELOG +2, an e2e test that acts on the product +1, the landing's declared feature list or
first feature section +1, the H1 +1; tie-breaks: a feature over the H1 promise, visible state change, number of
sources, source precedence, position — `--list-scoring` prints the table. `claims-index.json` inventories every number, logo and
quote with its source (`status: verified`, `claim_type: sourced`); declared claims that no source
contains are `status: unverified`, `claim_type: declared`, `source: null` and appear in `gaps`
(QA-12). Rules for this step:

- **Hero page.** Without `--url` the extractor takes the landing page inside the repo (`index.html`,
  `public/`, `site/`, `app/page.tsx`, `src/pages/index.*`, …; an empty SPA shell is skipped). With a
  declared `--url`, save the page first — after `inspect-project`, run
  `hyperframes capture <url> -o capture --skip-vision` (the § 5 stills-and-tokens capture brought forward; allowed
  under `--privacy local`; it writes `capture/extracted/page.html` and `tokens.json`) — then pass
  `--url <url> --hero capture/extracted/page.html`; the extractor never fetches on its own. `hyperframes` here is
  the pinned toolchain CLI the SessionStart hook puts on PATH (`node ${CLAUDE_PLUGIN_ROOT}/scripts/toolchain.mjs env`
  prints the export) — not `npx hyperframes`, which before § 7a step 1 links the CLI into the project fetches the
  registry's latest release. A `--hero` page that lives outside the repository, or that is minified, is
  copied next to `--out` as `hero-page.html` (re-lined, one block element per line) so every
  `snapshot:` line stays readable and no machine path leaks into the artefacts. `--fetch` is allowed
  only outside the privacy profile: it prints every host before contacting it (network
  manifest — a redirect hop is announced too, and the final URL becomes the provenance), saves
  `hero-page.html` next to `--out`, and is refused with exit 2 under `--privacy local` /
  `CLAUDE_PLUGIN_OPTION_PRIVACY=local` (pass the run's flag through as `--privacy local`).
- **Investors.** Pass `--metrics <csv>` (columns `metric,value,as_of[,unit]`): every row becomes a
  claim with `metrics.csv:<row>` as source and its date; a row without a date is a gap.
- **Sales / declared numbers.** A `claims.json` the user or a fixture provides (GS-02 shape) goes in
  as `--claims`; each entry is verified against the sources (`3,400` = `3.4k`; a declared `file:line`
  must state the same number with the same unit — a digit substring is not enough; a declared URL is
  checked against the hero page text) and merges into the claim it matches — decoys come out
  `unverified`. A declared source never opens anything outside the repository.
- **Show the gaps before anything renders**: read `story.gaps` / `claims.gaps` and tell the
  user what is missing and which source would close it (`gap.needed`). `unverified` items never
  reach `STORYBOARD.md` or `SCRIPT.md`; the story director may only use `proof.*` items that carry a
  source, and `claims-auditor` re-checks the index against the storyboard and frames (QA-12).
- Copy `hero_feature`, `promise.stated` (+ its source), `cta` and `user_flow` into the brief notes
  (brief-schema.md); the promise rewrite (`promise.derived`) belongs to the story director.
- The extractor obeys the same read allowlist as the detector (`read_policy` in the YAML lists
  every file opened) and never follows symlinks.

## 5. Capture chain

Order, never skipped: **prod → staging → local → user recording → reconstruction** (details
in [references/capture-chain.md](references/capture-chain.md)). Record the evidence tier per scene
(A recording / VHS / live API; B user recording; C HTML reconstruction).

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/record-flow.mjs --url <prod-url> --flow .media/flow.json --out .media/capture/   #
hyperframes capture <url> -o capture --skip-vision                                                                 # stills + tokens + assets
```

With a `combined` route (§ 4a) the footage is the product app (the demo), recorded by `demo.how`; the landing
contributes the stills and tokens of `capture/`, not a screencast. Reuse `capture/` from § 4 when it exists; run `hyperframes capture … -o capture` only when it does not (without
`-o` a second run lands in `./capture-2/` and `capture/extracted/tokens.json` goes stale). The `<url>` for a `--local`
run: a static site → `file://<absolute --local path>/index.html` (the pinned CLI captures it with no server to start
or stop); a `package.json` project → start its `dev`/`start` script in the background yourself, capture the
`http://localhost:NNNN` it prints and stop it by its PID (never `pkill -f` — the pattern matches your own shell).

A `cli` product (also the terminal scene of a `library/sdk`) is recorded from the repo's own VHS tape instead
 — the plugin never types commands the user did not write; with no `*.tape`, plan the scene from the README's
documented commands (the source plan) or as a code block:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/record-terminal.mjs --repo "<REPO>" --out .media/capture/ --frames                      #
```

It writes `footage.mp4` at the tape's size (≥ 1920×1080, else exit 3), `capture-manifest.json` (backend `vhs`,
tier A), `frames/` at 10 fps, and blocks on a Layer-2 hit exactly as below; there is no `events.jsonl`, so autozoom
reports `video_without_events` and the storyboard moves the camera with a declared `capture_drift` (with
`capture_window` / `capture_hold`). The frame worker still writes that frame's `<frame_id>.autozoom.json`, with
`--events /dev/null --manifest <capture>/capture-manifest.json`: a home-pose track `render-path assemble` stamps the
drift on — without it the drift is dropped (assemble warns). A `file/doc` scene needs no capture
(non-ui-products.md). Neither does an `api/backend` product's `api-card`, but it needs a source: build it from the
repo's own API description — OpenAPI `example`s, README request/response blocks — as evidence tier B labelled
"from the spec", every field with its `file:line` and no latency. It is tier A only when you ran the call against the
product's own server started from the repo (its documented start or dev script) or the `--url` / `--staging-url` the
user declared; never write a mock server and present its answers as evidence — that is not the product.

`record-flow` writes `footage.mp4` (3840×2160), `events.jsonl`, `capture-manifest.json` and
`redactions.json`. Stills or a contact sheet you cut from the footage to look at it go under
`.hyperframes/` (e.g. `.hyperframes/capture-look/`), never `assets/`: every media file under `assets/` and `.media/` is
frozen into the media ledger, and one it cannot license blocks the render (`.media/capture/` is the capture's
own, so what lands there is licensed as own-capture). Pass exactly one of `--url` / `--staging-url` / `--local` /
`--recording <file>` in the order; with none the script prints `{"needs_input": true}` — the § 2 form's product /
landing answers settle it (after the form, a stop: § 0b). `--local` starts `npm run dev|start`
from `--repo` — pass `--repo "<REPO>"` (or the absolute `--local` directory); its default is the current directory, `P` and captures the `http://localhost:NNNN` it prints; a `--repo`
holding `index.html` and no `package.json` (a static site) is served from `127.0.0.1` by
`scripts/lib/static-server.mjs` for the recording only.

**The flow is yours to write** — `.media/flow.json`, under `--yes` too. Without `--flow` the page is only held
for 3 s, so `events.jsonl` has no pointer event: no cursor and no auto-zoom. Source, in order: the
`user_flow` from `story-extraction.yaml`; else (gap `no-user-flow`, e.g. a bare `--url`) the hero page's own
interactive elements — `capture/extracted/page.html` (§ 4), or the repo landing page the extractor read: a link
to the product or its demo, tabs, the primary CTA — along planning-rubric Q9 (entry → the hero feature's key
action → result). Use only selectors present in that HTML; never guess one or borrow another project's flow.
Shape: a JSON array of steps — `goto` + `url`; `click` / `hover` / `scroll` + `selector`; `type` + `selector` +
`text`; `key` + `key`; `wait` + `ms` or `selector`. record-flow validates the file before it launches (exit 2
names the bad step).
Each step has a timeout of about 8 s. A failed step stops the flow but keeps the capture so far —
`footage.mp4`, `events.jsonl` and a `capture-manifest.json` whose `flow` block reads `steps_total`, `steps_done`,
`failed_step`: only the states before `failed_step` are tier-A evidence. Correct that step from the page
HTML and re-record once; otherwise plan from what was captured and say so.

**Exit 3 = blocked:** the Layer-2 gate (tesseract OCR → regex + gitleaks) found a
potential secret / PII in the frames. Open `redaction-findings.json` (rule ids and offsets only —
never the secret), show the user what was found, and re-run the same command with
`--confirm-findings` only after they confirm; never pass `--skip-ocr-gate` to get past a block —
the render guard (`hooks/guard-render.sh`) refuses `hyperframes render` while any
`capture-manifest.json` is `blocked` or its gate did not run without `confirmed: true`.
A degraded gate is visible in the manifest (`layer2_ocr_gate.ran: false` without tesseract,
`gitleaks: "unavailable"` without gitleaks) — say so in the run report, do not present it as clean.
Always pass `--skip-vision` to `hyperframes capture` under the privacy profile.
Tier C for `sales`/`investors` needs explicit confirmation and the `reconstructed` label; in
`investors` the "product does the work" scene is tier A only. Bash timeout for capture:
300 s. Requirements on this machine: Playwright + Chromium and ffmpeg come from the
toolchain (`${CLAUDE_PLUGIN_DATA}/toolchain`, installed by the SessionStart hooks — check
`node ${CLAUDE_PLUGIN_ROOT}/scripts/toolchain.mjs status` first; exit 3 = not ready, run
`… toolchain.mjs install`); tesseract (`eng`) and gitleaks are system packages the toolchain does
not install, so a missing one surfaces as a runtime error (exit 1) or a degraded gate, never as a
fake capture.

**The running product becomes the first story source** (source precedence, owner decision 2026-09-28): when the
capture recorded the product — a `combined` / `local-*` demo, a product URL, not the landing-only message capture —
run the § 4 extraction again with its `screens.jsonl` (seconds, no network):

```bash
cd "<P>" && node ${CLAUDE_PLUGIN_ROOT}/scripts/extract-story.mjs <the § 4 arguments> \
  --screens .media/capture/screens.jsonl --url-role <source-plan.json url_role.role, or unknown>
```

The product's own screens, actions and the values it shows (`claim_type: demonstrated`) then come first in
`story-extraction.yaml` (`product.screens`, `user_flow.from: product-screens`) and `claims-index.json`; a screen on the
landing itself (its URL under `--url-role landing`, or the landing's H1 on screen) is skipped as the message.

**Auto-zoom and cursor** — run once per capture, after the gate passed:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/autozoom.mjs --events .media/capture/events.jsonl --footage .media/capture/footage.mp4 \
     --out .media/capture/autozoom.json --emit-html .media/capture/index.html                                      #
```

`autozoom.json` holds the zoom `segments` (clusters of clicks / text-field focus / typing bursts
with the timing: in 0.7 s, hold, out 0.8 s, ≤ 1 zoom per 3 s, factor 1.5–2×, dead zone
50 % × 70 %; scroll and navigation end a zoom, never start one), one keyframe ladder per format in
`tracks['16:9'|'9:16']` for the **inner wrapper** of the product clip (`scale` / `xPercent` /
`yPercent`, eases), and the spring-smoothed `cursor` path with `clicks` for ripples. In the render
path the frame-worker does not mount the footage itself: it declares an approved frame video, the vendor
assembler hoists it to the host root and `render-path assemble` (`applyCamera`) drives that hoisted element
with the frame's scene-local `compositions/frames/<frame_id>.autozoom.json` (see `agents/frame-worker.md`). The 9:16
ladder is the same focus seen through the vertical crop — hand both to the frame-worker;
`--clip-start <s> --clip-duration <s>` rebases a scene's slice to scene-local time. Read
`warnings`: `video_without_events` (no events: a VHS terminal capture, tier A, or a tier-B recording — no auto-zoom;
say so in the storyboard and move the camera with `capture_drift`),
`no_pointer_events` or `stats.zooms: 0` on a tier-A web capture (the flow logged no click or focus with a target
rect: fix `.media/flow.json` and re-record once; otherwise say so in the storyboard and the run report),
`capture_size_below_output` (exit 3 for the requested format: the capture is too small for the
output, re-record at DPR 2 rather than upscale), `zoom_peak_upscale` (informational). The emitted
`index.html` is a standalone composition for the review protocol (`hyperframes check` /
`snapshot`), not a frame — the frame-worker copies its mount (untimed wrapper inside the timed
video's ancestors, `data-layout-allow-overflow`, cursor inside the wrapper).

## 6. Pitch round

Dispatch the `story-director` agent (MVP). It first answers the nine-question planning rubric
([references/planning-rubric.md](references/planning-rubric.md) — brag's rubric, Q2 → "most credible /
valuable claim") and its essence test (E1 what it is · E2 what I do in it · E3 what it gives back · E4 what changes —
each on a product screen) from the Inspect and Capture artefacts; copy that block into `BRIEF.md` `## Notes`
verbatim. Then it produces **5 concepts along five paths, at least 2 with
probability < 0.10, and a recommendation at the end**. The user's choice is the pitch question — the one question
after the § 2 form. In v1 the same round runs as Workflow `/power-presentation:pitch-panel` — today
that script is a stub. The five paths are the HyperFrames `pitch-round.md` paths, as
`agents/story-director.md` applies them: the subject's own visual world · the target emotion as a
frame · the audience (meet its expectation, or break it) · the anti-pattern inverted · an unusual
format. (The vendor's five story arcs — PAS, Future Pacing, Demo Loop, BAB, Feature-Benefit
Cascade — are archetypes, not pitch paths.)

## 7. Write `BRIEF.md` and enter the workflow

Load `/hyperframes` and select the `product-launch-video` route. The intent layer's questions are
already answered by `intake.json` + the interview — do not re-ask them. The workflow's Step 0
(Setup) scaffolds the project — in this plugin that is `render-path.mjs init` with the pinned CLI (§ 7a step 1),
never a bare `npx hyperframes init` — and materialises `BRIEF.md`; its frontmatter and body are specified
field by field in [references/brief-schema.md](references/brief-schema.md)
(`workflow: product-launch-video`, `flow`, `storyboard`, `message`, `audience`, `aspect`,
`language`, `length`, `reveal`, `register`, `voice`, `style_preset`). Audience deltas from
[references/audiences/](references/audiences/) (`marketing.md`, `sales.md`, `investors.md`) ride
in `## Customizations` and `## Notes`. Entering the workflow any other way is forbidden.
The workflow the plugin was verified against is the vendored copy (`vendor/product-launch-video`,
upstream `v0.8.47`); the SessionStart hook seeds it into `~/.claude/skills` when that skill is
absent and reports drift when an installed copy differs. `hyperframes init` runs with
`HYPERFRAMES_SKIP_SKILLS=1` (exported by the hook), so it never refreshes the workflow on its
own; refresh deliberately with `npx hyperframes@0.8.47 skills update` when the user asks.

## 7a. The render path, end to end (orchestration)

This is the sequence a run follows once `intake.json`, the network manifest (§ 3), Inspect and Capture (§ 1–5) are done. `P`
is the run workspace (§ 0a), `R` = `node ${CLAUDE_PLUGIN_ROOT}/scripts/render-path.mjs`; pass `--project P` and the run's
`--mode` / `--formats` to every stage. Every stage prints what it did — for you, not for the user (§ 0b); exit 3 names the gate or the missing input —
fix that, never skip it.

**Stage times.** render-path times the stages it runs itself (`audio`, `packets`, `assemble`,
`verify`, `render`, `deliver`). Every other stage is yours to bracket with wall-clock stamps — `R time
--project P --begin <stage>` when it starts, `R time --project P --end <stage>` when it ends: `intake` (§ 1, your
first action), `inspect`, `capture`, `pitch`, `brief`, `design_spec`, `storyboard`, `frames` (the frame-worker
dispatch, step 5) and `review`. The stamps land in `.hyperframes/pp-stages.json`, which works before the project is
scaffolded. `R time --stage <stage> --seconds <n>` stays only for a duration you really measured; never reconstruct
one from file mtimes. When one story-director dispatch does both the pitch round and the storyboard, bracket it as
`storyboard` and leave `pitch` unrecorded; bracket two dispatches separately.

1. **Project.** `R init --capture .media/capture` is the workflow's Step 0: when `P` has no `hyperframes.json` it
   scaffolds the HyperFrames project with the pinned toolchain CLI (copying in only the files `P` does not have yet),
   links that CLI into `P` (a bare `npx hyperframes` inside `P` then runs the pin) and copies footage + events +
   autozoom into `.media/capture/` and `assets/`. Never run a bare `npx hyperframes init`: `P` is not empty by now,
   so init refuses it, and before the link `npx` fetches the registry's latest release. The § 4 / § 5
   `hyperframes capture <url> -o capture --skip-vision` (reused, not repeated) or `brand-kit.mjs apply` gives
   `capture/extracted/tokens.json`; the workflow's Step 2 writes `frame.md`.
2. **Story.** Dispatch `story-director` with `model: <roles.story_director>` (§ 1 profile) (pitch round, then the storyboard mode): `STORYBOARD.md`, `SCRIPT.md`,
   `claims-index.json`. Rules that bind every frame (the 9:16 stage box, caption zone, size floors) go in a section
   above `## Frame 1`. Before the dispatch run `node ${CLAUDE_PLUGIN_ROOT}/scripts/media-packs.mjs list` and hand the
   director the fetched tracks: the bed comes from the first-run media pack — a missing MusicGen or a
   signed-out HeyGen never means "no bed". Investors default to a quiet bed under speech; `music: none` only
   with a reason the storyboard states. A pack `list` reports missing is fetched with `media-packs.mjs fetch` (it names
   its host; under `--privacy local` only with `--confirm-network` once the user confirmed). For exact line
   lengths the director may run `R audio --project P` right after it writes `SCRIPT.md`; step 4 reuses that
   synthesis. Nobody runs `hyperframes tts` into a temp directory.
3. **Budget.** `R cost --estimate` — print it before any worker is dispatched; over `--budget` (default
   $25) stop and say so unless `--yes`.
4. **Audio + packets.** `R run` runs `audio` (Kokoro VO per line, whisper words, frame windows grow to fit), `packets`
   (one packet per frame with the storyboard direction, `.hyperframes/frame-packets/_dispatch.json`) and stops at
   `frames` with exit 3 while frame files are missing.
   - `audio` reuses the previous synthesis while the `SCRIPT.md` line texts, voice and speed are unchanged
     (fingerprint in `.media/tts-cache.json`, wav hashes checked). It refuses with exit 3, before any TTS, when the
     `SCRIPT.md` headings — exactly `## Line <N> — <label> (Frame <N>)`, tags such as STAR before the parenthesis —
     do not map 1:1 onto the storyboard frames that carry `voiceover:`; send `SCRIPT.md` back to the story director
     with the named headings. When the storyboard's `music:` names a pack track, pass `--bgm pack:<track>` (or
     `pack:vol-N`) to `R run`: the credit line and the beat cues come with it and the bed sits at volume 0.12 under
     the VO.
   - `packets` first stages the fonts: every family `frame.md` declares is copied into `assets/fonts/` (from files
     already there — the brand kit — else from a pinned offline source in the plugin toolchain) and `frame.md` gets a
     `## Staged fonts` section holding the exact `@font-face` rules the frame files copy verbatim. A declared family
     with no local face fails the stage (exit 3, the family named); nothing is fetched from Google Fonts
     supply the face (brand-kit files with their licence) or move `frame.md` to a family that has one, then run
     again.
5. **Frames.** For every `_dispatch.json` frame whose `exists` is false dispatch one `frame-worker` (`model:
   <roles.frame_worker>`) — all of them in one message, in the foreground (§ 0b) — with its packet, `_role.md` and `agents/frame-worker.md`; each writes `compositions/frames/<id>.html` (+ its
   `.motion.json`, and `.autozoom.json` for a footage frame — always when it declares `capture_window` /
   `capture_drift`; with no `events.jsonl` from `autozoom --events /dev/null --manifest <capture>/capture-manifest.json`)
   and lints it. Workers take their `@font-face` rules from `frame.md` `## Staged fonts` and never search the disk
   for a font; a family missing there comes back in their return note — stage it (step 4) and re-dispatch.
6. **Assemble → verify.** `R assemble`, then `R verify`: `assemble` (captions, hoist, held clips, camera, the 9:16 host when asked)
   and `verify` (`lint`, `check`, animation map, wowprobe pre-render). On exit 3 read `QA/check.json` /
   `QA/check-9x16.json` / `QA/wowprobe.json`, send the named frame back to its worker with the finding (one auto-fix
   round per gate; a new foreground dispatch with the packet and the finding, every frame of the round in one message,
   no commentary — § 0b), and run again. Read the `assemble` notes too: a frame that declares `capture_drift` but has no
   `<frame_id>.autozoom.json` is named there (its drift is dropped) — send it back for the sidecar. When the story
   director's planning-rubric Q7 names a loudness target, pass it as `--target-lufs <n>` to `R verify` and `R deliver`
   (and `R run`) so a confirmed QA-08 row is not replaced by the default; without it render-path picks the row from
   the mix (VO-led: −14 marketing/sales, −16 investors; music-only, no VO: −18) — see
   [references/loudness.md](references/loudness.md).
   Once `verify` passes, `R preflight` (one draft render at the storyboard fps, ≈ one render's time) measures the frame
   gates only real frames can — QA-03 black open, QA-07 freeze share, QA-09 cut cadence — on `renders/draft/`
   (`QA/wowprobe-preflight.json`). Exit 3: fix the named frames (QA-07: give the still type scenes motion or declare
   the hold) and run `verify` + `preflight` again — before approval, so a failure costs one draft, not a delivery render
   and a critic round (GS-03 rerun and GS-02 sales, 2026-09-27: QA-07 failed on the master).
7. **Review, render, deliver.** Show the storyboard, a `npx hyperframes snapshot` sheet and one scene (§ 9), record
   the "render?" answer with `R approve` (silence or `--yes` = yes), then `R render` and `R deliver` (with the same
   `--target-lufs`; under `--yes` both in the foreground, § 12): masters in `renders/final/`, loudness, poster, SRT, `share-copy.txt`, `run-report.json`,
   post-render gates + scorecard.
8. **Vision critic** — only when the profile's `critic` is `on` (off: skip to step 9; run-report records the critic
   as `off`, not failed). `node ${CLAUDE_PLUGIN_ROOT}/scripts/critic.mjs prepare --project P --votes <critic_votes>` writes
   `QA/critic/dispatch.json`; dispatch its `votes` × `agents` (3 × 5) critic agents in one foreground message (§ 0b),
   each an independent vote on the dispatch `inputs` only, and write each returned JSON to its `write_to` path; then `critic.mjs tally`. Ship =
   the majority of votes with mean ≥ 3.0 and no dimension < 2. Not ship → one revision round (the critics' named
   fixes → the frame's worker, or the storyboard for C1/C7), then steps 6–8 again; a second round only by flag and
   budget.
9. **Report.** Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/progress.mjs --project P --finish`, then end the run with one
   message of at most eight lines: the absolute paths of the masters (and SRT, poster, `share-copy.txt`), the critic
   verdict and the scorecard in one line, the failed gates and every degraded or unmeasured item from
   `run-report.json` one line each, and the path of `run-report.json` for the details. No stage-by-stage account.

## 8. Deltas the plugin adds inside the workflow

| Delta | Where | Reference / component |
| --- | --- | --- |
| Auto-zoom from `events.jsonl` clusters, cursor synthesis, 9:16 window follows focus | after capture (§ 5); camera at `render-path assemble` | `scripts/autozoom.mjs` → `autozoom.json`; the frame-worker writes a scene-local `<frame_id>.autozoom.json` and declares the footage as an approved frame video; `render-path.mjs` `applyCamera` stamps the keyframes, cursor and ripples on the hoisted element (the vendor assembler hoists media) |
| Captions defaults (on for 9:16 + sales; off for 16:9 without VO; investors kicker cards + SRT; SRT always) | Step 6 | [captions.md](references/captions.md) |
| VO: Kokoro EN offline; TTS cache per line — `render-path audio` reuses the whole synthesis while line texts, voice and speed are unchanged (`.media/tts-cache.json`) and otherwise sends the engine only the lines it has not voiced before (`.hyperframes/tts-lines/`); cloud TTS v2 | Step 3.1 | [language.md](references/language.md) |
| Claims index: every visible number/logo/quote has a source or is `unverified` | storyboard | agent `claims-auditor` |
| QA gates + scorecard + 3-vote vision critic **before** render | Verify | `/power-presentation:present-qa`, [qa-gates.md](references/qa-gates.md) |
| Brand kit: `--brand <dir|json| before Step 2 (frame.md) | | `scripts/brand-kit.mjs` |
| Media ledger: every asset under `assets/` + `.media/` frozen with sha256 and a licence taken only from evidence (the plugin's own VO / capture, the font's own name table). `render` refuses on an unknown, restricted or CC-BY-NC licence, CC BY without a credit line, or a frozen asset that changed: ask the user for the licence (and credit line) and record it with `node ${CLAUDE_PLUGIN_ROOT}/scripts/media-ledger.mjs set-license <path> <licence> [--credit "…"]` — never guess one; a site font without a licence is replaced by an OFL one | `render-path assemble` (freeze) → Render (gate) | `scripts/media-ledger.mjs` → `.media/manifest.jsonl` |
| Render with timeouts, `render --batch` for 9:16, background worker for long renders | Render | `/power-presentation:present-render` |
| Deliver: mp4 per format, poster baked into frame 0 (`scripts/poster-bake.sh`), SRT (`en`), `share-copy.txt` (`scripts/share-copy.mjs init` → fill → `lint`, [share-copy.md](references/share-copy.md)), `run-report.json` | Deliver | [run-report-schema.md](references/run-report-schema.md) |

Music-first: the BGM bed is chosen before the storyboard — a track of the first-run media pack
(`media-packs.mjs list`), mounted with `R run --bgm pack:<track>` — and beat-locked with
`scripts/analyze_music_cues.py`; SFX by `assets/sfx-analysis.json`. The
two music packs are ende.app's upbeat "Happy Beats / Business Moves" and the restrained `music-ende-calm`
underscores (the investor default); an off-register bed is reported with its reason in the storyboard, never a silent
`music: none`.

## 9. Human review protocol

The user sees three artifacts and answers **one** question before render:
storyboard with the chosen pitch → sketch (`npx hyperframes snapshot`) → the look of one scene
(host-composition render) → "render?". Silence or `--yes` = continue; record it with
`node ${CLAUDE_PLUGIN_ROOT}/scripts/render-path.mjs approve --project .` (`approved: v<N>` + the hashes in
`renders/approvals.jsonl`; the stages then commit `v<N>: <request>` after each gate). For `investors`/`sales`
with a tier-C scene, the same question includes confirming the `reconstructed` label.
In an interactive run open the assembled project in HyperFrames Studio next to `STORYBOARD.md`:
`npx hyperframes preview . --background` and give the user its URL. A comment on one frame — typed in chat, or an
element the user selected in Studio (`npx hyperframes preview --selection --json` names it; map its composition to the
frame) — is recorded before anything is edited: `R comment --project . --frame <N> --text "<comment>"` →
`renders/comments.jsonl`, bound to the version and the storyboard / index / master hashes like an approval; the edit
loop (§ 10) works through the open comments. Under `--yes` nobody reviews: no Studio, no comments, approve and go on.
After render the loop is automatic: a failed gate or scorecard 60–79 sends the scene to auto-fix,
scorecard < 60 sends the storyboard back; one critic revision round by default, a second only by
flag and only while `budget_usd` remains.

## 10. Edit loop

Every change request goes through `/power-presentation:present-edit`: classify it with
[references/edit-matrix.md](references/edit-matrix.md) **before the first tool call**, state the
price and scope, then edit one named artifact per step. MVP: every frame edit costs a full
`index.html` render; per-scene re-render and the content-hash cache are v1. Each
accepted gate or edit is a git commit `v<N>: <request>` plus a line in `renders/manifest.json`.

## 11. Mode rules

- **sales**: prospect record is name, company, role, public site only; no LinkedIn
  scraping; name and company inside the hook window (QA-03) and on the poster; prospect site/logo in
  frame = personalisation level L2; the outreach draft carries the GDPR Art. 14 notice and Art. 21(2)
  opt-out; prospect data purged after 30 days. Details: [audiences/sales.md](references/audiences/sales.md).
- **investors**: traction numbers verbatim from `--metrics` with source and date, no
  rounding; a TTS narrator is flagged `tts_placeholder`; restrained default — quiet bed under speech (a media-pack
  track via `--bgm pack:<track>`; `music: none` only with a stated reason), ≤ 1 transition per beat; speed-ups labelled "N× speed"; the ask card (amount, milestone, deadline)
  is mandatory; first product frame per QA-04; product share is a scorecard target, not a lint
  failure. `--style cinematic` is v1. Details: [audiences/investors.md](references/audiences/investors.md).
- **marketing**: voice off unless `--voice`; product-led hook per QA-04/QA-05; tier C carries
  "Screen images simulated". Details: [audiences/marketing.md](references/audiences/marketing.md).

## 12. Timeouts and long runs

Bash timeouts: `capture` 300 s, `check` 180 s, `render` 600 s. In an interactive session
renders of ≥ 90 s or at 60 fps are dispatched to the background `render-worker` agent; the `PostToolUse`
rewake hook returns its one-line summary (hooks area). Under `--yes` (an unattended run, often a
headless `claude -p`) nothing wakes a session whose turn has ended — the run ends with it and its background
render is killed (GS-02 investors, 2026-09-27: approved, rendering, no master): run `R render` in the
foreground with the 600 s Bash timeout — no `run_in_background`, background agent or scheduled wake-up — and
end your turn only after `R deliver`. Service targets: capture ≤ 180 s, `lint` ≤ 10 s,
`check` ≤ 20 s, `snapshot` ≤ 10 s. Before dispatching workers print the estimate
"$ tokens / $ media / minutes"; the run must fit ≤ 45 min on the fast profile.

## Outputs of one run

All in the workspace `P` = `<REPO>/power-presentation-out/<name>/` (§ 0a), nothing in `REPO`: `intake.json`, `product-profile.json`, `.media/capture/{footage.mp4,events.jsonl,capture-manifest.json}`,
`BRIEF.md`, `frame.md`, `STORYBOARD.md`, `SCRIPT.md`, `claims-index.json`,
`QA/{wowprobe.json,check.json,contact-sheet.png}`, `renders/final/*.mp4`, poster, `*.srt`,
`share-copy.txt`, `run-report.json`, `.hyperframes/pp-stages.json` (every stage timed, § 7a). Every stub in this
skeleton reports which of these it could not produce.

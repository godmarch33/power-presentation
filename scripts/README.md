# scripts/

Deterministic helpers the `/present` pipeline calls. The model edits one
named artifact per step; everything global (capture, zoom keyframes, gates, scene keys, concat,
poster bake) is computed here. **Status:** `inspect-project.mjs` and
`extract-story.mjs` (implemented 2026-09-19), `record-flow.mjs`, `autozoom.mjs`, `toolchain.mjs`,
`vendor-workflow.mjs`, `wowprobe.py`, `poster-bake.sh` and `share-copy.mjs` (implemented 2026-09-20)
are real; the v1 scene cache (`render-scenes.mjs`, `scene-key.mjs`) is still a stub, see the "Real
today" column.

## Exit-code convention

| Code | Meaning |
| --- | --- |
| `0` | success, or `--help` / a `--list-*` data dump |
| `1` | runtime failure (unreadable repo, output not writable) — implemented scripts only |
| `2` | usage error (unknown flag, bad value; `extract-story.mjs`: also a `--fetch` refused under the privacy profile) |
| `3` | `extract-story.mjs --strict`: at least one declared claim is `unverified` (QA-12); `record-flow.mjs`: the Layer-2 gate found a potential secret / PII in the frames — blocked until `--confirm-findings`; `autozoom.mjs`: the base crop of the requested `--format` would upscale the capture (`capture_size_below_output`); `toolchain.mjs`: `status` not ready, `doctor` gate failed, `install` refused (privacy profile without `--confirm-network`, or another install holds the lock); `vendor-workflow.mjs`: `check` failed, `drift` found, media in the fetched tree; `wowprobe.py`: at least one measured gate failed (`gates_failed`); `share-copy.mjs lint`: violations; `golden-set.mjs`: a verification failed (fixture or `verify --run`) or a build step produced nothing; `autonomous-run.mjs`: a limit or the run-level check missed, or the session failed; `record-terminal.mjs`: the Layer-2 gate found a hit or the tape is below 1920×1080; `render-path.mjs`: a gate or precondition failed, named on stderr (e.g. SCRIPT.md headings that do not map onto the voiced frames, an unpinned package.json script, a frame.md family with no face, `time --end` without `--begin`); `baseline.mjs measure`: nothing measured |
| `4` | `record-flow.mjs`: a `--flow` step failed within its 8 s; the flow stopped there and the capture so far is kept (`capture-manifest.json` `flow.failed_step`) — a Layer-2 block still exits 3 |
| `64` | `NOT IMPLEMENTED: <what>` on stderr. A stub never prints a fake result on stdout. |

## Inventory

| Script | Phase | Real today | Stub part |
| --- | --- | --- | --- |
| `inspect-project.mjs` | MVP | **the whole script**: `CLASSES`, `SIGNALS` (id, kind, weight, source — primary signals at weight 4, heuristics labelled), `SCENES` (table), `CAPTURE_BY_CLASS`, `READ_DENY`, `walkRepo()` (no symlinks, ignored dirs, limits), `evaluateSignals()`, `scoreClasses()` (UI > runnable > concept, order on ties), `assessConfidence()`, `scenesFor()`, `buildProfile()`; `--list-signals`, `--list-scenes`, `--print`, `--out -` | — (see "product-profile.json" below) |
| `extract-story.mjs` | MVP | **the whole script**: `SOURCE_ORDER`, `SCORING` (the four rules + 0-point candidate generators, sourced), `TIE_BREAKS`, `NUMBER_PATTERNS`, `parseHeroHtml()` (H1 / subhead / CTA / sections incl. heading-driven `<dt>` sections / blockquotes and testimonial cards / logos), `parseMarkdown()`, `readmeExample()`, `changelogLatestAdded()`, `parseTestimonialFile()`, `parseE2E()`, `numbersInLine()`, `stripMdComments()` (HTML comments in Markdown are never sources), `scoreFeatures()`, `buildExtraction()`, `verifyDeclared` (via `--claims`), `loadMetrics()`, `toYaml()`, `relineHtml()`; `--list-scoring`, `--print`, `--out -`, `--strict`, `--fetch` (outside the privacy profile only); `--screens` (record-flow's `screens.jsonl`: the running product as the first source — `productScreens()`, 0-point `product-screen` candidates, `claim_type: demonstrated` numbers, the recorded flow as `user_flow`) and `--url-role` (skip the landing's own screens); `SOURCE_ORDER` follows the owner's source precedence (2026-09-28) | — (see "extract-story.mjs outputs" below) |
| `record-flow.mjs` | MVP (web/Electron); mobile/desktop v1; Cap/rrweb v2; the VHS tape for `cli` is a separate path | **the whole web/Electron path**: `CAPTURE_SPEC` (1920×1080 @ DPR 2 → 3840×2160, libx264 CRF 18, `cursor: none`, 300 s), `resolveChainStep()` (order, `needs_input` when nothing is given), `parseFlowFile()`, `SECRET_PATTERNS` + `ALWAYS_MASK_SELECTORS` + `luhnValid()` / `findCardNumbers()`, `maskingInitScript()` (Layer 1), `eventLoggerInitScript()`, CDP `Page.startScreencast` driver, `assembleFootage()`, `selectSampleFrames()` (2 fps + clicks), `runRedactionGate()` (tesseract → regex + gitleaks, Layer 2), `extractRecordingFrames()` (tier B), `startLocalDevServer()`, `buildManifest()`; `CAPTURE_SPEC.stepTimeoutMs` 8 s per flow step / `navTimeoutMs` 30 s for goto — a failed step stops the flow and keeps the partial capture, with a manifest `flow` block `{steps_total, steps_done, failed_step}` and exit 4; `main(argv, deps)` exported for tests; `--flow`, `--repo`, `--tier`, `--env`, `--fixed-time`, `--confirm-findings`, `--skip-ocr-gate`, `--print`; `screens.jsonl` — the running product's own words per flow step (`snapshotInPage()` in the page after Layer-1 masking, `sanitizeSnapshot()` re-scans with the secret grammar; owner decision 2026-09-28, source precedence) | — |
| `autozoom.mjs` | MVP (16:9 + 9:16; 1:1 v1) | **the whole script**: `AUTOZOOM_DEFAULTS`, `AUTOZOOM_RESEARCH` (clustering knobs, labelled research), `EASES` (by role), `FORMATS`, `parseEvents()` / `normalizeEvents()` (shape, `t - footage_start_ms`), `fitScale()` / `clusterEvents()` (dead zone; scroll / navigation break), `planSegments()` (pre-aim, hold, cadence, re-aim vs new zoom, camera-lag and cadence skips), `wrapperGeometry()` / `clampFocus()` / `poseTransform()` / `buildTrack()` (per-format ladders, edge snap, in-source clamp), `springConstants()` / `springStep()` / `cursorWaypoints()` / `springPath()` (closed-form Cap spring), `rebaseKeyframes()` / `rebasePath()` (scene slices), `sizeChecks()`, `buildAutozoom()` (pure), `gsapSnippet()`, `previewHtml()`, `probeFootage()`, `captureFacts()`; `--format`, `--clip-start/--clip-duration`, `--max-scale`, `--cursor-fps`, `--emit-html`, `--print`, `--out -` | — (see "autozoom.json" below) |
| `render-scenes.mjs` | **v1** | — | `hosts/NN.html` render + `ffmpeg concat -c copy` + cache; MVP = full `hyperframes render` |
| `scene-key.mjs` | **v1** | `sceneKey()` — sha256 over the input list, deterministic, tested | CLI that collects the inputs from a project |
| `wowprobe.py` | MVP | **the whole script**: `GATES` (14 gates: owner, measure, threshold, hard), `SCORECARD_WEIGHTS` (9 metrics = 100), `LENGTH_BANDS`, `BEAT_LOCK`, `parse_storyboard()` (vendor-lenient port + the plugin keys and the `- text: "…" @ a-b` timeline; frame headings need their number and warn when not `## Frame <N> — <title>`), `GATE_ROLES` (a role outside the vocabulary is a warning), `numbers_in_text()` / `load_claims()` / `number_is_claimed()` (QA-12), the ffmpeg measurements (`probe_format`, `measure_black_open` signalstats, `measure_freezes` freezedetect, `measure_cuts` scene-select, `measure_loudness` ebur128), `eval_qa01…eval_qa13` (QA-07 subtracts `capture_tail_hold()`, the held tail after a `capture_window`) + `eval_hyperframes_gates()` (check.json: QA-02/06/14; animation-map: QA-11), `reading_floor_violations()`, `parse_qa_md()` waivers, `find_allow_attributes()`, `parse_srt()`, `build_scorecard()` (hook speed reports `full_marks_path` below 100), `build_contact_sheet()` + `keyframe_times()` / `extract_keyframes()`, `pick_poster_time()`; `--list-gates`, `--poster-pick`, `--print`, `--trend` | — |
| `analyze_music_cues.py` | MVP | the whole script (ported verbatim from brag, MIT) | — (needs `librosa`, see below) |
| `poster-bake.sh` | MVP | **the whole script**: poster source order `--poster` > `--at` > `--storyboard` (`wowprobe.py --poster-pick`: `poster:` key → hook settled point → first product midpoint) > edge-energy scan (sobel, first 40 %, no near-black); brag's overlay recipe on frame 0 only; frame-count / duration / audio verified unchanged; `<stem>.poster.png` + `.jpg`; `--out`, `--keep-original`, `--json` | — |
| `golden-set.mjs` | MVP | **the whole script**: `FIXTURES` (GS-01…GS-03 facts), `verifyFixture()` (CLI pin, class via inspect-project with the declared URL for GS-01, claims reproduction + decoys in gaps, metrics rows, storyboard gates via `wowprobe.py`, hook, capture criteria when built), `captureChecks()` (the shared capture checks), `verifyRun()` + `verify --run <dir> [--only gs-01]` (run-level GS-01 checks: `.media/capture/` + `compositions/frames/*.autozoom.json` zoom / cursor + the camera stamped in `index.html`), `rolesCheck()` + `roles_optional` (GS-03 `design`), `serveStatic()` (GS-02 site), `findVhs()` (PATH or `${CLAUDE_PLUGIN_DATA}/toolchain/bin`), `buildFixture()` (record-flow / autozoom / vhs / pre-render probe); `list`, `verify`, `build`, `--only`, `--json` | — |
| `baseline.mjs` | MVP | **the whole harness**: `ROUTES` (brag → GS-02; hyperframes, plugin → GS-01…GS-03), `measureRun()` (wowprobe post-render with the fixture brief / band / target, optional storyboard, check.json, animation-map, cues), `renderTable()`; `measure`, `table`, `list` | the runs themselves (one autonomous pass per route / fixture) |
| `autonomous-run.mjs` | MVP | **the whole script**: `RUNS` (the fixture READMEs' invocations + `--yes`), a fresh run dir from the fixture inputs, `claude -p "/power-presentation:present …" --plugin-dir <staged copy> --model opus --effort high --output-format json` (acceptEdits, tools pre-allowed; the staged copy = `git ls-files` minus `PLUGIN_EXCLUDE`: no `examples/` answer keys, no `evals/` runs, no harness scripts / tests / README / CHANGELOG), inside a `bwrap` mount namespace (`isolationArgs`: the repo, the other runs, other sessions' transcripts and `/tmp/claude-<uid>` hidden; `--no-isolation` to opt out), without the launching session's variables (`sessionEnv`), in a neutrally named run dir (`RUNS[].slug`), the copied inputs without golden-set meta (`META` / `INPUT_REWRITES` / `scrubInput()` / `scrubClaims()` / `scrubCopies()` / `metaLeft()`: line counts kept where a declared `file:line` points, `inputs.scrubbed` in the record), `claude-result.json` + `autonomous-run.json` (wall time vs 45 min, `total_cost_usd` vs $25), `runChecks()` + `exitCode()` (`RUNS[].verify` → `s12_capture`, exit 3 on a miss), `COLLECT` (+ `.media/capture/` manifest / events / autozoom and `index.html`, so the copy re-verifies), then `render-path cost --actual`; `POWER_PRESENTATION_MAX_AGENTS=<n>` (`agentCap()` / `agentCapPrompt()`, operator knob) appends a subagent cap to the session's system prompt and records `max_agents`; the pass writes into `<run>/power-presentation-out/<name>/` (`runWorkspace()`: deliverables, `s12_capture`, `cost --actual` and `collect()` read it; the harness files stay in the run dir) and `rootLeaks()` lists anything else it left beside the inputs — `root_leaks` in the record, exit 3 when not empty; `gs-02-repo` runs the GS-02 site through `--repo` with `RUNS[].expect` (`expectChecks()`: `intake.json` source kind `repo`, `source-plan.json` web route `local-static`; exit 3 on a miss) | — |
| `render-path.mjs` | MVP | the deterministic half of the render path — commands, options and exit codes in `--help`, the stage list in the root README. Landed 2026-09-27: `init` scaffolds with the pinned CLI when `hyperframes.json` is missing (`scaffoldProject()`: `init --non-interactive --example=blank --skill=product-launch-video` in a temp dir with `HYPERFRAMES_SKIP_SKILLS=1`, only the entries the project lacks copied in, its own package.json / CLAUDE.md kept) and refuses an unpinned package.json script (`unpinnedScripts()`, exit 3); `packets` first stages frame.md's fonts (`lib/fonts.mjs`) into `assets/fonts/` + `## Staged fonts` (exit 3 on a family with no face), then builds the packets with `SKILL_PATH_KEYS` (`HYPERFRAMES_CORE_REFS`, `EXAMPLES_DIR`, `CUT_CATALOG`) as absolute paths in each header; `audio` checks `scriptFrameMap()` (SCRIPT.md headings 1:1 onto the voiced frames, exit 3 before any TTS), reuses the synthesis from `.media/tts-cache.json` while lines, voice and speed are unchanged, and mounts a storyboard `music: pack:<track>` as `--bgm pack:<track>` (`packMusic()`) while the vendor engine reads `.hyperframes/storyboard.audio.md` with `music: none` (`storyboardWithoutBed()`); `assemble` warns on a `capture_drift` without a sidecar (`DRIFT_DROPPED`); `deliver` targets the QA-08 row of the mix (`targetLufsFor()`, `MUSIC_ONLY_LUFS` −18, `target_row` in `<stem>.loudness.json`); `time --begin/--end <stage>` stamps the wall clock (`STAGE_ALIASES`; `--seconds` kept as `reported`); `manifest` lists registry.npmjs.org while the project has no `node_modules/hyperframes`; `render --fps` from the storyboard's `fps: 15|24|30` (`storyboardFps()`, default 30, another value stops `verify`) and assemble's `warning: restraint` on more than one look family (`styleTokens()` / `stylisticEffects()`); `cost --estimate` = the rule × `COST_CALIBRATION`; `preflight` (`stagePreflight()`): a draft render at the storyboard fps + wowprobe, only `PREFLIGHT_GATES` QA-03 / QA-07 / QA-09 decide, before approval | — |
| `media-packs.mjs` | MVP | **the whole script**: `MEDIA_PACKS` (the upbeat ende.app music pack pinned to brag@c893c5e, the restrained `music-ende-calm` pack — `access: 'account'`, import only — and the Kenney CC0 SFX, all with sizes + sha256), `fetch` (curl or `--from-dir`, hash-verified, `LICENSES.md`, privacy-profile refusal; an account-only pack is never downloaded: named, it lists the song pages; unnamed, it is skipped), `list` (per music track: `pack:<name>`, mood, tempo and length from its cue preset), `resolve` (track by short name across the music packs + credit line + cue preset for `render-path --bgm pack:`) | the calm pack reaches a user only by hand (ende.app needs an account; owner decision pending: import, a self-hosted CC BY mirror, or another source); no CC0 bed source named |
| `brand-kit.mjs` | MVP | **the whole script**: `import` (DTCG with inherited `$type` and srgb components, a capture `tokens.json`, CSS `:root` custom properties → `brand/brand.tokens.json` + a `brand.md` skeleton), `check` (≥ 1 colour, SVG logos light/dark, font files with a licence read from the file, no TODOs), `apply` (the vendor `capture/extracted/tokens.json` for `build-frame.mjs`, fonts → `assets/fonts/`, logos → `assets/brand/`) | Figma MCP / PDF-by-vision importers (v1) |
| `critic.mjs` | MVP | **the whole script**: `prepare` (inputs: contact sheet 1920 wide, 12 key frames 960×540, storyboard, brief, wowprobe → `QA/critic/dispatch.json`), `tally` (`QA/critic/vote-<n>/<agent>.json` → `QA/critic.json`: each C1…C7 from its owner per `present-qa` §4, a vote passes at mean ≥ 3.0 and min ≥ 2, `ship` by majority of 3, fixes lowest score first) | the panel itself is agents (`present-qa` §4); calibration and pairwise regressions are v1 |
| `media-ledger.mjs` | MVP | **the whole script**: `freezeLedger()` (every media file under `assets/` + `.media/` into media-use's `.media/manifest.jsonl` with `sha256` / `bytes` / `license`; media-use records keep id + provenance), licence only from evidence (`pluginProducts()`: `audio_meta.json` voices → `generated` + `synthetic`, the record-flow capture → `own-capture`; `fontLicence()` from the font's own name IDs 13/14 + fsType via `lib/font-names.mjs`; else `unknown`), `ledgerProblems()` (unknown / restricted / CC-BY-NC block, CC BY without a credit line, drift, missing), `set-license`, `--refreeze` | the `--fonts-licensed` override and the site-font classifier (v1); licences of media-use providers (no provider licence table yet) |
| `lib/font-names.mjs` | MVP | `fontNames()` / `fontTables()` / `nameStrings()`: name IDs 1/13/14 and `OS/2.fsType` from sfnt, WOFF (zlib) and WOFF2 (Brotli, W3C table directory) | — |
| `lib/fonts.mjs` | MVP | `declaredFamilies()`, `faceOf()`, `familyOfFace()`, `fontsourceFaces()`, `fontFaceRule()`, `stagedFontsSection()`, `upsertSection()`, `stageFonts()`, `missingFontsReason()`, `fontsSummary()`: the C1 font staging behind `render-path packets` — the families frame.md's `typography:` declares, a face already in `assets/fonts/` (a brand kit) or the pinned OFL `@fontsource` package (`FONT_PINS`, latin, static `<Family>-<weight>.woff2`), the `## Staged fonts` section with root-relative `@font-face` rules; a family with neither is `missing` (exit 3 upstream), nothing is fetched | variable faces; the other presets' families are not pinned |
| `lib/egress.mjs` | MVP | `externalUrls()` / `compositionRefs()` (src / href / CSS `url()` / `@import` over http(s) in `index.html` + `compositions/**`), `telemetryOff()` (the CLI's `HYPERFRAMES_NO_TELEMETRY` / `DO_NOT_TRACK` opt-out), `cliStageEgress()`, `appendEgress()` / `readEgress()` on `.media/egress.jsonl`; `render-path` `cliEgress()` logs verify / render and refuses an external reference under `--privacy local` | the vendor audio engine and media-use calls are not logged; the run-wide manifest printer |
| `lib/static-server.mjs` | MVP | `serveStatic(dir)` — loopback file server on a free port, confined to `dir`, typed by extension; used by `record-flow --local` for a static site and by `golden-set.mjs build` | — |
| `record-terminal.mjs` | MVP | **the whole script**: the repo's `*.tape` → `prepareTape` (one `Output` into `--out`, `__REPO__` resolved) → VHS from the repo root → `footage.mp4` + `terminal.tape` + `capture-manifest.json` (backend `vhs`, tier A, `blocked`), `--frames` stills at 10 fps, the Layer-2 OCR + gitleaks gate on 2 fps samples; `tapeBeats()` (the shown Type / key / Sleep / Wait with tape durations; Hide…Show left out), `timeTapeBeats()` (OCR anchors: typed text in full, a Wait's new match; 2 fps gate texts refined at 10 fps), `lenientCounter()` / `lenientMatcher()`, `vhsDurationMs()` → manifest `timeline.beats` + `capture.screencast_size`; exit 3 on a hit or a tape below 1920×1080 | authoring a tape from the CLI's usage (the plugin only records the user's) |
| `prospect-retention.mjs` | MVP | **the whole script**: `stamp` (the 30-day deadline in `.hyperframes/prospect-retention.json`, no personal data; `render-path deliver` calls it in sales mode), `status` (exit 3 once expired and unpurged), `purge` (deletes the prospect record inside the project, replaces its values in the text artifacts, lists renders / posters / voice lines without touching them); the SessionStart hook reports an expired project and purges it under `POWER_PRESENTATION_HOOKS_ENFORCE=1` | what counts as prospect data beyond the record, and whether delivered renders are included |
| `workspace.mjs` | MVP (owner layout 2026-09-27) | **the whole script**: `ensureWorkspace()` — `<repo>/power-presentation-out/<product>-<mode>[-<prospect company>]/` (`videoName()` from package.json / pyproject / Cargo / folder name, `--name` overrides), the workspace's own `.gitignore` (`*`), re-entry from inside a workspace resolves the repository above (`resolveRepo()`); render-path `ensureProjectRepo()` gives a project in that ignored workspace its own git for the versions | — |
| `interview.mjs` | MVP (owner decision 2026-09-28) | **the whole script** — the form `/present` asks after it scanned the project (a start with no parameters): `interviewForm()` from `intake.json` `declared` + `product-profile.json` + `source-plan.json` → at most four questions (`for`; `product` — this repository / another path / only online, asked only when the scan found no product app here; `landing` — the URL the repository names, its landing directory, another URL, none; `demo` — raise it with the repository's start, online, its screenshots, a reconstruction, with the demo-account file when the app asks for sign-in; for a landing-only URL: record the app the landing links to (recommended, needs a demo account), rebuild the app screens the landing publishes, a user recording, those screenshots as stills; `yes` = the unattended answer (rebuild in marketing, stills in sales / investors)) and `decided` with reasons; `askPayload()` = the AskUserQuestion shape; `--scan <dir>` for the pre-workspace scan | — |
| `progress.mjs` | MVP (owner request 2026-09-27) | **the whole script** — the one line a `/present` user sees instead of the orchestrator's narration: `progressOf()` reads `.hyperframes/pp-stages.json` (the current run starts at the latest `intake` mark; `pending` = the stage in progress, else the stage after the furthest finished one), the frame files `_dispatch.json` names (k/N; `packets` books `frames` early, so frames are done only when every file exists) and the critic votes / `QA/critic.json`; `STEPS` (order + critic, weights = measured shares of the wall clock); `lineOf()` → `▕██████░░░░▏ 48%  Building the frames · 6/10  21 min`; never backwards within a run, 100 % only after `--finish`; `.hyperframes/progress.json` (bookkeeping, `EDIT_SCOPE_EXEMPT`); `--if-changed`, `--hook` (`hooks/progress.sh` on the main session's PostToolUse and Stop → `{systemMessage}` on a change; `workspacesIn()` — a linear scan — finds the run in the call's path fields, the session remembers it under `<plugin data>/progress-sessions/`, a subagent's call stays silent; a second version starts clean, an unclosed bracket expires once a later stage finished, a not-ship verdict walks `REVISION_BAND`), `--statusline` (optional statusLine command) | the weights are observations from four runs |
| `repo-source.mjs` | MVP (owner extension) | **the whole script** — `/present --repo`: `plan` reads the repository (never writes) into `source-plan.json`: `localWebOptions()` (dev servers — runnable only with `node_modules` or no dependencies, built apps in `dist/` `build/` `out/`, static sites with content; a package root's `index.html` is its app shell), `prodUrlHints()` (declared: package.json `homepage`, `CNAME`; mentioned: a README "live / demo" link; code hosts, registries, badges never), `repoArtefacts()` (VHS tapes, OpenAPI / Swagger), `readmeCommands()` (the product executables' documented commands with their documented output), and `chooseRoutes()` per scene class — web: a landing (the declared `--url`, classified by `urlRole()`, or a landing site in the repository) **and** a product app → `combined` (message = the landing, demo = the app raised with the repository's own start from the run-copy and recorded, fallback = its screenshots; one `product-demo` question), from `productApps()` / `appRoutes()` / `backendNeeds()` / `startCommands()` / `productShots()` / `e2eFlows()` / `demoOf()` (owner request 2026-09-27); otherwise dev → build → static → declared URL → a question + tier C (sales / investors confirm); cli / sdk: tape (A) → README commands (B, never run) → code; api: the spec (B); other classes: the scene plan; `run-copy` puts the repository's files (no `.env` / keys / workspace, `node_modules` linked) in the workspace for a dev server to run in; a declared URL that reads as the product's **landing** with no product app in the repository gets the `landing-only` route (`source: reconstruction`, `from: landing-screenshots`, `message` = the landing, never a product beat) and a `product-demo` question of `kind: landing-only` (default: rebuild in marketing, stills in sales / investors — capture-chain.md § 1); `appUrlOf()` — the app address a landing names (JSON-LD application url, an `app.` / `dashboard.` link, a sign-in link on another host) → `url_role.app_url` and the landing-only question's `app_url` (recording the working product is then option 1) | — |
| `share-copy.mjs` | MVP | **the whole script**: `STOP_LIST` (English), `SECTIONS` per mode, `LIMITS`, `parseShareCopy()`, `visibleNumbers()` (extractor inventory + bare numbers), `lintShareCopy()` (stop-list, numbers vs claims, lengths, required sections, music credit / GDPR Art. 14 + 21(2) / tier-C lines, promise warning), `buildSkeleton()`; `init`, `lint`, `--list-rules` | — |
| `toolchain.mjs` | MVP | **the whole script**: `status` (probe, no network), `install` (npm-install `hyperframes@0.8.47` + `playwright@1.63.0` + `FONT_PINS` (six OFL `@fontsource` packages @5.3.0) [+ `ffmpeg-static` when ffmpeg is not on PATH] into `${CLAUDE_PLUGIN_DATA}/toolchain`, chrome-headless-shell via `@puppeteer/browsers` into `toolchain/chrome` with the CLI's own `browser ensure` as fallback, Playwright browsers into `toolchain/ms-playwright`, then `doctor`), `doctor` (`hyperframes doctor --json` → `doctor.json` with the derived gate); `status` adds `components.fonts` (informational, not in `ready`) and `install --if-needed` runs while a font package is missing; `env` (export lines for `$CLAUDE_ENV_FILE`), `manifest` (network hosts), `paths`; `REQUIRED_CHECKS` / `INFORMATIONAL_CHECKS`, `evaluateDoctor()`, `probeToolchain()`, `summaryLine()`, `installToolchain()` with an injectable runner, a pid lock, `install.log`; `adopt` / `siblingToolchain()` / `adoptToolchain()`: a data dir without a toolchain links the ready one of another install of the plugin (`--plugin-dir` and marketplace installs keep separate data dirs) — `install` does it before any download | media packs (no pack manifest yet) |
| `vendor-workflow.mjs` | MVP | **the whole script**: `fetch` (sparse blobless depth-1 checkout of `skills/product-launch-video` at `v<pin>`, media refused, hash verified against upstream `skills-manifest.json`, provenance + `LICENSE-hyperframes` + `NOTICE`), `check` (offline integrity, CI), `seed` (copy into `~/.claude/skills/` when absent; `--force` with backup), `drift` (installed vs vendored) | — |
| `lib/paths.mjs` | MVP | `pluginRoot()`, `pluginData()` (`CLAUDE_PLUGIN_DATA` → `POWER_PRESENTATION_DATA` → scan of `~/.claude/plugins/data/power-presentation*`), `toolchainDir()`, `vendorDir()`, `userSkillsDir()`, `projectRoot()` | — |
| `lib/versions.mjs` | MVP | `HYPERFRAMES_PIN = 0.8.47`, `HYPERFRAMES_RANGE = 0.8.x`, `PLAYWRIGHT_PIN = 1.63.0`, `CHROME_HEADLESS_SHELL_BUILD = 152.0.7977.30`, `FONT_PINS` (the MVP presets' `@fontsource` faces @5.3.0), `UPSTREAM_REPO`, `VENDORED_WORKFLOW`, `upstreamTag()`, `PLUGIN_VERSION` from `plugin.json`, `satisfiesRange()` | — |
| `lib/skill-bundle.mjs` | MVP | `hashSkillBundle()` (HyperFrames' `skills-manifest.json` algorithm, byte-for-byte), `listFilesSorted()`, `copyTree()`, `diffTrees()`, `findMedia()` | — |

Every `.mjs` exports its `parseArgs()` and `USAGE`; importing a module never runs its CLI
(the `import.meta.url === argv[1]` guard), so the data exports are safe to use from tests and
from other scripts.

## Running the tests

```sh
npm test                                   # = node --test "scripts/*.test.mjs"
node --test "scripts/*.test.mjs"           # same thing, no npm
```

`node:test` only, no dependencies. Note that on Node ≥ 21 `--test` takes glob patterns and no
longer walks a bare directory, so `node --test scripts/` does **not** work; use the glob.
The suite checks, per CONTRACT: every stub exits 64 with `NOT IMPLEMENTED` on stderr,
`--help` exits 0, `sceneKey()` is deterministic and changes with any single input,
`SIGNALS` covers all 9 classes and the detector classifies GS-01…GS-03 plus one synthetic
repository per class (and monorepo / Electron / React Native / Go / Rust / Django shapes) as
expected, never opens-denied files, never follows symlinks and is deterministic;
`record-flow.mjs` keeps the order, the secret grammar, the injected scripts, the gate
(fake OCR/gitleaks drivers) and the CLI error paths, and — when Playwright + Chromium, ffmpeg and
tesseract are on this machine, otherwise the three end-to-end cases skip with the reason —
captures a local page: 3840×2160 footage, Node-clock events, every Layer-1 mask, the Layer-2
block on a canvas-rendered token, `--confirm-findings`, tier B and `--local`;
`AUTOZOOM_DEFAULTS` holds the fixed zoom defaults, `GATES` = QA-01…QA-14
with valid owners and the scorecard weights sum to 100, and no script hard-codes a home
directory; `toolchain.mjs` runs its whole install flow through a fake runner (npm / CLI /
chrome download / Playwright / doctor all faked, no network), the gate against a real
0.8.47 doctor report, refusals (privacy profile, lock, Node < 22) and the CLI, and — when this
machine has the pinned toolchain — a real `doctor`; `vendor-workflow.mjs` proves the vendored
tree hashes to upstream's manifest entry (`d87f7ae140e88403`), checks seed / drift against a
temp skills dir and resolves the release tag upstream (network; skipped offline);
`hooks-session.test.mjs` runs both SessionStart hooks against temp `HOME` / data dirs (seeding
+ `reloadSkills`, `CLAUDE_ENV_FILE` exports, privacy=local, a ready fixture, no node, a failing
npm). Tests that need `python3` or `bash` skip when the interpreter is absent.

## Paths and environment

`${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_DATA}` are exported as environment variables
**only to hook processes** (and MCP/LSP subprocesses). When a skill body runs
`node ${CLAUDE_PLUGIN_ROOT}/scripts/x.mjs`, Claude Code substitutes the absolute path in the
command text, but the variable is not in the script's environment — so `lib/paths.mjs` falls
back to its own location for the root. For the data dir the SessionStart hook bridges the
gap: `scripts/toolchain.mjs env` writes `export POWER_PRESENTATION_DATA=<CLAUDE_PLUGIN_DATA>`
(plus the toolchain `PATH`, `HYPERFRAMES_BROWSER_PATH`, `PLAYWRIGHT_BROWSERS_PATH`,
`HYPERFRAMES_SKIP_SKILLS=1` and the switches under privacy=local) to `$CLAUDE_ENV_FILE`,
which Claude Code sources before every Bash command. With no variable at all `pluginData()`
scans `~/.claude/plugins/data/power-presentation*` (via `os.homedir()`, never hard-coded) for a
dir that holds `toolchain/toolchain.json` — `power-presentation-inline` for `--plugin-dir`,
`power-presentation-<marketplace>` for a marketplace install — else `…/power-presentation`.
`CLAUDE_PLUGIN_ROOT` is ephemeral for marketplace-cached plugins; persistent state (toolchain,
media packs, caches) belongs under `pluginData()`.

Two optional operator variables throttle every child process the scripts spawn
(`scripts/lib/throttle.mjs`, used by the `render-path.mjs` and `toolchain.mjs` runners):
`POWER_PRESENTATION_NICE=<0..19>` wraps the command in `nice -n <n>`, and
`POWER_PRESENTATION_CPUSET=<list>` (e.g. `0-7,16-23`) in `taskset -c <list>` (Linux only; a
missing `taskset` or an invalid value is reported and ignored, never fatal). Kokoro, whisper,
chrome-headless-shell, ffmpeg and npm inherit both, so an all-core burst from a render or a
voice pass stays inside the given cores and below the desktop's priority. Set them in
`.claude/settings.local.json` (`"env": {…}`) on a machine that must not be saturated — the
development workstation, whose CPU hard-resets on load transients until its BIOS is fixed,
runs with `nice 10` on `0-7,16-23`.

Layout of the data dir (written by `toolchain.mjs`):

```
${CLAUDE_PLUGIN_DATA}/
  toolchain/
    package.json, package-lock.json      private manifest with the pins (a lockfile is fine here — not the plugin package)
    node_modules/.bin/hyperframes         hyperframes@0.8.47 (first on PATH for later Bash commands)
    node_modules/playwright               playwright@1.63.0 (record-flow.mjs)
    node_modules/@fontsource/*            FONT_PINS: the MVP presets' OFL faces @5.3.0 (render-path packets stages them, C1)
    node_modules/ffmpeg-static, ffprobe-static   only when ffmpeg / ffprobe are not on PATH (HYPERFRAMES_FFMPEG_PATH / _FFPROBE_PATH exported)
    chrome/                               chrome-headless-shell 152.0.7977.30 (HYPERFRAMES_BROWSER_PATH)
    ms-playwright/                        Playwright's Chromium + headless shell (PLAYWRIGHT_BROWSERS_PATH)
    toolchain.json                        install state — schema power-presentation/toolchain@0.1
    install.log                           timestamped log of every install step and command
    .install.lock/pid                     held while an install runs (a dead pid is reclaimed)
  doctor.json                             last `hyperframes doctor --json` + the gate — schema power-presentation/doctor@0.1
  hook.log                                stderr of the SessionStart hooks' script calls
  media-packs/                            packs — not fetched yet (no pack manifest)
```

Measured 2026-09-20 on linux-x64: 1.7 GB (node_modules 746 MB, chrome 261 MB, ms-playwright
658 MB), 52 s on a fast line.

## Runtime dependencies (once implemented)

| Need | Used by | Notes |
| --- | --- | --- |
| Node ≥ 22 | all `.mjs` | `package.json` engines; no npm dependencies, no lockfile (a lockfile would make Claude Code run `npm ci` on every cache copy) |
| `hyperframes@0.8.47` | `render-scenes.mjs`, callers of `check`/`lint`/`snapshot`, `toolchain.mjs doctor` | pinned in `lib/versions.mjs`; range `0.8.x`; installed into `${CLAUDE_PLUGIN_DATA}/toolchain` by the async SessionStart hook (`toolchain.mjs install`) and put first on `PATH`; `npx hyperframes@0.8.47` still works |
| Playwright ≥ 1.59 + Chromium | `record-flow.mjs` | CDP `Page.startScreencast`; `recordVideo` is banned. Resolved from `${CLAUDE_PLUGIN_DATA}/toolchain/node_modules/playwright` first (installed there by `toolchain.mjs install`, browsers under `toolchain/ms-playwright` via `PLAYWRIGHT_BROWSERS_PATH`), else plain module resolution (`npm install --no-save playwright && npx playwright install chromium` for local runs). Chromium is launched with `--force-device-scale-factor=2`: the headless screencast ignores the context DPR (measured 2026-09-20, Playwright 1.63 / Chromium 153) |
| tesseract (+ `eng` data) | `record-flow.mjs` Layer-2 gate | OCR of sampled frames; absent → `layer2_ocr_gate.ran: false` with the reason (visible, not blocking). Debian/Ubuntu: `tesseract-ocr`; macOS: `brew install tesseract` |
| VHS 0.11.0 + ttyd | `record-terminal.mjs` (`cli`), `golden-set.mjs build` (GS-03) | the repo's tape with `Hide/Show`, `Wait /regex/`; found on PATH or in `${CLAUDE_PLUGIN_DATA}/toolchain/bin`; VHS 0.12.0 renders nothing. The tape is the event log: `timeline.beats` times its shown commands on the OCR'd frames |
| ffmpeg / ffprobe | `record-flow.mjs` (concat → libx264, tier-B frame sampling), `wowprobe.py`, `poster-bake.sh`, `render-scenes.mjs` | system binaries (LGPL/GPL, see THIRD_PARTY_NOTICES.md); when absent from PATH, `toolchain.mjs install` adds `ffmpeg-static` / `ffprobe-static` to the toolchain and exports `HYPERFRAMES_FFMPEG_PATH` / `HYPERFRAMES_FFPROBE_PATH` |
| chrome-headless-shell 152.0.7977.30 | `hyperframes` render / capture / check | the build `hyperframes@0.8.47` embeds; downloaded by `toolchain.mjs install` into `${CLAUDE_PLUGIN_DATA}/toolchain/chrome` through `@puppeteer/browsers` (the CLI's own `browser ensure` into `~/.cache/hyperframes` is the fallback) and exported as `HYPERFRAMES_BROWSER_PATH` |
| git | `vendor-workflow.mjs fetch` | sparse, blobless, depth-1 fetch of the release tag (network); `check` / `seed` / `drift` need no git |
| Python ≥ 3.11 + `librosa>=0.10.2`, `numpy>=1.26`, `scipy>=1.11`, `soundfile>=0.12` | `analyze_music_cues.py` | **optional** — versions from brag's `pyproject.toml`; without them the caller falls back to `npx hyperframes beats`. `wowprobe.py` itself needs only the standard library plus ffmpeg on PATH |
| gitleaks | `record-flow.mjs` Layer-2 gate | `gitleaks detect --pipe --redact` on the OCR text (Presidio NER gate is v1); absent → `layer2_ocr_gate.gitleaks: "unavailable"`, own regexes still run |

## `wowprobe.py` output schema (`QA/wowprobe.json`, schema `power-presentation/wowprobe@0.1`)

```jsonc
{
  "schema": "power-presentation/wowprobe@0.1", "generated_at": "…", "mode": "sales", "reveal": "early", "register": "high",
  "target_lufs": -14, "destination": "sales-outreach", "video": "renders/final/x.mp4", "storyboard": "STORYBOARD.md",
  "gates_failed": ["QA-03"],                       // measured, failed, not waived — what blocks the render / ship
  "not_measured": { "QA-11": "no --animation-map …" },   // inputs missing: never counted as passed
  "gates": { "QA-01": { "rule": "Duration", "owner": "ffmpeg", "type": "hard", "measured": true, "pass": true,
                        "value": 60.1, "threshold": { … }, "details": { "brief_sec": 60, "deviation_pct": 0.17, "band": "sales-outreach", … },
                        "override": "…only on default gates the brief overrode", "waived": true /* only when a QA.md waiver applied */ } },
  "waivers": [{ "gate": "QA-13", "snapshot": "QA/snapshots/05.png", "reason": "…", "qa_md": "QA.md#L12" }],   // applied
  "waivers_declared": [ … every bullet found in QA.md, with snapshot_exists … ],
  "brief_overrides": [{ "gate": "QA-04", "override": "reveal: story-first raises the first-product limit to 25 s …" }],
  "scorecard": { "total": 84.2, "measured_weight": 90, "band": "critic",   // total over the measured metrics, scaled to 100
                 "metrics": { "hook_speed": { "weight": 15, "score": 100, "measured": true, "basis": "…", "t": 3.5 }, … } },
  "measurements": { "format": { … }, "duration": 60.1, "black_open": { "yavg_min": 31.2, … }, "freezes": [ … ],
                    "cuts": [{ "t": 3.0, "score": 0.81 }], "loudness": { "integrated_lufs": -14.2, "lra_lu": 6.1, "true_peak_dbtp": -1.4 } },
  "storyboard_summary": { "frames": 7, "planned_duration_sec": 60, "roles": [ … ], "product_share_pct": 52.5, "text_items": 11, "warnings": [] },
  "contact_sheet": { "file": "QA/contact-sheet.png", "columns": 6, "rows": 10, "tile": [320, 180], "width": 1920, "height": 1800, "timecodes": true },
  "keyframes": [{ "file": "QA/frames/00-at-0.00s.png", "t": 0, "why": "frame0" }, …],   // ≤ 12: frame 0, +0.5 s, midpoints, cut ±0.2 s
  "ship": { "gates_ok": false, "scorecard_ok": true, "note": "… critic votes are not in this file" }
}
```

`gates` (with `type` = hard|default from `GATES[].hard`), `gates_failed`, `waivers` and `brief_overrides` are copied
verbatim into `run-report.json`. The script is the only producer of `QA/contact-sheet.png` and
`QA/frames/` (post-render, for the vision critic; `--sheet`, `--frames-dir`, `--no-sheet`); `hyperframes snapshot --at`
supplies pre-render frames only. Scorecard bands: ≥ 80 → critic; 60–79 → auto-revision of scenes; < 60 → replan
the storyboard. `--trend <tsv>` appends `date, label, mode, scorecard_total, gates_failed, not_measured, video`
(trend line; the skill passes a path under `${CLAUDE_PLUGIN_DATA}`, since the plugin root may be a read-only cache).
`gates.QA-07.details.declared_hold_sources` lists `{frame, kind: hold|capture_hold|end_card, start, end}` for every
declared hold QA-07 subtracted; `scorecard.metrics.hook_speed.full_marks_path` names the layout that earns full marks
when the score is below 100. `python3 scripts/wowprobe.py --list-gates` prints the gate table (with `gate_roles`);
`--poster-pick --storyboard X` prints the poster moment.

Storyboard keys the probe reads (agents/story-director.md § "What the scripts parse"): frontmatter `duration`,
`audience`/`mode`, `reveal`, `register`; frame headings `## Frame <N> — <title>` (an unnumbered Frame / Beat / Scene
heading is a warning, not a frame; a numbered one in another form counts and warns); per frame `duration`, `start`
(optional; the director never writes it), `role` (gate roles only: hook|ui|demo|recording|terminal|code|api|diagram|
design|file|outcome|metric|cta — any other value warns, and a card with no gate role leaves it out),
`continuous_camera`, `hold: true|<sec>` (from the frame start), `capture_window: a-b` + `capture_hold: <s>` (the held
tail at the frame's end is a declared QA-07 hold, no `hold:` needed), `poster: <sec>`, `src`, `voiceover`, and the
text timeline `- text: "…" @ a-b` / `@ a +hold` / `- cta: "…" @ a-b`, `- order: logo -> tagline -> URL`,
`- stagger: 0.4s`. Storyboard warnings go to `storyboard_summary.warnings` and to stderr as `wowprobe: warning: …
(STORYBOARD.md:<line>)`; they never change the exit code. Analysis passes run at 480 px wide (scene score, freeze,
luma); loudness on the untouched audio.

## Attribution

`analyze_music_cues.py` is copied verbatim from latent-spaces/brag v0.2.2 (MIT) with an
attribution block after the shebang; see `THIRD_PARTY_NOTICES.md`. `poster-bake.sh` is brag's
poster recipe (settled frame → `overlay … enable='eq(n,0)'` on frame 0), `share-copy.mjs` its
share-copy mechanism (one canonical caption; variants; no "excited to share"), and `wowprobe.py`'s
QA-10 rule is brag's reading-time floor with the plugin's numbers. Cue presets produced by the script live
in `assets/cue-presets/` (`assets/ATTRIBUTION.md`).

## `inspect-project.mjs` output (`product-profile.json`, schema `power-presentation/product-profile@0.1`)

```jsonc
{
  "surface": "cli",                       // one of the nine classes, or null when nothing matched
  "confidence": "medium",                 // high | medium | low — see assessConfidence()
  "ambiguous": true,                      // = confidence !== "high" → `question` is filled
  "mode": "product",                      // product | concept ("concept video": no UI, no runnable code) | unknown
  "candidates": [{ "class": "cli", "score": 4, "tier": "runnable", "signals": ["vhs-tape"] }, …],
  "secondary": ["api/backend", "mocks/design", "files/docs"],   // every other candidate with ≥ 2 points
  "signals": [{ "id": "openapi-spec", "class": "api/backend", "kind": "glob", "weight": 4, "source": "…", "evidence": ["openapi.yaml"] }],
  "scenes": [{ "type": "terminal / code", "for": "cli", "role": "terminal", "phase": "MVP", … }, …, { "type": "logo-outro" }],
  "optional_scenes": [ … "metrics / chart", "comparison" (any class) … ],
  "deferred_scenes": [ … "diagram" (v1) … ],
  "capture": { "class": "cli", "backend": "vhs-tape", "needs_url": false, "chrome_needed_for": "render only" },
  "question": { "field": "surface", "text": "…", "options": [ … ], "default": "cli" },   // null when confidence is high
  "story_sources": [{ "kind": "readme", "ref": "README.md" }, …],                       // order: hero page → README → CHANGELOG → testimonials → e2e
  "facts": { "has_code": true, "has_ui_or_code": true, "manifests": { … } },
  "read_policy": { "rules": ["env-files", "pem", "fixtures", "keys-and-credentials"], "denied_files_seen": { "env-files": 1 }, "content_read": [ … ] },
  "scan": { "files": 12, "dirs": 3, "truncated": false, "ignored_dirs": { "node_modules": 1 } },
  "notes": [ "Product without UI: no URL is required; Chrome is needed only at render." ]
}
```

Ranking rules (all in the file header): four tiers — a UI class with a real UI signal
(framework, Python UI framework, static-site generator, server templates, HTML entry, declared
`--url`, mobile/desktop host) beats the other runnable classes (cli, api/backend, library/sdk,
data/ml), which beat the `declared` tier (a URL-only web surface next to a cli / api / notebook
signal — it becomes a secondary web surface and the question is asked, never a silent flip),
which beats the concept classes (mocks/design, files/docs); inside a tier the score decides, then
the number of distinct product-evidence signals, then the class order ("VHS tape for CLI first"). `mode` follows the facts: `product` when the tree holds UI, code or a
runnable artefact (tape, spec, notebook), `concept` when only design/docs, `unknown` when nothing
matched; code the manifest readers do not understand (Java without Spring, C, Kotlin …) never turns
into a concept video — confidence drops to `low` and the question is asked. `devDependencies` are
tooling for publishable packages (a private app counts them — SvelteKit, Electron, Expo),
`peerDependencies` mark a plugin/library, a UI host (Electron / Expo / Ink) owns only its own
package's frontend evidence, nested package.json under `docs/`, `website/`, `examples/`,
`playground/` … and `site/index.html` next to a CLI / API describe a companion site or sample app,
Dockerfiles under `.devcontainer/`, `.github/`, `ci/` … are not a runtime, a Go/Rust server `main`
is not a CLI, a `models/` full of code is not ML. A class becomes `secondary` only with product
evidence (never packaging or tooling). The two absence
signals (`only-md`, `datasets-only`) fire only when nothing runnable matched. `read_policy.content_read`
lists every file whose content was opened; `scan.limits_hit` / `unreadable_dirs` mark an incomplete
scan as `truncated`. Exit codes: 0 (also when ambiguous), 1 runtime failure, 2 usage.

Measured 2026-09-19 (adversarial review + probe, 38 agents): 44 realistic synthetic repositories
(Next/Vite/Nuxt/SvelteKit/Angular, Rails full and API-only, Django/Flask/FastAPI, Express/Nest/Spring,
Go/Rust CLIs and libraries, npm/Python libraries and CLIs, Jupyter/MLOps, Flutter/Expo/Electron/Tauri,
design-only, docs-only, dataset-only, Terraform, monorepo, empty, CLI + Docusaurus, SDK + example
app, Ruby gem, Maven jar, serverless, static and Hugo sites) → 43/44 on the expected class after the
review fixes; the miss is a Terraform repo → `null` + question (the probe's own "acceptable"
outcome). A second round (24 agents, 16 further shapes: Remix, Vue kit, design-system monorepo,
Streamlit, Django under backend/, Go cli+server, Rust bin+lib, Kotlin CLI, Swift package, Flutter
package, Chrome extension, Jekyll, Notion export, OpenAPI-only, a repo named demo/) confirmed 7 more
interaction defects — all fixed, 16/16 on the expected class afterwards (the Chrome extension at
`low` + question, as there is no such class). 18 confirmed findings in total plus most unverified
ones are pinned by `inspect-project.test.mjs` (107 tests).

## `extract-story.mjs` outputs

`story-extraction.yaml` (schema `power-presentation/story-extraction@0.1`) — the record; every
`source` is `<file>:<line>` relative to `--repo` or the hero-page URL (with `snapshot: <file>:<line>`
when the page came from `--hero` / `--fetch`):

```yaml
repo: gs-02-ledgerly                                              # directory name only — no machine paths in artefacts
url: null; fetched_url: null                                      # the final URL after redirects when --fetch was used
sources: [{ kind: e2e-tests, tests: 2 }, { kind: readme, …, docs: docs/README.md }, { kind: changelog, latest_added: { version, entries, unreleased } }, { kind: hero-page, ref: site/index.html, mode: repo|snapshot|fetched, opened: true }, { kind: testimonials }]   # source precedence: the repository before the landing (owner decision 2026-09-28; the earlier order reversed for facts)
product_name: { value: Ledgerly, source: "site/index.html:6", from: title }   # og:site_name → JSON-LD name → manifest → <title> → README H1
product:                                                          # what the product IS and how it is used, in the owner's words (planning rubric Q1 / Q4 / Q9)
  definition: { text: "Ledgerly is a …", source, tier: repository | landing, from: package.json description | pyproject.toml description | Cargo.toml description | readme-one-liner | subhead | ld:application description | ld:Organization description | og:description | description }   # the repository first
  definition_candidates: [ … ]; category: { text, source }         # JSON-LD applicationSubCategory / applicationCategory
  app_url: { value, source, differs_from_page: true }             # the app lives elsewhere (app.<host>): the page is a landing, not the product
  features: [{ text, source }]                                    # JSON-LD featureList — the owner's own list
  videos: [{ name, description, label, caption, duration_s, url, source, rebuilt, parts }]   # the page's product films (VideoObject, <video aria-label>): a story source, never footage
  steps: [{ text, detail, source }]                               # a numbered "how it works" block (class steps / how-it-works / process)
  screens: [{ path, title, headings, actions, nav, source }]      # the running product's own words per recorded step (--screens screens.jsonl; generic chrome dropped)
promise: { stated: "Close the books in 3 days, not 12", source: "site/index.html:27", from: h1, claim_type: stated, derived: null, candidates: [ … ] }
audience: [{ persona, evidence, source, rule }]                    # "for X" copy, testimonial roles, CLI/SDK ⇒ developers
competitive_alternatives: [{ marker, sentence, source, rule }]     # unlike / vs / instead of / ", not X" …
hero_feature:                                                     # (owner's version, 2026-09-28)
  name: …; score: 6; rules: [{ rule: product-screen, points: 3, source }, { rule: product-heading, points: 2, source }, { rule: first-feature-section, points: 1, source }]
  state_change: { score: 1, evidence: [{ kind: before-after copy | e2e test asserts an outcome | changelog verb, before, after, excerpt, source }] }
  tie_break: null | feature-over-promise | state-change | source-count | source-order | position | name
  runner_up: { name, score }; evidence: [ … ]; before_state / key_action / after_state: { text, source } | null
features: [{ name, score, rules, state_change_score, sources }]   # every candidate, ranked
user_flow: { entry, key_action, result, steps?, source_files, from: product-screens | e2e-tests | readme-example | page-steps | product-video }   # the recorded product flow (--screens) first; no e2e spec or README example: the page's numbered steps, else a product film's listed parts
proof: { numbers: [{ value, context, source, date }], quotes: [{ text, name, role, company, source }], logos: [{ name, file, source }], badges: [ … ] }
cta: { text, href, source, kind: hero-cta | readme-install }
changelog: { version, source, latest_added: [{ text, source }] }
gaps: [{ id, where, reason, needed, value? }]                      # shown to the user before render
read_policy: { rules, denied_files_seen, content_read, external }
```

`claims-index.json` (schema `power-presentation/claims-index@0.1`) — the index the story
director extends (`used_in`) and `claims-auditor` checks (QA-12):

```jsonc
{ "counts": { "total": 21, "verified": 19, "unverified": 2, "by_kind": { "number": 20, "quote": 1, "logo": 0 } },
  "claims": [
    { "id": "c001", "kind": "number", "value": "3 days", "number": 3, "unit": "days", "unit_kind": "measure", "context": "Close the books in 3 days, not 12",
      "source": "site/index.html:27", "source_kind": "hero-page", "date": null, "claim_type": "sourced", "status": "verified",
      "declared": true, "declared_id": "close-days-hero", "declared_ids": ["close-days-hero"], "verification": "declared source site/index.html:27 states 3 days", "used_in": [] },
    { "id": "c020", "kind": "number", "value": "10x faster", "source": null, "source_kind": "declared", "claim_type": "declared",
      "status": "unverified", "declared": true, "declared_id": "decoy-10x", "verification": "no source line contains 10x faster", "used_in": [] } ],
  "gaps": [{ "id": "unverified-claim", "value": "10x faster", "kind": "number", "where": "claims.json", "reason": "…", "needed": "a `file:line` or URL …" }],
  "declared": { "ref": "claims.json", "total": 9, "verified": 7, "unverified": 2 }, "metrics": null }
```

Rules (all in the file header): sources rank by the owner's source precedence (2026-09-28: the running product,
the repository, the landing); the scoring is the owner's of 2026-09-28 — an action of the running product +3,
a heading of its screen +2, the README example that names the product +2, the latest `Added` +2, an e2e test that
acts on the product +1, the landing's declared `featureList` (else its first feature section) +1, the H1 +1, so the
H1 never outweighs the product; a first tie-break prefers a feature over the H1 promise; every item of a scoring block (all items of the first feature section, all entries of
the latest released `Added`; `[Unreleased]` only when nothing else has one, flagged) gets the
block's points, ties break by visible state-change evidence (before→after copy, an e2e test that
asserts an outcome), then number of distinct sources, source order, position inside the
source, name; two mentions are one feature when they share ≥ 3 content tokens, or ≥ 2 that cover
≥ 60 % of the shorter and ≥ 30 % of the longer mention; a candidate is named after its
feature-shaped mention (section item, CHANGELOG entry, README command), not the H1 sentence. The
hero H1 is the first `<h1>` that is neither site chrome (header / nav) nor the bare brand name; a
brand-only H1 fires no rule and the promise falls back to the subhead / `og:description`; a
template-only H1 / quote (i18n, JSX) is a `hero-data-driven` gap. Numbers are inventoried from text
only — currency, unit or count-noun numbers (word scales included), comma- or space-grouped /
≥ 5-digit counts, ranges, signed deltas, compound durations, `N+`; versions, bare years, times,
ids, ISO / issue numbers and runtime requirements (`Node 18+`) are skipped; a number inside an
extracted quote belongs to the quote's source (GS-02 rule); a bare number the H1 states as
before→after ("not 12") is indexed with the H1 line; a stat line that holds only the number borrows
a neighbouring label as context. Declared claims are matched by canonical number + compatible unit
(`3,400` = `3.4k`, `11 hrs` = `11 hours`; a unit-less "3" never matches "3 months"), quote text or
logo name/file; a declared `file:line` must state the same number with the same unit (never a digit
substring), a declared URL is checked against the hero page text, and a declared source can never
open a file outside the repository or one the rules deny. Minified pages (fetched or passed
with `--hero`) are re-lined (one block element per line) and saved next to `--out` as
`hero-page.html`, so `snapshot:` lines stay useful; a `--hero` file outside the repository is copied
there too, so no machine path enters the artefacts. Every `--fetch` host is printed before it is
contacted (redirect hops included); the final URL is the provenance. The extractor reads at
most one hero page, one README (+ one docs quickstart or workspace README as fallback), one
CHANGELOG (root, else `apps|packages/*`), 20 testimonial files, 40 e2e specs, 60 logo files; caps
and every opened file are listed under `read_policy`. Exit codes: 0 (gaps are normal), 1 runtime,
2 usage / refused fetch, 3 `--strict` with unverified claims. Measured 2026-09-19 on GS-02: all six
sourced numbers and the quote at the exact `claims.json` lines, both decoys `unverified`; on the
real plausible.io page (fetched once, outside the privacy profile): 5 named testimonials, `<dt>`
features, 36 numbers with labels, hero feature = the H1; the 11 realistic probe repositories of the
adversarial review (Next.js, Astro, Python CLI, Rust CLI, docs-only, monorepo, Django + Cypress,
OSS library, Vue SPA, README quotes, Go + HTML README) all run without a crash.

## `record-flow.mjs` outputs (`capture/`, manifest schema `power-presentation/capture-manifest@0.1`)

```sh
node scripts/record-flow.mjs --url https://app.example.com --flow flow.json --out .media/capture/
node scripts/record-flow.mjs --local --repo . --out .media/capture/          # npm run dev|start, waits for http://localhost:NNNN
node scripts/record-flow.mjs --recording ~/Desktop/demo.mp4 --tier B --out .media/capture/
node scripts/record-flow.mjs                                                  # → {"needs_input": true, question} — the skill asks
```

| File | Content |
| --- | --- |
| `footage.mp4` | 3840×2160 H.264 (libx264 CRF 18, limited-range yuv420p), one frame per compositor paint with its exact duration; the last frame lasts until the stop. Never Playwright `recordVideo`. |
| `events.jsonl` | one `{t, type, selector, tag, rect}` per line — `navigation`, `click`, `focus`, `scroll`, `key`; `t` is epoch ms from the Node clock (the page clock is frozen by `--fixed-time`). Empty for tier B. |
| `capture-manifest.json` | `tier`, `environment`, `chain_step`, `url`, `capture` (backend, viewport, screencast size, encoder, `cursor: "none"`), `artifacts`, `events.count`, `timeline` (`footage_start_ms`, `footage_end_ms` — maps an event as `t - footage_start_ms`; `null` for tier B), `flow` (a live capture: `{steps_total, steps_done, failed_step}` — `failed_step` `{index, action, selector, error, t, footage_t_sec}` or `null`), `redaction` (below), `blocked`, `created_at` |
| `redactions.json` | Layer-1 log: `{reason: "always-mask-selector" \| "secret-grammar", patternId?, length, sha256}` per replacement — never the plaintext |
| `redaction-findings.json` | only when Layer 2 found something: `{id, name, index, length}` per hit (`github-token`, `email`, `card-number`, …, `gitleaks:<rule>`) — offsets into the OCR text, never the matched text |

`redaction.layer1_dom_masking` = `{applied, replacements}` (tier B: `applied: false`);
`redaction.layer2_ocr_gate` = `{ran, sampled_frames, ocr_frames, gitleaks: "ok" | "unavailable", findings, confirmed}`,
or `{ran: false, skipped: true, reason: "--skip-ocr-gate"}`, or `{ran: false, reason: "tesseract not available", …}`.
A finding sets `blocked: true` and exit 3 until the same command is re-run with `--confirm-findings`
after a human has read the report; a degraded gate (no tesseract / no gitleaks) is stamped,
never hidden and never blocks the capture on its own. Downstream, `hooks/guard-render.sh` refuses
`hyperframes render` while a manifest is `blocked`, or while its gate did not run and nobody passed
`--confirm-findings` (a match blocks the render until confirmed; a skipped gate must never
look like a passed one).

Rules (all in the file header): the order `--url` → `--staging-url` → `--local` →
`--recording` is fixed; `--flow` is a JSON array of `goto | click | hover | scroll | type | key |
wait` steps, validated before anything starts. Layer 1 runs from the first byte
of every document and frame: an observer on `document` itself (before a root exists),
`characterData` mutations, wrapped `attachShadow`; always-mask selectors (password / `cc-*` /
one-time-code fields, Sentry / PostHog / rrweb conventions), then the secret grammar
(`SECRET_PATTERNS` + Luhn card numbers) over text nodes and input/textarea values, replaced with a
same-length `•` run *before* the sha256 is computed; `script` / `style` / `noscript` / `template`
text is left alone. Layer 2 samples 2 fps plus the frame nearest every click / navigation,
OCRs byte-identical frames once with up to 4 tesseract processes, and scans the
text with the OCR-tolerant variants (`ghp ABC…` counts as `ghp_ABC…`; IPv4 is dropped as OCR
noise) plus gitleaks. Tier B samples the user's file with ffmpeg at the same rate. A `--flow` step
gets 8 s (`goto` 30 s); a failed step stops the flow, the capture so far goes through the same
Layer-1 log and Layer-2 gate, and the step is named on stderr. Exit codes: 0, 1 runtime
(Playwright / browser / ffmpeg / dev server failure), 2 usage, 3 blocked, 4 a failed `--flow` step
(a block still wins with 3). Measured
2026-09-20 on the test page (Playwright 1.63, Chromium 153, ffmpeg 8.0, tesseract 5.5,
gitleaks 8.30): a 1.2 s flow captures in ≈ 3.5 s wall clock including OCR; Layer 1 masked the
password, three e-mails (text node, in-place update, shadow root), the card, the AWS key, the
phone and an `sk-` input value; Layer 2 caught the token drawn on a `<canvas>` and blocked.

## `autozoom.mjs` output (`autozoom.json`, schema `power-presentation/autozoom@0.1`)

```sh
node scripts/autozoom.mjs --events .media/capture/events.jsonl --footage .media/capture/footage.mp4 --out .media/capture/autozoom.json --emit-html .media/capture/index.html
node scripts/autozoom.mjs --events capture/events.jsonl --format 9:16 --clip-start 12.5 --clip-duration 6 --out frames/03.autozoom.json   # one scene, scene-local time
```

Inputs: `events.jsonl` + `capture-manifest.json` (default: the sibling file — `timeline.footage_start_ms`
is the origin, `capture.viewport` the rect unit, `capture.screencast_size` / the timeline the fallback
size and duration) and, when given, `footage.mp4` probed with ffprobe (wins over the manifest; the
disagreement is a warning). Pure and deterministic: no clock, basenames only, sha256 of the inputs
— two runs are byte-identical.

| Field | Content |
| --- | --- |
| `clusters[]` | `{id, start, last, kinds: [click\|focus\|typing], events: [i], bbox (fractions), fit_scale, closed_by: seed\|idle\|scroll\|navigation\|end, closed_at}` — a seed is a click, a focus on `input\|textarea\|select`, or the first key of ≥ 3 keys in 1.5 s whose target fits the dead zone (50 % × 70 % of the zoomed viewport) at 1.5×; the cluster grows while the union of target rects still fits; `scroll` / `navigation` close it (never zoomed); a click on a target too big to zoom (`body`, a full-width row) never seeds |
| `segments[]` | one per **zoom**: `t_in_start` (pre-aim: the camera arrives on the first event), `poses[]` (`zoom-in` then `reaim` moves — 0.7 s each, a pose holds ≥ 1 s after arrival and 1.2 s after its cluster's last event, `hold_until`), `t_out_start` / `t_out_end` (0.8 s), `ends_zoomed` when the footage ends first; `scale` and `focus` per format. A new zoom needs room for hold + out + in **and** ≥ 3 s since the previous zoom-in start (cadence), otherwise the camera re-aims inside the segment; a scroll / navigation ends the segment at the break |
| `skipped_clusters[]` | `{cluster, reason: camera-lag \| cadence \| cadence-after-break \| footage-ends}` — a cluster the camera could reach only after the hold ceiling (2 s past its last event), or that would break the cadence, is skipped instead of chased |
| `tracks['16:9'\|'9:16']` | `canvas`, `wrapper` (`width/height/left/top` px for that canvas + `visible` fractions at scale 1 — 16:9: the canvas; 9:16: a height-fit 3413×1920 wrapper), `zoom_factor` (16:9 1.5–2, `--max-scale 3` only with a ≥ 2160 px source; 9:16 1.3–1.5 — research, the crop already zooms), `peak_scale`, `poses[]`, `keyframes[]` — the ladder for the inner wrapper: `{t: 0, set: true, …}` then `{t, duration, role, ease, scale, xPercent, yPercent, focus}` (`xPercent = -(fx - 0.5)·S·100`, focus clamped and edge-snapped so the window stays inside the source; percents truncated toward zero; both properties in one tween so in-betweens stay inside too). 9:16: pre-aimed at the first focus at scale 1, holds the last centre through a zoom-out |
| `keyframes` | alias of `tracks[format].keyframes` (`--format`) |
| `cursor` | `null` without pointer events; else `{spring: 470/3.0/70 + ω0, ζ, overshoot, fps, start, waypoints[] (click / text-field focus / key on a new target), clicks[] (ripples), path: [[t, x, y], …]}` in fractions of the source frame — the closed-form damped spring departs 0.5 s before each event and rests 0.15 s after it; starts at the frame centre (or on the first target when it comes sooner). Place the cursor element **inside** the zoom wrapper |
| `clip` | `{start, duration}` — keyframes and cursor are clip-local; `clusters` / `segments` stay in footage time |
| `checks` | `video_without_events`, `no_pointer_events`, `capture_size_below_output[format]` (`ok`, `ratio`, source px in the base crop vs output px — the roadmap's GS-01 lint; exit 3 for the requested format), `zoom_peak_upscale[format]` (how far the peak zoom upscales; 3× only with 4K) |
| `warnings[]`, `stats`, `inputs`, `params` | human-readable notes; counts; basenames + sha256 + origin + viewport + source facts; the defaults, research knobs and eases used |

`--emit-html` writes a standalone composition next to the footage (root-relative `src`, HyperFrames
rejects `../`): untimed `.autozoom-stage` → `#autozoom` wrapper (`data-layout-allow-overflow`,
`transform-origin 50% 50%`) → the timed `<video data-start data-duration data-media-start>` plus the
cursor SVG and ripple; a paused GSAP timeline registered under the composition id with
`gsapSnippet()`'s calls. Measured 2026-09-20 (hyperframes 0.8.46, cached): `check` ok (lint, runtime,
layout, 0 warnings, 9 samples), `keyframes` reports `#autozoom` `scale 1..2, xPercent -50..50,
yPercent -50..50` with the cursor composed inside; snapshots at 0.2 / 1.3 / 3.5 / 13.8 / 15.5 s show
the full frame, the 2× punch on the top-right button with the cursor on it, the 1.85× form, the 2×
bottom-left link and the mid zoom-out; the 9:16 sheet shows the window flush right before the
first zoom, centred on the form, flush left on the link and holding left through the zoom-out.
Exit codes: 0, 1 runtime (unreadable input, ffprobe failure), 2 usage / no capture facts, 3
`capture_size_below_output` for the requested format.

## `toolchain.mjs` outputs

`status --json` (schema `power-presentation/toolchain-status@0.1`):

```json
{
  "state": "ready | installing | partial | outdated | failed | missing",
  "ready": true, "needs_install": false, "installing": null,
  "data_dir": "…/plugins/data/power-presentation-inline", "toolchain_dir": "…/toolchain",
  "pins": { "hyperframes": "0.8.47", "playwright": "1.63.0", "chrome_headless_shell": "152.0.7977.30" },
  "components": {
    "node": { "ok": true, "version": "v22.22.1" },
    "hyperframes": { "ok": true, "version": "0.8.47", "path": "…/node_modules/.bin/hyperframes", "source": "toolchain", "in_range": true },
    "chrome": { "ok": true, "path": "…/chrome-headless-shell", "build": "152.0.7977.30", "source": "toolchain | hyperframes-cache | env", "required": true },
    "playwright": { "ok": true, "version": "1.63.0", "browsers_path": "…/ms-playwright", "chromium": true, "headless_shell": true, "required": true },
    "ffmpeg": { "ok": true, "path": "/usr/bin/ffmpeg", "source": "system | toolchain | env" }, "ffprobe": { … },
    "fonts": { "ok": true, "missing": [], "pins": { "@fontsource/inter": "5.3.0", … }, "required": false }
  },
  "doctor": { "ok": true, "checked_at": "…", "hyperframes": "0.8.47", "failed": [], "optional_missing": ["whisper-cpp", "TTS (Kokoro)", "BGM (MusicGen)"], "file": "…/doctor.json" },
  "last_install": { "state": "ready", "finished_at": "…", "error": null, "plugin_version": "0.1.0" },
  "skills": { "dir": "~/.claude/skills", "core_missing": [], "workflow": { "name": "product-launch-video", "installed": true, "vendored": true, "matches_vendored": true } },
  "summary": "toolchain ready at …: hyperframes 0.8.47, chrome-headless-shell 152.0.7977.30 (toolchain), playwright 1.63.0, ffmpeg system; doctor gate ok (optional missing: …)"
}
```

`doctor.json` (schema `power-presentation/doctor@0.1`) — `hyperframes` (CLI version the report
came from), `cli` `{path, source}`, `gate` `{ok, required[], failed[{name, detail, hint}],
optional_missing[], unknown[], raw_ok, version_notice, update_available}`, `raw` (the CLI's
report verbatim). **The gate is `gate.ok`, not `raw.ok`:** the CLI's own `ok` is
`every(check.ok)`, which is false whenever npm has a newer CLI (always, for a pinned install)
or an optional engine (whisper-cpp, Kokoro, MusicGen, Docker) is absent. `gate.ok`
requires Node.js, Memory, Disk, Frames cache, Archive extractor, `/dev/shm` (Linux), FFmpeg,
FFprobe and Chrome; the rest is reported.

`toolchain.json` (schema `power-presentation/toolchain@0.1`) — `state`, `plugin_version`,
`started_at` / `finished_at` / `duration_s`, `pins` (incl. `kokoro` pip pins and `whisper_model`),
`requested` `{chrome, playwright, static_ffmpeg, tts, whisper}`, `engines` `{kokoro: {python, pins,
smoke}, whisper: {model, transcript}}`, `privacy`, `platform`, `node`, `steps[{name, ok, seconds,
detail | error, optional?}]` (`preflight`, `package`, `npm-install`, `verify-cli`, `chrome`,
`playwright`, `tts`, `whisper`, `doctor` — `tts` and `whisper` are optional: their failure is
recorded and never fails the install), `error`, `log`. `status` adds `components.tts`
(`findKokoro`: the venv interpreter, `modules_ok`) and `components.whisper` (`findWhisper`: env →
PATH → the CLI's cache build, `model`); `env` exports `HYPERFRAMES_PYTHON` to the venv.

## `vendor-workflow.mjs` outputs

`vendor/product-launch-video.vendored.json` (schema `power-presentation/vendored-skill@0.1`)
— `skill`, `vendored_at`, `plugin_version`, `hyperframes_pin`, `upstream` `{repo, tag, commit,
committed_at, subject, path}`, `bundle` `{hash, files, algorithm}`, `manifest_entry` (upstream's
`skills-manifest.json` entry at that commit), `license`, `upstream_notice`, `rules[]`.
`check --json` → `{ok, exit, name, dir, provenance, bundle, problems[]}`; `seed --json` →
`{ok, seeded, reason, dest, files, hash, backup, installed_matches_vendored}`; `drift --json` →
`{state: same | drift | not-installed, vendored_hash, installed_hash, diff: {only_a, only_b,
changed}, hint}`.

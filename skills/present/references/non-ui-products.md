# Products without UI — classes, detection, scene strategies

Phase: detector and the scenes terminal / code / api-card / data-chart / comparison = MVP;
design-frames and file/doc = MVP minimal; animated diagrams, logs and latency counters = v1.
A product without UI is a **standard case**: it takes the same pipeline, needs no URL, and reaches
render without a single screen. Chrome is needed only at render.
Detector: `scripts/inspect-project.mjs` (implemented 2026-09-19) — its `SIGNALS` export is the
table below plus the extras and labelled heuristics; `--list-signals` prints it, § 1.1 shows what
it writes.

## 1. Nine classes and detection signals

| `surface` | Signals from / (weight 4 unless noted) | Labelled heuristics the detector adds (weight ≤ 3) | MVP scene(s) from § 2 |
| --- | --- | --- | --- |
| `web-ui` | frontend framework present (npm frameworks; Python UI frameworks streamlit / gradio / dash …); a declared `--url` (Inspect) | frontend build config / UI libraries; `index.html` entry (a static site); server-rendered templates next to any server framework; Jekyll / Hugo / Eleventy site; a docs/marketing site under `website/`, `docs/`, `site/` counts 1 only | product-ui |
| `mobile` | lists no mobile-specific signal | react-native / expo / capacitor / ionic; Flutter with `ios/`/`android/`; Xcode iOS project, `android/app/build.gradle` | product-ui via `--recording` (v1) |
| `desktop` | lists no desktop-specific signal (Electron is handled by the Playwright backend) | electron / tauri / neutralino / wails; `wails.json`, `src-tauri/`, macOS Xcode target, WPF/WinForms | product-ui via `--recording` (v1) |
| `cli` | `bin` in `package.json`; `pyproject` entry points; VHS `*.tape` ("VHS tape for CLI first"); `bin/` (weight 2) | CLI libraries (commander, ink, click, clap, cobra, picocli…); `src/main.rs`, `main.go`/`cmd/`, JVM `application { mainClass }`, Dart `executables` — never next to a server framework unless a separate `cmd/<tool>` exists; gem `executables` / `exe/`; `man/`, `completions/` | terminal / code |
| `api/backend` | `openapi.*` / `swagger.*`; `Dockerfile` (weight 2); no frontend framework (absence, weight 1 — fires only next to a server framework or Dockerfile) | server frameworks (express, fastapi, django, gin, axum, spring-boot…); `*.proto`, GraphQL schema, prisma, docker-compose, serverless | api-card, diagram (v1) |
| `library/sdk` | lists no dedicated signal; says "no frontend framework" + package without `bin` is the working assumption; `examples/` + README quickstart (weight 1) | `package.json` exports/types (or main + files) without `bin`, not private, no server runtime — root or any workspace member; a framework in peerDependencies (plugin / component library); Python package without console scripts or runtime entry; Cargo `[lib]`, Go module without `main`, `Package.swift`, `*.podspec`, Maven/Gradle jar without Spring, composer `type: library`, `*.gemspec`, Dart package; publishConfig / `index.d.ts` | terminal / code, comparison |
| `data/ml` | `*.ipynb`; `notebooks/` (2); `data/` (2); datasets next to code (2) | dvc / MLproject / conda env / `models/`; torch, tensorflow, scikit-learn, pandas… | metrics / chart, diagram (v1) |
| `mocks/design` | links to Figma; `mocks/` (3) | `*.fig`, `*.sketch`, `*.xd`, `*.pen`, `*.excalidraw`, `*.drawio`; `design/`, `mockups/`, `wireframes/` | design-frames |
| `files/docs` | only `.md` files; datasets without code (both absence signals: fire only when nothing runnable matched); `docs/` (2); pdf/docx/pptx/xlsx files (2) | — | file / doc |

Ranking: four tiers. A UI class backed by a real UI signal (framework, Python UI framework or
static-site generator, server-rendered templates next to any server framework, HTML entry, declared
URL, mobile/desktop host) outranks the other runnable classes — defines `api/backend` by the
*absence* of a frontend, so a repo with both shows its UI and keeps the backend as a `secondary`
class with its own scenes. The runnable classes (`cli`, `api/backend`, `library/sdk`, `data/ml`)
outrank a `declared` tier (a web-ui candidate whose only UI evidence is `--url` next to a documented
signal for cli / api / notebook — the URL becomes a secondary web surface and the question is
asked, never a silent flip), which outranks the concept classes (`mocks/design`, `files/docs`): a
design export or a document is never the tier-A "product does the work" scene (§ 4). Inside a
tier the score decides, then the number of distinct *product-evidence* signals (tooling never breaks
a tie), then order (`cli` before `api/backend` — "VHS tape for CLI first").
Dependencies are read per package.json: a private app counts `dependencies` and `devDependencies`
(SvelteKit, Electron, Expo CLIs live there), a publishable package counts `devDependencies` as
tooling and `peerDependencies` as a plugin; Electron / React Native / Expo / Tauri / Ink hosts own
the frontend evidence of their own package only (a web app in another workspace package still
wins); package.json files under `docs/`, `website/`, `examples/`, `playground/` … and an
`index.html` under `site/`, `www/` next to a CLI / API describe a companion site or sample app;
Dockerfiles under `.devcontainer/`, `.github/`, `ci/` … are a developer environment; a Go/Rust
server's `main` or `--port` parser is not a CLI unless a separate `cmd/<tool>` entry exists.
Confidence: `high` = winner ≥ 4 points and ≥ 2 ahead of the runner-up of its tier; `medium` =
winner ≥ 3; else `low` — and always `low` when a concept class wins over code the signal table did
not recognise (never a concept video). Anything not `high` is `ambiguous` and carries the
question. `secondary` = every other candidate with ≥ 2 points **and** product evidence (a
Dockerfile, a vitest config, a docs site or a `docs/` folder next to a UI product never adds a
scene); each adds its § 2 scenes. `mode` follows the facts: `product` when the tree holds UI, code,
HTML or a runnable artefact (tape, spec, notebook), `concept` when only design/docs, `unknown`
when nothing matched.

### 1.1 `product-profile.json` (what `/present` and `story-director` read)

`surface`, `confidence`, `ambiguous`, `mode` (`product` | `concept` — neither UI nor runnable code,
the case the skill must announce | `unknown`), `candidates` (class, score, tier,
signal ids), `secondary`, `signals` (id, class, kind, weight, source, evidence), `scenes` (the
plan: type, class, role, phase; `logo-outro` last), `optional_scenes` (metrics / chart,
comparison — any class), `deferred_scenes` (v1: diagram), `capture` (backend per § 4 of
capture-chain.md, `needs_url` — true only for `web-ui`, `chrome_needed_for` — `"render only"` for the seven non-browser backends, capture + render for `web-ui` / `desktop` whose backend is a Playwright screencast),
`question` (null when `high`), `story_sources` (order), `read_policy` (rules,
count of denied files seen, every file whose content was opened), `scan` (files, dirs, truncation,
ignored dirs), `notes`. Full example: `scripts/README.md`.

When the signals conflict or nothing matches, the class becomes an interview question
("detection by openapi / Dockerfile / `bin/` + 1 question"): the profile always carries
`question` when `ambiguous`. caps the interview at three named questions (prod
URL, audience, pitch) and adds one more — owner to decide; until then ask about the class only
when one of the three slots is free (a non-UI product frees the prod-URL slot), else take
`question.default` (`--yes` prints the decision). The result goes to `product-profile.json.surface`
and to `intake.json.surface`. Open question: does the detector reach ≥ 90 % on the golden-set
repositories — measured 2026-09-19 on GS-01…GS-03: 3/3 by the detector's tests. The per-fixture
expectations stay in the development repository; a run takes its class from its own profile.

## 2. Scene table (Composition) — every class has ≥ 1 MVP scene

| Scene type | Classes | Source | Phase |
| --- | --- | --- | --- |
| product-ui | web-ui; mobile and desktop via `--recording` (v1) | `<video class="clip">` from footage with punch-in | MVP |
| terminal / code | cli, library/sdk | VHS frames, code/terminal block, diff | MVP |
| api-card | api/backend | request, response, status, latency | MVP |
| metrics / chart | data/ml, any | `data-chart` from `metrics.json` with a source | MVP |
| comparison | library/sdk, any | before/after wipe | MVP |
| diagram | api/backend, data/ml | animated architecture from registry blocks | v1 |
| design-frames | mocks/design | static Figma/PNG export inside `browser-device-stage`, disclaimer "Design preview" | MVP |
| file / doc | files/docs | document scroll plus a typed excerpt | MVP |
| logo-outro | all | end card per QA-13: brand, promise, CTA | MVP |

## 3. Strategy per class

| Product | What plays the role of "the real product" | "Camera through the UI" equivalent |
| --- | --- | --- |
| CLI | terminal recording as a VHS tape (`Hide`/`Show`, `Wait /regex/`, fake `Env`); deterministic PNG frames — the tape is the event log | scroll through the log, zoom on one output line |
| Library / SDK | code-editor scene: typed code, diff; "before/after" integration snippet as a comparison wipe | zoom on the changed lines |
| API / backend | HTTP request/response card: from the repo's API description (OpenAPI examples, README request/response blocks) = tier B "from the spec", no latency; a live call against the product's own server started from the repo = tier A with status and measured latency — never a mock the run wrote; architecture/flow diagram from registry blocks (v1); logs and latency counters (v1) | highlight of one response field |
| Data / ML | benchmark chart via `data-chart` from `metrics.json`; `dataviz-countup`, `mk-progress-stat` blocks; `--metrics <csv\|xlsx>` input (delta 5) | count-up on one number, 1.2–2.5 s |
| Mocks / design | Figma/PNG frames as product visuals inside a device stage with the "Design preview" label | pan across the frame |
| Files / docs | document scroll with a highlighted excerpt; typed excerpt | scroll + highlight |

Principles do not change for non-UI products, only the carrier: the hook ≤ 3 s (QA-03), one
idea per scene (C3), every beat a visible state change, every number sourced (QA-12).
Motion values are the same; auto-zoom applies to terminal and code frames as it
does to UI footage.

## 4. Evidence and gates for non-UI scenes

- A recorded terminal session, or a live API call against the product's own server (started from the repo, or the
  declared prod/staging URL), is **tier A**, equal to a UI recording. An api-card built from the repo's
  API description is tier B "from the spec" (SKILL § 5); a server the run writes itself is not the product and never
  yields tier-A evidence. names no tier or on-screen label for a spec-derived api-card.
- For gates and the scorecard a product frame is any role `terminal|code|api|diagram|design|file`;
QA-04/QA-05 and the product-share metric count them.
- A design-frames scene is not evidence of a working product: it always carries "Design preview"
  (table). Under `sales`/`investors` a mock used in place of a product scene follows the tier-C
  rules.
- Rendering needs Chrome; capture of these scenes does not.

## 5. Golden set

GS-03 is the MVP check for a product without UI, including the minimal design-frames and file/doc
scenes; a product made only of mocks is GS-04 (v1). Exit criterion: `gates_failed: 0` with the same
QA-01…QA-14. The fixtures and their expected answers live in the development repository only and
do not ship with the plugin: a run plans its scenes from its own Inspect and Capture artefacts,
never from a fixture's storyboard or scorecard.

## 6. Risk

A wrong `surface` produces mockups instead of terminal and diagram scenes. Mitigation is this
table plus the one-question rule; the owner's regression test on GS-03 keeps the risk closed.

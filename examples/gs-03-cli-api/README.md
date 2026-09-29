# GS-03 — CLI/API product without UI, marketing, not a single screen

**Phase: MVP.** Golden-set fixture GS-03. CLI pin `hyperframes@0.8.47`, range `0.8.x`.

The product is a fictional job-queue service, "Acme Jobs": a CLI (`acmejobs`), an HTTP API (`openapi.yaml`), a docs
folder and a design hand-off link. There is no web UI and no URL to record — that is the point: products without UI are
a standard case, not an extension, and the non-UI fixture is in MVP. Every name and number here is a
synthetic placeholder.

| Field | Value |
|---|---|
| Classes | `cli` + `api/backend` (+ `mocks/design`, `files/docs` for the minimal scenes) |
| Detection signals expected | `demo.tape` → cli ("VHS tape for CLI first"; the detector's `vhs-tape` signal — the fixture ships no package.json, so `bin` cannot fire); `openapi.*` → api/backend; Figma link in `design/README.md` → mocks/design; `docs/` → files/docs. Measured 2026-09-20 (with the mock CLI in `bin/` — the `bin/` signal): `surface: cli` (high), `secondary: api/backend, mocks/design, files/docs`, scene roles `terminal, api, design, file, outro`, `needs_url: false` (`scripts/inspect-project.test.mjs`); before `bin/` existed the cli/api tie was broken by the order at medium confidence |
| Mode | `--for marketing`, no `--url` (the capture chain asks one question and proceeds) |
| Length | no fixed duration; picked from the QA-01 bands at run time (45 s in the skeleton) |
| Scenes | `terminal / code` (VHS frames, code/terminal block, diff), `api-card` (request, response, status, latency), `design-frames` ("Design preview" disclaimer), `file / doc` (document scroll + typed excerpt), `logo-outro` |
| Frame roles | `terminal`, `code`, `api`, `design`, `file` — these count as product frames for QA-04/QA-05 and the scorecard |
| Evidence | VHS terminal session and a live API call are tier **A** |
| Capture backend | VHS tape for the CLI (`Hide/Show`, `Wait /regex/`, fictitious `Env`) |
| Voice / captions | marketing defaults: voice off, captions off on 16:9 without VO, SRT always |
| `diagram` scene | animated architecture from registry blocks — **v1**, not exercised in MVP |

## Files

- `demo.tape` — VHS tape for the `terminal / code` scene: `Output`, `Set`, a fictitious `Env`, `Hide`/`Show`
  around setup, `Wait+Screen /regex/` on the CLI's output. `bin/acmejobs` is the mock CLI the tape records (every
  output is fixture fiction; the job id is `openapi.yaml`'s example). `node scripts/golden-set.mjs build --only gs-03`
  substitutes the `__ACMEJOBS_BIN__` placeholder and renders `demo.mp4` + `frames/` into `evals/fixtures/gs-03/`;
  by hand: put `bin/` on `PATH` and run `vhs demo.tape`. VHS and ttyd are system dependencies the
  toolchain does not install: on 2026-09-20 `vhs v0.11.0` + `ttyd 1.7.7` (GitHub release binaries dropped into
  `${CLAUDE_PLUGIN_DATA}/toolchain/bin`, where `golden-set.mjs` also looks) rendered the tape; **`vhs v0.12.0` does
  not** — it cancels its context before rendering, so ffmpeg is never run and no mp4 appears (`evaluator.go`
  `teardown()` → `Render(ctx)`). VHS's `Output frames/` rename fails silently across filesystems; the builder derives
  the frames from `demo.mp4` at 10 fps in that case.
- `openapi.yaml` — minimal valid OpenAPI 3.1 document; source of the `api-card` scene (request, response, status,
  latency) and a detection signal.
- `docs/README.md` — source of the `file / doc` scene (document scroll plus a typed excerpt).
- `design/README.md` — placeholder for the Figma link that feeds the `design-frames` scene (static Figma/PNG export in
  `browser-device-stage`, "Design preview" disclaimer).

Not in the repo (heavy fixture set): the rendered VHS frames, the storyboard skeleton and baseline renders.

## Invocation

```bash
/present --for marketing                  # no source flag (needs no URL); run from the repo root — non-UI strategy from skills/present/references/non-ui-products.md
```

## Expected checks

- Nightly eval (v1) renders GS-01 and GS-03; no GS-03 eval case exists yet —
  `evals/render-cli-api/` is added when the nightly tier is enabled.
- MVP exit criterion: `gates_failed: 0`, scorecard and vision critic above the thresholds, like GS-01 / GS-02;
  the non-UI scenes (terminal, code, api, file) carry it — a `design` frame waits for a source (none is named yet).
- Roadmap open question: does the detector classify non-UI repos correctly on ≥ 90 % of golden-set repos?

## Status

`scripts/inspect-project.mjs` classifies this fixture (see the table above). `storyboard-skeleton.md` passes the
storyboard gates with `claims.json` (`node scripts/golden-set.mjs verify --only gs-03`); the VHS session (15.3 s,
1920×1080, 154 frames) is built by `golden-set.mjs build` — measured 2026-09-20. The `api-card` live call against a
local mock of `openapi.yaml` and the design export PNGs are not built yet (`TODO`: no mock server in the fixture).

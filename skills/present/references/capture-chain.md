# Capture chain — prod-first, evidence tiers, `record-flow` artifacts

Phase: MVP (web via Playwright screencast, CLI via VHS, stills via `hyperframes capture` and
`claude-in-chrome`); auth/mobile/desktop v1; Cap/rrweb v2. `record-flow.mjs`
(web/Electron) and `autozoom.mjs` are implemented (2026-09-20); the VHS backend for
`cli` is `record-terminal.mjs` (2026-09-27): the repo's `*.tape` → `footage.mp4` + `capture-manifest.json` (backend
`vhs`, tier A) with the same Layer-2 gate, run from the repo root (`__REPO__` in the tape = that path).

## 1. The chain and the one-question rule

Priority, never reordered: **deployed prod → staging → local run → user recording → HTML
reconstruction**. Without a prod URL the plugin asks exactly one question
(counts toward the limit of 3). The prod URL is never auto-detected: the plugin only uses
`--url|--staging-url|--local|--recording`.
`--local` starts the dev server from `package.json scripts`; a `--repo` holding `index.html` and no `package.json` (a static site) is served from `127.0.0.1` by `scripts/lib/static-server.mjs`. The chosen step is written to
`intake.json.evidence_plan`, `capture-manifest.json` and `run-report.json.capture.chain_step`.

**The chain is walked for the product, not for the page the user typed** — the working product first, then the
repository, the landing last (source precedence, `planning-rubric.md`; owner decision 2026-09-28). When the declared URL is a landing
(`source-plan.json` `url_role.role: landing`, or `story-extraction.yaml` `product.app_url.differs_from_page: true` —
the app lives at its own address, often behind sign-in), recording it is the *message* capture: hook, promise, CTA,
brand. It is tier A evidence of the landing, not of the product, and it does not end the chain for product scenes.
Those continue: the running product — the app online (prod — with a demo account the user provides,
`<P>/.demo-account.json`; auth via storageState is v1), or the app raised from the repository (`combined` /
`local-*`, tier A) — → a user recording (`--recording`, tier B) → the repository's own product screenshots (tier B)
→ the product's screenshots the landing publishes (tier B stills, `capture/assets/`) → a reconstruction (tier C, § 6). `intake.json.evidence_plan`
records both: `message` (the landing, tier A) and `demo` (the step the product scenes stand on). Under `--yes` in
`marketing` a landing-only run takes the reconstruction from the published screenshots for its product beats
(marketing needs no confirmation, only the label); `sales` / `investors` take the stills and ask. Message and demo
are split so that a landing recording never stands in for the product.

## 2. Evidence tiers (single definition; everything else references it)

| Tier | Material | Allowed where |
| --- | --- | --- |
| A | recording of prod/staging/local run; VHS terminal session; live API call against the product's own server (started from the repo, or the declared prod/staging URL — never a mock the run wrote) | everywhere; the only tier for the investors "product does the work" scene |
| B | user-supplied recording (`--recording`); an api-card built from the repo's API description, labelled "from the spec" (names no tier for it) | everywhere |
| C | HTML reconstruction | last resort; `sales`/`investors` only with explicit confirmation and the `reconstructed` label; marketing carries "Screen images simulated" |

A recorded terminal session, or an API session against the product's own server, is tier A, equal to a UI recording (non-ui-products.md).
The tier is recorded per scene in `STORYBOARD.md` (`evidence_tier`) and in `run-report.json.scenes[]`. A
frame that shows no product screen (a type-only hook, metric or CTA card) omits `evidence_tier`; the labels
("reconstructed", "Screen images simulated") apply to product-screen frames — role
`ui|demo|recording|terminal|code|api|design|file` — at tier C, or to a frame that declares `reconstructed: true`.

## 3. `record-flow` artifacts

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/record-flow.mjs --url <url> --flow .media/flow.json --out .media/capture/   # implemented 2026-09-20 (web/Electron)
```

`.media/flow.json` is written by the orchestrator (SKILL § 5): from `story-extraction.yaml` `user_flow`, else from
the hero page's own links, tabs and primary CTA (only selectors present in that HTML).

| File | Content |
| --- | --- |
| `footage.mp4` | CDP `Page.startScreencast` JPEG frames stamped with the frame's own capture time → ffmpeg concat (exact per-frame durations, last frame until the stop) → **libx264 CRF 18** yuv420p; viewport **1920×1080 at DPR 2**, Chromium launched with `--force-device-scale-factor=2` (the headless screencast ignores the context DPR) so the footage is **3840×2160** and the 9:16 crop never upscales |
| `events.jsonl` | input events with the target `rect`: click, key, focus, scroll, navigation; `t` in epoch-ms **from Node** (the page clock is frozen by `--fixed-time`); `capture-manifest.json.timeline.footage_start_ms` is the origin for |
| `capture-manifest.json` | tier, environment (prod/staging/local), chain step, capture spec, `timeline`, redaction summary (`layer1_dom_masking`, `layer2_ocr_gate`), `blocked`; `flow` (`steps_total`, `steps_done`, `failed_step`) — a step that fails its ~8 s timeout stops the flow and the capture so far is kept; only the states before `failed_step` are tier A |
| `screens.jsonl` | what the running product says on each flow step (source precedence: the working product first): `step`, `action`, `url` (origin + path, no query), `title`, `description`, visible `headings`, `nav`, `buttons` and body `text` (≤ 4000 chars), `footage_t_sec` — read after the Layer-1 masking, input values never read, every string re-scanned with the secret grammar; an unchanged step is skipped. Owner decision 2026-09-28; lists no such artifact |
| `redactions.json` / `redaction-findings.json` | Layer-1 log (sha256 + length per replacement) / Layer-2 hits (rule id + offset) — never the secret itself |

The pointer is never recorded (`cursor: "none"`); the cursor is synthesised in the composition from
`events.jsonl` with the spring. Requires Playwright ≥ 1.59, or CDP
`Page.startScreenRecording` on Chrome 153+ (dependencies).

**`recordVideo` is banned:** VP8 at 1 Mbit/s, 25 fps, viewport scaled to 800×800 — text is
unreadable. Lint `capture_size_below_output` must be 0 on GS-01 (exit criteria).

## 4. Backends per product class

| Class | Backend | Phase |
| --- | --- | --- |
| web-ui, desktop (Electron) | Playwright screencast (section 3) | MVP |
| cli, library/sdk | VHS tape: `Hide`/`Show`, `Wait /regex/`, fake `Env`; deterministic PNG frames — the tape is the event log (`scripts/record-terminal.mjs`) | MVP |
| api/backend | api-card from the repo's API description (OpenAPI examples, README request/response blocks; tier B "from the spec", no latency); a live call against the product's own server started from the repo = tier A | MVP |
| any web | `hyperframes capture <url> -o capture --skip-vision` (the pinned toolchain CLI; a static `--local` site as `file://<abs>/index.html`) — stills, tokens, assets and `capture/extracted/page.html` (the `--hero` page for extract-story) only; no auth/cookie flag | MVP |
| any web | `claude-in-chrome` stills of the production pages (delta 3, scope table) | MVP |
| mobile | `xcrun simctl io recordVideo`, `adb shell screenrecord` (adb limit 180 s), Maestro `--local` | v1 |
| desktop (native) | user's OS recorder via `--recording` (tier B) | v1 |
| desktop native / DOM replay | Cap CLI (ffmpeg `draw_mouse 0`), rrweb | v2 |

Auth: headed-browser hand-off + `storageState` (mode 600) — v1. Until then an
unavailable panel gets a shimmer-div placeholder, never a fake screen.

## 5. Redaction — three layers

1. **Before capture**: seeded demo data — `record-flow --seed <plan.json>` answers the product's API calls from
   local fixture files (`{"routes": [{"url": "**/api/transactions*", "file": "fixtures/transactions.json"}], "init":
   "seed-init.js"}`; Playwright `page.route`, an optional init script before any page script; the manifest's
   `seed` block records each fixture's sha256), so a capture shows demo records, never a customer's; `page.clock.setFixedTime` (`--fixed-time`, default
   2026-01-01); DOM placeholders; repository read allowlist (no `.env*`, `*.pem`, fixtures with
   real data — `inspect-project` / `extract-story`, not `record-flow`).
2. **During**: shape-preserving DOM masking — always-mask selectors (password / `cc-*` /
   one-time-code fields, Sentry / PostHog / rrweb classes) plus the secret grammar (AWS / `sk-` /
   GitHub / Slack tokens, JWT, PEM, Postgres URIs, e-mails, E.164 phones, IPv4, Luhn card
   numbers) over text nodes and input values, same-length `•` placeholders written before the
   next paint (observer from the first byte, `characterData`, shadow roots); logged as sha256 only.
3. **After**: sampled frames (2 fps + one per click) → tesseract → the same grammar in
   OCR-tolerant form + gitleaks; a user recording (tier B) is sampled with ffmpeg the same way.
   Presidio NER (match threshold 0.6) — v1. A match **blocks with exit 3** (`blocked: true` in the
   manifest) until the user reads `redaction-findings.json` and the command is re-run with
   `--confirm-findings`; `hooks/guard-render.sh` (`capture-clean` gate) refuses `hyperframes
   render` while any `capture-manifest.json` is blocked or unscanned, which is what keeps `render`
   and `publish` closed. A missing
   tesseract / gitleaks is stamped in the manifest (`ran: false` / `gitleaks: "unavailable"`), never
   silently treated as clean.

Under `--privacy local` `capture` must run with `--skip-vision`: without it screenshots go to
Gemini/OpenRouter when a key is present.

## 6. Reconstruction rules

- Tier C is the last step of the chain, never a shortcut past a failed capture.
- `sales`/`investors`: explicit confirmation in the pre-render question (protocol) and the
  `reconstructed` label in `STORYBOARD.md` and `run-report.json`.
- `investors`: reconstruction only for non-product scenes; the "product does the work" scene is tier A.
- `marketing`: tier C frames carry the on-screen line "Screen images simulated".
- **Exact, not invented**. A reconstructed product screen is rebuilt
  from the product's own material, by source precedence: the repository's own screen (its component, route and
  strings — what the product really renders) first, then the product's screenshots (the repository's, then the ones
  the landing publishes, with their `alt` and captions), then the landing's copy about that screen; the brand tokens
  for the look. Every word, number, label, name and row on it is one the
  material shows; the layout keeps the screenshot's structure and proportions; its settled state is the screenshot's
  state. The motion is the product doing its job toward that state — the user's input arriving (a field filled, a
  query or a command typed, a file dropped, an option chosen), the product's response landing, rows, bars or a chart
  filling to the published values. A state the material does not show (a different score, an extra row, a screen nobody published)
  is a gap, never drawn. The storyboard names the source of each reconstructed frame in `asset_candidates`.
- With neither a repository screen nor a published screenshot there is nothing to rebuild: the product scenes are a gap the user closes
  with the app URL and a demo account or `--recording`; under `--yes` the run goes on with what the page shows and
  the reply and run report say the product itself was not shown. Never draw a screen from the copy alone.
- A product film the page itself publishes (`story-extraction.yaml` `product.videos`) is the owner's explanation,
  not this run's evidence: one input to the story next to the steps and features, never a structure to copy; its
  footage is never cut into the video.
- Generative B-roll (Higgsfield, v1) is non-UI B-roll only, never evidence.

## 7. Auto-zoom and reframing

`scripts/autozoom.mjs` clusters `events.jsonl` into zoom keyframes on the inner wrapper of the
product clip with the values — in 0.7 s, hold 1–2 s, out 0.8 s, ease-out (`power3.out` in,
`power2.out` out, `power2.inOut` for a re-aim), ≤ 1 zoom per 3 s, factor 1.5–2× (3× only
with a 4K source and `--max-scale 3`), dead-zone 50 % × 70 %, cursor spring 470 / 3.0 / 70 in
closed form; scroll and video are never zoomed — a scroll or navigation ends the open zoom at the
break. The 9:16 window follows the same focus: the 9:16 track is a second ladder on a
height-fit 3413×1920 wrapper (factor 1.3–1.5× because the crop already zooms — research),
pre-aimed at the first focus and holding the last centre through each zoom-out. Output
`autozoom.json` (`segments`, `tracks`, `cursor`, `checks`, `warnings`); `--emit-html` writes a
standalone composition that passes `hyperframes check` (lint, runtime, layout). Deterministic.
Full shape in `scripts/README.md`. A capture with no `events.jsonl` (VHS terminal, tier A; a tier-B
recording) gets no auto-zoom: its frames move the camera with a storyboard `capture_drift`, and the frame worker
still writes the scene-local sidecar with `--events /dev/null --manifest <capture>/capture-manifest.json` — the
home-pose track `render-path assemble` stamps the drift on (without it assemble warns and drops the drift).

## 8. Time limits

| Limit | Value | ID |
| --- | --- | --- |
| Site capture (service target) | ≤ 180 s (measured 75 s on linear.app) | |
| Bash timeout for `capture` | 300 s | |
| `adb shell screenrecord` hard limit | 180 s | (v1) |

## 9. Outputs consumed downstream

`capture-manifest.json.tier` → storyboard per-frame `tier` → QA-04/QA-05 role checks and critic C2
(product credibility). `events.jsonl` → auto-zoom + cursor → 9:16 crop.
`capture.backend` and `chain_step` → `run-report.json`.

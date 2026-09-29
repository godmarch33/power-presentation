# Privacy profile `--privacy local` and PII gates

Phase: MVP (Presidio NER gate: v1).

## How it is switched on

- Flag `--privacy local` on `/present` (opt-in), or plugin `userConfig.privacy = local` (reaches hooks as `CLAUDE_PLUGIN_OPTION_PRIVACY=local`); the flag overrides the config per run. Scripts the skill runs get the per-run flag explicitly (`scripts/extract-story.mjs --privacy local`) or, when the skill exports it, `POWER_PRESENTATION_PRIVACY=local` — both are honoured next to `CLAUDE_PLUGIN_OPTION_PRIVACY`.
- `BRIEF.md` / `intake.json` record `privacy: local` as a declared flag.
- The plugin prints the **network manifest** (list of hosts it may contact) **before the first external call** and asks for confirmation: `node ${CLAUDE_PLUGIN_ROOT}/scripts/render-path.mjs manifest --project .` right after `intake.json` is written and before Inspect (SKILL § 3) — it reads `intake.json` and the flags and needs no HyperFrames scaffold.

## What the profile sets

| Area | Setting |
|---|---|
| Environment | `HYPERFRAMES_NO_TELEMETRY=1`, `DO_NOT_TRACK=1`, `HYPERFRAMES_SKIP_SKILLS=1` (vendored workflow from `vendor/`, seeded into `~/.claude/skills` by the SessionStart hook), plus `HYPERFRAMES_NO_UPDATE_CHECK=1` (the CLI's npm version poll is an egress too) and `POWER_PRESENTATION_PRIVACY=local` so scripts see the per-run profile |
| CLI flags | `--skip-vision` on `hyperframes capture`; `--local-only` |
| Render | local only |
| VO | Kokoro (en) — see [language.md](language.md) |
| Captions | whisper.cpp |
| Refused | `hyperframes cloud render`, `hyperframes publish`, HeyGen paths (voice, BGM, SFX, logos, render), cloud TTS (ElevenLabs, OpenAI, Gemini) |
| Logging | every external call appended to `.media/egress.jsonl` |
| CI | the profile runs in a no-network sandbox; the manifest **must be empty** (MVP exit criterion) |

No-network sandbox without root (Linux): `bwrap --unshare-net --dev-bind / / -- node ${CLAUDE_PLUGIN_ROOT}/scripts/render-path.mjs render --project <dir>` — a fresh network namespace with loopback only (the render's own Chrome ↔ producer traffic stays on `lo`; no DNS, no route out). Ubuntu's `apparmor_restrict_unprivileged_userns` blocks a plain `unshare -rn`, while `bwrap` is allowed by the stock `bwrap-userns-restrict` profile. Measured 2026-09-27 on a privacy-local copy of GS-02 v2: `manifest` empty, render ok (16:9, 59.6 s master, 111 s wall), `.media/egress.jsonl` empty, the strace audit saw no external connect — the criterion holds.

The SessionStart hook writes the privacy exports to `$CLAUDE_ENV_FILE` only when `CLAUDE_PLUGIN_OPTION_PRIVACY=local`; `HYPERFRAMES_SKIP_SKILLS=1` is exported in every profile (`hyperframes init` must not refresh the pinned workflow silently). Under the profile the async toolchain installer does **not** run: the hook names `node ${CLAUDE_PLUGIN_ROOT}/scripts/toolchain.mjs manifest` (the hosts an install would contact — registry.npmjs.org, storage.googleapis.com for chrome-headless-shell, cdn.playwright.dev, github.com only for a static ffmpeg) and, once the user confirmed, `… toolchain.mjs install --confirm-network`. The core HyperFrames skills the workflow imports are not vendored (size) — install them before going offline (`vendor/README.md`). See `hooks/README.md`.

## What leaks by default without the profile (measured 2026-09-18, hyperframes 0.8.46)

| Default behaviour | Where it goes | Profile switch |
|---|---|---|
| PostHog telemetry in HyperFrames and media-use, per-machine id (tied to the account after HeyGen login) | PostHog | `HYPERFRAMES_NO_TELEMETRY=1`, `DO_NOT_TRACK=1` |
| `hyperframes capture` screenshots for captions when a key is present | Gemini / OpenRouter | `--skip-vision` |
| Voice, music, SFX, logos via media-use | HeyGen cloud (may train on inputs unless opted out) | local packs, Kokoro |
| `hyperframes cloud render` | zip of the whole project → HeyGen S3 | refused |
| `hyperframes init` | GitHub request | `--local-only` / vendored |
| `hyperframes feedback --file-issue` | public publication of the project | refused |

The plugin adds **no telemetry of its own**. Every row is switched off by the profile.

## Network manifest and egress log

- Manifest = the hosts the run may contact for the chosen flags (e.g. the product URL, the toolchain install and media-pack fetch on first run, the CLI telemetry host; fonts are staged from local files, never fetched from Google Fonts). Printed once before the first external call; the user confirms.
- Under `local`, the expected manifest after first-run setup is empty; a non-empty manifest in the no-network CI test fails the build.
- `.media/egress.jsonl`: one line per external call (`host`, `purpose`, `at`, plus `by` = the stage and `url`) — the same list lands in `run-report.json` as `egress hosts`. Written today by `render-path verify` / `render` (`scripts/lib/egress.mjs`): every external URL the composition loads (the producer downloads it, chrome loads it — GS-02: GSAP from `cdn.jsdelivr.net`) and the HyperFrames telemetry host `us.i.posthog.com` when neither `HYPERFRAMES_NO_TELEMETRY` nor `DO_NOT_TRACK` is set. Under the profile an external composition reference refuses `verify` / `render` (the manifest must be empty): vendor the file into `assets/` — `assemble` already does it for GSAP (`gsap@3.14.2` from the toolchain → `assets/vendor/`). Observed egress (`--audit-network`, on by default under the profile when `strace` exists): every child process runs under `strace -f -yy -e trace=connect,sendto,sendmsg,sendmmsg`; a TCP connect to a non-loopback address, or a UDP send that names an external peer, is egress (logged with `observed: true` and, under the profile, fails the stage). A UDP `connect()` alone sends no packet — Chromium connects one to `2001:4860:4860::8888:443` to learn its outgoing address — and is reported as a route probe, not egress (GS-02 render, 2026-09-27). Not logged yet: the vendor audio engine (`audio.mjs`, `fetch-sfx`) and media-use resolves.

## PII gates

Three redaction layers:

| When | Layer | Phase |
|---|---|---|
| Before capture | read allowlist for the repo (no `.env*`, `*.pem`, fixtures with real data); seeded demo data; `page.clock.setFixedTime`; DOM placeholders | MVP |
| During capture | DOM masking that preserves layout shape; MaskSegment redaction overlays | MVP |
| After capture | OCR gate by regex (emails, keys, card numbers) with gitleaks on captured frames — a match **blocks `render` / `publish` until confirmed** | MVP |
| After capture | Presidio NER gate (match threshold 0.6) | v1 |

## Sales-mode data — applies regardless of profile

Prospect record = name, company, role, public site; no LinkedIn scraping; Art. 14 notice + Art. 21(2) opt-out in the letter; purge after 30 days. Details in [audiences/sales.md](audiences/sales.md).

## Synthetic media disclosure — applies regardless of profile

Synthetic voice or avatar ⇒ disclosure line in description and credits (EU AI Act Art. 50, in force 2026-08-02) and `synthetic {voice, presenter, broll}` in `run-report.json`. Voice clone or avatar = deepfake: "AI" label ≥ 28 px from frame 0 for ≥ 3 s plus a consent file.

## Interaction with other flags

- `--privacy local` + ElevenLabs/HeyGen keys in `userConfig` ⇒ keys are ignored, the paths are refused (plugin.json descriptions).
- `--privacy local` + `--recording` (user footage) ⇒ still runs the OCR gate.
- `hyperframes capture` under the profile: stills + tokens + assets only, `--skip-vision`; no auth/cookie flag exists.
- Higgsfield B-roll (v1) is a cloud generation and is refused under the profile.

## Status

Enforced today: the env exports (`hooks/session-start.sh`, every session), the no-download rule of the toolchain installer (`scripts/toolchain.mjs install` refuses under the profile until `--confirm-network`; `manifest` prints the hosts), `extract-story.mjs --fetch` refusal. Not yet: `hooks/guard-render.sh` is dry-run unless `POWER_PRESENTATION_HOOKS_ENFORCE=1`, the run-wide manifest (`render-path manifest`) is computed from `intake.json`, the toolchain doctor and the composition's references rather than traced, and `.media/egress.jsonl` covers only the stages that start the HyperFrames CLI (`verify`, `render`) — `/present` prints the manifest with `render-path manifest` (SKILL § 3) and refuses cloud paths in its prompt logic until that tooling lands.

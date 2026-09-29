# vendor/ — vendored `product-launch-video` workflow

**Status: done (2026-09-20).** `product-launch-video/` is a byte-identical copy of
`skills/product-launch-video/` from [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes)
at the release tag of the pinned CLI (`v0.8.47`, commit `415967bef…` — the exact provenance
is in `product-launch-video.vendored.json`).

## Layout

| Path | What | Notes |
|---|---|---|
| `product-launch-video/` | the pristine upstream skill (`SKILL.md`, `references/`, `scripts/`, `sub-agents/`, 30 files) | never edited — its bundle hash (`d87f7ae140e88403`) equals the entry HyperFrames publishes in `skills-manifest.json`, so `hyperframes skills check` treats a seeded copy as *current* for that manifest |
| `product-launch-video.vendored.json` | provenance: plugin version, `hyperframes_pin`, upstream repo / tag / commit / date, bundle hash + file count, the manifest entry it was verified against | schema `power-presentation/vendored-skill@0.1`; lives **next to** the copy so the copy's hash stays upstream's |
| `LICENSE-hyperframes` | Apache-2.0 text from the same commit | kept with the copy (Apache-2.0) |
| `NOTICE` | attribution the plugin owes for the copy (upstream ships no NOTICE at that commit) | `THIRD_PARTY_NOTICES.md` points here |

## What the copy is for — and what it is not

- **Determinism.** Plugin templates and the golden set are checked against the
  workflow that shipped with `hyperframes@0.8.47`, not against whatever is on GitHub `main`
  (HyperFrames' skills float on `main`; `hyperframes skills update` and `hyperframes init` refresh
  them from there).
- **Entry without network (CI, privacy profile).** With `HYPERFRAMES_SKIP_SKILLS=1`
  nothing refreshes skills, so on a fresh machine the workflow must come from the package. The
  SessionStart hook runs `node scripts/vendor-workflow.mjs seed`, which copies this directory
  into `~/.claude/skills/product-launch-video` **only when that skill is absent**, then asks
  Claude Code to re-scan skills (`reloadSkills`). An installed copy is never overwritten; drift
  between the two is reported in the session context line instead.
- **Not a routing bypass.** The plugin enters the workflow only through `BRIEF.md`.
  Nothing in `skills/`, `agents/`, `scripts/` or `hooks/` imports from `vendor/`; the seeded
  copy is found by `/hyperframes` routing exactly like an upstream install. The workflow's
  scripts import sibling core skills (`../../hyperframes/scripts/lib/frame-packets-core.mjs`,
  `../../media-use/audio/scripts/lib/bgm.mjs`), so the copy is only functional once the core
  set is installed next to it — which is why only the seeded location works and `vendor/` is
  never executed in place.

The core skills themselves (`hyperframes`, `hyperframes-core`, …, `media-use`, ≈ 6 MB) are
**not** vendored: they would exceed the 5 MB package ceiling. They are installed by
`npx hyperframes@0.8.47 skills update` (network, git) — under the default profile the workflow's
own Step 0 does this on first use; under `--privacy local` they must be present before going
offline. `node scripts/toolchain.mjs status` lists which core skills are missing.

## Commands (`scripts/vendor-workflow.mjs`)

```bash
node scripts/vendor-workflow.mjs fetch        # re-vendor at v<HYPERFRAMES_PIN> (git + network; sparse, blobless, depth 1)
node scripts/vendor-workflow.mjs check        # offline: tree hash == provenance, pin matches versions.mjs, no media, licence + NOTICE present (CI)
node scripts/vendor-workflow.mjs seed         # copy into ~/.claude/skills/<name> when absent (--force to replace, with a backup)
node scripts/vendor-workflow.mjs drift        # installed copy vs vendored copy (exit 3 + file lists when they differ)
```

`fetch` refuses a tree that carries media binaries and a checkout whose hash differs
from upstream's manifest entry for that commit.

## Rules

- Do not edit `product-launch-video/` in place — `check` fails on any change. Plugin deltas
  (audience modes, capture chain, QA gates, scene cache) ride in `BRIEF.md` `## Customizations`
  / `## Notes` and in the plugin's own `skills/`, `agents/`, `scripts/`.
- On every HyperFrames bump: change `HYPERFRAMES_PIN` in `scripts/lib/versions.mjs`, run
  `fetch`, re-run the golden set through `lint` / `check` / `render`, re-check the
  plugin's templates with `hyperframes check`, and re-seed with
  `seed --force` where an older copy is installed.
- CI sets `HYPERFRAMES_SKIP_SKILLS=1` (`.github/workflows/ci.yml`) and runs `check`; the
  SessionStart hook exports the same variable in every session so `hyperframes init` never
  refreshes the pinned workflow silently (an explicit `hyperframes skills update` still works).
- Size: 416 KB, counted in the ≤ 5 MB package. No media may land here.
- Keep `LICENSE-hyperframes` and `NOTICE` with the copy.

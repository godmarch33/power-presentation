# Brief schema — `intake.json` and what `/present` puts into `BRIEF.md`

Phase: MVP. The `BRIEF.md` shape itself belongs to HyperFrames
(`~/.claude/skills/hyperframes/references/brief-format.md`, `brief-contract.md`); this file only
says which values the plugin supplies and where.

## 1. `intake.json` (written by `/present` before any question)

A flag is recorded as **declared** (typed by the user), separately from anything
**derived**, and every derived value carries its source. `intake.json` is project-local and is
later mirrored into `BRIEF.md` `## Notes` (section 3).

```jsonc
{
  "schema": "power-presentation/intake@0.1",
  "plugin_version": "0.3.0",
  "arguments_raw": "<the $ARGUMENTS string verbatim>",
  "declared": {                      // only flags present in $ARGUMENTS
    "for": "sales", "duration": 60, "format": ["16:9", "9:16"], "reveal": "early",
    "voice": true, "source": { "kind": "url", "value": "https://…", "plan": "source-plan.json" },   // or { "kind": "repo", "value": "<abs repo>", "plan": "source-plan.json" } (--repo); the plan runs in every run with a repository (SKILL § 4a)
    "brand": "brand/", "preset": "blue-professional", "style": null, "privacy": "local",
    "budget": 25, "yes": false, "verbose": false,   // --verbose: narration allowed (/present § 0b; not a flag)
    "model_mix": "economy", "critic": false,        // --model-mix / --critic|--no-critic (owner 2026-09-28)
    "prospect": "prospect.json", "pain": "manual month-end reconciliation",
    "metrics": null, "deck": null, "recipe": null
  },
  "derived": {                       // every field NOT declared, with its source
    "voice":    { "value": true,  "source": "default:(on for sales/investors)" },
    "format":   { "value": ["16:9"], "source": "destination→aspect (brief-contract § 2)" },
    "duration": { "value": null,  "source": "length-bands.md band for the mode (QA-01)" },
    "budget":   { "value": 25,    "source": "userConfig:budget_usd" },
    "brand":    { "value": null,  "source": "userConfig:brand_kit_dir" },
    "privacy":  { "value": "default", "source": "userConfig:privacy" },
    "lang":     { "value": "en",  "source": "(English only; no --lang flag)" }
  },
  "questions": [                     // ≤ 3, one per message; empty under --yes
    { "n": 1, "field": "source.url", "answer": "…" },
    { "n": 2, "field": "for", "answer": "…" },
    { "n": 3, "field": "pitch", "answer": "concept-3" }
  ],
  "yes_decisions": [],               // decisions printed instead of asked when --yes
  "conflicts": [],                   // e.g. --metrics with --for sales
  "phase_blocked": [],               // v1/v2 flags seen in MVP: [{"flag":"--deck","phase":"v1"}]
  "model_mix": "opus-orchestrator",  // resolved: flag → userConfig model_mix → default (scripts/lib/run-profile.mjs)
  "critic": "on",                    // resolved: --critic / --no-critic → userConfig critic (auto: off in economy) → on
  "privacy_profile": "default",      // "local" enables
  "network_manifest": [],            // hosts printed before the first external call
  "surface": null,                   // filled from product-profile.json after Inspect
  "evidence_plan": null              // chain step chosen: prod|staging|local|recording|reconstruction, or the routes of source-plan.json (`combined`: landing = message, app = demo)
}
```

Source vocabulary for `derived.*.source`: `default:<FR-ID>`, `userConfig:<key>`, `interview:q<n>`,
`repo:<file>`, `prefs:<tier>` (HyperFrames remembered defaults), `brief-contract § 2`.

## 2. `BRIEF.md` frontmatter the plugin supplies

`BRIEF.md` is created by the workflow's Setup (Step 0) right after `hyperframes init` — never
before (brief-format.md lifecycle). `/present` hands Setup the confirmed values below. "Memory"
= the preference-backed subset that `media-use scripts/prefs.mjs record` accepts (brief-format.md);
the store rejects every other key, so plugin keys are never recorded.

| Key | Owner | Memory | Value the plugin supplies |
| --- | --- | --- | --- |
| `workflow` | vendor | no | `product-launch-video` — always; entry via this file only |
| `flow` | vendor | yes | `automation` (the plugin runs the vendor pipeline) |
| `storyboard` | vendor | yes | `yes` by default (the review protocol needs the board); `--yes` → `no`, i.e. autonomous mode (brief-contract § 1) |
| `message` | vendor | no | the promise chosen in the pitch round: ≤ 60 chars, concrete noun + number/deadline/named alternative, 0 stop-list words |
| `audience` | vendor | no | the `--for` value plus one persona line |
| `destination` | vendor | yes | derived from mode + band (`length-bands.md`), stated |
| `aspect` | vendor | yes | `1920x1080` (master is always 16:9); other `--format` entries go to `## Customizations` as `render --batch` cuts |
| `language` | vendor | yes | always `en` — derived; there is no `--lang` flag |
| `length` | vendor | no | `--duration` + `s`; the ±3 % rule and the band are checked by QA-01 |
| `angle` | vendor | no | the story archetype for mode × length (sales inverted pyramid; investors 7 beats; marketing PAS/BAB/Sparkline…) |
| `reveal` | **plugin** | no | `early\|story-first`; `story-first` moves the product reveal within the QA-04 ceiling |
| `register` | **plugin** | no | `high` (marketing), `medium` (sales), `premium` (investors); `playful` only when the user asks — it is the only register allowing `back.out` (QA-11) |
| `voice` | vendor | yes | `on\|off`: on for sales/investors, off for marketing unless `--voice` |
| `style_preset` | vendor | yes (per workflow) | `--preset` value; recorded with `--workflow product-launch-video` only when the user confirmed it |
| `privacy` | **plugin**, optional | no | `local` when the profile is on, so resume keeps refusing cloud paths |

`register` is not a flag; it is derived from the mode.

## 3. Body sections and what the plugin writes into each

- `## Intent` — one paragraph: the product in the user's words, who watches, why now, the chosen
  concept from the pitch round and its promise. Copy is authored natively in
  English.
- `## Assets` — one line per file, `path — what it is, where it belongs`, each with its evidence
  tier: `.media/capture/footage.mp4`, `events.jsonl`, `capture-manifest.json`;
  VHS tape + PNG frames for CLI products; `--recording` file (tier B); `--prospect` file;
`--metrics` file; brand kit `brand/brand.tokens.json` + `brand.md`.
- `## Customizations` — the plugin deltas the workflow must honour: the mode block copied from
  `audiences/<mode>.md`; auto-zoom by; extra formats via `render --batch`;
  captions default; VO Kokoro EN; claims index and `unverified` rule;
non-UI scene plan by `surface`; `reconstructed` confirmations; the
  QA gate set QA-01…QA-14 as ship criteria; sales letter lines; investors ask card.
- `## Notes` — the declared-vs-derived table from `intake.json`; evidence tier decisions
  and the chain step used; stop-list reminder; privacy profile and printed
  network manifest; the cost estimate printed before dispatch; v1 flags that were
  ignored (`phase_blocked`).

## 4. Rules

- One source of truth: a mid-run change to a frontmatter field rewrites `BRIEF.md` and, for memory
  keys, re-records the preference (brief-format.md lifecycle). `STORYBOARD.md` keeps copies of
  `message`/`audience`; when they disagree `BRIEF.md` wins.
- Per-frame plugin data (`role`, `evidence_tier`, `reconstructed`, `speed`) lives in `STORYBOARD.md`
  frame entries — the storyboard parser keeps unknown keys under `extra` (storyboard-format.md).
- Never write `BRIEF.md` for a project that already has one: read it, hand over to the workflow it
  names (brief-format.md "no-repeat token").

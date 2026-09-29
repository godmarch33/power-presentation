# Expected `BRIEF.md` for GS-01 (skeleton)

This is the intent document the `present` skill writes as the first action after `hyperframes init`, in the shape of
HyperFrames `references/brief-format.md`, before it enters the `product-launch-video` workflow. Field vocabulary
and the declared-vs-derived record follow `skills/present/references/brief-schema.md`. Values in `<angle brackets>` are
decided at run time.

```markdown
---
workflow: product-launch-video        # the plugin never bypasses /hyperframes routing
flow: automation
storyboard: yes                       # human review protocol, storyboard -> snapshot -> one-scene look -> "render?"
message: "<promise: <=60 chars, concrete noun + number/term; best of 5 candidates>"
audience: marketing                   # --for marketing, declared
aspect: 1920x1080                     # --format 16:9 master; 9:16 added via `render --batch`; canonical value per brief-schema.md
language: en                          # always en, derived — there is no --lang flag
length: 45s                           # --duration 45, declared; QA-01 band "Hero launch 45-90 s", +/-3 % hard
reveal: early                         # default; `story-first` would move the product within the QA-04 limit
register: high                        # marketing register (audience table): kinetic text, `expo`, 0.15-0.3 s
voice: off                            # marketing default: voice off unless --voice
style_preset: "no default --preset; the presets are blue-professional, code-editorial, cartesian, editorial-forest"
---

## Intent

A 45-second product-led marketing video for Plausible (web analytics) built from the real production dashboard at
https://plausible.io. Second person, kinetic typography, the real product as the hero; hook element visible by 3 s
(QA-03), real product by 5 s (QA-04), first result by 12 s (QA-05). Golden-set fixture GS-01.

## Assets

- footage.mp4 — record-flow screencast of the production dashboard, 1920x1080 @ DPR 2, libx264 CRF 18; evidence tier A.
- events.jsonl — input events in epoch ms with target rects; drives auto-zoom clusters.
- capture-manifest.json — tier, environment, redactions.

## Customizations

- Auto-zoom on click clusters with the auto-zoom defaults; cursor synthesised from events.jsonl; scroll and video are never zoomed.
- 9:16 companion cut via `render --batch`; the 9:16 window follows the auto-zoom focus.
- Captions: off on 16:9 (no VO) with kicker cards carrying the copy; on for 9:16; SRT always.
- 5-7 product beats, each >= 3 s; one STAR moment planned first.
- Exactly one CTA, first person, on screen for the QA-13 end-card window and spoken only if VO is on.
- Loudness target −18…−20 LUFS, the QA-08 "music only" row (no VO on the 16:9 master = music-only mix; QA-08 words it "music only, cinematic hero", which does not say whether it covers a hero *launch*); ±1 LU, TP ≤ −1 dBTP; the run-report records the choice.

## Notes

- Every visible number must exist in claims-index.json with a `file:line` or URL source, else `unverified` and dropped (QA-12).
- A stop-list word fails the linter; the promise is <= 60 chars with a concrete noun + number/term.
- Evidence tier A only; no reconstruction needed for a web-ui product with a public prod URL.
- Scorecard target: product-frame share >= 35 % for marketing.
- Declared vs derived: `audience`, `length`, `aspect` are declared by flags; `language` (always `en`), `reveal`, `register`, `voice`, `style_preset` are derived and recorded with their source, separately from the declared ones.
```

# Language: English only

Phase: MVP.

## The rule

The video is in **English end to end**: script, VO, captions, on-screen text, `share-copy.txt` and the Art. 50 disclosure line. There is **no `--lang` flag**; `BRIEF.md` `language` is always `en`, written as a derived value (brief-schema.md). Other languages are out of scope — not v1, not v2. A request for another language is answered with that fact, never with a silent English fallback or an improvised translation.

## What it means per stage

| Stage | Rule | ID |
|---|---|---|
| Intake | no language question in the interview; `language: en` derived | |
| Story / script | copy authored in English; limits in characters, not words (≤ 42 chars/line, ≤ 2 lines); stop-list is the English list |, QA-10 |
| Audio | VO = Kokoro-82M offline, EN voices; TTS cache per script (`render-path audio` reuses the synthesis while line texts, voice and speed are unchanged — per-line reuse is open, the engine is external); cloud TTS v2 | |
| Captions | whisper.cpp with an explicit `--language en`; SRT always | |
| Fonts | only faces declared in `frame.md` with a real `@font-face` — the `## Staged fonts` rules `render-path packets` writes from `assets/fonts/`, no Google Fonts fetch; `document.fonts.check` must pass (QA-14). No script-coverage lint, no Latin-only substitution, no glyph probe | QA-14 (withdrawn) |
| Reading floor | `hold ≥ max(1.2 s, chars / 20)` | QA-10, |
| Deliver | `share-copy.txt`, SRT (`en`) and the Art. 50 line in English | |

## Consequences

- Piper (GPL-3.0, RU/UK voices) is **not part of the toolchain**; nothing spawns it. Kokoro is the only VO engine in MVP and v1.
- whisper `.en` models are no longer a lint target: with English VO the silent translation of `small.en` is harmless (closed 2026-09-19). The rule that remains is the explicit `--language en`.
- Golden set: there is no RU run; GS-02's exit criteria are the sales personalisation and the investors variant.
- Brand kits may still declare `locales` and font licences; the plugin reads the licence class, not the locale list. Fonts scraped from the site with a `restricted|unknown` licence are never used — substitute an OFL analogue; `--fonts-licensed` only for the owner (table, v1).

## Skeleton status

Kokoro VO and whisper words run in `render-path audio` through the vendored workflow's `audio.mjs`. The retired `--lang` flag, the RU/UK routing and the Cyrillic font rules were removed from the skill, README, agents and examples on 2026-09-20.

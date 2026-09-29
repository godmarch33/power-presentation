# Captions, kicker cards, reading floor and keep-out zone

Phase: MVP (1:1 format rules: v1).

## Defaults

| Format / mode | Burned-in captions | Other text carrier | SRT |
|---|---|---|---|
| 9:16 (and 1:1 from v1), any mode | **ON**, word-timed | — | always |
| sales, any format | **ON**, word-timed | — | always |
| 16:9 marketing without VO | **OFF** | kicker cards (P3) | always |
| 16:9 investors with VO | OFF unless flagged | **kicker cards ≤ 7 words per beat** | always |

- Burned-in captions are word-timed.
- SRT (`en`) is emitted always.
- "≤ 7 words" is the investor kicker limit; the operative limit is still the QA-10 character limit — copy is sized in characters, not words.
- Captions are one of the caption-zone lint targets: `hyperframes check --caption-zone` (QA-14).

## Keep-out zone (QA-14)

Subtitles live in the bottom band **y ≥ 0.82** (18 % of frame height); nothing else may be placed there and captions may not sit over key UI (QA-14). Frame workers enforce this per frame (`frame-worker` agent); `check --caption-zone` verifies it.

Positions inside the zone: 16:9 — 80–120 px from the bottom; 9:16 — 600–700 px from the bottom (values @1080p reference frame).

## Groups and size

- Word groups: 2–3 words (hype) / 3–5 / 4–6 (calm).
- Size ≥ **42 px @1080p**.
- Break on a pause ≥ 150 ms.
- Count-up numbers animate 1.2–2.5 s (P9).

## The active-word highlight (C5 brand)

The vendor preset skins mark the spoken word with a solid accent chip. Give that chip a full pill radius and a
minimum width (≈ 1.9 em, same padding on every word so nothing shifts): a two-letter word in a rounded square reads as
a logo mark — the GS-02 critic saw "in" on the accent square as the LinkedIn logo (C5, 2026-09-26). The skin is the
project's `.hyperframes/caption-skin.html` (copied from the preset by the vendor's `build-frame.mjs`); fix it there,
never in the vendored preset.

## Reading floor (QA-10 — hard)

Every on-screen text (captions, cards, callouts) is held for at least

```
hold ≥ max(1.2 s, chars / 20)
```

- **20 cps** (characters per second) — the English value; the video is English only, so there is one cps.
- ≤ **42 characters per line**, ≤ **2 lines** (QA-10 — Netflix timed-text guideline).
- Label of 1–3 words ≥ 0.8 s; the hook is the longest hold, ≥ 1.5 s.
- Do not speed text up — split the scene (creative checklist).
- Measured on the `STORYBOARD.md` timeline (QA-10): every on-screen text is one `- text: "…" @ start-end`
  bullet in its frame (` / ` = line break), the end card's CTA a `- cta:` bullet; `scripts/wowprobe.py`
  reads only those bullets. Word-timed caption groups are checked from the SRT (`--srt`): cps
  and line limits, with the 0.8 s label floor — QA-10 does not say whether its 1.2 s floor
  applies to word-timed groups. Scorecard "reading comfort" weight 10: 100 − 10 × violations.
- The rule is brag's reading-time floor ("fast-in, then hold — never fast-in, then gone"; a 4 s scene
  lands 2–3 short reads, not 6 — split it) with the plugin's numbers (brag v0.2.2, MIT, `THIRD_PARTY_NOTICES.md`).

## Transcription rule

whisper.cpp runs with an explicit language, always:

```
--model large-v3|turbo --language en
```

The engine is whisper.cpp in every profile. The former `.en`-model lint was withdrawn with the one-language decision: with English VO a `.en` model translates nothing.

## Contrast and fonts (QA-14)

- Contrast is a `check` **error**, not a warning: WCAG AA 4.5:1 (3:1 for large text) (QA-14). ≥ 7:1 for display text is a recommendation, not the gate.
- Display text ≥ 6 % of frame height (≈ 64 px @1080p), weight 600–900, letter-spacing −0.02em, line-height 1.05 — unless `frame.md`'s type ramp fixes the display weight (`frame.md` and the brand tokens fix the typography; critic C5: the font exactly per the preset): then `frame.md`'s weight wins, and never a weight the preset's `@font-face` does not ship. 600–900 conflicts with presets that set serif display at 400 (EB Garamond in `code-editorial`).
- Fonts: every visible face is a shipped file declared in `frame.md`; `document.fonts.check` must pass (QA-14). The script-coverage lint, Latin-only substitution and glyph probe of were withdrawn on 2026-09-19 — see [language.md](language.md).

## Copy rules that apply to captions and cards

- One idea per screen, one claim (C3); authored in English, sized in characters.
- Stop-list fails lint; promise ≤ 60 characters.
- Every number on screen has a `claims-index.json` source (QA-12).
- Captions/cards are declared as `data-var-text` where they are personalisable so a text change is a `--variables` edit.

## Skeleton status

Caption generation rides on the vendor `product-launch-video` `captions` script (entered via BRIEF.md); the plugin adds the defaults above in `BRIEF.md` `## Customizations`. The keep-out check is `hyperframes check --caption-zone` run by `present-qa` (QA-14), real today.

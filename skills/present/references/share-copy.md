# Share copy — `share-copy.txt`

Phase: MVP. Mechanism ported from
brag v0.2.2 `references/step-4-deliver.md` (MIT — `THIRD_PARTY_NOTICES.md`): one canonical caption,
1–3 sentences, postable as-is, specific to the product, no "excited to share"; brag's per-tone templates
become per-mode templates here, and the variants brag kept in a separate file live in the same
`share-copy.txt` because asks for platform variants in that file.

Producer: the `present-render` skill (Deliver step) writes the file from the storyboard, the intake and the
run facts; `scripts/share-copy.mjs init` writes the skeleton with the mandatory lines already in place,
`scripts/share-copy.mjs lint` fails the delivery when a rule below is broken.

## File format (`power-presentation/share-copy@0.1`)

Plain UTF-8 text. A header comment, then `[section]` blocks. Lines starting with `#` are comments.

```
# share-copy.txt — power-presentation/share-copy@0.1
# product: Ledgerly · mode: sales · video: renders/final/ledgerly_16x9.mp4 · generated: 2026-09-20

[caption]
Dana, Northbridge closes the books in 12 days. Ledgerly customers average 3.1.
One 60-second look at how — reply "yes" for Tuesday or Thursday.

[x]
…

[linkedin]
…

[email]
Subject: …
…
This message uses publicly available business contact data (GDPR Art. 14) …
You can object to this processing at any time (GDPR Art. 21(2)) …

[credits]
Music: "Happy Beats / Business Moves Vol. 9" by Sascha Ende / ende.app (CC BY 4.0)
Voice: synthetic (Kokoro). This video contains AI-generated narration (EU AI Act Art. 50).
```

| Section | Required for | Content |
|---|---|---|
| `[caption]` | every mode | the canonical single caption (brag rule): 1–3 sentences, ≤ 280 chars, postable anywhere; the promise is its first sentence |
| `[x]` | every mode | ≤ 280 chars, the CTA URL last |
| `[linkedin]` | every mode | up to ~1,300 chars before the fold; first line = the promise; one CTA |
| `[product-hunt]` | marketing | tagline ≤ 60 chars (Product Hunt limit, creative checklist) + a 2–3 sentence maker comment |
| `[email]` | sales | subject + body (≤ 120 words) + the lines: a GDPR Art. 14 information notice (source of the contact data, purpose, retention 30 days) and the Art. 21(2) right to object with a one-step opt-out |
| `[investor-note]` | investors | the note that accompanies the video in the data room / email: one-liner, the ask (amount · milestone · deadline), contact |
| `[credits]` | when applicable | music credit line for CC BY tracks (`assets/ATTRIBUTION.md`); the disclosure line when `run-report.synthetic.voice` or `.presenter` is true; `Screen images simulated` when a marketing cut used tier-C material |

## Rules the linter enforces (`scripts/share-copy.mjs lint`)

1. **Stop-list** — none of: seamless, all-in-one, supercharge, unlock, empower, game-changing,
   cutting-edge, innovative, revolutionary, effortless, powerful, streamline, "AI-powered" as the whole
   thesis, "10x" without a base, "we're excited to announce" / "excited to share". Replacement recipe:
   `[verb] + [object] + [number or deadline] + [named alternative]`.
2. **Numbers (QA-12)** — every number in the file exists in `claims-index.json` with a source
   (`--claims`); the same regex and exemptions as the storyboard gate (versions, times, bare years, IDs).
3. **Lengths** — `[caption]` and `[x]` ≤ 280 characters; `[product-hunt]` first line ≤ 60 characters.
4. **Mode sections** — the sections marked required for the mode exist and are non-empty.
5. **Mandatory lines** — `--synthetic-voice` (or `--run-report` with `synthetic.voice: true`) requires the
   line in `[credits]` (`AI-generated` + `Art. 50`); `--music-credit "<line>"` requires that exact
   line; `--mode sales` requires `Art. 14` and `Art. 21` in `[email]`; `--tier-c` (marketing) requires
   `Screen images simulated`.
6. **Promise** — the first sentence of `[caption]` ≤ 60 characters; reported as a warning,
   not a failure, because the promise itself is linted upstream by the story director.

Exit codes: 0 clean · 3 violations (listed as JSON with `--json`) · 2 usage · 1 unreadable input.

## Per-mode templates (rewritten from brag's `polished` / `app-store` shapes; the comedic tones are out)

**marketing**
```
[caption]
<Promise ≤ 60 chars: noun + number/deadline/alternative>. <One concrete outcome from the product, with its sourced number>. <CTA in first person: "Start my free trial" → URL>
```

**sales** (name + company in the first line; one step with a choice as CTA)
```
[caption]
<Name>, <Company> <pain in their words>. <Product> customers <sourced outcome>. <CTA: Reply "yes" — Tuesday or Thursday?>
[email]
Subject: <Company> — <outcome> in <number>
<Name>, … (≤ 120 words, the video link, the same one-step CTA)
<GDPR Art. 14 notice: where the contact data comes from, why, kept 30 days>
<GDPR Art. 21(2): reply "stop" to object; no further messages>
```

**investors** (numbers verbatim with date; the ask card)
```
[caption]
<One-liner>. <Traction: number · rate · window, as of <date>>. <Ask: amount · milestone · deadline>.
[investor-note]
<One-liner> — <why now in one sentence>. Traction as of <date>: <n1>, <n2>. Raising <amount> to <milestone> by <deadline>. <contact>
```

## What is not here

Publishing (Drive / Notion / Gmail delivery) is v1. Platform thumbnails come from `poster-bake.sh`
(`<stem>.poster.jpg`) — the caption never carries an image path.

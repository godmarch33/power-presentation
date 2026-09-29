# Audience mode: `--for investors`

Phase: MVP (default restrained demo). `--style cinematic` teaser register: **v1** (scope table).

## Goal

Investors default = **restrained demo**: real data, founder VO preferred, minimal transitions, quiet music bed under speech — a track of the restrained `music-ende-calm` pack (`media-packs.mjs list`) — no heavy branding. Staging kills trust — Google admitted the Gemini demo was staged (Engadget 2023-12-08) — so the "product does the work" scene is tier A only. `--style cinematic` (v1) switches the register to a teaser, not the preset.

## Length band and destination

- Investor demo: **60–120 s**; data-room cut **≤ 180 s** (QA-01 band). A cold deck is read in ≈ 2:30 (DocSend 2024, vendor data).
- Plugin range 10–180 s; sweet spot 45–90 s (QA-01). Delivered duration = brief ±3 % (QA-01 hard). See [../length-bands.md](../length-bands.md).

## Hook and reveal

- Hard: hook element visible by 3.0 s, no black open (QA-03).
- Hook content: "what we do" in one phrase **≤ 14 words** in the first 5 s (Paul Graham 2010; first phrase ≤ 14 words with an object).
- Default: first product frame **≤ 10 s** (QA-04 — source research G6, vendor-derived, not a16z/DocSend; retuned on GS-06); first outcome ≤ 20 s (QA-05).
- `--reveal story-first`: product may be delayed up to **25 s** (QA-04); this is the only mode where the Raskin narrative is allowed.
- Scorecard scale, not lint: 100 points at product ≤ 10 s, linear to 0 at 25 s; product-frame share ≥ 40 %. See [../hook-timing.md](../hook-timing.md).

## Story archetype

Default 7 beats (canonical): **one-liner → problem → product (real data) → traction → why now → team → ask**.
Raskin variant (Change, Promised land, Magic gifts, Evidence, Team, Ask) only under `reveal: story-first` — it reorders beats, it does not change their set.

Archetype by length (story table):

| Length | investors |
|---|---|
| 15 s | teaser: promise + 1 number |
| 30 s | promise + shift + 1 traction number |
| 60 s | 7 beats, demo-day cut |
| 90–120 s | 7 beats; Raskin variant under `reveal: story-first` |

Beat roles. Investors follow the 7-beat structure with a single product beat (audience table: product = real data); the "5–7 product beats" count is the sales/marketing rule (table) and does not apply here — only "each beat ≥ 3 s" does. Traction and ask beats are card beats, not product beats.

## Voice, captions, loudness

- Voice: **ON** by default, founder voice preferred; a TTS narrator is allowed but flagged `tts_placeholder` in `run-report.json`. Pace: investor 130–145 wpm; word budget.
- Synthetic voice ⇒ EU AI Act Art. 50 disclosure line in description/credits and `synthetic.voice` in run-report.
- Captions: 16:9 with VO → **kicker cards ≤ 7 words per beat + SRT**; burned-in captions only by flag; 9:16 → captions ON. See [../captions.md](../captions.md). Note the operative card limit is in characters (≤ 42 chars/line, QA-10), not words.
- Loudness (QA-08): **−16…−18 LUFS** (VO-led premium / investor); |I − target| ≤ 1 LU; TP ≤ −1 dBTP; quiet bed under speech  (bed −28…−32 LUFS-S under VO). See [../loudness.md](../loudness.md).

## Tone, register, transitions

- Tone: numbers without adjectives.
- Register `premium`: spring ζ 1.0, transitions 0.5–0.8 s, **≤ 1 transition per beat**.
- Rhythm: state change every 2–4 s; ASL **4–8 s** (QA-09); Cursor 3 / Linear Agent are the reference cadence (#1, #3).
- Speed-ups carry the on-screen label "N× speed".
- AI answers shown in frame are verified.

## Proof, traction and CTA (ask)

- Proof shape: one number of the form **`number · rate · window`**; the conclusion is written on the chart; 1 credential per founder.
- Traction numbers come **verbatim** from `--metrics <csv|xlsx>` with source and date, no rounding. Every visible number must exist in `claims-index.json` with `source` (QA-12) — the `claims-auditor` agent enforces this.
- CTA = the **ask card**: amount + milestone + deadline + contact (mandatory). End card per QA-13: 2.5–4.0 s; ≥ 45 s videos additionally ≤ 12 %; one CTA ≥ 2.5 s; logo → tagline → URL, stagger 0.4 s.

## Mode-specific flags

- `--metrics <csv|xlsx>` — traction source (MVP). Read through the xlsx skill (dependencies).
- `--deck <pdf|pptx>` — v1.
- `--style cinematic` — v1, investors only; teaser register. Adds patterns P8 and P11.
- `--reveal story-first` — enables the Raskin order and the 25 s product limit (QA-04).

## Evidence rules

- The "product does the work" scene: **tier A only**. Reconstruction (tier C) is allowed only for non-product scenes, only with explicit confirmation, and carries the `reconstructed` label in storyboard + run-report.
- No generated video as evidence; Higgsfield B-roll (v1) is non-UI only with estimate + budget cap.
- The human-review question before render includes the `reconstructed` confirmation (protocol).

## Scorecard targets

- Hook speed: 100 at product ≤ 10 s, linear to 0 at 25 s (investor scale).
- Product-frame share: 100 at ≥ 40 %.
- Cadence: ASL 4–8 s (QA-09).
- Ship: 14 gates, scorecard ≥ 80, vision critic mean ≥ 3.0, min ≥ 2. The investor thresholds in QA-04 and the share target are **targets, not lint failures** and are an open question until GS-06 "Northwind" (v1) exists.

## Pattern composition

`investors` default restrained demo: **P1 over real data, P9 with three cards, P3 kickers, P15 without heavy branding** (quoted). `investors --style cinematic` (v1) adds **P8 and P11**. P12 (branching lines) is listed for investors architecture beats.

Mapping: P1 `camera-journey` (9 s per pass, `power1.inOut` — observation); P3 `kinetic-type-beats`, `titlecard-reveal` (1.2–2.5 s each); P9 `dataviz-countup`, `mk-progress-stat`, `data-chart` (2.2 s `power4.out`, 3 cards stagger 0.15 s, `tabular-nums`); P12 `constellation-hub`; P8 `logo-assemble-lockup`, `logo-outro` (v1); P11 `typewriter-reveal` (v1); P15 `logo-outro`. Count-up 1.2–2.5 s. Timings marked observation are retuned on the golden set.

## What `/present` writes into `BRIEF.md` for this mode

Frontmatter: `audience: investors`, `length` in 60–120 s (≤ 180 s data-room), `aspect`, `language`, `reveal: early|story-first`, `register: premium`, `voice: true`, `style_preset`.

`## Customizations`:
- 7-beat structure (or Raskin under story-first) with roles; one-liner ≤ 14 words in the first 5 s.
- Product ≤ 10 s default / ≤ 25 s story-first (QA-04); product share target ≥ 40 % (scorecard).
- Pattern chain P1 + P9 (three cards) + P3 + P15; ≤ 1 transition per beat, ζ 1.0, 0.5–0.8 s.
- Traction cards bound to `--metrics` rows verbatim with source + date; conclusion written on the chart.
- Ask card: amount, milestone, deadline, contact.
- VO on, founder preferred; `tts_placeholder` when TTS; kicker cards ≤ 7 words + SRT for 16:9.
- Loudness −16…−18 LUFS (QA-08); quiet bed.

`## Notes`: "product does the work" is tier A only, reconstruction only for non-product scenes with confirmation + `reconstructed`; "N× speed" labels; Art. 50 disclosure when the voice is synthetic; QA-04/QA-05 investor thresholds are vendor-derived defaults; enter the vendor workflow via this BRIEF only.

## Skeleton status

Reference only. `--style cinematic`, `--deck`, GS-06 "Northwind" and the calibrated critic are v1; `wowprobe.py` and the claims tooling are stubs.

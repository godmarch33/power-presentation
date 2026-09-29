# GS-02 — Ledgerly (synthetic B2B SaaS), sales 60 s

**Phase: MVP.** Golden-set fixture GS-02. CLI pin `hyperframes@0.8.47`, range `0.8.x`.

**Everything in this directory is fictional.** Ledgerly, its numbers, the testimonial, the prospect and the prospect's
company are synthetic placeholders created for the golden set; `.example` is a reserved domain. They exist so the
claims and personalisation rules can be tested without touching real people or real data (no LinkedIn
scraping; PII gates).

| Field | Value |
|---|---|
| Product | Ledgerly — fictional month-end close / reconciliation SaaS, class `web-ui`, synthetic landing page in `site/` |
| Mode | `--for sales` with `--prospect prospect.json --pain "…"` |
| Length | 60 s — inside the "Sales outreach 30–60 s" band; ±3 % hard |
| Story | inverted pyramid (sales): hook 3 s → "why you" 7 s → pain 15 s → show 15 s → CTA 5 s; 5–7 beats ≥ 3 s |
| Hook | prospect name and company in the hook window and in the poster |
| Personalisation | prospect site or logo in frame and poster = ladder level L2 |
| Voice | on by default for sales (Kokoro EN offline — English only) |
| Captions | on, word-timed, burned in; SRT always |
| CTA | exactly one step with a choice (example: "Reply \"yes\""; "Tuesday or Thursday?"), visible for the last 8 s (audience table) |
| Evidence | the synthetic site is captured like a real one (tier A: local run of `site/`); tier C reconstruction needs explicit confirmation + `reconstructed` label in sales |
| Scorecard target | product-frame share ≥ 50 % (sales) |

## Files

- `claims.json` — 7 sourced numbers (incl. the bare "12" before-state of the H1) + 1 sourced quote pointing at `site/index.html:<line>`, plus **2 decoys**
  (`"decoy": true`, `"source": null`). The claims-auditor (QA-12) must report both decoys as `unverified`
  in `gaps` before render and they must never appear in the storyboard or frames. Two sourced values differ on
  purpose (hero "3 days" vs. measured "3.1 days"): a storyboard cites one source and uses its value verbatim.
- `prospect.json` — the minimal prospect record: name, company, role, public site — nothing else. Prospect data is
  deleted after 30 days; a fixture is exempt only because it is fictional.
- `site/index.html` — minimal synthetic landing page, no external resources, one H1 (hero scoring), a features
  section, one testimonial, pricing, CTA. Serve it locally (`--local`) or point `--url` at a static server.

- `metrics.csv` — the investors-variant traction table (`metric,value,as_of,unit,source`; fictional, two rows point
  back at `site/index.html` lines) so the exit criterion "`--for investors --metrics` on GS-02" has an input
  (GS-06 Northwind carries the full investors fixture in v1). It also
  carries the ask card (`Ask: raise / milestone / deadline / contact`) and the team line, because no other
  input carries them and an unattended run must not invent them; rows with unit `date`,
  `email`, `url` or `text` become sourced text claims in `claims-index.json`.
- `storyboard-skeleton.md` — the expected sales storyboard (inverted pyramid, 12 frames, 60 s): prospect name and
  company in the hook, product by 3.5 s, first outcome at 8 s, every number from `claims.json`, CTA visible through
  the last 9 s, end card 3.5 s.
- `flow.json` — the `record-flow` steps over the synthetic site (hover CTA, scroll + click each section).

Built locally by `node scripts/golden-set.mjs build --only gs-02` into `evals/fixtures/gs-02/` (git-ignored; served
by the builder's own static server): footage, events, manifest, `autozoom.json`, `wowprobe.pre.json`.

## Invocations

```bash
# sales (MVP exit criterion: personalisation + outreach letter)
/present --for sales --duration 60 --local ./site --prospect prospect.json --pain "manual month-end reconciliation"

# investors variant on this fixture (MVP exit criterion; full investors fixture GS-06 is v1)
/present --for investors --duration 90 --local ./site --metrics metrics.csv
```

## Sales letter rule

The outreach email produced next to the video contains the GDPR Art. 14 information notice and the Art. 21(2) right to
object. The "15–25 % reply rate" figure is vendor data (Sendspark/Autobound, 2026) and is not verified on the golden set.
The eval `evals/storyboard-ledgerly/` checks that the skill states this rule.

## Status

`scripts/inspect-project.mjs` classifies this fixture as `web-ui` (high, `site/index.html`); `golden-set.mjs verify`
(2026-09-20): all 8 sourced claims reproduced at their lines, both decoys in `gaps`, 5 metrics rows with dates,
the hook check, storyboard gates on paper (scorecard 82.2), capture criteria on the built fixture (7 events /
3 clicks, 1 zoom segment, size ok).
`scripts/extract-story.mjs --repo examples/gs-02-ledgerly --claims examples/gs-02-ledgerly/claims.json` (2026-09-19) reproduces every
sourced `file:line` of `claims.json` (seven numbers + the quote), reports both decoys as `unverified` in `gaps`, and picks the H1 as the
hero feature (+3; `before_state: 12`, `after_state: 3 days`) — pinned by `scripts/extract-story.test.mjs`. The claims-auditor
agent now has a real `claims-index.json` to audit.

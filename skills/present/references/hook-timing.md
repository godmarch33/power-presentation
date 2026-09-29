# Hook timing, reveal and rhythm

Phase: MVP.

## The one hard rule (QA-03)

A **hook element** — problem, promise or thesis, spoken or on screen — is visible by **3.0 s**, and there is **no black open**: no frame with YAVG < 26/255 without an element in the first second (QA-03).

- Measured by `wowprobe.py` `signalstats` + the `hook` frame role in `STORYBOARD.md` (QA-03).
- Type: **hard** — blocks shipping in every mode, no brief override.
- The anti-example: Rabbit r1 opens with 12 s of near-black (#9) — that is exactly the failure this gate catches (lineage).
- No logo before 3 s (creative checklist); a logo sting is a typical-explainer marker.
- Brag baseline: first UI ≈ 6 s after ≈ 2 s near-black open (s6/s9) — fails QA-03.

## Defaults per mode (QA-04, QA-05) — overridable by the brief

| Gate | marketing (product-led) | sales | investors | Type |
|---|---|---|---|---|
| QA-04 first product frame | ≤ 5 s | ≤ 5 s | ≤ 10 s default; ≤ 25 s under `reveal: story-first` | default |
| QA-05 first outcome (`outcome\|metric` role) | ≤ 12 s | ≤ 12 s | ≤ 20 s | default |

- Measured from the frame roles in `STORYBOARD.md` + critic labels (QA-04) and the `outcome|metric` role (QA-05).
- "Default" means the brief (`reveal`, `register`, `duration`) may override it and the override is recorded in `run-report.json` (gate types). It is **not** a universal lint failure.
- The investor 10 s / 25 s thresholds come from research G6 (vendor-derived), not from a16z/DocSend, and are retuned on GS-06 "Northwind" (QA-04, open questions).
- For products without UI the "product frame" is any frame with role `terminal|code|api|diagram|design|file`.

## `reveal: early | story-first`

- `early` (default for marketing product-led and sales): product ≤ 5 s (QA-04).
- `story-first`: the product reveal may be delayed — for investors/narrative up to **25 s** (QA-04). It changes the beat order, not the beat set; for investors it enables the Raskin narrative.
- The marketing P7 pivot "pain → product" lands at 30–50 % of runtime (P7, observation) — this is a story-first shape and must still satisfy QA-03 with a hook card in the first 3 s.
- Dia (product at 0:40) gives the pivot grammar but not the timing; the limit is set only by QA-04.

## Investor scorecard scale

Hook-speed metric (weight 15): investors score **100 at product ≤ 10 s, linear to 0 at 25 s**; marketing/sales score 100 at first outcome ≤ 4 s, linear to 0 at 12 s. These are scorecard targets, not lint. Investor one-liner: "what we do" in ≤ 14 words in the first 5 s.

## Rhythm vs cadence (QA-09)

Two different rules, do not merge them:

| Rule | What changes | Value | Owner |
|---|---|---|---|
| Rhythm | a visual **or audio state change** (not a cut) | every **2–4 s** | |
| Cadence | average shot length between cuts | ASL **2–6 s** marketing; **4–8 s** sales/investors; no shot > 12 s unless declared continuous camera | QA-09 (default gate) |

- QA-09 is measured with `gt(scene,0.25)` in `wowprobe.py`; is judged from the storyboard and the critic (note: "QA-09 measures cuts only").
- One static shot for the whole runtime is forbidden (Humane lesson).
- Beat-lock: reveals ±0.15 s, entrances ±0.10 s of the cue; scorecard "beat lock" 100 at ≥ 80 % locked.
- Reference cadence (observation): Linear Agent 0 cuts / continuous camera; Cursor 3 24 cuts / 3.6 s ASL; Screen Studio 27 / 1.6 s; Arc 38 / 0.94 s (beat montage, P6); Warp Oz 26 / 4.0 s.

## Timeline sanity check for a 45 s marketing cut (example, values from the IDs above)

- 0.0–3.0 s: hook card visible (QA-03), first motion starts at 0.1–0.3 s, headline present.
- ≤ 5 s: first real product frame (QA-04).
- ≤ 12 s: first outcome/metric (QA-05).
- every 2–4 s: a state change; cuts average 2–6 s (QA-09).
- last 2.5–4.0 s: end card, ≤ 12 % of runtime (QA-13).

## Skeleton status

`scripts/wowprobe.py` (stub) will own QA-03/QA-09 measurement; the storyboard roles that feed QA-04/QA-05 are written by the `story-director` agent. Until lands, `/present` states these limits in `BRIEF.md` `## Notes` only.

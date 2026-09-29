# GS-02 sales (Ledgerly → Dana Okafor, Northbridge Retail Group) — unattended pass, 2026-09-27 19:13–20:43

`node scripts/autonomous-run.mjs --run gs-02-sales` at beb17fe (the first pass with the wow features: bed automation
and dropout, voice carve, beat-snapped cuts, motion blur, checks), `bwrap` isolation, throttle `nice 10,
cpus 0-3,5-7,16-19,21-23`, `POWER_PRESENTATION_MAX_AGENTS=2`. Invocation: `--for sales --duration 60 --local ./site
--prospect prospect.json --pain "manual month-end reconciliation" --yes` (old layout: the pass wrote into the run
directory — the `power-presentation-out/` workspace landed after it was staged).

**Outcome: delivered and ships.** `ledgerly-sales_16x9.mp4` + `ledgerly-sales_9x16.mp4` (sales outreach derives both),
59.2 s, Kokoro VO + pack bed + SRT, poster at 2.2 s with the prospect's name and company. 16:9 master: post-render
`gates_failed: []` (14/14; QA-13 with one waiver — no Ledgerly URL or calendar link exists in any source, so the end
card is logo → tagline → CTA), scorecard **93.7** (9:16: 92.7) — **beat lock 93.8** (the earlier passes: 44.6–57.7;
beat-snapped cuts), craft lint 75.9, ending discipline 50 (the missing URL). Vision critic ship 2 of 3 votes, mean
3.0, lowest 1 (one design vote: C3 / C4). The letter carries the Art. 14 notice and the Art. 21(2) opt-out
(`letter_gdpr` both true), retention stamped (delete after 2026-10-27), prospect record = name, company, role, site;
the two decoy claims of `claims.json` ("10x faster", "50,000 customers") appear nowhere. −14.5 LUFS, TP −1.9 dBTP.

**$30.88 — missed** (Opus $15.98 + Sonnet $14.90 at list price): a revision round before the final panel
(clipped memo text, a "12" read as "42", callouts over the app's own text, a frozen quote card for QA-07) with a
second render, the 9:16 cut, and the 3-vote panel on the final version. The calibrated pre-dispatch estimate said
~$18. 5434 s session wall (wall-time target missed at the 2-agent cap, accepted); `time.wall_s` 4783 s. Stage seconds: frames
1379, review 1132, storyboard 868, verify 450 (5 passes), render 227 (2), pitch 162, deliver 88, capture 63, audio 45,
brief 41, assemble 37 (9 passes), intake 23, inspect 9, design_spec 4. `claude-result.json` covers the session's last segment
only (6 turns, 39 s); its `total_cost_usd` / `modelUsage` are the whole session's.

## Plugin defects this pass surfaced (fixed after it)

| # | Defect | Fix |
| --- | --- | --- |
| S1 | The window frame drew a heavy drop shadow although `frame.md` said "NO shadows"; the critic marked it down | ca2e5a3 |
| S2 | A Kenney SFX renamed into the project froze `unknown` in the media ledger and blocked the render (set by hand from its hash) | 1d291a4 |
| S3 | A hand-run `run-report.mjs` without `--prospect` left `mode.sales.prospect_fields` null | 8f58fb0 |
| S4 | The cost estimate (×0.63) said ~$18 for a run that cost $30.88 | db25a51 (median of four runs, spread shown) |

Open from this pass: the 9:16 cut crops the "Matched" column of the Auto-match frame and cuts the "7 of 7 matched"
callout at the edge (13.4 s); two 9:16 callouts sit at ≈ 26 px (below the 40 px floor) with no room above the caption
band — no gate measures the 9:16 reflow's text size or crop (the critic sees the 16:9 master only). The frame at
40.9 s shows the whole app at once (critic, one focus per frame).

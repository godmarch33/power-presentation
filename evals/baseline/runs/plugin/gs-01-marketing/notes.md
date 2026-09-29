# GS-01 marketing (Plausible, live URL) — unattended pass, 2026-09-27 16:56–17:59

`node scripts/autonomous-run.mjs --run gs-01-marketing` at bb4f2c3, `bwrap` isolation, throttle `nice 10, cpus
0-3,5-7,16-19,21-23`, `POWER_PRESENTATION_MAX_AGENTS=2`. Invocation: `--for marketing --duration 45 --format
16:9,9:16 --url https://plausible.io --yes`.

**Outcome: delivered and ships.** `plausible_16x9.mp4` + `plausible_9x16.mp4`, 45.0 s each, music only. 16:9 master:
post-render `gates_failed: []` (14/14), scorecard 81.3 (≥ 80; beat lock 44.6, craft lint 0), vision critic SHIP 3/3
votes, mean 3.91, lowest dimension 3. **capture criteria ok** (`s12_capture`): tier A from prod, OCR gate ran with
0 findings, cursor from `events.jsonl` (6 events, 2 clicks, flow 12/12), 2 auto-zoom segments,
`capture_size_below_output` = 0. $18.13 (ok), 3769 s session wall; `run-report.json` `time.wall_s` 2970 s
(first stamp → last), `timed_s` 3246 s (brief and pitch stamps overlap). The wall-time target was missed at the 2-agent cap (accepted).

## What the orchestrator fixed or worked around (plugin fixes since)

| Issue | Fix |
| --- | --- |
| Frames 1–8 found their root via `document.currentScript.closest(…)` — `null` in the host, `check` runtime errors | e9e8988 (worker prompt) |
| `R time --end frames` → "unexpected argument frames" (`frames` is also a command) | e9e8988 |
| Its own look-files (12 stills, a contact sheet, `hyperframes capture` output) under `.media/` froze as `unknown` | 07472d2 |
| Two frames linked GSAP from unpkg `gsap@3` / cdnjs 3.12.5 | 9af7e0e |
| Brand colour matching picked the site's green for body text; panels over zoomed footage | worker / frame.md (kept) |

Open from this pass: the **9:16 cut was never reviewed** — the critic sees the 16:9 master only, and frames 3–7 read
small beside a narrow dashboard strip in portrait; a panel still loading at ≈ 14.5 s (real product behaviour, < 1 s);
the Plausible logo is licensed `own-capture` because it comes from the capture of the product being marketed.

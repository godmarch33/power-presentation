---
workflow: product-launch-video
flow: automation
storyboard: no
message: "Close the books in 3 days, not 12"
audience: sales — Dana Okafor, Head of Finance at Northbridge Retail Group (fictional prospect, GS-02)
destination: sales-outreach
aspect: 1920x1080
language: en
length: 60s
angle: inverted pyramid (sales) — hook 3 s → why you → pain → show → CTA
reveal: early
register: medium
voice: on
style_preset: blue-professional
---

## Intent

A 60-second sales outreach video for one prospect: Dana Okafor, Head of Finance at Northbridge Retail Group,
whose close takes 12 days. Ledgerly (fictional, GS-02) reconciles bank lines to invoices automatically and
closes the month in 3 days. The pitch (concept 1 of the round): open on the prospect's own number,
show the real product doing the work, and ask for one reply. Promise: "Close the books in 3 days,
not 12" (site H1). Every number on screen comes from `claims-index.json`; the two decoys of the fixture
("10x faster", "50,000 customers") are unverified and never used (QA-12).

## Assets

- `assets/footage.mp4` — tier A: record-flow capture of the synthetic site over a local static server
  (3840×2160, 9.4 s; hero → features → proof → pricing → CTA click). `.media/capture/events.jsonl` (7 events),
  `.media/capture/capture-manifest.json` (OCR gate ran, 0 findings), `.media/capture/autozoom.json` (1 zoom
  segment at 7.14 s on the CTA, cursor path).
- `prospect.json` — name, company, role, public site; nothing else.
- `claims-index.json` — 8 verified claims (7 numbers + 1 quote) from `site/index.html`, 2 decoys in `gaps`.
- `assets/fonts/SpaceGrotesk-latin-wght.woff2` — Space Grotesk variable (OFL) for the preset's display face;
  Inter is pre-bundled by the renderer.

## Customizations

- Mode: sales (audiences/sales.md) — inverted pyramid, prospect name + company inside the QA-03 window and on
  the poster, one-step CTA visible through the last 8 s, captions burned in, −14 LUFS (QA-08).
- Auto-zoom from `autozoom.json`; the plugin mounts the hoisted footage in the zoom wrapper at the host
  root — the vendor assembler hoists frame videos, the plugin's `render-path.mjs` adds the camera.
- VO: Kokoro EN `am_michael` offline; captions word-timed from whisper `small.en`; SRT always.
- Ship criteria: QA-01…QA-14 + scorecard ≥ 80. Outreach letter carries GDPR Art. 14 / 21(2) lines.
- No tier-C reconstruction: every product frame is the tier-A capture; card frames (hook, proof, price, end)
  are typographic, not product screens.

## Notes

Declared vs derived: see `intake.json`. Evidence: chain step `local` (no prod URL for a synthetic site), tier A.
Cost estimate printed before dispatch: none (this baseline run is driven by hand in one session, so the
estimate/actual are recorded in `run-report.json` from the session's own accounting).

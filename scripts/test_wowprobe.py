#!/usr/bin/env python3
from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wowprobe as wp

STORYBOARD = """---
format: 1920x1080
duration: 45s
message: "Close the books in 3 days"
audience: sales
reveal: early
register: high
---

## Frame 1 — Hook

- scene: Big type on the beat
- duration: 3s
- role: hook
- text: "Dana, close the books in 3 days" @ 0.2-3.0

Narrative with a number that must not count: at 0.4 s the card slides.

## Frame 2 — Why you

- duration: 7s
- role: pain_point
- text: "Northbridge: 12 days to close" @ 0.5-3.0
- text: "manual month-end reconciliation" @ 3.2-7.0

## Frame 3 — Product

- duration: 15s
- role: ui
- evidence_tier: A
- hold: 2.0
- text: "98.5% auto-matched" @ 1.0 +3.0
- voiceover: "Ledgerly matches 98.5% of transactions automatically."

## Frame 4 — Outcome

- duration: 15s
- role: outcome
- continuous_camera: true
- text: "3.1 days average close" @ 0.5-3.5

## Frame 5 — End card

- duration: 3.5s
- role: cta
- cta: "Reply \\"yes\\" — Tuesday or Thursday?" @ 0.4-3.5
- order: logo -> tagline -> URL
- stagger: 0.4s
"""

CLAIMS = {
    "schema": "power-presentation/claims-index@0.1",
    "claims": [
        {"id": "c001", "kind": "number", "value": "3 days", "number": 3, "unit": "days", "source": "site/index.html:27", "status": "verified"},
        {"id": "c002", "kind": "number", "value": "98.5%", "number": 98.5, "unit": "%", "source": "site/index.html:36", "status": "verified"},
        {"id": "c003", "kind": "number", "value": "3.1 days", "number": 3.1, "unit": "days", "source": "site/index.html:40", "status": "verified"},
        {"id": "c009", "kind": "number", "value": "12", "number": 12, "unit": "days", "source": "site/index.html:27", "status": "verified"},
        {"id": "decoy", "kind": "number", "value": "10x faster", "number": 10, "unit": "x", "source": None, "status": "unverified"},
    ],
}


def sb():
    return wp.parse_storyboard(STORYBOARD)


class StoryboardParsing(unittest.TestCase):
    def test_frontmatter_and_frames(self):
        s = sb()
        self.assertEqual(s["globals"]["audience"], "sales")
        self.assertEqual(s["globals"]["reveal"], "early")
        self.assertEqual([f["index"] for f in s["frames"]], [1, 2, 3, 4, 5])
        self.assertEqual([f["role"] for f in s["frames"]], ["hook", "pain_point", "ui", "outcome", "cta"])
        self.assertEqual(s["frames"][0]["title"], "Hook")
        self.assertEqual(s["frames"][0]["number"], 1)

    def test_cumulative_starts_and_planned_duration(self):
        s = sb()
        self.assertEqual([f["start"] for f in s["frames"]], [0.0, 3.0, 10.0, 25.0, 40.0])
        self.assertEqual(s["planned_duration"], 43.5)
        self.assertEqual(wp.storyboard_brief_duration(s), (45.0, "storyboard frontmatter duration"))

    def test_text_timeline_forms(self):
        s = sb()
        t1 = s["frames"][0]["texts"][0]
        self.assertEqual((t1["start"], t1["end"], t1["chars"], t1["timed"]), (0.2, 3.0, 31, True))
        t3 = s["frames"][2]["texts"][0]
        self.assertEqual((t3["start"], t3["end"]), (1.0, 4.0))
        cta = s["frames"][4]["texts"][0]
        self.assertEqual(cta["kind"], "cta")
        self.assertTrue(cta["text"].startswith("Reply"))
        self.assertEqual(s["frames"][4]["order"], "logo -> tagline -> URL")
        self.assertEqual(s["frames"][4]["stagger"], 0.4)

    def test_plugin_keys(self):
        s = sb()
        self.assertEqual(s["frames"][2]["hold"], 2.0)
        self.assertTrue(s["frames"][3]["continuous_camera"])
        self.assertEqual(s["frames"][2]["evidence_tier"], "A")
        self.assertEqual(s["frames"][2]["voiceover"], "Ledgerly matches 98.5% of transactions automatically.")

    def test_line_breaks_and_untimed_text(self):
        e = wp.parse_text_entry('"one line / second line"', "text", 4.0)
        self.assertEqual(e["lines"], ["one line", "second line"])
        self.assertEqual((e["start"], e["end"], e["timed"]), (0.0, 4.0, False))

    def test_lenient_on_missing_frontmatter_and_h3(self):
        s = wp.parse_storyboard("### Scene 1: Intro\n- duration: 2s\n- role: hook\n\n### Beat 2 — Next\n- duration: 2s\n")
        self.assertEqual(len(s["frames"]), 2)
        self.assertEqual(s["frames"][1]["start"], 2.0)


class Numbers(unittest.TestCase):
    def test_tokens_and_units(self):
        toks = wp.numbers_in_text("Close the books in 3 days, not 12 — 98.5% matched, EUR 190/mo, 3.4k teams")
        got = [(t["number"], t["unit"]) for t in toks]
        self.assertIn((3.0, "days"), got)
        self.assertIn((12.0, ""), got)
        self.assertIn((98.5, "%"), got)
        self.assertIn((190.0, "EUR"), got)
        self.assertIn((3400.0, ""), got)

    def test_exemptions(self):
        self.assertEqual(wp.numbers_in_text("v1.2.3 shipped at 12:30 in 2026, and #123 and Step 2"), [])

    def test_claims_matching(self):
        claims = wp.load_claims_from(CLAIMS)
        ok = wp.number_is_claimed({"number": 3.0, "unit": "days"}, claims)
        self.assertIsNotNone(ok)
        self.assertIsNone(wp.number_is_claimed({"number": 3.0, "unit": "h"}, claims), "unit mismatch must not match")
        self.assertIsNone(wp.number_is_claimed({"number": 10.0, "unit": "x"}, claims), "an unverified decoy is not a source")
        self.assertIsNotNone(wp.number_is_claimed({"number": 12.0, "unit": ""}, claims), "a bare number matches a claim with a unit")


class StoryboardGates(unittest.TestCase):
    def setUp(self):
        self.frames = sb()["frames"]

    def test_qa04_qa05(self):
        g = wp.eval_qa04(self.frames, "sales", "early")
        self.assertFalse(g["pass"])
        self.assertEqual(g["value"], 10.0)
        g = wp.eval_qa04(self.frames, "sales", "story-first")
        self.assertTrue(g["pass"])
        self.assertIn("story-first", g["override"])
        g = wp.eval_qa05(self.frames, "sales")
        self.assertFalse(g["pass"])
        g = wp.eval_qa05(self.frames, "investors")
        self.assertFalse(g["pass"])

    def test_qa10_reading_floor(self):
        g = wp.eval_qa10(self.frames, None)
        self.assertTrue(g["pass"], g["details"])
        bad = wp.parse_storyboard('## Frame 1\n- duration: 3s\n- role: hook\n- text: "A forty-two-plus character line that runs on far too long for one line" @ 0.0-1.0\n')["frames"]
        g = wp.eval_qa10(bad, None)
        self.assertFalse(g["pass"])
        v = g["details"]["violations"][0]
        self.assertTrue(any("hold" in p for p in v["problems"]))
        self.assertTrue(any("chars" in p for p in v["problems"]))

    def test_qa10_floor_formula(self):
        frames = wp.parse_storyboard('## Frame 1\n- duration: 3s\n- text: "Dana, close the books in 3 days" @ 0.0-1.5\n')["frames"]
        self.assertEqual(len(wp.reading_floor_violations(frames, 20, 1.2, 42, 2)), 1)
        frames = wp.parse_storyboard('## Frame 1\n- duration: 3s\n- text: "Dana, close the books in 3 days" @ 0.0-1.6\n')["frames"]
        self.assertEqual(wp.reading_floor_violations(frames, 20, 1.2, 42, 2), [])

    def test_qa12(self):
        claims = wp.load_claims_from(CLAIMS)
        g = wp.eval_qa12(self.frames, claims, None)
        self.assertTrue(g["pass"], g["details"]["unsourced"])
        self.assertGreaterEqual(g["details"]["numbers_checked"], 5)
        frames = wp.parse_storyboard('## Frame 1\n- duration: 3s\n- text: "10x faster close" @ 0.0-3.0\n')["frames"]
        g = wp.eval_qa12(frames, claims, None)
        self.assertFalse(g["pass"])
        self.assertEqual(g["details"]["unsourced"][0]["token"], "10x")

    def test_qa13(self):
        g = wp.eval_qa13(self.frames, 43.5)
        self.assertTrue(g["pass"], g["details"]["problems"])
        long_card = wp.parse_storyboard("## Frame 1\n- duration: 20s\n- role: ui\n## Frame 2\n- duration: 6s\n- role: cta\n")["frames"]
        g = wp.eval_qa13(long_card, 26.0)
        self.assertFalse(g["pass"])
        self.assertTrue(any("outside" in p for p in g["details"]["problems"]))
        self.assertTrue(any("absolute" in p for p in g["details"]["problems"]))
        no_card = wp.parse_storyboard("## Frame 1\n- duration: 20s\n- role: ui\n")["frames"]
        self.assertFalse(wp.eval_qa13(no_card, 20.0)["pass"])

    def test_qa03_needs_video_but_reports_hook_timing(self):
        g = wp.eval_qa03(None, self.frames)
        self.assertFalse(g["measured"])
        self.assertEqual(g["details"]["hook_visible_at_sec"], 0.2)
        g = wp.eval_qa03({"yavg_min": 12.0, "yavg_mean": 20.0, "yavg_at_0": 12.0, "yavg_at_0_5": 30.0, "window_sec": 1.0, "frames": 30}, self.frames)
        self.assertFalse(g["pass"])
        frames0 = wp.parse_storyboard('## Frame 1\n- duration: 3s\n- role: hook\n- text: "x" @ 0.0-3.0\n')["frames"]
        g = wp.eval_qa03({"yavg_min": 12.0, "yavg_mean": 20.0, "yavg_at_0": 12.0, "yavg_at_0_5": 30.0, "window_sec": 1.0, "frames": 30}, frames0)
        self.assertTrue(g["pass"])

    def test_qa07_declared_holds_and_end_card(self):
        freezes = [{"start": 11.0, "end": 12.5, "duration": 1.5}, {"start": 40.0, "end": 43.5, "duration": 3.5}]
        g = wp.eval_qa07(freezes, None, 43.5, self.frames)
        self.assertTrue(g["pass"])
        self.assertEqual(g["details"]["windows"][0]["declared_hold_sec"], 1.0)
        self.assertEqual(g["details"]["windows"][1]["counted_sec"], 0.0)

    def test_qa09_declared_cuts(self):
        frames = [{"start": 0.0, "end": 3.5}, {"start": 3.5, "end": 8.0}, {"start": 8.0, "end": 12.0}, {"start": 12.0, "end": 17.0}]
        declared = wp.declared_cuts(frames)
        self.assertEqual([c["t"] for c in declared], [3.5, 8.0, 12.0])
        self.assertTrue(all(c["source"] == "storyboard" for c in declared))
        g = wp.eval_qa09(declared, 17.0, "marketing", frames, detected=[{"t": 12.0}])
        self.assertTrue(g["pass"], g["details"])
        self.assertEqual(g["details"]["cut_source"], "storyboard frame boundaries")
        self.assertEqual(g["details"]["detected_cuts"], [12.0])
        self.assertEqual(g["details"]["asl_sec"], 4.25)
        self.assertEqual(wp.declared_cuts([]), [])
        g2 = wp.eval_qa09([{"t": 12.0}], 17.0, "marketing", frames)
        self.assertEqual(g2["details"]["cut_source"], "ffmpeg scene>0.25")
        self.assertEqual(g2["details"]["detected_cuts"], [12.0])

    def test_qa09_continuous_camera(self):
        cuts = [{"t": 3.0}, {"t": 10.0}, {"t": 17.0}, {"t": 25.0}, {"t": 40.0}]
        g = wp.eval_qa09(cuts, 43.5, "sales", self.frames)
        self.assertTrue(g["pass"], g["details"])
        self.assertEqual(g["details"]["cuts"], 5)
        self.assertTrue(g["details"]["continuous_camera_exempted"])
        g = wp.eval_qa09(cuts, 43.5, "sales", [dict(f, continuous_camera=False) for f in self.frames])
        self.assertFalse(g["pass"])

    def test_qa01(self):
        g = wp.eval_qa01(45.9, 45.0, "brief", "sales-outreach", False)
        self.assertTrue(g["pass"])
        g = wp.eval_qa01(47.0, 45.0, "brief", "sales-outreach", False)
        self.assertFalse(g["pass"])
        g = wp.eval_qa01(70.0, 70.0, "brief", "sales-outreach", False)
        self.assertFalse(g["pass"])
        g = wp.eval_qa01(70.0, 70.0, "brief", "sales-outreach", True)
        self.assertTrue(g["pass"])
        self.assertIn("overridden", g["override"])

    def test_qa08(self):
        g = wp.eval_qa08({"integrated_lufs": -14.4, "true_peak_dbtp": -1.5, "lra_lu": 5.0}, -14.0, True)
        self.assertTrue(g["pass"])
        g = wp.eval_qa08({"integrated_lufs": -16.0, "true_peak_dbtp": -1.5, "lra_lu": 5.0}, -14.0, True)
        self.assertFalse(g["pass"])
        g = wp.eval_qa08({"integrated_lufs": -14.0, "true_peak_dbtp": -0.2, "lra_lu": 5.0}, -14.0, True)
        self.assertFalse(g["pass"])
        self.assertFalse(wp.eval_qa08({"integrated_lufs": -14.0, "true_peak_dbtp": -2}, None, True)["measured"])


class HyperframesGates(unittest.TestCase):
    CHECK = {
        "ok": False,
        "lint": {"ok": True, "errorCount": 0, "warningCount": 1, "findings": []},
        "runtime": {"ok": True, "errorCount": 0, "warningCount": 0, "findings": []},
        "layout": {"ok": False, "errorCount": 2, "warningCount": 1, "findings": [
            {"code": "clipped_text", "severity": "error", "time": 0.5},
            {"code": "caption_zone_collision", "severity": "error", "time": 1.0, "selector": "div.caption"},
        ], "samples": [0.5, 1.5]},
        "motion": {"ok": False, "errorCount": 1, "warningCount": 0, "enabled": True, "samples": 12, "findings": [{"code": "motion_frozen", "severity": "error"}]},
        "contrast": {"ok": False, "errorCount": 1, "warningCount": 1, "enabled": True, "checked": 10, "passed": 8, "findings": [
            {"code": "contrast_aa_failure", "severity": "error", "ratio": 2.1},
            {"code": "contrast_aa_failure", "severity": "warning", "ratio": 4.2},
        ]},
    }

    def test_failing_envelope(self):
        g = wp.eval_hyperframes_gates(self.CHECK, None, None, [], [])
        self.assertFalse(g["QA-02"]["pass"])
        self.assertEqual(g["QA-02"]["value"], 3)
        self.assertEqual(g["QA-02"]["details"]["warnings"], 3)
        self.assertFalse(g["QA-06"]["pass"])
        self.assertEqual(g["QA-06"]["value"], 1)
        self.assertFalse(g["QA-14"]["pass"])
        self.assertEqual(g["QA-14"]["value"], 2)
        self.assertFalse(g["QA-11"]["measured"])

    def test_qa14_static_token_warned_in_two_frames_fails(self):
        ok = json.loads(json.dumps(self.CHECK))
        ok["layout"]["findings"] = []
        star = {"code": "contrast_aa_failure", "severity": "warning", "text": "\u2731", "fg": "rgb(204,120,92)", "bg": "rgb(239,233,222)", "ratio": 2.71}
        ok["contrast"]["findings"] = [dict(star, sourceFile="04.html", time=12.5), dict(star, sourceFile="06.html", time=22.5)]
        g = wp.eval_hyperframes_gates(ok, None, None, [], [])
        self.assertFalse(g["QA-14"]["pass"])
        self.assertEqual(g["QA-14"]["value"], 2)
        self.assertEqual(g["QA-14"]["details"]["contrast_errors"][0]["held_across_samples"], 2)
        ok["contrast"]["findings"] = [dict(star, time=12.5)]
        self.assertTrue(wp.eval_hyperframes_gates(ok, None, None, [], [])["QA-14"]["pass"], "one one-off sample stays a warning")

    def test_passing_envelope_and_uncited_allow(self):
        ok = json.loads(json.dumps(self.CHECK))
        ok["ok"] = True
        for k in ("layout", "contrast", "motion"):
            ok[k]["ok"], ok[k]["errorCount"], ok[k]["findings"] = True, 0, []
        g = wp.eval_hyperframes_gates(ok, None, None, [], [])
        self.assertTrue(g["QA-02"]["pass"])
        self.assertTrue(g["QA-06"]["pass"])
        self.assertTrue(g["QA-14"]["pass"])
        allow = [{"file": "frames/03.html", "attr": "data-layout-allow-overlap"}]
        g = wp.eval_hyperframes_gates(ok, None, None, [], allow)
        self.assertFalse(g["QA-02"]["pass"])
        waiver = [{"gate": "QA-02", "subject": "frames/03.html", "reason": "stacked IDE windows", "snapshot": "QA/s.png", "snapshot_exists": True, "qa_md": "QA.md#L3"}]
        g = wp.eval_hyperframes_gates(ok, None, None, waiver, allow)
        self.assertTrue(g["QA-02"]["pass"])

    def test_not_counted_without_samples(self):
        ok = json.loads(json.dumps(self.CHECK))
        ok["ok"] = True
        for k in ("layout", "contrast", "motion"):
            ok[k]["ok"], ok[k]["errorCount"], ok[k]["findings"] = True, 0, []
        ok["layout"]["samples"] = []
        g = wp.eval_hyperframes_gates(ok, None, None, [], [])
        self.assertFalse(g["QA-02"]["pass"])
        self.assertTrue(any("does not count" in p for p in g["QA-02"]["details"]["problems"]))

    def test_qa11(self):
        anim = {"tweens": [
            {"selector": ".a", "props": ["opacity", "y"], "duration": 0.6, "ease": "power3.out", "flags": []},
            {"selector": ".b", "props": ["opacity"], "duration": 0.5, "ease": "expo.out", "flags": ["paced-fast"]},
            {"selector": ".c", "props": ["x"], "duration": 0.4, "ease": "power2.in", "flags": []},
        ], "staggers": [{"elements": ["#f01-x", "#f01-y", "#f01-z"], "intervals": [0.1, 0.1]}], "deadZones": []}
        g = wp.eval_qa11(anim, None)
        self.assertTrue(g["pass"], g["details"]["problems"])
        anim["tweens"].append({"selector": "#caption-word-3-1", "props": ["scale"], "duration": 0.18, "ease": "power1.out", "flags": []})
        g = wp.eval_qa11(anim, None)
        self.assertTrue(g["pass"], g["details"]["problems"])
        self.assertEqual(g["details"]["caption_tweens_excluded"], 1)
        self.assertEqual(g["details"]["tweens"], 3)
        anim["staggers"].append({"elements": ["#f01-x", "#f01-x", "#f01-x"], "intervals": [0.029, 0.0]})
        anim["staggers"].append({"elements": ["#caption-word-0-0", "#caption-word-0-1", "#caption-word-0-2"], "intervals": [0.05, 0.4]})
        anim["staggers"].append({"elements": ["#_12-end-tagline", "#_12-end-url", "#f03-metric-suffix"], "intervals": [0.4, 0.9]})
        g = wp.eval_qa11(anim, None)
        self.assertTrue(g["pass"], g["details"]["problems"])
        anim["tweens"].append({"selector": ".d", "props": ["opacity"], "duration": 0.1, "ease": "none", "flags": []})
        anim["tweens"].append({"selector": ".e", "props": ["scale"], "duration": 0.5, "ease": "back.out(1.7)", "flags": []})
        anim["staggers"].append({"elements": ["#f09-card-1", "#f09-card-1", "#f09-card-2", "#f09-card-2", "#f09-card-3", "#f09-card-3"], "intervals": [0.037, 0.113, 0.037, 0.113, 0.037]})
        self.assertEqual(wp._element_intervals(anim["staggers"][-1]["elements"], anim["staggers"][-1]["intervals"]), [0.15, 0.15])
        self.assertEqual(wp.eval_qa11(anim, None)["details"]["uneven_staggers"], [])
        anim["staggers"].append({"elements": ["#f02-p", "#f02-q", "#f02-r"], "intervals": [0.1, 0.3]})
        g = wp.eval_qa11(anim, None)
        self.assertFalse(g["pass"])
        self.assertEqual(len(g["details"]["problems"]), 4, g["details"]["problems"])
        self.assertEqual(g["details"]["uneven_staggers"][0]["elements"], ["#f02-p", "#f02-q", "#f02-r"])
        g = wp.eval_qa11(anim, "playful")
        self.assertEqual(len(g["details"]["problems"]), 3)
        self.assertEqual(wp._stagger_runs([0.1, 0.5, 0.1]), [[0.1], [0.1]])
        self.assertEqual(wp._stagger_runs([0.1, 0.1, 0.6, 0.1, 0.3]), [[0.1, 0.1], [0.1, 0.3]])
        self.assertEqual(wp._stagger_runs([0.1, 0.3]), [[0.1, 0.3]], "0.3 s is below the beat gap: still one uneven run")
        quote = {"tweens": [], "deadZones": [], "staggers": [{"elements": ["#f10-hero", "#f10-hero", "#f10-s1-line2", "#f10-s1-line2", "#f10-attr-line1", "#f10-attr-line1", "#f10-attr-line2", "#f10-attr-line2"], "intervals": [0, 0.1, 0, 0.5, 0, 0.1, 0]}]}
        self.assertEqual(wp.eval_qa11(quote, None)["details"]["uneven_staggers"], [])
        quote["staggers"][0] = {"elements": ["#f10-a", "#f10-b", "#f10-c", "#f10-d", "#f10-e", "#f10-f"], "intervals": [0.1, 0.1, 0.6, 0.1, 0.3]}
        self.assertEqual(wp.eval_qa11(quote, None)["details"]["uneven_staggers"][0]["run"], [0.1, 0.3])


class Scorecard(unittest.TestCase):
    def test_hook_speed(self):
        self.assertEqual(wp.score_hook_speed("marketing", 4.0, None)[0], 100.0)
        self.assertEqual(wp.score_hook_speed("marketing", 8.0, None)[0], 50.0)
        self.assertEqual(wp.score_hook_speed("marketing", 12.0, None)[0], 0.0)
        self.assertEqual(wp.score_hook_speed("investors", 30.0, 10.0)[0], 100.0)
        self.assertEqual(wp.score_hook_speed("investors", 30.0, 17.5)[0], 50.0)

    def test_product_share_and_cadence(self):
        self.assertEqual(wp.score_product_share("sales", 50.0)[0], 100.0)
        self.assertEqual(wp.score_product_share("sales", 25.0)[0], 50.0)
        self.assertEqual(wp.score_product_share("marketing", 35.0)[0], 100.0)
        self.assertEqual(wp.score_cadence(4.0, (2, 6), 8.0)[0], 100.0)
        self.assertEqual(wp.score_cadence(8.0, (2, 6), 14.0)[0], 60.0)

    def test_loudness(self):
        self.assertEqual(wp.score_loudness({"integrated_lufs": -14.5, "true_peak_dbtp": -2}, -14)[0], 100.0)
        self.assertEqual(wp.score_loudness({"integrated_lufs": -17.0, "true_peak_dbtp": -2}, -14)[0], 70.0)
        self.assertEqual(wp.score_loudness({"integrated_lufs": -14.0, "true_peak_dbtp": 0.5}, -14)[0], 0.0)
        self.assertIsNone(wp.score_loudness(None, -14)[0])

    def test_beat_lock(self):
        cues = {"beats": [{"time": 3.0}, {"time": 7.0}], "strongCues": []}
        frames = wp.parse_storyboard('## Frame 1\n- duration: 3s\n- text: "x" @ 0.5-3.0\n## Frame 2\n- duration: 4s\n- text: "y" @ 0.05-4.0\n')["frames"]
        s, d = wp.score_beat_lock(cues, [{"t": 3.1}, {"t": 7.0}], frames)
        self.assertEqual((d["reveal_hits"], d["hero_hits"]), (2, 1))
        self.assertEqual(d["locked_pct"], 75.0)
        self.assertEqual(round(s, 1), 93.8)
        self.assertIsNone(wp.score_beat_lock(None, [], frames)[0])

    def test_total_over_measured_weight(self):
        gates = {gid: wp.gate(gid, measured=False, reason="x") for gid in wp.GATES}
        sc = wp.build_scorecard("marketing", gates, {}, [], None, None)
        self.assertIsNone(sc["total"])
        frames = sb()["frames"]
        gates["QA-10"] = wp.eval_qa10(frames, None)
        gates["QA-13"] = wp.eval_qa13(frames, 43.5)
        gates["QA-04"] = wp.eval_qa04(frames, "sales", "early")
        gates["QA-05"] = wp.eval_qa05(frames, "sales")
        sc = wp.build_scorecard("sales", gates, {}, frames, None, None)
        self.assertEqual(sc["measured_weight"], 15 + 15 + 10 + 5)
        self.assertTrue(0 <= sc["total"] <= 100)


class QaMdAndSrt(unittest.TestCase):
    def test_waivers_and_srt(self):
        with tempfile.TemporaryDirectory() as td:
            base = Path(td)
            (base / "QA").mkdir()
            (base / "QA" / "s.png").write_bytes(b"png")
            qa = base / "QA.md"
            qa.write_text("# QA\n\n## Waivers\n\n- QA-02 frames/03.html: stacked IDE windows are intentional (snapshot: QA/s.png)\n- QA-13: end card 4.4 s for the investors cut (snapshot: QA/missing.png)\n")
            w = wp.parse_qa_md(qa, base)
            self.assertEqual([x["gate"] for x in w], ["QA-02", "QA-13"])
            self.assertEqual(w[0]["subject"], "frames/03.html")
            self.assertTrue(w[0]["snapshot_exists"])
            self.assertFalse(w[1]["snapshot_exists"])
            srt = base / "en.srt"
            srt.write_text("1\n00:00:00,000 --> 00:00:01,000\nHello there\n\n2\n00:00:01,000 --> 00:00:01,400\nA line that is way too long for its 0.4 seconds of screen time\n\n")
            cues = wp.parse_srt(srt)
            self.assertEqual(len(cues), 2)
            g = wp.eval_qa10([], cues)
            self.assertFalse(g["pass"])
            self.assertEqual(len(g["details"]["caption_violations"]), 1)


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "ffmpeg not installed")
class Keyframes(unittest.TestCase):
    def test_stale_set_removed_and_portrait_kept_upright(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            video = tmp / "v.mp4"
            subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc=size=108x192:rate=10:duration=1", "-pix_fmt", "yuv420p", str(video)], check=True)
            out = tmp / "frames"
            out.mkdir()
            (out / "07-at-29.11s.png").write_bytes(b"stale")
            (out / "notes.txt").write_text("kept")
            files = wp.extract_keyframes(video, [{"t": 0.2, "why": "a"}, {"t": 0.6, "why": "b"}], out)
            self.assertEqual(sorted(p.name for p in out.iterdir()), ["00-at-0.20s.png", "01-at-0.60s.png", "notes.txt"])
            self.assertEqual(len(files), 2)
            dims = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", files[0]["file"]], capture_output=True, text=True).stdout.strip()
            self.assertEqual(dims, "540,960")
            sheet = wp.build_contact_sheet(video, 1.0, tmp / "sheet.png", portrait=True)
            self.assertEqual((sheet["tile"], sheet["width"]), ([180, 320], 180 * wp.SHEET_COLUMNS))


class KeyframeTimes(unittest.TestCase):
    def test_twelve_scenes_keep_the_ending(self):
        takes = [2.261, 2.048, 2.944, 4.949, 5.632, 2.837, 6.336, 5.163, 3.307, 4.288, 3.605, 2.496]
        frames, t = [], 0.0
        for i, d in enumerate(takes, 1):
            frames.append({"index": i, "start": t, "duration": d})
            t += d
        picks = wp.keyframe_times(t, frames, [])
        whys = [p["why"] for p in picks]
        self.assertEqual(len(picks), 12)
        self.assertEqual(whys[:2], ["frame0", "+0.5s"])
        self.assertIn("mid frame 12", whys)
        self.assertIn("mid frame 11", whys)
        self.assertNotIn("mid frame 1", whys, "the hook is already shown at 0 s and 0.5 s")
        self.assertEqual(picks, sorted(picks, key=lambda p: p["t"]))

    def test_short_video_fills_with_cuts(self):
        frames = [{"index": 1, "start": 0.0, "duration": 3.0}, {"index": 2, "start": 3.0, "duration": 3.0}]
        whys = [p["why"] for p in wp.keyframe_times(6.0, frames, [{"t": 3.0}])]
        self.assertEqual(whys, ["frame0", "+0.5s", "mid frame 1", "cut-0.2 @3.0", "cut+0.2 @3.0", "mid frame 2"])

    def test_spread_keeps_first_and_last(self):
        self.assertEqual(wp._spread(list(range(11)), 10), [0, 1, 2, 3, 4, 6, 7, 8, 9, 10])
        self.assertEqual(wp._spread([1, 2, 3], 5), [1, 2, 3])
        self.assertEqual(wp._spread([1, 2, 3], 1), [3])


def load_tests(loader, tests, pattern):
    import test_wowprobe_roles

    tests.addTests(loader.loadTestsFromModule(test_wowprobe_roles))
    return tests


if __name__ == "__main__":
    unittest.main()

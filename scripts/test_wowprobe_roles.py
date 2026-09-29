#!/usr/bin/env python3
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import wowprobe as wp
from test_wowprobe import STORYBOARD


def messages(sb: dict) -> list[str]:
    return [w["message"] for w in sb["warnings"]]


class GateRoles(unittest.TestCase):

    def test_vocabulary_is_the_contract_list(self):
        self.assertEqual(wp.GATE_ROLES, ("hook", "ui", "demo", "recording", "terminal", "code", "api", "diagram", "design", "file", "outcome", "metric", "cta"))

    def test_pain_point_fixture_warns_once(self):
        s = wp.parse_storyboard(STORYBOARD)
        self.assertEqual([f["role"] for f in s["frames"]], ["hook", "pain_point", "ui", "outcome", "cta"])
        role_warnings = [m for m in messages(s) if "not a gate role" in m]
        self.assertEqual(len(role_warnings), 1, messages(s))
        self.assertTrue(role_warnings[0].startswith('Frame 2: role "pain_point" is not a gate role (hook|ui|'), role_warnings[0])
        self.assertIn("no gate counts this frame", role_warnings[0])
        self.assertEqual([w["frameIndex"] for w in s["warnings"] if "not a gate role" in w["message"]], [2])

    def test_missing_role_is_silent_and_misspelt_role_is_named(self):
        s = wp.parse_storyboard(
            "## Frame 1 — Hook\n- duration: 3s\n- role: hook\n\n"
            "## Frame 2 — Team\n- duration: 3s\n\n"
            "## Frame 3 — Product\n- duration: 4s\n- role: Product-UI\n\n"
            "## Frame 4 — End card\n- duration: 3s\n- role: cta\n"
        )
        self.assertEqual([f["role"] for f in s["frames"]], ["hook", None, "product-ui", "cta"])
        self.assertEqual([m for m in messages(s) if "gate role" in m], [m for m in messages(s) if m.startswith('Frame 3: role "product-ui"')])
        self.assertEqual(len([m for m in messages(s) if "gate role" in m]), 1)
        self.assertFalse(wp.eval_qa04(s["frames"], "marketing", "early")["pass"])
        self.assertEqual(wp.role_share(s["frames"], wp.PRODUCT_ROLES, None), 0.0)

    def test_every_gate_role_is_accepted(self):
        md = "".join(f"## Frame {i} — F{i}\n- duration: 3s\n- role: {r}\n\n" for i, r in enumerate(wp.GATE_ROLES, 1))
        self.assertEqual([m for m in messages(wp.parse_storyboard(md)) if "gate role" in m], [])


class FrameHeadings(unittest.TestCase):

    GS03_FIRST_DRAFT = (
        "---\nduration: 10s\naudience: marketing\n---\n\n"
        "## Video direction\n\nRules that bind every frame.\n\n"
        "### Beat grid (music-first)\n\n- 120 bpm, reveals on the downbeat\n\n"
        "## Frame 1 — Hook\n\n- duration: 3s\n- role: hook\n- text: \"Ship the CLI in 3 steps\" @ 0.3-2.9\n\n"
        "## Frame 2 — Terminal\n\n- duration: 4s\n- role: terminal\n\n"
        "## Frame 3 — End card\n\n- duration: 3s\n- role: cta\n"
    )

    def test_beat_grid_section_is_not_a_phantom_frame(self):
        s = wp.parse_storyboard(self.GS03_FIRST_DRAFT)
        self.assertEqual(len(s["frames"]), 3)
        self.assertEqual([f["number"] for f in s["frames"]], [1, 2, 3])
        self.assertEqual([f["role"] for f in s["frames"]], ["hook", "terminal", "cta"])
        self.assertEqual([f["start"] for f in s["frames"]], [0.0, 3.0, 7.0])
        grid = [w for w in s["warnings"] if w["message"].startswith('Heading "### Beat grid')]
        self.assertEqual(len(grid), 1, messages(s))
        self.assertIn("vendor storyboard parser", grid[0]["message"])
        self.assertEqual(grid[0]["line"], 10)
        self.assertFalse(any("no duration" in m for m in messages(s)), "the section is no longer a frame without a duration")
        self.assertFalse(any("contract form" in m for m in messages(s)))

    def test_numbered_beat_and_scene_headings_count_but_warn(self):
        s = wp.parse_storyboard("### Scene 1: Intro\n- duration: 2s\n- role: hook\n\n### Beat 2 — Next\n- duration: 2s\n\n## Frame 3 — Last\n- duration: 2s\n")
        self.assertEqual(len(s["frames"]), 3)
        form = [w["frameIndex"] for w in s["warnings"] if "contract form" in w["message"]]
        self.assertEqual(form, [1, 2])

    def test_multi_digit_frame_numbers(self):
        md = "".join(f"## Frame {i} — F{i}\n- duration: 1s\n\n" for i in range(1, 13))
        s = wp.parse_storyboard(md)
        self.assertEqual([f["number"] for f in s["frames"]], list(range(1, 13)))
        self.assertEqual([f["title"] for f in s["frames"]][-1], "F12")
        self.assertEqual(s["warnings"], [])

    def test_untitled_frame_heading_warns(self):
        s = wp.parse_storyboard("## Frame 1\n- duration: 3s\n")
        self.assertEqual(len(s["frames"]), 1)
        self.assertEqual(len([m for m in messages(s) if "contract form" in m]), 1)


class CaptureHold(unittest.TestCase):

    MD = (
        "## Frame 1 — Hook\n- duration: 3s\n- role: hook\n\n"
        "## Frame 2 — Footage\n- duration: 5s\n- role: ui\n- capture_window: 0-2\n- capture_hold: 3\n"
        "- capture_drift: 0.5,0.5 1.5 @ 2.0-5.0\n\n"
        "## Frame 3 — Footage, implied hold\n- duration: 4s\n- role: ui\n- capture_window: 10.0-11.5\n\n"
        "## Frame 4 — Plain\n- duration: 4s\n- role: ui\n- hold: 1.0\n\n"
        "## Frame 5 — End card\n- duration: 3s\n- role: cta\n"
    )

    def test_tail_on_the_absolute_timeline(self):
        frames = wp.parse_storyboard(self.MD)["frames"]
        self.assertEqual([wp.capture_tail_hold(f) for f in frames], [0.0, 3.0, 2.5, 0.0, 0.0])
        g = wp.eval_qa07([], None, 19.0, frames)
        self.assertEqual(g["details"]["declared_holds"], [[5.0, 8.0], [9.5, 12.0], [12.0, 13.0], [16.0, 19.0]])
        self.assertEqual([(s["frame"], s["kind"]) for s in g["details"]["declared_hold_sources"]],
                         [(2, "capture_hold"), (3, "capture_hold"), (4, "hold"), (5, "end_card")])

    def test_held_tail_is_not_counted_as_frozen(self):
        frames = wp.parse_storyboard(self.MD)["frames"]
        freezes = [{"start": 5.1, "end": 8.0, "duration": 2.9}]
        g = wp.eval_qa07(freezes, None, 19.0, frames)
        self.assertTrue(g["pass"], g["details"])
        self.assertEqual(g["details"]["windows"][0]["counted_sec"], 0.0)
        plain = wp.parse_storyboard(self.MD.replace("- capture_window: 0-2\n- capture_hold: 3\n", ""))["frames"]
        g = wp.eval_qa07(freezes, None, 19.0, plain)
        self.assertFalse(g["pass"])
        self.assertEqual(g["details"]["windows"][0]["counted_sec"], 2.9)

    def test_capture_hold_longer_than_the_frame_shows_only_the_frame(self):
        f = wp.parse_storyboard("## Frame 1 — F\n- duration: 4s\n- role: ui\n- capture_window: 0-2\n- capture_hold: 3\n")["frames"][0]
        self.assertEqual(wp.capture_tail_hold(f), 2.0)

    def test_invalid_or_missing_window_declares_nothing(self):
        for window in ("", "3-2", "a-b", "1.2.3-4"):
            md = "## Frame 1 — F\n- duration: 5s\n- role: ui\n" + (f"- capture_window: {window}\n" if window else "") + "- capture_hold: 3\n"
            self.assertEqual(wp.capture_tail_hold(wp.parse_storyboard(md)["frames"][0]), 0.0, window)

    def test_overlapping_declarations_subtract_once(self):
        frames = wp.parse_storyboard("## Frame 1 — Still\n- duration: 6s\n- role: ui\n- hold: true\n- capture_window: 0-2\n\n## Frame 2 — X\n- duration: 6s\n- role: ui\n")["frames"]
        freezes = [{"start": 4.0, "end": 9.0, "duration": 5.0}]
        g = wp.eval_qa07(freezes, None, 12.0, frames)
        self.assertEqual(g["details"]["windows"][0]["declared_hold_sec"], 2.0)
        self.assertEqual(g["details"]["windows"][0]["counted_sec"], 3.0)


class HookSpeedFullMarks(unittest.TestCase):

    MARKETING_45 = (
        "---\nduration: 45s\naudience: marketing\nreveal: early\n---\n\n"
        "## Frame 1 — Hook\n- duration: 3s\n- role: hook\n- text: \"Close the books in 3 days\" @ 0.2-3.0\n\n"
        "## Frame 2 — Result\n- duration: 2s\n- role: metric\n- text: \"3.1 days average close\" @ 0.2-1.9\n\n"
        + "".join(f"## Frame {n} — Product {n - 2}\n- duration: 5s\n- role: {r}\n\n" for n, r in zip(range(3, 9), ("ui", "ui", "demo", "ui", "recording", "ui")))
        + "## Frame 9 — Outcome\n- duration: 6s\n- role: outcome\n- text: \"Month-end in 3 days, not 12\" @ 0.5-2.5\n\n"
        "## Frame 10 — End card\n- duration: 4s\n- role: cta\n- cta: \"Start my free trial\" @ 0.4-2.9\n- order: logo -> tagline -> URL\n- stagger: 0.4s\n"
    )

    def test_rules_compliant_storyboard_scores_100(self):
        s = wp.parse_storyboard(self.MARKETING_45)
        frames = s["frames"]
        self.assertEqual(s["warnings"], [])
        self.assertEqual(s["planned_duration"], 45.0)
        product = [f for f in frames if f["role"] in wp.PRODUCT_ROLES]
        self.assertEqual(len(product), 6)
        self.assertTrue(all(f["duration"] >= 3 for f in product))
        holds = [t["end"] - t["start"] for f in frames for t in f["texts"]]
        self.assertEqual(max(holds), frames[0]["texts"][0]["end"] - frames[0]["texts"][0]["start"])
        self.assertLessEqual(wp.eval_qa03(None, frames)["details"]["hook_visible_at_sec"], 3.0)
        gates = {
            "QA-04": wp.eval_qa04(frames, "marketing", "early"),
            "QA-05": wp.eval_qa05(frames, "marketing"),
            "QA-10": wp.eval_qa10(frames, None),
            "QA-13": wp.eval_qa13(frames, 45.0),
        }
        for gid, g in gates.items():
            self.assertTrue(g["pass"], (gid, g.get("details")))
        self.assertTrue(wp.eval_qa09(wp.declared_cuts(frames), 45.0, "marketing", frames)["pass"])
        sc = wp.build_scorecard("marketing", gates, {}, frames, None, None)
        self.assertEqual(sc["metrics"]["hook_speed"]["score"], 100.0)
        self.assertNotIn("full_marks_path", sc["metrics"]["hook_speed"])

    def test_every_frame_3s_reading_caps_at_75_and_names_the_path(self):
        score, detail = wp.score_hook_speed("marketing", 6.0, 3.0)
        self.assertEqual(score, 75.0)
        self.assertIn("", detail["full_marks_path"])
        self.assertIn("full_marks_path", wp.score_hook_speed("sales", None, 3.0)[1])
        self.assertNotIn("full_marks_path", wp.score_hook_speed("investors", None, 30.0)[1])

    def test_numbers_and_weight_unchanged(self):
        self.assertEqual(wp.SCORECARD_WEIGHTS["hook_speed"]["weight"], 15)
        self.assertTrue(wp.SCORECARD_WEIGHTS["hook_speed"]["full_marks"].startswith("≤ 4 s to first outcome, linear to 0 at 12 s"))
        self.assertEqual(wp.score_hook_speed("marketing", 4.0, None)[0], 100.0)
        self.assertEqual(wp.score_hook_speed("marketing", 12.0, None)[0], 0.0)


if __name__ == "__main__":
    unittest.main()


class ExplainerMarkers(unittest.TestCase):

    def markers(self, md):
        sb = wp.parse_storyboard(md)
        return sorted({m["marker"] for m in wp.explainer_markers(sb["frames"], sb["globals"])})

    def test_each_marker(self):
        md = """---
music: pack:vol-10
---
## Frame 1 — Logo sting
- duration: 2s
- scene: logo animation intro
## Frame 2 — Dashboard
- duration: 4s
- role: ui
- evidence_tier: C
- scene: a mock-up of the dashboard with stock footage behind it
## Frame 3 — Settings
- duration: 3s
- role: ui
- scene: a screenshot of the settings page, linear ease in
## Frame 4 — Close the books (STAR)
- duration: 4s
- voiceover: "Close the books in three days"
- text: "Close the books in three days" @ 0.2-3.5
## Frame 5 — Reveal
- duration: 3s
- beat: star
"""
        self.assertEqual(self.markers(md), sorted(["logo-sting", "stock", "fake-ui", "static-screenshot", "linear-easing", "voice-reads-screen", "multiple-reveals", "flat-bed"]))

    def test_clean_storyboard_and_declared_dropout(self):
        md = """---
music: pack:vol-10
---
## Frame 1 — Hook
- duration: 3s
- role: hook
- text: "Who sent you visitors?" @ 0.2-2.6
- voiceover: "One click shows where they came from."
## Frame 2 — Live dashboard (STAR)
- duration: 4s
- role: ui
- evidence_tier: A
- capture_window: 0-4
- dropout: 0.4
"""
        self.assertEqual(self.markers(md), [])
        self.assertIn("flat-bed", self.markers(md.replace("- dropout: 0.4\n", "")))
        self.assertEqual(self.markers(md.replace("music: pack:vol-10", "music: none").replace("- dropout: 0.4\n", "")), [])


class ProductSpineMarkers(unittest.TestCase):

    def markers(self, md, mode="marketing"):
        sb = wp.parse_storyboard(md)
        return {m["marker"]: m["message"] for m in wp.explainer_markers(sb["frames"], sb["globals"], mode)}

    CUT = """---\nmusic: none\n---
## Frame 1 — Hook
- duration: 2.8s
- role: hook
## Frame 2 — Promise
- duration: 2.0s
- role: outcome
## Frame 3 — First screen
- duration: 3.3s
- role: ui
- evidence_tier: A
- capture_window: 4.3-5.8
## Frame 4 — The action
- duration: 5.3s
- role: demo
- evidence_tier: A
- capture_window: 6.6-11.9
## Frame 5 — The result
- duration: 5.0s
- role: ui
- evidence_tier: B
## Frame 6 — A number
- duration: 3.5s
- role: metric
## Frame 7 — Named alternative
- duration: 3.5s
## Frame 8 — End card
- duration: 3.5s
- role: cta
"""

    def test_undeclared_and_card_share_never_counts(self):
        m = self.markers(self.CUT)
        self.assertEqual(set(m), {"essence-gap"})
        self.assertIn("no frame declares `essence:`", m["essence-gap"])
        self.assertEqual(self.markers(self.CUT, None), {}, "no mode, no spine check (the markers only)")
        self.assertNotIn("type-heavy", wp.EXPLAINER_MARKERS, "no card-share ceiling: the has only the product-share floor")

    def test_essence_coverage(self):
        md = self.CUT.replace("- role: hook\n", "- role: hook\n- essence: E1\n").replace("- capture_window: 6.6-11.9\n", "- capture_window: 6.6-11.9\n- essence: E2\n")
        self.assertIn("E3, E4", self.markers(md)["essence-gap"])
        md2 = md.replace("- role: metric\n", "- role: metric\n- essence: E3, E4\n")
        self.assertIn("E3 on a product frame", self.markers(md2)["essence-gap"])
        md3 = md2.replace("- essence: E3, E4\n", "- essence: E4\n").replace("## Frame 5 — The result\n- duration: 5.0s\n", "## Frame 5 — The result\n- duration: 5.0s\n- essence: E3\n")
        self.assertEqual(self.markers(md3), {})
        self.assertEqual(self.markers(md3, "investors"), {}, "the same test in every mode")


class EntranceNotes(unittest.TestCase):
    def test_entrance_durations_are_notes_not_failures(self):
        tw = lambda sel, d, o0, o1: {"selector": sel, "props": ["opacity", "y"], "duration": d, "ease": "power3.out",
                                      "bboxes": [{"opacity": o0}, {"opacity": o1}], "flags": []}
        notes = wp._m02_entrance_notes([tw("#f01-a", 0.25, 0, 1), tw("#f01-b", 0.45, 0, 1), tw("#f01-c", 1.4, 0, 1), tw("#f01-d", 1.4, 1, 0)])
        self.assertEqual([n["selector"] for n in notes], ["#f01-a", "#f01-c"])
        g = wp.eval_qa11({"tweens": [tw("#f01-c", 1.4, 0, 1), tw("#f01-e", 0.5, 0, 1)], "staggers": []}, None)
        self.assertEqual(len(g["details"]["m02_notes"]), 1)


class CraftLint(unittest.TestCase):

    def gates(self, kinds, tweens, warning_codes):
        g11 = {"measured": True, "details": {"flag_count": sum(kinds.values()), "flags_by_kind": kinds, "tweens": tweens}}
        g02 = {"measured": True, "details": {"warnings": sum(warning_codes.values()), "warning_codes": warning_codes}}
        return g02, g11

    def test_collisions_and_pipeline_warnings_do_not_count(self):
        s, d = wp.craft_lint_score(*self.gates({"collision": 175, "paced-slow": 12, "paced-fast": 10, "offscreen": 2, "degenerate": 1}, 192,
                                                {"composition_file_too_large": 1, "clip_media_fit": 2}))
        self.assertAlmostEqual(s, 96.35, places=1)
        self.assertEqual((d["weighted_flags"], d["check_warnings"], d["check_warnings_excluded"]), (14.0, 0, 3))

    def test_real_warnings_and_offscreen_cost(self):
        s, _ = wp.craft_lint_score(*self.gates({"collision": 136, "offscreen": 11, "paced-fast": 2, "paced-slow": 11, "degenerate": 1}, 169,
                                                {"clip_media_fit": 1, "contrast_aa_failure": 2}))
        self.assertAlmostEqual(s, 84.53, places=1)
        self.assertEqual(wp.craft_lint_score(*self.gates({"mystery": 40}, 100, {}))[0], 80.0, "an unknown flag kind weighs 1")
        self.assertEqual(wp.craft_lint_score(*self.gates({"offscreen": 100}, 10, {}))[0], 0.0, "still floors at 0")

#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as _dt
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SCHEMA = "power-presentation/wowprobe@0.1"

EXIT_OK = 0
EXIT_RUNTIME = 1
EXIT_USAGE = 2
EXIT_GATES_FAILED = 3

OWNER_FFMPEG = "ffmpeg"
OWNER_STORYBOARD = "storyboard"
OWNER_HYPERFRAMES = "hyperframes"

GATES: dict[str, dict] = {
    "QA-01": {
        "rule": "Duration",
        "owner": OWNER_FFMPEG,
        "measure": "ffprobe format=duration",
        "threshold": {"brief_tolerance_pct": 3, "band": "destination band (see length bands)"},
        "hard": True,
        "note": "±3 % is hard; the destination band is a default",
    },
    "QA-02": {
        "rule": "Composition valid",
        "owner": OWNER_HYPERFRAMES,
        "measure": "hyperframes check --json --frame-check",
        "threshold": {"ok": True, "errors_after_triage": 0},
        "hard": True,
        "note": "waiver via data-layout-allow-* must cite a snapshot in QA.md",
    },
    "QA-03": {
        "rule": "Hook ≤ 3 s",
        "owner": OWNER_FFMPEG,
        "measure": "wowprobe.py signalstats + role `hook` in STORYBOARD.md",
        "threshold": {"hook_visible_by_sec": 3.0, "black_open_yavg_max": 26, "black_open_window_sec": 1.0},
        "hard": True,
        "note": "no black frame (YAVG < 26/255) without an element in the first second",
    },
    "QA-04": {
        "rule": "First product frame",
        "owner": OWNER_STORYBOARD,
        "measure": "frame role in STORYBOARD.md + critic labels",
        "threshold": {"marketing_sec": 5, "sales_sec": 5, "investors_sec": 10, "story_first_max_sec": 25},
        "hard": False,
        "note": "investors 10 s comes from research G6 (vendor data), retuned on the golden set",
    },
    "QA-05": {
        "rule": "First outcome",
        "owner": OWNER_STORYBOARD,
        "measure": "role outcome|metric",
        "threshold": {"marketing_sec": 12, "sales_sec": 12, "investors_sec": 20},
        "hard": False,
    },
    "QA-06": {
        "rule": "Motion sidecar",
        "owner": OWNER_HYPERFRAMES,
        "measure": "*.motion.json via `check`",
        "threshold": {"hero_appears_by_sec": 0.5, "max_static_sec": 2.0, "motion_findings": 0},
        "hard": True,
        "note": "end card ceiling is QA-13, not maxStaticSec",
    },
    "QA-07": {
        "rule": "Frozen share",
        "owner": OWNER_FFMPEG,
        "measure": "freezedetect=n=0.001:d=1.0",
        "threshold": {"frozen_pct_max": 25, "window_sec_max": 2.5},
        "hard": False,
        "note": "declared holds are subtracted; end card measured by QA-13",
    },
    "QA-08": {
        "rule": "Loudness",
        "owner": OWNER_FFMPEG,
        "measure": "ebur128=peak=true (EBU R 128-2023) on the master, not a transcode",
        "threshold": {
            "tolerance_lu": 1,
            "true_peak_dbtp_max": -1,
            "targets_lufs": {"social_vo": -14, "vo_premium_investors": [-16, -18], "music_only_cinematic": [-18, -20]},
        },
        "hard": True,
    },
    "QA-09": {
        "rule": "Cadence",
        "owner": OWNER_FFMPEG,
        "measure": "gt(scene,0.25) in wowprobe.py",
        "threshold": {"asl_sec": {"marketing": [2, 6], "sales": [4, 8], "investors": [4, 8]}, "shot_max_sec": 12},
        "hard": False,
        "note": "a declared continuous camera is exempt from the 12 s shot cap",
    },
    "QA-10": {
        "rule": "Reading floor",
        "owner": OWNER_STORYBOARD,
        "measure": "STORYBOARD.md timeline",
        "threshold": {
            "min_sec": 1.2,
            "cps": {"en": 20},
            "max_chars_per_line": 42,
            "max_lines": 2,
        },
        "hard": True,
        "note": "text >= max(1.2 s, chars / 20 cps) — English only",
    },
    "QA-11": {
        "rule": "Easing lint",
        "owner": OWNER_HYPERFRAMES,
        "measure": "animation-map.mjs",
        "threshold": {"linear_on_in_out": 0, "tweens_under_sec": 0.2, "min_distinct_easings": 3, "stagger_tolerance_pct": 20},
        "hard": False,
        "note": "back.out only under register: playful",
    },
    "QA-12": {
        "rule": "Truth of numbers",
        "owner": OWNER_STORYBOARD,
        "measure": "regex over the storyboard and frame HTML",
        "threshold": {"every_visible_number_in_claims_with_source": True},
        "hard": True,
    },
    "QA-13": {
        "rule": "End card",
        "owner": OWNER_STORYBOARD,
        "measure": "last frame of STORYBOARD.md",
        "threshold": {
            "duration_sec": [2.5, 4.0],
            "max_share_pct_when_runtime_ge_45s": 12,
            "abs_max_sec_for_10_30s": 4,
            "cta_min_sec": 2.5,
            "order": "logo -> tagline -> URL",
            "stagger_sec": 0.4,
        },
        "hard": False,
    },
    "QA-14": {
        "rule": "Contrast, captions, fonts",
        "owner": OWNER_HYPERFRAMES,
        "measure": "check --caption-zone + glyph probe",
        "threshold": {
            "contrast_ratio_min": 4.5,
            "contrast_ratio_large_text_min": 3.0,
            "caption_keepout_y_min": 0.82,
            "fonts_check_face_x_script": True,
            "whisper_language_flag_required_when_lang_not_en": True,
        },
        "hard": True,
    },
}

SCORECARD_WEIGHTS: dict[str, dict] = {
    "hook_speed": {"weight": 15, "full_marks": "≤ 4 s to first outcome, linear to 0 at 12 s; investors: product ≤ 10 s -> 100, 0 at 25 s"},
    "product_share": {"weight": 15, "full_marks": "≥ 50 % sales, ≥ 35 % marketing, ≥ 40 % investors"},
    "liveliness": {"weight": 15, "full_marks": "100 - 2 × frozen %"},
    "cadence": {"weight": 10, "full_marks": "ASL inside the QA-09 band and shot ≤ 12 s; -10 per second outside"},
    "beat_lock": {"weight": 10, "full_marks": "≥ 80 % of reveals within ±0.15 s and hero entrances within ±0.10 s of a cue"},
    "loudness": {"weight": 10, "full_marks": "within QA-08 tolerance; -10 per LU; 0 when TP > 0"},
    "reading_comfort": {"weight": 10, "full_marks": "100 - 10 × reading-floor violations (QA-10)"},
    "craft_lint": {"weight": 10, "full_marks": "100 - 5 × (weighted animation-map flags per 10 tweens + check warnings the pipeline does not cause) — owner decision 2026-09-27 on the formula 100 - 5 × (flags + warnings)"},
    "ending_discipline": {"weight": 5, "full_marks": "end card per QA-13; otherwise 50/0"},
}

PRODUCT_ROLES = ("ui", "demo", "recording", "terminal", "code", "api", "diagram", "design", "file")
OUTCOME_ROLES = ("outcome", "metric")
GATE_ROLES = ("hook",) + PRODUCT_ROLES + OUTCOME_ROLES + ("cta",)
PRODUCT_SHARE_TARGET_PCT = {"sales": 50, "marketing": 35, "investors": 40}
MODES = ("marketing", "sales", "investors")

LENGTH_BANDS: dict[str, tuple[float, float]] = {
    "social": (15, 30),
    "social-x": (15, 45),
    "social-linkedin": (30, 90),
    "hero-loop": (10, 20),
    "product-hunt": (30, 75),
    "hero-launch": (45, 90),
    "sales-outreach": (30, 60),
    "investors-demo": (60, 120),
    "data-room": (10, 180),
}
DEFAULT_DESTINATION = {"marketing": "hero-launch", "sales": "sales-outreach", "investors": "investors-demo"}
PLUGIN_LENGTH_RANGE = (10, 180)

BEAT_LOCK = {"reveal_tolerance_sec": 0.15, "hero_tolerance_sec": 0.10, "full_marks_pct": 80}

ANALYSIS_WIDTH = 480
SHEET_COLUMNS = 6
SHEET_TILE = (320, 180)
KEYFRAME_SIZE = (960, 540)
KEYFRAME_COUNT = 12

USAGE_EPILOG = (
    "Exit codes: 0 every measured gate passed · 3 a measured gate failed (see gates_failed) · 1 runtime · 2 usage.\n"
    "Pre-render: --storyboard [--check --animation-map --claims]. Post-render: add --video (the master).\n"
    "Output schema: {gates_failed: [], not_measured: {QA-xx: reason}, gates: {QA-xx: {pass, measured, value, threshold, type}},\n"
    "               waivers: [{gate, snapshot, reason, qa_md}], brief_overrides: [], scorecard: {total, metrics}, measurements: {...}}"
)


def _num(text: str) -> float | None:
    m = re.search(r"-?\d+(?:\.\d+)?", text or "")
    return float(m.group(0)) if m else None


def _round(x: float | None, nd: int = 3) -> float | None:
    return None if x is None else round(float(x), nd)


def ffmpeg_bin() -> str:
    return os.environ.get("HYPERFRAMES_FFMPEG_PATH") or "ffmpeg"


def ffprobe_bin() -> str:
    return os.environ.get("HYPERFRAMES_FFPROBE_PATH") or "ffprobe"


class ProbeError(RuntimeError):
    pass


def _run(cmd: list[str], *, timeout: int = 600) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=False)
    except FileNotFoundError as e:
        raise ProbeError(f"{cmd[0]} not found on PATH (HYPERFRAMES_FFMPEG_PATH / _FFPROBE_PATH honoured): {e}") from e
    except subprocess.TimeoutExpired as e:
        raise ProbeError(f"{cmd[0]} timed out after {timeout} s") from e


FRAME_HEADING_RE = re.compile(r"^(#{2,3})[ \t]+(?:frame|beat|scene)(?=[ \t]+\d)", re.IGNORECASE)
VENDOR_FRAME_HEADING_RE = re.compile(r"^(#{2,3})[ \t]+(?:frame|beat|scene)\b", re.IGNORECASE)
CONTRACT_FRAME_HEADING_RE = re.compile(r"^##[ \t]+Frame[ \t]+\d+[ \t]*[—–-]+")
HEADING_LEVEL_RE = re.compile(r"^(#{1,6})\s+")
META_RE = re.compile(r"^\s*[-*]\s+([A-Za-z_][\w-]*)\s*:\s*(.+?)\s*$")
TEXT_RE = re.compile(r'^\s*[-*]\s+(text|cta)\s*:\s*(.+?)\s*$', re.IGNORECASE)
TEXT_TIMING_RE = re.compile(
    r"""^\s*(?:"(?P<q>.*?)"|'(?P<s>.*?)'|(?P<bare>.*?))\s*@\s*(?P<a>\d+(?:\.\d+)?)\s*(?:(?P<plus>\+)\s*(?P<b>\d+(?:\.\d+)?)|[-–—]\s*(?P<c>\d+(?:\.\d+)?))?\s*s?\s*$"""
)
TRANSITION_KEYS = {"transition_in", "transitionin", "transition"}
SCENE_KEYS = {"scene", "description", "summary", "caption"}
VOICEOVER_KEYS = {"voiceover", "vo", "voice_over", "narration"}


def _strip_quotes(v: str) -> str:
    if len(v) >= 2 and ((v[0] == '"' and v[-1] == '"') or (v[0] == "'" and v[-1] == "'")):
        return v[1:-1]
    return v


def _truthy(v) -> bool:
    return str(v).strip().lower() in {"true", "yes", "1", "on"}


def parse_text_entry(raw: str, kind: str, frame_duration: float | None) -> dict | None:
    m = TEXT_TIMING_RE.match(raw)
    if m:
        text = m.group("q") if m.group("q") is not None else (m.group("s") if m.group("s") is not None else m.group("bare"))
        start = float(m.group("a"))
        if m.group("plus"):
            end = start + float(m.group("b"))
        elif m.group("c") is not None:
            end = float(m.group("c"))
        else:
            end = frame_duration if frame_duration is not None else None
        timed = True
    else:
        text = _strip_quotes(raw.strip())
        start, end, timed = 0.0, frame_duration, False
    text = text.strip()
    if not text:
        return None
    lines = [ln.strip() for ln in re.split(r"\s/\s|\\n", text) if ln.strip()]
    flat = " ".join(lines)
    return {
        "kind": kind,
        "text": flat,
        "lines": lines,
        "chars": len(flat),
        "words": len(flat.split()),
        "start": start,
        "end": end,
        "timed": timed,
    }


def parse_storyboard(source: str) -> dict:
    warnings: list[dict] = []
    lines = source.split("\n")
    i = 0
    while i < len(lines) and lines[i].strip() == "":
        i += 1
    globals_: dict = {"extra": {}}
    body_start = 0
    if i < len(lines) and lines[i].strip() == "---":
        end = None
        for j in range(i + 1, len(lines)):
            if lines[j].strip() == "---":
                end = j
                break
        if end is None:
            warnings.append({"message": "Frontmatter opening '---' has no closing '---'; treating whole file as body.", "line": i + 1})
        else:
            for j in range(i + 1, end):
                raw = lines[j]
                if raw.strip() == "":
                    continue
                if ":" not in raw:
                    warnings.append({"message": f'Ignored non key:value frontmatter line: "{raw.strip()}"', "line": j + 1})
                    continue
                k, v = raw.split(":", 1)
                globals_[k.strip().lower()] = _strip_quotes(v.strip())
            body_start = end + 1
    sections: list[dict] = []
    current: dict | None = None
    for n in range(body_start, len(lines)):
        line = lines[n]
        m = FRAME_HEADING_RE.match(line)
        if m:
            heading = line[m.end():]
            heading = re.sub(r"^[\s.:—-]+", "", heading).strip()
            current = {"heading": heading, "raw": line.strip(), "line": n + 1, "level": len(m.group(1)), "lines": []}
            sections.append(current)
            continue
        if VENDOR_FRAME_HEADING_RE.match(line):
            warnings.append({"message": f'Heading "{line.strip()}" has no frame number, so it is not a frame here — but the vendor storyboard parser (assemble-index, audio, captions, transitions) opens a frame on any ##/### heading that starts with Frame, Beat or Scene, which shifts every frame index after it; rename it.', "line": n + 1})
        h = HEADING_LEVEL_RE.match(line)
        if current is not None and h and len(h.group(1)) <= current["level"]:
            current = None
            continue
        if current is not None:
            current["lines"].append(line)

    frames: list[dict] = []
    for idx, sec in enumerate(sections, start=1):
        frame: dict = {
            "index": idx,
            "number": None,
            "title": None,
            "status": "outline",
            "duration": None,
            "start": None,
            "start_declared": False,
            "src": None,
            "poster": None,
            "scene": None,
            "voiceover": None,
            "role": None,
            "beat": None,
            "scene_type": None,
            "evidence_tier": None,
            "reconstructed": False,
            "speed": None,
            "continuous_camera": False,
            "hold": None,
            "texts": [],
            "order": None,
            "stagger": None,
            "extra": {},
            "narrative": "",
            "line": sec["line"],
        }
        if not CONTRACT_FRAME_HEADING_RE.match(sec["raw"]):
            warnings.append({"message": f'Frame {idx}: heading "{sec["raw"]}" is counted as a frame, but it is not the contract form `## Frame <N> — <title>` — the frame packets split only on `## Frame`, and render-path / run-report skip a frame heading without ` — <title>`; rename it.', "line": sec["line"], "frameIndex": idx})
        hm = re.match(r"^(\d+)", sec["heading"])
        if hm:
            frame["number"] = int(hm.group(1))
            rest = re.sub(r"^[\s.:—-]+", "", sec["heading"][hm.end():]).strip()
            frame["title"] = rest or None
        elif sec["heading"]:
            frame["title"] = sec["heading"]
        narrative: list[str] = []
        pending_texts: list[tuple[str, str]] = []
        for line in sec["lines"]:
            tm = TEXT_RE.match(line)
            if tm:
                pending_texts.append((tm.group(1).lower(), tm.group(2)))
                continue
            mm = META_RE.match(line)
            if not mm:
                narrative.append(line)
                continue
            key, value = mm.group(1).lower(), mm.group(2).strip()
            if key == "duration":
                frame["duration"] = _num(value)
                if frame["duration"] is None:
                    warnings.append({"message": f'Frame {idx}: could not parse duration "{value}".', "line": sec["line"], "frameIndex": idx})
            elif key == "start":
                frame["start"] = _num(value)
                frame["start_declared"] = frame["start"] is not None
            elif key == "status":
                frame["status"] = value.lower()
            elif key == "src":
                frame["src"] = value
            elif key == "poster":
                frame["poster"] = _num(value)
            elif key in TRANSITION_KEYS:
                frame["transition_in"] = value
            elif key in SCENE_KEYS:
                frame["scene"] = value
            elif key in VOICEOVER_KEYS:
                frame["voiceover"] = _strip_quotes(value)
            elif key == "role":
                frame["role"] = value.strip().lower()
                if frame["role"] not in GATE_ROLES:
                    warnings.append({"message": f'Frame {idx}: role "{frame["role"]}" is not a gate role ({"|".join(GATE_ROLES)}); no gate counts this frame as hook/product/outcome/CTA — leave `role` out on a card that has none.', "line": sec["line"], "frameIndex": idx})
            elif key == "beat":
                frame["beat"] = value.strip().lower()
            elif key == "scene_type":
                frame["scene_type"] = value.strip().lower()
            elif key == "evidence_tier":
                frame["evidence_tier"] = value.strip().upper()
            elif key == "reconstructed":
                frame["reconstructed"] = _truthy(value)
            elif key == "speed":
                frame["speed"] = value
            elif key == "continuous_camera":
                frame["continuous_camera"] = _truthy(value)
            elif key == "hold":
                frame["hold"] = True if _truthy(value) else _num(value)
            elif key == "order":
                frame["order"] = value
            elif key == "stagger":
                frame["stagger"] = _num(value)
            else:
                frame["extra"][key] = value
        for kind, raw in pending_texts:
            entry = parse_text_entry(raw, kind, frame["duration"])
            if entry:
                frame["texts"].append(entry)
        frame["narrative"] = "\n".join(narrative).strip()
        frames.append(frame)

    t = 0.0
    for f in frames:
        if f["start_declared"]:
            t = float(f["start"])
        f["start"] = round(t, 3)
        d = f["duration"] if f["duration"] is not None else 0.0
        if f["duration"] is None:
            warnings.append({"message": f"Frame {f['index']}: no duration; timeline after it is unreliable.", "line": f["line"], "frameIndex": f["index"]})
        f["end"] = round(t + d, 3)
        for te in f["texts"]:
            if te["end"] is None:
                te["end"] = d
        t += d
    return {"globals": globals_, "frames": frames, "warnings": warnings, "planned_duration": round(t, 3)}


def storyboard_brief_duration(sb: dict) -> tuple[float | None, str]:
    g = sb["globals"]
    if g.get("duration"):
        v = _num(str(g["duration"]))
        if v:
            return v, "storyboard frontmatter duration"
    if sb["frames"]:
        return sb["planned_duration"], "sum of frame durations"
    return None, "none"


_UNIT_ALIASES = {
    "%": "%", "percent": "%", "pct": "%",
    "x": "x", "×": "x", "times": "x",
    "ms": "ms", "msec": "ms",
    "s": "s", "sec": "s", "secs": "s", "second": "s", "seconds": "s",
    "min": "min", "mins": "min", "minute": "min", "minutes": "min",
    "h": "h", "hr": "h", "hrs": "h", "hour": "h", "hours": "h",
    "d": "days", "day": "days", "days": "days",
    "wk": "weeks", "week": "weeks", "weeks": "weeks",
    "mo": "months", "month": "months", "months": "months",
    "yr": "years", "yrs": "years", "year": "years", "years": "years",
    "eur": "EUR", "€": "EUR", "usd": "USD", "$": "USD", "gbp": "GBP", "£": "GBP",
}
_SCALES = {"k": 1e3, "K": 1e3, "M": 1e6, "m": 1e6, "B": 1e9, "bn": 1e9, "thousand": 1e3, "million": 1e6, "billion": 1e9}
NUMBER_RE = re.compile(
    r"(?<![\w.:/#-])"
    r"(?P<cur>EUR|USD|GBP|€|\$|£)?\s?"
    r"(?P<sign>[-−+])?(?P<num>\d{1,3}(?:[,\u00a0\u202f ]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)"
    r"\s?(?P<scale>k|K|M|B|bn|thousand|million|billion)?"
    r"(?:\s?(?P<unit>%|percent|×|x|times|ms|msec|s|secs?|seconds?|mins?|minutes?|h|hrs?|hours?|d|days?|weeks?|months?|years?|yrs?))?(?![\w-])",
)


def canonical_number(num: str, scale: str | None = None) -> float:
    n = float(re.sub(r"[,\u00a0\u202f ]", "", num))
    if scale:
        n *= _SCALES.get(scale, 1)
    return n


def numbers_in_text(text: str) -> list[dict]:
    out = []
    for m in NUMBER_RE.finditer(text or ""):
        before = text[: m.start()]
        after = text[m.end():]
        token = m.group(0).strip()
        digits = m.group("num")
        if re.search(r"\bv(?:ersion)?\s?$", before, re.IGNORECASE) or re.match(r"^\.\d", after):
            continue
        if re.match(r"^\s*:\s*\d", after) or re.search(r"\d:\s*$", before):
            continue
        if re.fullmatch(r"(19|20)\d\d", digits) and not m.group("unit") and not m.group("scale") and not m.group("cur"):
            continue
        if re.search(r"#\s*$", before) or re.search(r"\b(?:issue|pr|rfc|iso|soc|fr|nfr|qa|gs|cve|ticket|no|nr|№|step|v)[-\s.]?$", before, re.IGNORECASE):
            continue
        unit = m.group("unit") or (m.group("cur") or "")
        unit = _UNIT_ALIASES.get(unit.lower(), _UNIT_ALIASES.get(unit, unit))
        value = canonical_number(digits, m.group("scale"))
        if m.group("sign") in ("-", "−"):
            value = -value
        out.append({"token": token, "number": value, "unit": unit, "start": m.start(), "end": m.end()})
    return out


def load_claims(path: Path) -> list[dict]:
    return load_claims_from(json.loads(path.read_text(encoding="utf-8")))


def load_claims_from(data) -> list[dict]:
    claims = data.get("claims", []) if isinstance(data, dict) else data
    norm = []
    for c in claims:
        value = str(c.get("value", ""))
        if str(c.get("kind", "number")) == "quote":
            norm.append({"id": c.get("id"), "kind": "quote", "value": value, "number": None, "unit": "", "sourced": bool(c.get("source")) and str(c.get("status", "verified")).lower() != "unverified" and not c.get("decoy", False), "source": c.get("source"), "text": _norm_quote(value)})
            continue
        nums = numbers_in_text(value)
        number = c.get("number") if isinstance(c.get("number"), (int, float)) else (nums[0]["number"] if nums else None)
        unit = c.get("unit")
        if unit is None and nums:
            unit = nums[0]["unit"]
        unit = _UNIT_ALIASES.get(str(unit).lower(), unit) if unit else ""
        sourced = bool(c.get("source")) and str(c.get("status", "verified")).lower() != "unverified" and not c.get("decoy", False)
        norm.append({"id": c.get("id"), "kind": c.get("kind", "number"), "value": value, "number": number, "unit": unit, "sourced": sourced, "source": c.get("source")})
    return norm


def _norm_quote(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()


def quote_covers(text: str, claims: list[dict]) -> dict | None:
    t = _norm_quote(text)
    if len(t) < 12:
        return None
    for c in claims:
        if c.get("kind") == "quote" and c["sourced"] and c.get("text"):
            if t in c["text"] or c["text"] in t:
                return c
    return None


def number_is_claimed(tok: dict, claims: list[dict]) -> dict | None:
    for c in claims:
        if not c["sourced"] or c["number"] is None:
            continue
        if not math.isclose(c["number"], tok["number"], rel_tol=1e-9, abs_tol=1e-9):
            continue
        cu, tu = c["unit"] or "", tok["unit"] or ""
        if cu and tu and cu != tu:
            continue
        return c
    return None


def visible_text_of_frame_html(path: Path) -> str:
    html = path.read_text(encoding="utf-8", errors="replace")
    html = re.sub(r"<(script|style|template)\b[^>]*>.*?</\1>", " ", html, flags=re.IGNORECASE | re.DOTALL)
    html = re.sub(r"<!--.*?-->", " ", html, flags=re.DOTALL)
    text = re.sub(r"<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", text)


def probe_format(video: Path) -> dict:
    r = _run([ffprobe_bin(), "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height,r_frame_rate,nb_frames,sample_rate,channels", "-of", "json", str(video)], timeout=120)
    if r.returncode != 0:
        raise ProbeError(f"ffprobe failed on {video}: {r.stderr.strip()[:400]}")
    data = json.loads(r.stdout or "{}")
    out = {"duration": float(data.get("format", {}).get("duration", 0) or 0), "video": None, "audio": None}
    for s in data.get("streams", []):
        if s.get("codec_type") == "video" and out["video"] is None:
            num, _, den = str(s.get("r_frame_rate", "0/1")).partition("/")
            fps = float(num) / float(den) if den and float(den) else 0.0
            out["video"] = {"width": s.get("width"), "height": s.get("height"), "fps": round(fps, 3), "nb_frames": int(s["nb_frames"]) if str(s.get("nb_frames", "")).isdigit() else None}
        elif s.get("codec_type") == "audio" and out["audio"] is None:
            out["audio"] = {"sample_rate": s.get("sample_rate"), "channels": s.get("channels")}
    return out


def _metadata_pairs(stdout: str) -> list[tuple[float, dict]]:
    frames: list[tuple[float, dict]] = []
    cur: dict | None = None
    t = 0.0
    for line in stdout.splitlines():
        if line.startswith("frame:"):
            m = re.search(r"pts_time:(-?\d+(?:\.\d+)?)", line)
            t = float(m.group(1)) if m else t
            cur = {}
            frames.append((t, cur))
        elif "=" in line and cur is not None:
            k, v = line.split("=", 1)
            cur[k.strip()] = v.strip()
    return frames


def _vf(chain: str) -> str:
    return f"scale={ANALYSIS_WIDTH}:-2:flags=fast_bilinear,{chain}"


def measure_black_open(video: Path, window: float) -> dict:
    r = _run([ffmpeg_bin(), "-nostdin", "-hide_banner", "-loglevel", "error", "-t", f"{window + 0.05:.3f}", "-i", str(video),
              "-vf", _vf("signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-"), "-an", "-f", "null", "-"])
    if r.returncode != 0:
        raise ProbeError(f"signalstats failed: {r.stderr.strip()[:300]}")
    samples = [(t, float(d.get("lavfi.signalstats.YAVG", "nan"))) for t, d in _metadata_pairs(r.stdout) if t <= window + 1e-6]
    yavgs = [y for _, y in samples if not math.isnan(y)]
    return {
        "window_sec": window,
        "frames": len(yavgs),
        "yavg_min": _round(min(yavgs), 2) if yavgs else None,
        "yavg_mean": _round(sum(yavgs) / len(yavgs), 2) if yavgs else None,
        "yavg_at_0": _round(yavgs[0], 2) if yavgs else None,
        "yavg_at_0_5": _round(next((y for t, y in samples if t >= 0.5), yavgs[-1]), 2) if yavgs else None,
    }


def measure_freezes(video: Path) -> tuple[list[dict], float | None]:
    r = _run([ffmpeg_bin(), "-nostdin", "-hide_banner", "-loglevel", "error", "-i", str(video),
              "-vf", _vf("freezedetect=n=0.001:d=1.0,metadata=print:file=-"), "-an", "-f", "null", "-"])
    if r.returncode != 0:
        raise ProbeError(f"freezedetect failed: {r.stderr.strip()[:300]}")
    windows: list[dict] = []
    open_start: float | None = None
    for _, d in _metadata_pairs(r.stdout):
        if "lavfi.freezedetect.freeze_start" in d:
            open_start = float(d["lavfi.freezedetect.freeze_start"])
        if "lavfi.freezedetect.freeze_end" in d:
            end = float(d["lavfi.freezedetect.freeze_end"])
            start = open_start if open_start is not None else end - float(d.get("lavfi.freezedetect.freeze_duration", 0))
            windows.append({"start": round(start, 3), "end": round(end, 3), "duration": round(end - start, 3)})
            open_start = None
    return windows, open_start


def measure_cuts(video: Path, threshold: float = 0.25) -> list[dict]:
    r = _run([ffmpeg_bin(), "-nostdin", "-hide_banner", "-loglevel", "error", "-i", str(video),
              "-vf", _vf(f"select='gt(scene,{threshold})',metadata=print:key=lavfi.scene_score:file=-"), "-an", "-f", "null", "-"])
    if r.returncode != 0:
        raise ProbeError(f"scene detection failed: {r.stderr.strip()[:300]}")
    return [{"t": round(t, 3), "score": _round(float(d.get("lavfi.scene_score", 0)), 3)} for t, d in _metadata_pairs(r.stdout) if t > 0.0]


def measure_loudness(video: Path) -> dict | None:
    r = _run([ffmpeg_bin(), "-nostdin", "-hide_banner", "-nostats", "-i", str(video), "-vn", "-af", "ebur128=peak=true", "-f", "null", "-"])
    text = r.stderr
    if "Summary:" not in text:
        if "does not contain any stream" in text or "Output file #0 does not contain any stream" in text or "-vn" in text and "Stream map" in text:
            return None
        if r.returncode != 0:
            raise ProbeError(f"ebur128 failed: {text.strip()[-300:]}")
        return None
    summary = text.split("Summary:", 1)[1]

    def grab(label: str) -> float | None:
        m = re.search(rf"{label}:\s*(-?\d+(?:\.\d+)?)", summary)
        return float(m.group(1)) if m else None

    return {
        "integrated_lufs": grab("I"),
        "lra_lu": grab("LRA"),
        "true_peak_dbtp": grab("Peak"),
        "threshold_lufs": grab("Threshold"),
    }


def build_contact_sheet(video: Path, duration: float, out: Path, portrait: bool = False) -> dict:
    out.parent.mkdir(parents=True, exist_ok=True)
    w, h = SHEET_TILE[::-1] if portrait else SHEET_TILE
    rows = max(1, math.ceil(max(duration, 1.0) / SHEET_COLUMNS))
    draw = "drawtext=text='%{pts\\:hms}':fontsize=18:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=3:x=6:y=h-th-6,"
    base = f"fps=1,scale={w}:{h}:flags=bicubic,"
    tile = f"tile={SHEET_COLUMNS}x{rows}:padding=0:margin=0:color=black"
    timecodes = True
    r = _run([ffmpeg_bin(), "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", str(video), "-vf", base + draw + tile, "-frames:v", "1", str(out)])
    if r.returncode != 0 or not out.exists():
        timecodes = False
        r = _run([ffmpeg_bin(), "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", str(video), "-vf", base + tile, "-frames:v", "1", str(out)])
        if r.returncode != 0:
            raise ProbeError(f"contact sheet failed: {r.stderr.strip()[:300]}")
    return {"file": str(out), "columns": SHEET_COLUMNS, "rows": rows, "tile": [w, h], "width": w * SHEET_COLUMNS, "height": h * rows, "timecodes": timecodes, "fps": 1}


def _spread(items: list, k: int) -> list:
    n = len(items)
    if k >= n:
        return list(items)
    if k <= 0:
        return []
    if k == 1:
        return [items[-1]]
    idx = sorted({int(i * (n - 1) / (k - 1) + 0.5) for i in range(k)})
    return [items[i] for i in idx]


def keyframe_times(duration: float, frames: list[dict], cuts: list[dict]) -> list[dict]:
    first = [(0.0, "frame0"), (0.5, "+0.5s")]
    primary: list[tuple[float, str]] = []
    secondary: list[tuple[float, str]] = []
    for f in frames:
        if not f.get("duration"):
            continue
        a, b = f["start"], f["start"] + f["duration"]
        pick = (a + f["duration"] / 2, f"mid frame {f['index']}")
        (secondary if any(a <= t < b for t, _ in first) else primary).append(pick)
    primary = _spread(primary, KEYFRAME_COUNT - len(first))
    cut_picks: list[tuple[float, str]] = []
    for c in cuts:
        cut_picks.append((max(0.0, c["t"] - 0.2), f"cut-0.2 @{c['t']}"))
        cut_picks.append((c["t"] + 0.2, f"cut+0.2 @{c['t']}"))
    seen: list[dict] = []
    for t, why in first + primary + secondary + cut_picks:
        if duration and t > duration - 0.05:
            t = max(0.0, duration - 0.05)
        if any(abs(t - s["t"]) < 0.05 for s in seen):
            continue
        seen.append({"t": round(t, 3), "why": why})
        if len(seen) >= KEYFRAME_COUNT:
            break
    return sorted(seen, key=lambda s: s["t"])


KEYFRAME_NAME = re.compile(r"^\d{2}-at-\d+\.\d{2}s\.png$")


def keyframe_scale() -> str:
    long_side = max(KEYFRAME_SIZE)
    return f"scale={long_side}:{long_side}:force_original_aspect_ratio=decrease"


def extract_keyframes(video: Path, times: list[dict], out_dir: Path) -> list[dict]:
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.iterdir():
        if old.is_file() and KEYFRAME_NAME.match(old.name):
            old.unlink()
    files = []
    for n, k in enumerate(times):
        name = f"{n:02d}-at-{k['t']:.2f}s.png"
        path = out_dir / name
        r = _run([ffmpeg_bin(), "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{k['t']:.3f}", "-i", str(video), "-frames:v", "1", "-vf", keyframe_scale(), str(path)])
        if r.returncode == 0 and path.exists():
            files.append({"file": str(path), "t": k["t"], "why": k["why"]})
    return files


POSTER_SETTLE_SEC = 0.4


def pick_poster_time(frames: list[dict]) -> dict | None:
    for f in frames:
        if f.get("poster") is not None:
            return {"t": round(f["start"] + float(f["poster"]), 3), "frame": f["index"], "why": "storyboard `poster:` key"}
    hook = first_frame_with_role(frames, ("hook",))
    if hook is not None and hook.get("duration"):
        timed = [t for t in hook["texts"] if t["end"] is not None]
        if timed:
            latest_start = max(t["start"] for t in timed)
            earliest_end = min(t["end"] for t in timed)
            t = min(latest_start + POSTER_SETTLE_SEC, max(latest_start, earliest_end - 0.2))
        else:
            t = hook["duration"] / 2
        return {"t": round(hook["start"] + t, 3), "frame": hook["index"], "why": "hook frame, settled point"}
    prod = first_frame_with_role(frames, PRODUCT_ROLES)
    if prod is not None and prod.get("duration"):
        return {"t": round(prod["start"] + prod["duration"] / 2, 3), "frame": prod["index"], "why": "first product frame, midpoint"}
    return None


def gate(gid: str, *, measured: bool, passed: bool | None = None, value=None, details: dict | None = None, reason: str | None = None, override: str | None = None) -> dict:
    g = GATES[gid]
    return {
        "rule": g["rule"],
        "owner": g["owner"],
        "type": "hard" if g["hard"] else "default",
        "measured": measured,
        "pass": (None if not measured else bool(passed)),
        "value": value,
        "threshold": g["threshold"],
        "details": details or {},
        **({"reason": reason} if reason else {}),
        **({"override": override} if override else {}),
    }


def first_frame_with_role(frames: list[dict], roles: tuple[str, ...]) -> dict | None:
    for f in frames:
        if f.get("role") in roles:
            return f
    return None


def role_share(frames: list[dict], roles: tuple[str, ...], runtime: float | None) -> float | None:
    total = sum(f["duration"] or 0 for f in frames if f.get("role") in roles)
    base = runtime if runtime else sum(f["duration"] or 0 for f in frames)
    return round(100.0 * total / base, 2) if base else None


CAPTURE_WINDOW_RE = re.compile(r"^\s*([\d.]+)\s*[-–]\s*([\d.]+)\s*$")


def capture_tail_hold(frame: dict) -> float:
    extra = frame.get("extra") or {}
    w = CAPTURE_WINDOW_RE.match(str(extra.get("capture_window") or ""))
    duration = frame.get("duration")
    if not w or not duration:
        return 0.0
    try:
        a, b = float(w.group(1)), float(w.group(2))
    except ValueError:
        return 0.0
    if not b > a:
        return 0.0
    return max(0.0, min(float(duration), round(float(duration) - (b - a), 3)))


def eval_qa01(measured_duration: float | None, brief: float | None, brief_source: str, band_key: str | None, band_override: bool) -> dict:
    if measured_duration is None:
        return gate("QA-01", measured=False, reason="no --video: the master's duration is measured by ffprobe post-render")
    if brief is None:
        return gate("QA-01", measured=False, value=_round(measured_duration), reason="no brief duration (--brief-duration or storyboard `duration:`) to compare against")
    dev = 100.0 * (measured_duration - brief) / brief
    tol_ok = abs(dev) <= GATES["QA-01"]["threshold"]["brief_tolerance_pct"]
    details = {"brief_sec": brief, "brief_source": brief_source, "deviation_pct": _round(dev, 2), "tolerance_ok": tol_ok}
    band_ok = True
    if band_key and band_key in LENGTH_BANDS:
        lo, hi = LENGTH_BANDS[band_key]
        band_ok = lo <= measured_duration <= hi
        details.update({"band": band_key, "band_sec": [lo, hi], "band_ok": band_ok})
    plugin_ok = PLUGIN_LENGTH_RANGE[0] <= measured_duration <= PLUGIN_LENGTH_RANGE[1]
    details["plugin_range_ok"] = plugin_ok
    passed = tol_ok and plugin_ok and (band_ok or band_override)
    return gate("QA-01", measured=True, passed=passed, value=_round(measured_duration), details=details,
                override=("destination band overridden by the brief (default part of QA-01)" if (band_override and not band_ok) else None))


def eval_qa03(black: dict | None, frames: list[dict]) -> dict:
    th = GATES["QA-03"]["threshold"]
    hook = first_frame_with_role(frames, ("hook",))
    hook_visible_at = None
    if hook is not None:
        first_text = min((t["start"] for t in hook["texts"] if t["timed"]), default=0.0)
        hook_visible_at = round(hook["start"] + first_text, 3)
    details = {"hook_frame": hook["index"] if hook else None, "hook_visible_at_sec": hook_visible_at}
    if black is None:
        return gate("QA-03", measured=False, details=details, reason="no --video: the black-open luma is measured by signalstats post-render")
    details.update(black)
    black_open = black["yavg_min"] is not None and black["yavg_min"] < th["black_open_yavg_max"]
    element_on_black = hook is not None and hook["start"] <= 0.0 and any(t["start"] <= 0.0 + 1e-6 for t in hook["texts"])
    details["black_open"] = black_open
    details["element_declared_on_open"] = element_on_black
    hook_ok = hook is not None and hook_visible_at is not None and hook_visible_at <= th["hook_visible_by_sec"]
    details["hook_ok"] = hook_ok
    if hook is None:
        details["hook_note"] = "no frame with role: hook in the storyboard"
    passed = hook_ok and (not black_open or element_on_black)
    return gate("QA-03", measured=True, passed=passed, value=hook_visible_at, details=details)


def eval_qa04(frames: list[dict], mode: str, reveal: str) -> dict:
    th = GATES["QA-04"]["threshold"]
    limit = th[f"{mode}_sec"]
    override = None
    if reveal == "story-first":
        limit = th["story_first_max_sec"]
        override = "reveal: story-first raises the first-product limit to 25 s (default gate, recorded in run-report)"
    f = first_frame_with_role(frames, PRODUCT_ROLES)
    if f is None:
        return gate("QA-04", measured=True, passed=False, value=None, details={"limit_sec": limit, "note": "no product-role frame in the storyboard"}, override=override)
    return gate("QA-04", measured=True, passed=f["start"] <= limit, value=f["start"], details={"limit_sec": limit, "frame": f["index"], "role": f["role"]}, override=override)


def eval_qa05(frames: list[dict], mode: str) -> dict:
    limit = GATES["QA-05"]["threshold"][f"{mode}_sec"]
    f = first_frame_with_role(frames, OUTCOME_ROLES)
    if f is None:
        return gate("QA-05", measured=True, passed=False, value=None, details={"limit_sec": limit, "note": "no outcome|metric frame in the storyboard"})
    return gate("QA-05", measured=True, passed=f["start"] <= limit, value=f["start"], details={"limit_sec": limit, "frame": f["index"], "role": f["role"]})


def eval_qa07(freezes: list[dict], open_freeze: float | None, duration: float, frames: list[dict]) -> dict:
    th = GATES["QA-07"]["threshold"]
    if open_freeze is not None:
        freezes = freezes + [{"start": round(open_freeze, 3), "end": round(duration, 3), "duration": round(duration - open_freeze, 3), "to_end": True}]
    holds: list[tuple[float, float]] = []
    sources: list[dict] = []

    def declare(a: float, b: float, frame: dict, kind: str):
        if b > a:
            holds.append((a, b))
            sources.append({"frame": frame.get("index"), "kind": kind, "start": _round(a), "end": _round(b)})

    for f in frames:
        if f.get("hold") is True:
            declare(f["start"], f["end"], f, "hold")
        elif isinstance(f.get("hold"), (int, float)) and f["hold"]:
            declare(f["start"], min(f["end"], f["start"] + float(f["hold"])), f, "hold")
        tail = capture_tail_hold(f)
        if tail > 0:
            declare(f["end"] - tail, f["end"], f, "capture_hold")
    if frames and frames[-1].get("role") == "cta":
        declare(frames[-1]["start"], frames[-1]["end"], frames[-1], "end_card")

    def overlap(a0, a1, b0, b1):
        return max(0.0, min(a1, b1) - max(a0, b0))

    union: list[list[float]] = []
    for h0, h1 in sorted(holds):
        if union and h0 <= union[-1][1]:
            union[-1][1] = max(union[-1][1], h1)
        else:
            union.append([h0, h1])

    windows = []
    counted = 0.0
    for w in freezes:
        declared = sum(overlap(w["start"], w["end"], h0, h1) for h0, h1 in union)
        net = max(0.0, w["duration"] - declared)
        counted += net
        windows.append({**w, "declared_hold_sec": round(declared, 3), "counted_sec": round(net, 3)})
    pct = 100.0 * counted / duration if duration else 0.0
    longest = max((w["counted_sec"] for w in windows), default=0.0)
    passed = pct <= th["frozen_pct_max"] and longest <= th["window_sec_max"]
    return gate("QA-07", measured=True, passed=passed, value=_round(pct, 2),
                details={"frozen_pct": _round(pct, 2), "longest_window_sec": _round(longest), "windows": windows, "raw_frozen_sec": _round(sum(w["duration"] for w in freezes)), "declared_holds": [[_round(a), _round(b)] for a, b in holds], "declared_hold_sources": sources})


def eval_qa08(loud: dict | None, target: float | None, has_audio: bool) -> dict:
    th = GATES["QA-08"]["threshold"]
    if not has_audio:
        return gate("QA-08", measured=False, reason="the master has no audio stream")
    if loud is None:
        return gate("QA-08", measured=False, reason="ebur128 produced no summary")
    if target is None:
        return gate("QA-08", measured=False, value=loud, reason="no --target-lufs: the target is chosen by destination and mix (QA-08 rows), never a silent default")
    integrated, tp = loud["integrated_lufs"], loud["true_peak_dbtp"]
    if integrated is None:
        return gate("QA-08", measured=False, value=loud, reason="no integrated loudness (silent or too short for ebur128)")
    dev = integrated - target
    passed = abs(dev) <= th["tolerance_lu"] and (tp is not None and tp <= th["true_peak_dbtp_max"])
    return gate("QA-08", measured=True, passed=passed, value=integrated, details={**loud, "target_lufs": target, "deviation_lu": _round(dev, 2), "tp_ok": tp is not None and tp <= th["true_peak_dbtp_max"]})


def shots_from_cuts(cuts: list[dict], duration: float) -> list[dict]:
    times = [0.0] + [c["t"] for c in cuts] + [duration]
    return [{"start": round(a, 3), "end": round(b, 3), "duration": round(b - a, 3)} for a, b in zip(times, times[1:]) if b > a]


def declared_cuts(frames: list[dict]) -> list[dict]:
    starts = sorted(float(f["start"]) for f in frames if f.get("start") is not None)
    return [{"t": round(t, 3), "source": "storyboard"} for t in starts[1:] if t > 0]


def eval_qa09(cuts: list[dict], duration: float, mode: str, frames: list[dict], detected: list[dict] | None = None) -> dict:
    th = GATES["QA-09"]["threshold"]
    lo, hi = th["asl_sec"][mode]
    shots = shots_from_cuts(cuts, duration)
    asl = duration / (len(cuts) + 1) if duration else 0.0
    continuous = [(f["start"], f["end"]) for f in frames if f.get("continuous_camera")]
    longest = 0.0
    longest_exempt = False
    for s in shots:
        exempt = any(s["start"] >= a - 0.25 and s["end"] <= b + 0.25 for a, b in continuous)
        if s["duration"] > longest and not exempt:
            longest = s["duration"]
        if exempt and s["duration"] > th["shot_max_sec"]:
            longest_exempt = True
    asl_ok = lo <= asl <= hi
    shot_ok = longest <= th["shot_max_sec"]
    return gate("QA-09", measured=True, passed=asl_ok and shot_ok, value=_round(asl, 2),
                details={"cuts": len(cuts), "cut_times": [c["t"] for c in cuts], "cut_source": ("storyboard frame boundaries" if cuts and cuts[0].get("source") == "storyboard" else "ffmpeg scene>0.25"), "detected_cuts": [c["t"] for c in (detected if detected is not None else cuts)], "asl_sec": _round(asl, 2), "band_sec": [lo, hi], "asl_ok": asl_ok, "longest_shot_sec": _round(longest, 2), "shot_ok": shot_ok, "continuous_camera_exempted": longest_exempt},
                override=("continuous_camera declared on a frame (default gate, recorded in run-report)" if longest_exempt else None))


def reading_floor_violations(frames: list[dict], cps: float, min_sec: float, max_chars: int, max_lines: int) -> list[dict]:
    out = []
    for f in frames:
        for te in f["texts"]:
            hold = (te["end"] - te["start"]) if (te["end"] is not None) else None
            needed = max(min_sec, te["chars"] / cps)
            problems = []
            if hold is None:
                problems.append("no hold (frame has no duration)")
            elif hold + 1e-6 < needed:
                problems.append(f"hold {hold:.2f} s < floor {needed:.2f} s")
            if len(te["lines"]) > max_lines:
                problems.append(f"{len(te['lines'])} lines > {max_lines}")
            for ln in te["lines"]:
                if len(ln) > max_chars:
                    problems.append(f"line of {len(ln)} chars > {max_chars}: {ln[:30]}…")
            if problems:
                out.append({"frame": f["index"], "kind": te["kind"], "text": te["text"], "hold_sec": _round(hold, 2), "floor_sec": _round(needed, 2), "chars": te["chars"], "lines": len(te["lines"]), "problems": problems})
    return out


def eval_qa10(frames: list[dict], srt_cues: list[dict] | None) -> dict:
    th = GATES["QA-10"]["threshold"]
    items = sum(len(f["texts"]) for f in frames)
    if items == 0 and not srt_cues:
        return gate("QA-10", measured=False, reason="the storyboard declares no `text:` / `cta:` entries (and no --srt); nothing to measure")
    viol = reading_floor_violations(frames, th["cps"]["en"], th["min_sec"], th["max_chars_per_line"], th["max_lines"])
    cap_viol = []
    if srt_cues:
        for c in srt_cues:
            problems = []
            hold = c["end"] - c["start"]
            if hold < 0.8:
                problems.append(f"hold {hold:.2f} s < 0.8 s")
            if hold > 0 and c["chars"] / hold > th["cps"]["en"]:
                problems.append(f"{c['chars'] / hold:.1f} cps > {th['cps']['en']}")
            if len(c["lines"]) > th["max_lines"]:
                problems.append(f"{len(c['lines'])} lines")
            for ln in c["lines"]:
                if len(ln) > th["max_chars_per_line"]:
                    problems.append(f"line of {len(ln)} chars")
            if problems:
                cap_viol.append({"cue": c["index"], "start": c["start"], "end": c["end"], "text": " ".join(c["lines"]), "problems": problems})
    total = len(viol) + len(cap_viol)
    return gate("QA-10", measured=True, passed=total == 0, value=total, details={"text_items": items, "violations": viol, "caption_cues": len(srt_cues or []), "caption_violations": cap_viol})


def eval_qa12(frames: list[dict], claims: list[dict] | None, frame_html_dir: Path | None) -> dict:
    if claims is None:
        return gate("QA-12", measured=False, reason="no --claims claims-index.json")
    unsourced: list[dict] = []
    checked = 0
    for f in frames:
        sources = [(te["kind"], te["text"]) for te in f["texts"]]
        if f.get("voiceover"):
            sources.append(("voiceover", f["voiceover"]))
        if frame_html_dir and f.get("src"):
            p = frame_html_dir / f["src"]
            if p.exists():
                sources.append(("frame-html", visible_text_of_frame_html(p)))
        for where, text in sources:
            if where != "frame-html" and quote_covers(text, claims) is not None:
                checked += len(numbers_in_text(text))
                continue
            for tok in numbers_in_text(text):
                checked += 1
                if number_is_claimed(tok, claims) is None:
                    unsourced.append({"frame": f["index"], "where": where, "token": tok["token"], "number": tok["number"], "unit": tok["unit"]})
    return gate("QA-12", measured=True, passed=not unsourced, value=len(unsourced), details={"numbers_checked": checked, "unsourced": unsourced, "claims_sourced": sum(1 for c in claims if c["sourced"])})


def eval_qa13(frames: list[dict], runtime: float | None) -> dict:
    th = GATES["QA-13"]["threshold"]
    if not frames:
        return gate("QA-13", measured=False, reason="storyboard has no frames")
    last = frames[-1]
    total = runtime if runtime else (frames[-1]["end"] if frames else 0)
    d = last["duration"] or 0.0
    lo, hi = th["duration_sec"]
    problems = []
    if last.get("role") != "cta":
        problems.append(f"last frame role is `{last.get('role')}`, not `cta`")
    if not (lo <= d <= hi):
        problems.append(f"end card {d:.2f} s outside {lo}–{hi} s")
    if total >= 45 and d > total * th["max_share_pct_when_runtime_ge_45s"] / 100:
        problems.append(f"end card {100 * d / total:.1f} % of runtime > {th['max_share_pct_when_runtime_ge_45s']} %")
    if 10 <= total <= 30 and d > th["abs_max_sec_for_10_30s"]:
        problems.append(f"end card {d:.2f} s > {th['abs_max_sec_for_10_30s']} s absolute for a 10–30 s cut")
    ctas = [t for t in last["texts"] if t["kind"] == "cta"]
    cta_hold = None
    if ctas:
        cta_hold = max((t["end"] - t["start"]) for t in ctas if t["end"] is not None)
        if len(ctas) > 1:
            problems.append(f"{len(ctas)} CTA entries on the end card (one CTA)")
    else:
        cta_hold = d if last.get("role") == "cta" else None
    if cta_hold is not None and cta_hold < th["cta_min_sec"]:
        problems.append(f"CTA hold {cta_hold:.2f} s < {th['cta_min_sec']} s")
    order_declared = last.get("order")
    order_ok = None
    if order_declared:
        seq = [s.strip().lower() for s in re.split(r"->|→|>", order_declared)]
        order_ok = seq == ["logo", "tagline", "url"]
        if not order_ok:
            problems.append(f"order `{order_declared}` is not logo -> tagline -> URL")
    if last.get("stagger") is not None and abs(last["stagger"] - th["stagger_sec"]) > 0.05:
        problems.append(f"stagger {last['stagger']} s ≠ {th['stagger_sec']} s")
    return gate("QA-13", measured=True, passed=not problems, value=_round(d, 2),
                details={"frame": last["index"], "role": last.get("role"), "share_pct": _round(100 * d / total, 2) if total else None, "cta_hold_sec": _round(cta_hold, 2), "order": order_declared, "order_ok": order_ok, "stagger_sec": last.get("stagger"), "problems": problems})


def _findings(section: dict | None) -> list[dict]:
    return list((section or {}).get("findings") or [])


def eval_hyperframes_gates(check: dict | None, anim: dict | None, register: str | None, waivers: list[dict], allow_attrs: list[dict]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    if check is None:
        for gid in ("QA-02", "QA-06", "QA-14"):
            out[gid] = gate(gid, measured=False, reason="no --check QA/check.json (hyperframes check --json --frame-check --caption-zone …)")
    else:
        lint, layout, runtime, motion, contrast = (check.get(k) or {} for k in ("lint", "layout", "runtime", "motion", "contrast"))
        counted = bool(lint.get("ok")) and bool(layout.get("samples"))
        errors = sum(int((s or {}).get("errorCount") or 0) for s in (lint, layout, runtime, contrast))
        uncited = []
        for a in allow_attrs:
            cited = any(w.get("gate") == "QA-02" and w.get("snapshot_exists") and (w.get("subject") in (None, "") or w["subject"] in a["file"] or w["subject"] in a["attr"]) for w in waivers)
            if not cited:
                uncited.append(a)
        problems = []
        if not counted:
            problems.append("check.json does not count: lint.ok must be true and layout.samples non-empty")
        if not check.get("ok"):
            problems.append("check ok:false")
        if errors:
            problems.append(f"{errors} errors after triage")
        if uncited:
            problems.append(f"{len(uncited)} data-layout-allow-* attribute(s) without a QA.md waiver citing an existing snapshot")
        out["QA-02"] = gate("QA-02", measured=True, passed=not problems, value=errors, details={"ok": check.get("ok"), "counted": counted, "errors": errors, "warnings": sum(int((s or {}).get("warningCount") or 0) for s in (lint, layout, runtime, contrast)), "warning_codes": _warning_codes(lint, layout, runtime, contrast), "allow_attributes": allow_attrs, "uncited_allow_attributes": uncited, "problems": problems})
        mf = [f for f in _findings(motion) if str(f.get("code", "")).startswith("motion_")]
        if not motion.get("enabled"):
            out["QA-06"] = gate("QA-06", measured=False, reason="check.json: motion assertions not enabled (no *.motion.json sidecars ran)")
        else:
            out["QA-06"] = gate("QA-06", measured=True, passed=not mf, value=len(mf), details={"findings": mf[:20], "samples": motion.get("samples")})
        cf = _contrast_failures(_findings(contrast))
        cz = [f for f in _findings(layout) if str(f.get("code", "")) == "caption_zone_collision"]
        ff = [f for f in _findings(lint) + _findings(runtime) if "font" in str(f.get("code", "")).lower() and f.get("severity") == "error"]
        problems14 = []
        if cf:
            problems14.append(f"{len(cf)} contrast failures (WCAG AA)")
        if cz:
            problems14.append(f"{len(cz)} caption-zone collisions")
        if ff:
            problems14.append(f"{len(ff)} font findings")
        if not contrast.get("enabled", True):
            problems14.append("contrast pass disabled (--no-contrast)")
        out["QA-14"] = gate("QA-14", measured=True, passed=not problems14, value=len(cf) + len(cz) + len(ff), details={"contrast_errors": cf[:20], "caption_zone_collisions": cz[:20], "font_findings": ff[:20], "contrast_checked": contrast.get("checked"), "contrast_passed": contrast.get("passed"), "problems": problems14, "fonts_note": "document.fonts.check runs inside the frame-worker / check; no separate glyph probe (English only)"})
    if anim is None:
        out["QA-11"] = gate("QA-11", measured=False, reason="no --animation-map animation-map.json (hyperframes-animation/scripts/animation-map.mjs)")
    else:
        out["QA-11"] = eval_qa11(anim, register)
    return out


IN_OUT_PROPS = {"opacity", "x", "y", "scale", "xPercent", "yPercent", "autoAlpha", "clipPath"}


def _is_caption_tween(t: dict) -> bool:
    return str(t.get("selector") or "").startswith("#caption")


EXPLAINER_MARKERS = ("logo-sting", "stock", "fake-ui", "static-screenshot", "linear-easing", "flat-bed", "voice-reads-screen", "multiple-reveals", "essence-gap")
ESSENCE_ITEMS = ("E1", "E2", "E3", "E4")


def _words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9']+", str(text or "").lower())


def essence_of(frame: dict) -> set[str]:
    return {e for e in re.findall(r"\bE[1-4]\b", str((frame.get("extra") or {}).get("essence") or "").upper())}


def explainer_markers(frames: list[dict], globals_: dict, mode: str | None = None) -> list[dict]:
    out = []

    def add(marker: str, frame: dict | None, detail: str) -> None:
        where = f" in frame {frame['index']}" if frame else ""
        out.append({"marker": marker, "frameIndex": frame["index"] if frame else None, "line": frame.get("line") if frame else None,
                    "message": f"explainer marker {marker}{where}: {detail}"})

    def prose(f: dict) -> str:
        return " ".join(str(f.get(k) or "") for k in ("title", "scene", "narrative")).lower()

    if frames:
        first = frames[0]
        if re.search(r"\blogo\b.*\b(sting|reveal|animation|intro|opener)\b|\b(sting|opener)\b", prose(first)) and first.get("role") not in PRODUCT_ROLES:
            add("logo-sting", first, "the video opens on the brand, not the hook — the logo belongs on the end card (QA-03)")
    reveals = []
    for f in frames:
        text = prose(f)
        if re.search(r"\bstock\s+(footage|video|photo|image|clip|b-roll)s?\b", text):
            add("stock", f, "stock material — the real product is the hero")
        if f.get("role") in PRODUCT_ROLES and ((f.get("evidence_tier") == "C" and not f.get("reconstructed")) or re.search(r"\b(mock-?up|fake ui|illustrated ui|recreated ui)\b", text)):
            add("fake-ui", f, "a product screen that is not a capture of the product — capture it, or declare `reconstructed: true` for its label")
        if f.get("role") in ("ui", "demo", "recording") and re.search(r"\bscreenshots?\b", text) and not (f.get("extra") or {}).get("capture_window"):
            add("static-screenshot", f, "a static screenshot where the product moves — use a footage window of the capture")
        if re.search(r"\blinear\b[^.\n]{0,20}\b(ease|easing|motion)\b|ease:\s*\"?(none|linear)\b", text):
            add("linear-easing", f, "linear easing on an entrance or exit (QA-11 fails it in the render)")
        vo = set(_words(f.get("voiceover")))
        shown = [w for t in f.get("texts") or [] for w in _words(t.get("text"))]
        if vo and len(shown) >= 4 and sum(1 for w in shown if w in vo) / len(shown) >= 0.8:
            add("voice-reads-screen", f, "the voiceover says what the screen shows — the voice adds, the screen proves")
        if str(f.get("beat") or "").lower() in ("star", "reveal") or re.search(r"\bstar\b|\breveal\b", str(f.get("title") or "").lower()):
            reveals.append(f)
    if mode and frames:
        declared = {e for f in frames for e in essence_of(f)}
        on_product = {e for f in frames if f.get("role") in PRODUCT_ROLES for e in essence_of(f)}
        if not declared:
            add("essence-gap", None, "no frame declares `essence:` — map E1 what it is · E2 what I do in it · E3 what it gives back · E4 what changes onto the frames that show them (planning-rubric essence test)")
        else:
            missing = [e for e in ESSENCE_ITEMS if e not in declared] + [f"{e} on a product frame" for e in ("E2", "E3") if e in declared and e not in on_product]
            if missing:
                add("essence-gap", None, f"the essence test is not answered: {', '.join(missing)} — a muted viewer must see what the product is, what you do in it, what it gives back and what changes (planning-rubric essence test)")
    if len(reveals) > 1:
        add("multiple-reveals", None, f"{len(reveals)} reveal frames ({', '.join(str(f['index']) for f in reveals)}) — one STAR, one reveal technique")
    music = str(globals_.get("music") or "").strip().lower()
    if music and music != "none" and not any((f.get("extra") or {}).get("dropout") for f in frames):
        add("flat-bed", None, "the bed never drops out before the reveal — put `- dropout: 0.4` on the reveal frame")
    return out


def _contrast_failures(findings: list[dict]) -> list[dict]:
    errors = [f for f in findings if f.get("severity") == "error"]
    warns = [f for f in findings if f.get("severity") != "error" and str(f.get("code", "")) == "contrast_aa_failure"]
    key = lambda f: (f.get("text"), f.get("fg"), f.get("bg"))
    seen: dict = {}
    for f in warns:
        seen[key(f)] = seen.get(key(f), 0) + 1
    return errors + [dict(f, held_across_samples=seen[key(f)]) for f in warns if seen[key(f)] >= 2]


def _stagger_group(elements: list[str]) -> bool:
    ids = [e.lstrip("#") for e in dict.fromkeys(elements)]
    if len(ids) < 3 or any(e.startswith("caption") or e.startswith("el-") for e in ids):
        return False
    lcp = ids[0]
    for e in ids[1:]:
        n = 0
        while n < min(len(lcp), len(e)) and lcp[n] == e[n]:
            n += 1
        lcp = lcp[:n]
    return len(lcp) >= 4 and any(ch.isdigit() for ch in lcp)


def _element_intervals(elements: list[str], intervals: list) -> list[float]:
    if len(intervals) != len(elements) - 1 or any(x is None for x in intervals):
        return [float(x) for x in intervals if x is not None and float(x) > 0]
    pos, first = 0.0, {}
    for i, e in enumerate(elements):
        if i:
            pos += float(intervals[i - 1])
        first.setdefault(e, pos)
    starts = list(first.values())
    return [round(b - a, 3) for a, b in zip(starts, starts[1:]) if b - a > 0]


STAGGER_BEAT_GAP_S = 0.4


def _stagger_runs(iv: list[float]) -> list[list[float]]:
    runs, cur = [], []
    for i, x in enumerate(iv):
        others = iv[:i] + iv[i + 1:]
        med = sorted(others)[len(others) // 2] if others else 0.0
        if x >= STAGGER_BEAT_GAP_S and med > 0 and x >= 3 * med:
            if cur:
                runs.append(cur)
            cur = []
        else:
            cur.append(x)
    if cur:
        runs.append(cur)
    return runs


ENTRANCE_SEC = (0.3, 1.0)


def _m02_entrance_notes(tweens: list[dict]) -> list[dict]:
    notes = []
    for t in tweens:
        boxes = t.get("bboxes") or []
        sel = str(t.get("selector") or "")
        if sel.startswith("#el-") or sel.startswith("#caption"):
            continue
        if "opacity" not in (t.get("props") or []) and "autoAlpha" not in (t.get("props") or []) or len(boxes) < 2:
            continue
        o0, o1 = boxes[0].get("opacity"), boxes[-1].get("opacity")
        if o0 is None or o1 is None or not (float(o0) <= 0.1 and float(o1) >= 0.6):
            continue
        d = float(t.get("duration") or 0)
        if (0.2 <= d < ENTRANCE_SEC[0] or d > ENTRANCE_SEC[1]) and not any(n["selector"] == sel for n in notes):
            notes.append({"selector": sel, "duration": d, "note": f"entrance {d:.2f} s — asks 0.3–0.6 s (a hero landing up to 1.0 s)"})
    return notes[:20]


def eval_qa11(anim: dict, register: str | None) -> dict:
    th = GATES["QA-11"]["threshold"]
    all_tweens = anim.get("tweens") or []
    tweens = [t for t in all_tweens if not _is_caption_tween(t)]
    captions = len(all_tweens) - len(tweens)
    linear = [t for t in tweens if str(t.get("ease", "")).lower() in ("none", "linear", "power0", "power0.out", "power0.in", "power0.inout") and IN_OUT_PROPS & set(t.get("props") or [])]
    fast = [t for t in tweens if t.get("duration") is not None and float(t["duration"]) < th["tweens_under_sec"] and IN_OUT_PROPS & set(t.get("props") or [])]
    eases = {str(t.get("ease")) for t in tweens if t.get("ease") and str(t.get("ease")).lower() not in ("none", "linear")}
    back_out = [t for t in tweens if "back.out" in str(t.get("ease", "")).lower()]
    bad_staggers = []
    for s in anim.get("staggers") or []:
        if not _stagger_group([str(e) for e in (s.get("elements") or [])]):
            continue
        iv = _element_intervals([str(e) for e in (s.get("elements") or [])], list(s.get("intervals") or []))
        for run in _stagger_runs(iv):
            if len(run) < 2:
                continue
            med = sorted(run)[len(run) // 2]
            if med > 0 and max(abs(x - med) for x in run) > med * th["stagger_tolerance_pct"] / 100:
                bad_staggers.append({"elements": s.get("elements"), "intervals": iv, "run": run})
                break
    problems = []
    if linear:
        problems.append(f"{len(linear)} linear enter/exit tween(s)")
    if fast:
        problems.append(f"{len(fast)} tween(s) under {th['tweens_under_sec']} s")
    if tweens and len(eases) < th["min_distinct_easings"]:
        problems.append(f"{len(eases)} distinct easings < {th['min_distinct_easings']}")
    if bad_staggers:
        problems.append(f"{len(bad_staggers)} stagger group(s) outside ±{th['stagger_tolerance_pct']} % of the median")
    if back_out and register != "playful":
        problems.append(f"{len(back_out)} back.out tween(s) without register: playful")
    flags = sum(len(t.get("flags") or []) for t in tweens)
    flags_by_kind: dict = {}
    for t in tweens:
        for f in t.get("flags") or []:
            k = f if isinstance(f, str) else str(f.get("kind") or f.get("type") or "other")
            flags_by_kind[k] = flags_by_kind.get(k, 0) + 1
    m02 = _m02_entrance_notes(tweens)
    return gate("QA-11", measured=True, passed=not problems, value=len(problems),
                details={"tweens": len(tweens), "caption_tweens_excluded": captions, "linear_in_out": [t.get("selector") for t in linear][:20], "under_0_2s": [t.get("selector") for t in fast][:20], "distinct_easings": sorted(eases), "back_out": len(back_out), "register": register, "uneven_staggers": bad_staggers, "dead_zones": anim.get("deadZones") or [], "flag_count": flags, "flags_by_kind": flags_by_kind, "problems": problems, "m02_notes": m02})


WAIVER_RE = re.compile(
    r"^\s*[-*]\s+(?:waiver\s*:\s*)?(QA-\d{2})\b(?:[ \t]+(?P<subject>[^:(\n]+?)[ \t]*:)?[ \t]*:?[ \t]*(?P<reason>[^(]*?)\s*\(snapshot:\s*(?P<snap>[^)]+)\)\s*$",
    re.IGNORECASE,
)


def parse_qa_md(path: Path | None, base: Path) -> list[dict]:
    if not path or not path.exists():
        return []
    out = []
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        m = WAIVER_RE.match(line)
        if not m:
            continue
        snap = m.group("snap").strip()
        out.append({"gate": m.group(1).upper(), "subject": (m.group("subject") or "").strip() or None, "reason": (m.group("reason") or "").strip(), "snapshot": snap, "snapshot_exists": (base / snap).exists() or Path(snap).exists(), "qa_md": f"{path.name}#L{n}"})
    return out


def find_allow_attributes(root: Path | None) -> list[dict]:
    if not root or not root.exists():
        return []
    out = []
    for p in sorted(root.rglob("*.html")):
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for m in re.finditer(r"data-layout-allow-[a-z-]+", text):
            out.append({"file": str(p.relative_to(root)), "attr": m.group(0)})
    return out


def parse_srt(path: Path) -> list[dict]:
    cues = []
    block: list[str] = []
    for line in path.read_text(encoding="utf-8-sig").splitlines() + [""]:
        if line.strip():
            block.append(line)
            continue
        if len(block) >= 2:
            tm = re.search(r"(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)", block[1] if len(block) > 1 else block[0])
            if tm:
                h1, m1, s1, ms1, h2, m2, s2, ms2 = (int(x) for x in tm.groups())
                lines = [re.sub(r"<[^>]+>", "", ln).strip() for ln in block[2:] if ln.strip()]
                cues.append({"index": len(cues) + 1, "start": h1 * 3600 + m1 * 60 + s1 + ms1 / 1000, "end": h2 * 3600 + m2 * 60 + s2 + ms2 / 1000, "lines": lines, "chars": len(" ".join(lines))})
        block = []
    return cues


def _clamp(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, x))


HOOK_SPEED_FULL_MARKS_PATH = (
    "an outcome|metric frame starting ≤ 4 s: the hook card visible by 3 s (QA-03) → the outcome|metric card → the first "
    "product frame by 5 s (QA-04); ≥ 3 s floor binds the product beats, not these two cards"
)


def score_hook_speed(mode: str, first_outcome: float | None, first_product: float | None) -> tuple[float | None, dict]:
    if mode == "investors":
        if first_product is None:
            return 0.0, {"basis": "first product frame (investors)", "t": None}
        return _clamp(100.0 * (25 - first_product) / 15) if first_product > 10 else 100.0, {"basis": "first product frame (investors): 100 at ≤ 10 s, 0 at 25 s", "t": first_product}
    if first_outcome is None:
        return 0.0, {"basis": "first outcome", "t": None, "full_marks_path": HOOK_SPEED_FULL_MARKS_PATH}
    score = _clamp(100.0 * (12 - first_outcome) / 8) if first_outcome > 4 else 100.0
    detail = {"basis": "first outcome: 100 at ≤ 4 s, 0 at 12 s", "t": first_outcome}
    if score < 100.0:
        detail["full_marks_path"] = HOOK_SPEED_FULL_MARKS_PATH
    return score, detail


def score_product_share(mode: str, share: float | None) -> tuple[float | None, dict]:
    target = PRODUCT_SHARE_TARGET_PCT[mode]
    if share is None:
        return None, {"target_pct": target, "share_pct": None}
    return _clamp(100.0 * share / target), {"target_pct": target, "share_pct": share}


def score_cadence(asl: float, band: tuple[float, float], longest: float) -> tuple[float, dict]:
    lo, hi = band
    outside = (lo - asl) if asl < lo else (asl - hi) if asl > hi else 0.0
    outside += max(0.0, longest - 12.0)
    return _clamp(100.0 - 10.0 * outside), {"asl_sec": asl, "band": [lo, hi], "longest_shot_sec": longest, "seconds_outside": round(outside, 2)}


def score_loudness(loud: dict | None, target: float | None) -> tuple[float | None, dict]:
    if not loud or target is None or loud.get("integrated_lufs") is None:
        return None, {"reason": "no loudness measurement or target"}
    integrated, tp = loud["integrated_lufs"], loud.get("true_peak_dbtp")
    if tp is not None and tp > 0:
        return 0.0, {"deviation_lu": round(integrated - target, 2), "tp": tp, "reason": "true peak above 0 dBTP"}
    dev = abs(integrated - target)
    if dev <= 1.0 and (tp is None or tp <= -1.0):
        return 100.0, {"deviation_lu": round(dev, 2), "tp": tp}
    penalty = 10.0 * dev + (10.0 if (tp is not None and tp > -1.0) else 0.0)
    return _clamp(100.0 - penalty), {"deviation_lu": round(dev, 2), "tp": tp, "reading": "−10 per LU of deviation outside the ±1 LU tolerance window; −10 more when TP is above −1 dBTP"}


def score_beat_lock(cues: dict | None, cuts: list[dict], frames: list[dict]) -> tuple[float | None, dict]:
    if not cues:
        return None, {"reason": "no --cues music-cues.json (beat grid)"}
    beats = sorted({round(float(b["time"]), 3) for b in (cues.get("beats") or []) + (cues.get("strongCues") or []) if "time" in b})
    if not beats:
        return None, {"reason": "cue file has no beats"}
    offset = float(cues.get("offset_sec", 0.0) or 0.0)

    def nearest(t: float) -> float:
        return min(abs(t - (b + offset)) for b in beats)

    reveals = [c["t"] for c in cuts]
    heroes = []
    for f in frames:
        timed = [te["start"] for te in f["texts"] if te["timed"]]
        if timed:
            heroes.append(f["start"] + min(timed))
    r_hits = sum(1 for t in reveals if nearest(t) <= BEAT_LOCK["reveal_tolerance_sec"])
    h_hits = sum(1 for t in heroes if nearest(t) <= BEAT_LOCK["hero_tolerance_sec"])
    total = len(reveals) + len(heroes)
    if total == 0:
        return None, {"reason": "no reveals (cuts) or timed hero entrances to lock"}
    pct = 100.0 * (r_hits + h_hits) / total
    return _clamp(100.0 * pct / BEAT_LOCK["full_marks_pct"]), {"reveals": len(reveals), "reveal_hits": r_hits, "hero_entrances": len(heroes), "hero_hits": h_hits, "locked_pct": round(pct, 1)}


CRAFT_FLAG_WEIGHTS = {"collision": 0.0, "offscreen": 1.0, "degenerate": 1.0, "paced-fast": 0.5, "paced-slow": 0.5}
CRAFT_FLAG_WEIGHT_OTHER = 1.0
CRAFT_BENIGN_WARNINGS = {
    "clip_media_fit",
    "composition_file_too_large",
}


def _warning_codes(*sections) -> dict:
    out: dict = {}
    for sec in sections:
        for f in _findings(sec or {}):
            if f.get("severity") == "warning":
                c = str(f.get("code") or "other")
                out[c] = out.get(c, 0) + 1
    return out


def craft_lint_score(g02: dict | None, g11: dict | None) -> tuple:
    d11 = g11["details"] if g11 and g11["measured"] else {}
    d02 = g02["details"] if g02 and g02["measured"] else {}
    kinds = d11.get("flags_by_kind") or {}
    weighted = sum(n * CRAFT_FLAG_WEIGHTS.get(k, CRAFT_FLAG_WEIGHT_OTHER) for k, n in kinds.items())
    tweens = int(d11.get("tweens") or 0)
    per10 = weighted / max(1.0, tweens / 10.0) if tweens else float(weighted)
    codes = d02.get("warning_codes") or {}
    benign = sum(n for c, n in codes.items() if c in CRAFT_BENIGN_WARNINGS)
    warns = max(0, int(d02.get("warnings") or 0) - benign)
    return _clamp(100.0 - 5.0 * (per10 + warns)), {
        "animation_map_flags": int(d11.get("flag_count") or 0), "flags_by_kind": kinds, "weighted_flags": round(weighted, 1),
        "tweens": tweens, "flags_per_10_tweens": round(per10, 2), "check_warnings": warns, "check_warnings_excluded": benign,
        "formula": "100 - 5 × (weighted flags per 10 tweens + check warnings)",
    }


def build_scorecard(mode: str, gates: dict[str, dict], measurements: dict, frames: list[dict], cues: dict | None, target_lufs: float | None) -> dict:
    metrics: dict[str, dict] = {}

    def put(name: str, score: float | None, detail: dict):
        metrics[name] = {"weight": SCORECARD_WEIGHTS[name]["weight"], "score": (None if score is None else round(score, 1)), "measured": score is not None, **detail}

    g04, g05 = gates.get("QA-04"), gates.get("QA-05")
    first_product = g04["value"] if g04 and g04["measured"] else None
    first_outcome = g05["value"] if g05 and g05["measured"] else None
    if frames:
        s, d = score_hook_speed(mode, first_outcome, first_product)
        put("hook_speed", s, d)
    else:
        put("hook_speed", None, {"reason": "no storyboard"})
    s, d = score_product_share(mode, role_share(frames, PRODUCT_ROLES, measurements.get("duration")) if frames else None)
    put("product_share", s, d)
    g07 = gates.get("QA-07")
    if g07 and g07["measured"]:
        put("liveliness", _clamp(100.0 - 2.0 * g07["value"]), {"frozen_pct": g07["value"]})
    else:
        put("liveliness", None, {"reason": "no video"})
    g09 = gates.get("QA-09")
    if g09 and g09["measured"]:
        s, d = score_cadence(g09["details"]["asl_sec"], tuple(g09["details"]["band_sec"]), g09["details"]["longest_shot_sec"])
        put("cadence", s, d)
    else:
        put("cadence", None, {"reason": "no video"})
    s, d = score_beat_lock(cues, measurements.get("cuts") or [], frames) if measurements.get("cuts") is not None else (None, {"reason": "no video"})
    put("beat_lock", s, d)
    s, d = score_loudness(measurements.get("loudness"), target_lufs)
    put("loudness", s, d)
    g10 = gates.get("QA-10")
    if g10 and g10["measured"]:
        put("reading_comfort", _clamp(100.0 - 10.0 * g10["value"]), {"violations": g10["value"]})
    else:
        put("reading_comfort", None, {"reason": "no text timeline"})
    g02, g11 = gates.get("QA-02"), gates.get("QA-11")
    if (g02 and g02["measured"]) or (g11 and g11["measured"]):
        put("craft_lint", *craft_lint_score(g02, g11))
    else:
        put("craft_lint", None, {"reason": "no check.json / animation map"})
    g13 = gates.get("QA-13")
    if g13 and g13["measured"]:
        has_card = g13["details"].get("role") == "cta"
        put("ending_discipline", 100.0 if g13["pass"] else (50.0 if has_card else 0.0), {"end_card": has_card, "per_qa13": g13["pass"]})
    else:
        put("ending_discipline", None, {"reason": "no storyboard"})

    measured_w = sum(m["weight"] for m in metrics.values() if m["measured"])
    weighted = sum(m["weight"] * m["score"] for m in metrics.values() if m["measured"])
    total = round(weighted / measured_w, 1) if measured_w else None
    band = None if total is None else ("critic" if total >= 80 else "auto-revision" if total >= 60 else "replan")
    return {"total": total, "measured_weight": measured_w, "band": band, "metrics": metrics,
            "note": "total = Σ weight × score over the measured metrics, scaled to 100 (unmeasured metrics are excluded)"}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="wowprobe.py",
        description="Ship gates QA-01…QA-14, the 0–100 proxy scorecard and the critic's contact sheet. Offline: ffprobe/ffmpeg only.",
        epilog=USAGE_EPILOG,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--video", help="rendered master mp4 (not a transcode, QA-08) — enables the ffmpeg gates and the contact sheet")
    parser.add_argument("--storyboard", help="STORYBOARD.md — enables the storyboard gates (roles, text timeline, end card)")
    parser.add_argument("--check", help="QA/check.json from `hyperframes check --json --frame-check --caption-zone …` (QA-02, QA-06, QA-14)")
    parser.add_argument("--animation-map", help="animation-map.json from hyperframes-animation/scripts/animation-map.mjs (QA-11)")
    parser.add_argument("--claims", help="claims-index.json (QA-12); the GS fixture claims.json shape is accepted too")
    parser.add_argument("--cues", help="<track>.music-cues.json (beat_lock scorecard metric); add `offset_sec` to the file when the bed does not start at 0")
    parser.add_argument("--srt", help="captions .srt (word-timed groups measured under QA-10 by cps / line limits)")
    parser.add_argument("--qa-md", default="QA.md", help="QA.md with waiver bullets `- QA-02 <subject>: <reason> (snapshot: <png>)` (default: QA.md)")
    parser.add_argument("--project", help="project root for frame HTML (`src:` paths) and data-layout-allow-* scanning (default: the storyboard's directory)")
    parser.add_argument("--mode", choices=list(MODES), help="audience mode (per-mode defaults for QA-04, QA-05, QA-09, product share); falls back to the storyboard's audience/mode")
    parser.add_argument("--target-lufs", type=float, help="loudness target chosen by destination/mix (QA-08); without it QA-08 is not measured")
    parser.add_argument("--brief-duration", type=float, help="the brief's length in seconds (QA-01 ±3 %%); default: storyboard `duration:` then the frame sum")
    parser.add_argument("--destination", choices=sorted(LENGTH_BANDS), help="QA-01 destination band; default per mode (hero-launch / sales-outreach / investors-demo)")
    parser.add_argument("--band-override", action="store_true", help="the brief overrides the destination band (QA-01 default part; recorded in brief_overrides)")
    parser.add_argument("--reveal", choices=["early", "story-first"], help="brief reveal (QA-04); default: storyboard `reveal:` then early")
    parser.add_argument("--register", help="brief register (QA-11 back.out rule); default: storyboard `register:`")
    parser.add_argument("--out", default="QA/wowprobe.json", help="output JSON (default: QA/wowprobe.json)")
    parser.add_argument("--sheet", default="QA/contact-sheet.png", help="contact sheet PNG built from the master (for the vision critic); this script is its only producer")
    parser.add_argument("--frames-dir", default="QA/frames", help="directory for the 12 keyframes at 960×540 (default: QA/frames)")
    parser.add_argument("--no-sheet", action="store_true", help="skip the contact sheet and keyframes")
    parser.add_argument("--trend", help="append one line (date, label, mode, total, gates failed) to this TSV (e.g. evals/results/trend.tsv)")
    parser.add_argument("--label", default="", help="label for the trend line (fixture / route / version)")
    parser.add_argument("--print", action="store_true", help="also print the JSON to stdout")
    parser.add_argument("--list-gates", action="store_true", help="print GATES + SCORECARD_WEIGHTS as JSON and exit")
    parser.add_argument("--poster-pick", action="store_true", help="print the poster moment chosen from --storyboard as JSON {t, frame, why} and exit (used by scripts/poster-bake.sh)")
    return parser


def run(args: argparse.Namespace) -> tuple[dict, int]:
    video = Path(args.video) if args.video else None
    sb_path = Path(args.storyboard) if args.storyboard else None
    if video is None and sb_path is None:
        raise SystemExit("error: at least one of --video / --storyboard is required (see --help)")
    if video is not None and not video.exists():
        raise ProbeError(f"--video not found: {video}")
    if sb_path is not None and not sb_path.exists():
        raise ProbeError(f"--storyboard not found: {sb_path}")

    sb = parse_storyboard(sb_path.read_text(encoding="utf-8")) if sb_path else {"globals": {}, "frames": [], "warnings": [], "planned_duration": 0.0}
    frames = sb["frames"]
    g = sb["globals"]
    mode = args.mode or str(g.get("audience") or g.get("mode") or "").strip().lower()
    if mode not in MODES:
        raise SystemExit(f"error: --mode is required (storyboard audience `{mode or '—'}` is not one of {', '.join(MODES)})")
    markers = explainer_markers(sb["frames"], sb["globals"], mode)
    sb["warnings"] = sb["warnings"] + [{k: m[k] for k in ("message", "line", "frameIndex") if m.get(k) is not None} for m in markers]
    reveal = args.reveal or str(g.get("reveal") or "early").strip().lower()
    register = args.register or (str(g.get("register")).strip().lower() if g.get("register") else None)
    project = Path(args.project) if args.project else (sb_path.parent if sb_path else Path.cwd())
    qa_md = Path(args.qa_md) if args.qa_md else None
    if qa_md and not qa_md.is_absolute() and not qa_md.exists():
        qa_md = project / qa_md
    waivers = parse_qa_md(qa_md, project)

    measurements: dict = {}
    duration: float | None = None
    has_audio = False
    if video is not None:
        fmt = probe_format(video)
        duration = fmt["duration"]
        has_audio = fmt["audio"] is not None
        measurements["format"] = fmt
        measurements["duration"] = _round(duration)
        measurements["black_open"] = measure_black_open(video, GATES["QA-03"]["threshold"]["black_open_window_sec"])
        freezes, open_freeze = measure_freezes(video)
        measurements["freezes"] = freezes
        cuts = measure_cuts(video)
        measurements["cuts"] = cuts
        measurements["loudness"] = measure_loudness(video) if has_audio else None
    else:
        freezes, open_freeze, cuts = [], None, None

    brief, brief_source = (args.brief_duration, "--brief-duration") if args.brief_duration else storyboard_brief_duration(sb)
    band_key = args.destination or DEFAULT_DESTINATION[mode]

    gates: dict[str, dict] = {}
    gates["QA-01"] = eval_qa01(duration, brief, brief_source, band_key, args.band_override)
    gates["QA-03"] = eval_qa03(measurements.get("black_open"), frames) if (video is not None or frames) else gate("QA-03", measured=False, reason="no --video and no storyboard")
    if video is not None:
        gates["QA-07"] = eval_qa07(freezes, open_freeze, duration or 0.0, frames)
        gates["QA-08"] = eval_qa08(measurements.get("loudness"), args.target_lufs, has_audio)
        declared = declared_cuts(frames) if frames else []
        gates["QA-09"] = eval_qa09(declared or (cuts or []), duration or 0.0, mode, frames, detected=cuts or [])
    else:
        for gid in ("QA-07", "QA-08", "QA-09"):
            gates[gid] = gate(gid, measured=False, reason="no --video: measured on the rendered master post-render")
    if frames:
        gates["QA-04"] = eval_qa04(frames, mode, reveal)
        gates["QA-05"] = eval_qa05(frames, mode)
        srt_cues = parse_srt(Path(args.srt)) if args.srt else None
        gates["QA-10"] = eval_qa10(frames, srt_cues)
        claims = load_claims(Path(args.claims)) if args.claims else None
        gates["QA-12"] = eval_qa12(frames, claims, project)
        gates["QA-13"] = eval_qa13(frames, duration)
    else:
        for gid in ("QA-04", "QA-05", "QA-10", "QA-12", "QA-13"):
            gates[gid] = gate(gid, measured=False, reason="no --storyboard (or it has no frames)")
    check = json.loads(Path(args.check).read_text(encoding="utf-8")) if args.check else None
    anim = json.loads(Path(args.animation_map).read_text(encoding="utf-8")) if args.animation_map else None
    allow_attrs = find_allow_attributes(project / "compositions") if check is not None else []
    gates.update(eval_hyperframes_gates(check, anim, register, waivers, allow_attrs))
    gates = {gid: gates[gid] for gid in GATES}

    applied_waivers = []
    for w in waivers:
        gid = w["gate"]
        if gid in gates and gates[gid]["measured"] and gates[gid]["pass"] is False and gates[gid]["type"] == "default" and w["snapshot_exists"]:
            gates[gid]["waived"] = True
            applied_waivers.append({"gate": gid, "snapshot": w["snapshot"], "reason": w["reason"], "qa_md": w["qa_md"]})
    gates_failed = [gid for gid, gt in gates.items() if gt["measured"] and gt["pass"] is False and not gt.get("waived")]
    not_measured = {gid: gt.get("reason", "") for gid, gt in gates.items() if not gt["measured"]}
    brief_overrides = [{"gate": gid, "override": gt["override"]} for gid, gt in gates.items() if gt.get("override")]

    cues = json.loads(Path(args.cues).read_text(encoding="utf-8")) if args.cues else None
    scorecard = build_scorecard(mode, gates, measurements, frames, cues, args.target_lufs)

    sheet = None
    keyframes: list[dict] = []
    if video is not None and not args.no_sheet:
        vfmt = (measurements.get("format") or {}).get("video") or {}
        portrait = bool(vfmt.get("width") and vfmt.get("height") and vfmt["height"] > vfmt["width"])
        sheet = build_contact_sheet(video, duration or 0.0, Path(args.sheet), portrait=portrait)
        keyframes = extract_keyframes(video, keyframe_times(duration or 0.0, frames, cuts or []), Path(args.frames_dir))

    report = {
        "schema": SCHEMA,
        "generated_at": _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "generated_by": "scripts/wowprobe.py",
        "mode": mode,
        "reveal": reveal,
        "register": register,
        "target_lufs": args.target_lufs,
        "destination": band_key,
        "video": str(video) if video else None,
        "storyboard": str(sb_path) if sb_path else None,
        "check": args.check,
        "animation_map": args.animation_map,
        "claims": args.claims,
        "gates_failed": gates_failed,
        "not_measured": not_measured,
        "gates": gates,
        "waivers": applied_waivers,
        "waivers_declared": waivers,
        "brief_overrides": brief_overrides,
        "scorecard": scorecard,
        "measurements": measurements,
        "storyboard_summary": {
            "frames": len(frames),
            "planned_duration_sec": sb["planned_duration"],
            "brief_duration_sec": brief,
            "brief_duration_source": brief_source,
            "roles": [f.get("role") for f in frames],
            "product_share_pct": role_share(frames, PRODUCT_ROLES, duration) if frames else None,
            "text_items": sum(len(f["texts"]) for f in frames),
            "warnings": sb["warnings"],
            "explainer_markers": markers,
        },
        "contact_sheet": sheet,
        "keyframes": keyframes,
        "ship": {
            "gates_ok": not gates_failed and not not_measured,
            "scorecard_ok": scorecard["total"] is not None and scorecard["total"] >= 80,
            "note": "ship = all 14 gates pass + scorecard ≥ 80 + critic mean ≥ 3.0 with no dimension < 2; the critic votes are not in this file",
        },
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.trend:
        tp = Path(args.trend)
        tp.parent.mkdir(parents=True, exist_ok=True)
        new = not tp.exists()
        with tp.open("a", encoding="utf-8") as fh:
            if new:
                fh.write("date\tlabel\tmode\tscorecard_total\tgates_failed\tnot_measured\tvideo\n")
            fh.write("\t".join([report["generated_at"], args.label, mode, str(scorecard["total"]), ",".join(gates_failed) or "-", ",".join(not_measured) or "-", str(video or "")]) + "\n")
    return report, (EXIT_GATES_FAILED if gates_failed else EXIT_OK)


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.list_gates:
        json.dump({"gates": GATES, "scorecard_weights": SCORECARD_WEIGHTS, "product_roles": list(PRODUCT_ROLES), "gate_roles": list(GATE_ROLES), "length_bands": LENGTH_BANDS, "beat_lock": BEAT_LOCK}, sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
        return EXIT_OK

    if args.poster_pick:
        if not args.storyboard:
            sys.stderr.write("error: --poster-pick needs --storyboard\n")
            return EXIT_USAGE
        sb_path = Path(args.storyboard)
        if not sb_path.exists():
            sys.stderr.write(f"error: --storyboard not found: {sb_path}\n")
            return EXIT_RUNTIME
        pick = pick_poster_time(parse_storyboard(sb_path.read_text(encoding="utf-8"))["frames"])
        json.dump(pick or {"t": None, "frame": None, "why": "storyboard has no poster key, hook frame or product frame"}, sys.stdout)
        sys.stdout.write("\n")
        return EXIT_OK

    if not args.video and not args.storyboard:
        parser.print_usage(sys.stderr)
        sys.stderr.write("error: at least one of --video / --storyboard is required\n")
        return EXIT_USAGE
    if not args.mode and not args.storyboard:
        sys.stderr.write("error: --mode is required when no storyboard names the audience\n")
        return EXIT_USAGE
    if shutil.which(ffmpeg_bin()) is None and args.video:
        sys.stderr.write(f"error: {ffmpeg_bin()} not on PATH — the ffmpeg gates need it (toolchain exports HYPERFRAMES_FFMPEG_PATH when it installed a static build)\n")
        return EXIT_RUNTIME
    try:
        report, code = run(args)
    except SystemExit as e:
        if isinstance(e.code, str):
            sys.stderr.write(e.code + "\n")
            return EXIT_USAGE
        raise
    except ProbeError as e:
        sys.stderr.write(f"error: {e}\n")
        return EXIT_RUNTIME
    except (OSError, json.JSONDecodeError) as e:
        sys.stderr.write(f"error: {e}\n")
        return EXIT_RUNTIME
    for w in report["storyboard_summary"]["warnings"]:
        where = f" ({Path(args.storyboard).name}:{w['line']})" if w.get("line") and args.storyboard else ""
        sys.stderr.write(f"wowprobe: warning: {w['message']}{where}\n")
    if args.print:
        json.dump(report, sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
    else:
        sc = report["scorecard"]["total"]
        failed = ", ".join(report["gates_failed"]) or "none"
        nm = ", ".join(report["not_measured"]) or "none"
        sys.stdout.write(f"wowprobe: gates_failed={failed}; not_measured={nm}; scorecard={sc}; out={args.out}\n")
    return code


if __name__ == "__main__":
    sys.exit(main())

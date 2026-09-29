# `run-report.json` schema

Phase: MVP. Written at Deliver, next to the mp4s.
Every number here is *measured by the run*; this file defines fields, not values. Fields marked
(v1) are present as `null` in MVP.

```jsonc
{
  "schema": "power-presentation/run-report@0.1",
  "generated_at": "<ISO-8601>",
  "project": { "dir": "<abs path>", "brief": "BRIEF.md", "storyboard_version": "v<N>" },   //

  "versions": {                                              // "version pins";
    "plugin": "0.3.0",
    "hyperframes": { "pinned": "0.8.47", "range": "0.8.x", "installed": "<doctor --json>" },
    "node": "<v>", "ffmpeg": "<v>", "playwright": "<v>",
    "tts": { "engine": "kokoro", "version": "<v>" },                                  // (cloud engines v2)
    "whisper": { "model": "large-v3|turbo", "language": "en" },                        //
    "doctor_ok": true                                        // run is gated on the doctor gate: `${CLAUDE_PLUGIN_DATA}/doctor.json` `gate.ok` (scripts/toolchain.mjs — derived from the required checks; the CLI's raw `.ok` never passes for a pinned version)
  },

  "model_mix": {                                             //; userConfig model_mix
    "profile": "all-sonnet|opus-orchestrator|all-opus",
    "roles": { "orchestrator": "<model>", "story_director": "<model>", "frame_worker": "<model>", "critics": "<model>" }
  },
  "tokens": {                                                // "estimate / actual"
    "estimate": { "usd": 0, "printed_before_dispatch": true },
    "actual":   { "usd": 0, "input": 0, "output": 0 },
    "budget_usd": 25,                                        // threshold in the default mix
    "revision_rounds": 1                                     // default 1; 2 only by flag
  },
  "cost": { "tokens_usd": 0, "media_usd": 0, "third_party_usd": 0 },   //; $0 on the zero-account path

  "time": {                                                  // "time per stage"; stage names = pipeline table
    "stages_s": { "intake": 0, "inspect": 0, "capture": 0, "pitch": 0, "brief": 0, "design_spec": 0,
                  "storyboard": 0, "audio": 0, "frames": 0, "assemble": 0, "transitions_captions": 0,
                  "verify": 0, "review": 0, "render": 0, "deliver": 0 },
    "wall_s": 0,                                             // wall clock: first stage start → last stage end
    "timed_s": 0,                                            // sum of stages_s — below wall_s by what nobody stamped
    "threshold_s": null                                      // ≤ 45 min fast profile, ≤ 180 min serial
  },

  "capture": {                                               // "capture backend";..
    "chain_step": "prod|staging|local|recording|reconstruction",
    "backend": "playwright-screencast|vhs|hyperframes-capture|claude-in-chrome|user-recording|simctl|adb|none",
    "source": "<url or path>",
    "skip_vision": true,                                     // required under
    "redaction": { "pre": ["seeded-data", "clock.setFixedTime"], "during": ["dom-mask"], "post": ["ocr-regex"] },  //
    "ocr_gate": { "matches": 0, "confirmed": false }         // a match blocks render/publish until confirmed
  },

  "scenes": [                                                // "tier per scene"
    { "id": "01", "role": "hook", "tier": "A|B|C", "reconstructed": false,
      "label": null,                                         // "reconstructed" | "Screen images simulated" — only a product-screen role at tier C or `reconstructed: true` | "Design preview" (table)
      "speed_label": null,                                   // "N× speed" when sped up in investors
      "duration_s": 0 }
  ],
  "reconstructed": { "any": false, "confirmed_by_user": false },       //; mandatory confirmation for sales/investors

  "synthetic": { "voice": false, "presenter": false, "broll": false, "provider": null },   //
  "tts_placeholder": false,                                  // investors with a TTS narrator
  "disclosure": {                                            // EU AI Act Art. 50, required when synthetic.* is true
    "required": false,
    "line": null,
    "placed_in": ["share-copy.txt", "credits", "run-report.json"],
    "ai_badge": null                                         // voice clone / avatar only: "AI" ≥ 28 px from frame 0 for ≥ 3 s + consent file
  },

  "licences": [                                              // "licence table"; LICENSES.md; sha256 ledger
    { "asset": "<path>", "licence": "CC0|CC BY 4.0|OFL|…", "source": "<url>", "credit_line": null, "sha256": "<hex>" }
  ],
  "fonts": { "document_fonts_check": "pass", "faces": [] },            // QA-14 (withdrawn 2026-09-19)

  "egress_hosts": [],                                        //; from .media/egress.jsonl; must be [] under in CI
  "privacy_profile": "default|local",                        //

  "loudness": {                                              // QA-08, — measured on the master, not a transcode
    "integrated_lufs": 0, "true_peak_dbtp": 0,
    "target_lufs": 0,                                        // −14 social/VO-led; −16…−18 premium VO/investors; −18…−20 music-only (QA-08)
    "tolerance_lu": 1, "true_peak_max_dbtp": -1, "measured_on": "master", "pass": false
  },

  "gates": { "QA-01": { "pass": false, "value": null, "threshold": null, "type": "hard|default" } },  // all 14, see qa-gates.md
  "gates_failed": [],                                        // ship requires []
  "waivers": [ { "gate": "QA-02", "snapshot": "QA/…png", "reason": "…", "qa_md": "QA.md#…" } ],   // QA-02: a waiver cites a snapshot in QA.md
  "brief_overrides": [],                                     // default gates overridden by reveal/register/duration
  "check_counted": false,                                    // true only when lint.ok and layout.samples non-empty

  "scorecard": { "total": 0, "metrics": {} },                // 9 metrics, weights in qa-gates.md; ≥ 80 candidate for the critic
  "critic": { "votes": 3, "dimensions": { "C1": [], "C2": [], "C3": [], "C4": [], "C5": [], "C6": [], "C7": [] },
              "mean": 0, "min": 0, "ship": false },          // pass = mean ≥ 3.0 and min ≥ 2, majority of 3
  "pairwise": null,                                          // (v1) "wow confirmed" when ≥ 2 of 3 votes beat the previous best

  "claims": { "verified": 0, "unverified": [], "gaps": [] }, //, QA-12; sources file:line or URL
  "mode": {
    "sales":     { "prospect_fields": ["name", "company", "role", "site"], "letter_gdpr": { "art14": false, "art21_2": false }, "purge_after_days": 30 },   //
    "investors": { "metrics_file": null, "ask_card": false, "traction_verbatim": false }   //
  },

  "deliverables": {                                          //
    "mp4": { "16:9": "renders/final/…mp4", "9:16": null },
    "poster": { "path": null, "baked_into_frame_0": false }, //
    "srt": { "<lang>": "…srt" },                             // always
    "share_copy": "share-copy.txt"
  },
  "versions_history": [ { "version": "v<N>", "request": "<text>", "commit": "<sha>", "render_hash": "<sha256>" } ]   //
}
```

## Rules

- Written on every render, including failed ones, so `gates_failed` and waivers are never lost.
- `time.stages_s` keys follow the pipeline table; add none, rename none.
- `time.stages_s` comes from `.hyperframes/pp-stages.json`: render-path times its own stages; the others are the
  orchestrator's `render-path time --begin <stage>` / `--end <stage>` wall-clock stamps (SKILL § 7a), never file mtimes;
  render-path stamps `frames` itself from `packets` to `assemble` when the orchestrator has not begun it.
- `time.wall_s` is the wall clock from the first stage start to the last stage end; `time.timed_s` is the sum
  of `stages_s`.
- `loudness.target_lufs` is the target chosen for this destination/mix (QA-08 owns the values);
  the report records which one was chosen and why (`brief_overrides`).
- Under `--privacy local` the report itself is written locally and `egress_hosts` must be empty.
- The skeleton has no producer for this file yet; `scripts/wowprobe.py` (stub) will fill `gates`,
  `gates_failed` and `scorecard`; the Deliver step fills the rest.

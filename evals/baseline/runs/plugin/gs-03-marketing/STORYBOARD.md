---
format: 1920x1080
duration: 45s
message: "Dear dashboard: three commands replace you."
arc: PAS told as a letter — salutation + promise (hook) → outcome → product intro → agitate → demo (watch · done STAR · result · JSON) → the same job over HTTP (spec) → benefit recap → sign-off → CTA
audience: marketing
mode: autonomous
language: en
version: v1
reveal: early
register: high
music: pack:happy-beats-business-moves-vol-1
approved: v1
---

## Video direction

Concept (pitch 5, "A letter to the dashboard"): a developer writes a short, dry break-up letter to the job dashboard.
The letter's lines are the kinetic type on cream paper; the real VHS recording of the repo's own `demo.tape` is the
evidence that the letter is true. Muted-first: no voice, no captions on the 16:9 master; the letter carries
the meaning. One reveal device (the letter: salutation → body → sign-off), one STAR (Frame 6, `status: done`), one
CTA (Frame 13).

### Stage and fixed boxes (bind every frame — W/H fractions of 1920x1080)

- Caption keep-out: nothing load-bearing below y = 0.82 (QA-14), even with captions off.
- Letter frames (1, 2, 4, 11, 12): ground cream `#FAF9F5`. Kicker-spike `✱ RE: YOUR JOBS` at box x 0.12, y 0.12,
  w 0.40, h 0.045 — JetBrains Mono uppercase 0.16em, 40 px (up from the preset's 28 px: no declared text under
  40 px), `✱` coral, letters ink, opacity 1, static, identical in every letter frame. Section-rule 1px ink@12% at
  y 0.19 from x 0.12 to x 0.88, static. Letter copy column x 0.12–0.80, first line top at y 0.30; EB Garamond 400,
  sentence case, negative-tracked; salutation and sign-off in the italic register; size by fit-to-measure
  (≤3 words display-cover, 4–6 display, 7+ headline).
- Terminal frames (3, 5, 6, 7, 8): the footage fills the stage, box x 0, y 0, w 1, h 1, 1× home pose; its own dark
  terminal ground is the ground — no recolour, no look treatment, no dim (it is the product). The terminal
  text lives in footage x 0.02–0.53, y 0.03–0.69; the right half and bottom third are empty terminal ground.
  Annotation block in that empty ground: box x 0.58, y 0.22, w 0.34, h 0.42 — kicker (mono 40 px, `✱` coral,
  letters cream) at its top, then one letter line in EB Garamond italic, cream, 5.0–6.7cqw, then an optional mono
  label (cream@72%, 40 px). The annotation never overlaps the terminal text region and always leaves before a
  camera drift starts (a drift enlarges the terminal text into the right half).
- Spec frames (9, 10): ground cream. Kicker `✱ FROM THE SPEC` at the letter kicker's box (x 0.12, y 0.12, w 0.40,
  h 0.045) — this kicker IS the "from the spec" label and stays on screen for the whole frame. Heading line
  (EB Garamond headline) at x 0.12, y 0.22, w 0.76, h 0.09. Code-surface card (warm navy `#181715`, `navy-elev`
  title bar, 8px radius, cream@14% hairline) at x 0.12, y 0.36, w 0.76, h 0.42: request column x 0.14–0.48,
  response column x 0.52–0.86, status pill at the top of the response column. JetBrains Mono ≥ 40 px inside.
  No host name, no latency — a spec has none.
- End card (13): ground cream, lockup centred on x 0.5, top at y 0.26, bottom above y 0.78.

### Palette and type (frame.md, code-editorial)

Cream ground, ink voice, coral voltage exactly once per frame (the `✱` kicker spike is the brand mark, not the
voltage moment); warm navy only on the spec card; the terminal footage keeps its own colours. EB Garamond display,
Inter body, JetBrains Mono kickers / labels / code. No pure white, no cool grey, no gradient, glow or heavy shadow.

### Motion grammar

Register `high`: entrances expo.out (ease-out), 0.4–0.6 s; exits ease-in, 0.25 s; no `back.out` (QA-11), no
linear easing. Letter lines reveal word by word on their `text:` start (never front-load; each piece enters at its
declared time). Terminal footage always plays at 1× — no speed-up, so no speed label. The only camera on footage is
the declared `capture_drift` (1.5–2×, ease-out in); VHS has no `events.jsonl`, so there is no click autozoom.
Holds are still: no breathing, no back-half push. Transitions: `blur-crossfade 0.25s` is the primary (8 of 12 cuts,
67 %); one accent (`zoom-through 0.3s` into the spec section, Frame 9); three hard cuts where the footage runs
continuously (Frames 6, 7, 8) so the recording reads as one take.

Look treatment: none.

### Rhythm and held frames

Cuts sit on the bed's beat grid (120.19 BPM, beat 0.499 s; every frame is a whole number of beats: 5, 4, 7, 5, 7, 10,
6, 8, 8, 8, 8, 7, 7). Declared holds with a drift: Frame 6 tail (the STAR punch-in) and Frame 8 tail (the JSON
punch-in). The end card is the final still. The one bed dropout sits on the STAR reveal (Frame 6).

### Negative list

No hand-set terminal that imitates the recording (the recording is the terminal); no numbers lifted from the
recorded JSON (`rows`, `duration_ms`, `worker` are fixture sample output of `bin/acmejobs`, visible only inside the
footage, never in copy); no latency (the declared "40 ms" is unverified); no invented URL, domain or install
command; no logo before 3 s; no stock, no cursor, no fake dashboard; no slideshow (front-load then freeze) and no
screensaver (everything floating).

## Frame 1 — Dear dashboard

- src: compositions/frames/01-hook.html
- duration: 2.5s
- transition_in: cut
- scene: A letter opens on cream paper — "Dear dashboard, three commands replace you."
- beat: hook
- role: hook
- blueprint: typewriter-reveal (Adapt)
- focal: the salutation "Dear dashboard,"
- roles: salutation = focal · promise line = supporting · kicker + rule = chrome
- sfx: none
- asset_candidates:
- asset_note: typographic hook, no asset (vendor story-design rule 6) — the letter opens before any product is shown
- text: "✱ RE: YOUR JOBS" @ 0.0-2.5
- text: "Dear dashboard," @ 0.15-2.5
- text: "three commands replace you." @ 0.6-2.5
- handoff_out: kicker "✱ RE: YOUR JOBS" — box x 0.12, y 0.12, w 0.40, h 0.045 · scale 1 · opacity 1 · motion none (static) at the cut; section-rule — box x 0.12, y 0.19, w 0.76, h 1px · scale 1 · opacity 1 · motion none

Adapt: keep the typewriter signature (a line typed live, in the writer's own words); change — no backspace-and-retype,
the second line lands as a clean word-by-word reveal so the promise reads inside 2.5 s.
Scene 1 (0.0–0.15s): cream paper already on screen with the kicker and the hairline rule (no black open).
Scene 2 (0.15–0.6s): "Dear dashboard," types on in EB Garamond italic display at the letter column's first line.
Scene 3 (0.6–1.3s): "three commands replace you." reveals word by word beneath it, EB Garamond display, ink.
Scene 4 (1.3–2.5s): held read, still.

## Frame 2 — File in, finished job out

- src: compositions/frames/02-outcome.html
- duration: 2.028s
- transition_in: blur-crossfade 0.25s
- scene: The letter's first line of substance — a file goes in, a finished job comes out
- beat: benefit_highlight
- role: outcome
- blueprint: kinetic-type-beats (Adapt)
- focal: "A finished job out."
- roles: outcome lines = focal · kicker + rule = chrome
- sfx: none
- asset_candidates:
- asset_note: typographic outcome card, no asset — it states the outcome the next six frames prove on the real terminal
- text: "✱ RE: YOUR JOBS" @ 0.0-2.0
- text: "A file in." @ 0.1-2.0
- text: "A finished job out." @ 0.6-2.0
- handoff_in: kicker "✱ RE: YOUR JOBS" — box x 0.12, y 0.12, w 0.40, h 0.045 · scale 1 · opacity 1 · motion none (static) at the cut; section-rule — box x 0.12, y 0.19, w 0.76, h 1px · scale 1 · opacity 1 · motion none

Adapt: keep kinetic-type's "each statement lands solo before the next"; change — two statements, the second is the
payoff, no swap.
Scene 1 (0.0–0.6s): "A file in." lands on the letter column's first line, EB Garamond display, ink.
Scene 2 (0.6–1.2s): "A finished job out." lands on the second line; the word "finished" is the heaviest beat.
Scene 3 (1.2–2.0s): held read.

## Frame 3 — Send the file

- src: compositions/frames/03-submit.html
- duration: 3.495s
- transition_in: blur-crossfade 0.25s
- scene: The real terminal — `acmejobs submit --file report.csv` types, Enter, `job_7f3k2 queued`
- beat: product_intro
- role: terminal
- scene_type: terminal/code
- evidence_tier: A
- capture_window: 0.0-2.9
- capture_hold: 0.6
- blueprint: device-surface-showcase (Adapt)
- focal: assets/footage.mp4
- roles: footage.mp4 = background (full-bleed, undimmed — it is the product) · letter line = supporting
- sfx: click @ 2.0
- asset_candidates: assets/footage.mp4 — VHS recording of the repo's demo.tape, tier A, this frame plays footage 0.0–2.9 s
- text: "✱ SUBMIT" @ 0.2-3.5
- text: "First, I send the file." @ 0.3-3.5

Adapt: keep the signature (the product introduced by doing its core loop once inside its real interface, stepwise,
cursorless); change — the interface is the recorded terminal, and the step is narrated by one letter line.
Scene 1 (0.0–1.7s): footage plays at 1×: `acmejobs submit --file report.csv` types at the top-left prompt. Kicker and
"First, I send the file." enter in the right-half annotation block (0.2 / 0.3 s).
Scene 2 (1.7–2.6s): Enter at 2.0 (click); `uploading report.csv … ok` prints.
Scene 3 (2.6–3.5s): `job_7f3k2 queued` prints at 2.6; a 1px coral hairline draws under the recorded
`job_7f3k2 queued` line at 2.7 (the frame's one coral moment — no added label: a 0.9 s label would miss the QA-10
reading floor); the footage holds its last picture from 2.9 (declared `capture_hold`).

## Frame 4 — You made me refresh a tab

- src: compositions/frames/04-refresh.html
- duration: 2.496s
- transition_in: blur-crossfade 0.25s
- scene: The agitate beat — one line of the letter, alone on the page
- beat: pain_point
- blueprint: kinetic-type-beats (Adapt)
- focal: "You made me refresh a tab."
- roles: pain line = focal · kicker + rule = chrome
- sfx: none
- asset_candidates:
- asset_note: typographic agitate beat (PAS, one beat ≤ 3 s), no asset — the pain is the old way, which has no footage
- text: "✱ RE: YOUR JOBS" @ 0.0-2.5
- text: "You made me refresh a tab." @ 0.2-2.5

Adapt: keep "the pain lands alone on a bare canvas, no product"; change — one statement instead of three (the
agitate beat is ≤ 3 s).
Scene 1 (0.0–0.2s): letter chrome only.
Scene 2 (0.2–1.0s): "You made me refresh a tab." reveals word by word, EB Garamond italic display, ink; "refresh"
lands last and heaviest.
Scene 3 (1.0–2.5s): held read, still.

## Frame 5 — Watch it run

- src: compositions/frames/05-watch.html
- duration: 3.506s
- transition_in: blur-crossfade 0.25s
- scene: The real terminal — `acmejobs watch --last` types, Enter, the job starts streaming status
- beat: feature_showcase
- role: terminal
- scene_type: terminal/code
- evidence_tier: A
- capture_window: 3.5-7.0
- blueprint: agent-progress-theater (Adapt)
- focal: assets/footage.mp4
- roles: footage.mp4 = background (full-bleed, undimmed) · letter line = supporting
- sfx: click @ 1.9
- asset_candidates: assets/footage.mp4 — VHS recording of the repo's demo.tape, tier A, this frame plays footage 3.5–7.0 s
- text: "✱ WATCH" @ 0.2-3.5
- text: "Then I watch it run." @ 0.3-3.5
- handoff_out: footage — box x 0, y 0, w 1, h 1 · scale 1 · opacity 1 · motion none (plays on at 1×, footage time 7.0 s at the cut); kicker "✱ WATCH" — box x 0.58, y 0.22, w 0.34, h 0.045 · scale 1 · opacity 1 · motion none (static)

Adapt: keep the signature (trigger → the machine visibly works); change — the working theater is the real status
stream, not drawn rows; the receipt lands in Frame 6.
Scene 1 (0.0–0.55s): footage at 1× (the prompt waits); kicker and "Then I watch it run." enter in the annotation block.
Scene 2 (0.55–1.9s): `acmejobs watch --last` types at the prompt.
Scene 3 (1.9–2.9s): Enter (click); `watching job_7f3k2` and `status: queued` print.
Scene 4 (2.9–3.5s): `status: running` prints; the footage plays on through the cut (hard continuity into Frame 6).

## Frame 6 — Done (STAR)

- src: compositions/frames/06-done.html
- duration: 4.992s
- transition_in: cut
- scene: STAR — the bed drops out, `status: done` prints, "done." lands, the camera punches into the line
- beat: feature_showcase
- role: terminal
- scene_type: terminal/code
- evidence_tier: A
- capture_window: 7.0-9.5
- capture_hold: 2.5
- capture_drift: 0.28,0.28 1.8 @ 2.8-4.4
- dropout: 0.4 @ 1.5
- poster: 2.2
- blueprint: compose
- focal: the recorded line `status: done`
- roles: footage.mp4 = background (full-bleed, undimmed, then punched in) · "done." = focal overlay until 2.8 s
- sfx: success @ 1.5
- asset_candidates: assets/footage.mp4 — VHS recording of the repo's demo.tape, tier A, this frame plays footage 7.0–9.5 s
- text: "✱ WATCH" @ 0.0-2.8
- text: "running" @ 0.1-1.4
- text: "done." @ 1.5-2.8
- handoff_in: footage — box x 0, y 0, w 1, h 1 · scale 1 · opacity 1 · motion none (plays on at 1×, footage time 7.0 s at the cut); kicker "✱ WATCH" — box x 0.58, y 0.22, w 0.34, h 0.045 · scale 1 · opacity 1 · motion none (static)
- handoff_out: footage — box x 0, y 0, w 1, h 1 · scale 1.8 with focus 0.28,0.28 of the footage (the stage shows footage x 0–0.556, y 0–0.556) · opacity 1 · motion none (drift settled at 4.4 s, still at the cut); no text on screen at the cut

Compose (the one STAR moment, planned first): the whole video builds to the status word flipping.
Scene 1 (0.0–1.1s): footage at 1× shows `status: running`; the mono label "running" sits under the kicker in the
annotation block, cream@72%.
Scene 2 (1.1–1.5s): the bed falls silent (declared dropout 0.4 s, returns at 1.5 s) — the screen does not move.
Scene 3 (1.5–2.8s): `status: done` prints at 1.5 (footage 8.5 s) with the success cue; in the same instant "running"
is replaced in place by "done." in EB Garamond italic display-cover, cream — the biggest type in the video; a 1px
coral hairline draws under the recorded `status: done` line (the one coral moment). Poster at 2.2 s.
Scene 4 (2.5–2.8s): the footage holds its last picture (declared `capture_hold` from 2.5 s); the annotation exits
ease-in by 2.8 s.
Scene 5 (2.8–4.4s): the camera drifts in to 1.8× on the status lines (declared `capture_drift`, ease-out) — the
terminal text now reads at ~50 px; `status: done` sits in the upper half of the stage.
Scene 6 (4.4–5.0s): held still on the punched-in `status: done`.

## Frame 7 — Read the result

- src: compositions/frames/07-result.html
- duration: 2.996s
- transition_in: cut
- scene: Snap back to the full terminal — `acmejobs result --last --json | head -n 12` types, Enter
- beat: feature_showcase
- role: terminal
- scene_type: terminal/code
- evidence_tier: A
- capture_window: 9.5-12.5
- blueprint: compose
- focal: the typed `result` command
- roles: footage.mp4 = background (full-bleed, undimmed) · letter line = supporting
- sfx: click @ 2.9
- asset_candidates: assets/footage.mp4 — VHS recording of the repo's demo.tape, tier A, this frame plays footage 9.5–12.5 s
- text: "✱ RESULT" @ 0.2-3.0
- text: "And I read the result." @ 0.3-3.0
- handoff_in: footage — box x 0, y 0, w 1, h 1 · scale 1 (a deliberate on-beat snap back from Frame 6's 1.8×) · opacity 1 · motion none (plays at 1× from footage 9.5 s)
- handoff_out: footage — box x 0, y 0, w 1, h 1 · scale 1 · opacity 1 · motion none (plays on at 1×, footage time 12.5 s at the cut); kicker "✱ RESULT" — box x 0.58, y 0.22, w 0.34, h 0.045 · scale 1 · opacity 1 · motion none (static)

Compose: the third command, told plainly.
Scene 1 (0.0–0.5s): hard cut back to the full 1× terminal (all lines through `status: done` visible); kicker and
"And I read the result." enter in the annotation block.
Scene 2 (0.5–2.6s): `acmejobs result --last --json | head -n 12` types at the prompt (footage 10.0–12.1 s).
Scene 3 (2.6–3.0s): Enter at 2.9 (click); the footage plays on through the cut into Frame 8.

## Frame 8 — The finished job, as JSON

- src: compositions/frames/08-json.html
- duration: 4.005s
- transition_in: cut
- scene: The JSON result prints; the camera settles on the finished-job block
- beat: feature_showcase
- role: terminal
- scene_type: terminal/code
- evidence_tier: A
- capture_window: 12.5-13.7
- capture_hold: 2.8
- capture_drift: 0.30,0.36 1.7 @ 1.6-3.4
- blueprint: camera-journey (Adapt)
- focal: the recorded JSON block (`"id"`, `"status": "done"`)
- roles: footage.mp4 = background (full-bleed, undimmed, then punched in) · letter line = supporting until 1.6 s
- sfx: none
- asset_candidates: assets/footage.mp4 — VHS recording of the repo's demo.tape, tier A, this frame plays footage 12.5–13.7 s
- text: "✱ RESULT" @ 0.0-1.6
- text: "The finished job, as JSON." @ 0.2-1.6
- handoff_in: footage — box x 0, y 0, w 1, h 1 · scale 1 · opacity 1 · motion none (plays on at 1×, footage time 12.5 s at the cut); kicker "✱ RESULT" — box x 0.58, y 0.22, w 0.34, h 0.045 · scale 1 · opacity 1 · motion none (static)

Adapt: keep the signature (the camera explores the artifact while it acts by itself, no hands); change — one slow
push over a single JSON block instead of a flight over a canvas. The recorded values stay inside the footage and are
never echoed in copy (fixture sample output).
Scene 1 (0.0–0.2s): the JSON block prints (footage 12.5 s) on the cut.
Scene 2 (0.2–1.35s): "The finished job, as JSON." enters in the annotation block; footage at 1×.
Scene 3 (1.2–1.6s): the footage holds its last picture (declared `capture_hold`); kicker and line exit ease-in by 1.6 s.
Scene 4 (1.6–3.4s): the camera drifts to 1.7× on the JSON block (declared `capture_drift`, ease-out) — the stage
frames the braces top to bottom; `"status": "done"` sits in the upper third.
Scene 5 (3.4–4.0s): held still.

## Frame 9 — Or send it over HTTP

- src: compositions/frames/09-post-jobs.html
- duration: 4.005s
- transition_in: zoom-through 0.3s
- scene: A spec card — POST /jobs with a file, the answer 202 Accepted, a queued job id
- beat: feature_showcase
- role: api
- scene_type: api-card
- evidence_tier: B
- blueprint: compose
- focal: the status pill "202 Accepted"
- roles: spec card = focal · heading = supporting · kicker = label
- sfx: pop @ 1.4
- asset_candidates:
- asset_note: built from the repo's openapi.yaml (POST /jobs lines 14–26, JobRequest.file line 56, Job.id example line 65, status enum line 68) — tier B "from the spec", no asset file, no host, no latency
- text: "✱ FROM THE SPEC" @ 0.0-4.0
- text: "Or send it over HTTP." @ 0.2-4.0
- text: "POST /jobs" @ 0.6-4.0
- text: "202 Accepted" @ 1.4-4.0
- handoff_out: kicker "✱ FROM THE SPEC" — box x 0.12, y 0.12, w 0.40, h 0.045 · scale 1 · opacity 1 · motion none (static); spec card — box x 0.12, y 0.36, w 0.76, h 0.42 · scale 1 · opacity 1 · motion none (static)

Compose (section turn — the zoom-through marks it): the same job, told by the API's own description.
Scene 1 (0.0–0.2s): cream ground, the kicker (the "from the spec" label) and the empty navy card are in place.
Scene 2 (0.2–0.6s): heading "Or send it over HTTP." reveals word by word above the card.
Scene 3 (0.6–1.3s): the request column types `POST /jobs` then the body `{ "file": "report.csv" }` in mono.
Scene 4 (1.4–2.4s): the response column answers — status pill "202 Accepted" lands (pop; the pill is the frame's one
coral moment), then `{ "id": "job_7f3k2", "status": "queued" }` types beneath it.
Scene 5 (2.4–4.0s): held read.

## Frame 10 — Then ask how it went

- src: compositions/frames/10-get-job.html
- duration: 4.006s
- transition_in: blur-crossfade 0.25s
- scene: The same spec card — GET /jobs/{jobId}, the answer 200, the job now done
- beat: feature_showcase
- role: api
- scene_type: api-card
- evidence_tier: B
- blueprint: compose
- focal: the status pill "200"
- roles: spec card = focal · heading = supporting · kicker = label
- sfx: none
- asset_candidates:
- asset_note: built from the repo's openapi.yaml (GET /jobs/{jobId} lines 31–43, Job.id example line 65, status enum line 68) — tier B "from the spec", no asset file, no host, no latency
- text: "✱ FROM THE SPEC" @ 0.0-4.0
- text: "Then ask how it went." @ 0.2-4.0
- text: "GET /jobs/{jobId}" @ 0.6-4.0
- text: "200" @ 1.4-4.0
- handoff_in: kicker "✱ FROM THE SPEC" — box x 0.12, y 0.12, w 0.40, h 0.045 · scale 1 · opacity 1 · motion none (static); spec card — box x 0.12, y 0.36, w 0.76, h 0.42 · scale 1 · opacity 1 · motion none (static)

Compose: the mirror of Frame 9 — queued there, done here.
Scene 1 (0.0–0.2s): kicker and card in place (the card's old contents are gone; the card surface is unchanged).
Scene 2 (0.2–0.6s): heading "Then ask how it went." reveals word by word.
Scene 3 (0.6–1.3s): the request column types `GET /jobs/{jobId}` and, beneath it, `jobId: job_7f3k2`.
Scene 4 (1.4–2.4s): the status pill "200" lands (pop; coral, the one voltage) with the spec's own description
"The job" beside it in Inter; `{ "id": "job_7f3k2", "status": "done" }` types beneath.
Scene 5 (2.4–4.0s): held read.

## Frame 11 — Submit. Watch. Read.

- src: compositions/frames/11-recap.html
- duration: 3.994s
- transition_in: blur-crossfade 0.25s
- scene: The letter's recap — three verbs stack, then "No dashboard in between."
- beat: benefit_highlight
- blueprint: grid-card-assemble (Adapt)
- focal: "No dashboard in between."
- roles: three verbs = supporting (accumulating list) · closing line = focal · kicker + rule = chrome
- sfx: none
- asset_candidates:
- asset_note: typographic recap, no asset — the three verbs are the README's own line (docs/README.md:23)
- text: "✱ RE: YOUR JOBS" @ 0.0-4.0
- text: "Submit." @ 0.3-4.0
- text: "Watch." @ 0.8-4.0
- text: "Read." @ 1.3-4.0
- text: "No dashboard in between." @ 1.8-4.0
- handoff_out: kicker "✱ RE: YOUR JOBS" — box x 0.12, y 0.12, w 0.40, h 0.045 · scale 1 · opacity 1 · motion none (static) at the cut; section-rule — box x 0.12, y 0.19, w 0.76, h 1px · scale 1 · opacity 1 · motion none

Adapt: keep the signature (short value phrases populate a vertical list, co-resident and accumulating, each popping
into its slot); change — three items on the beat, then one closing line instead of more items.
Scene 1 (0.3–1.8s): "Submit." / "Watch." / "Read." pop into three stacked slots in the letter column, one per bar
beat, EB Garamond display, ink.
Scene 2 (1.8–2.3s): "No dashboard in between." reveals beneath them in EB Garamond italic headline; a 1px coral
rule draws on between the list and the line (the one coral moment).
Scene 3 (2.8–4.0s): held read.

## Frame 12 — Yours, from the terminal

- src: compositions/frames/12-sign-off.html
- duration: 3.494s
- transition_in: blur-crossfade 0.25s
- scene: The letter signs off — "Yours, from the terminal."
- beat: benefit_highlight
- blueprint: compose
- focal: "from the terminal."
- roles: sign-off = focal · kicker + rule = chrome
- sfx: none
- asset_candidates:
- asset_note: typographic sign-off that closes the letter device, no asset
- text: "✱ RE: YOUR JOBS" @ 0.0-3.5
- text: "Yours," @ 0.3-3.5
- text: "from the terminal." @ 0.55-3.5
- handoff_in: kicker "✱ RE: YOUR JOBS" — box x 0.12, y 0.12, w 0.40, h 0.045 · scale 1 · opacity 1 · motion none (static) at the cut; section-rule — box x 0.12, y 0.19, w 0.76, h 1px · scale 1 · opacity 1 · motion none

Compose: the letter's close, calm after the recap's pops.
Scene 1 (0.3–0.8s): "Yours," types on in EB Garamond italic display, lower-left of the letter column like a
signature line.
Scene 2 (0.8–1.6s): "from the terminal." reveals word by word beneath it; a 1px coral underline draws on under
"terminal" (the one coral moment).
Scene 3 (1.6–3.5s): held read, still.

## Frame 13 — End card

- src: compositions/frames/13-end-card.html
- duration: 3.483s
- transition_in: blur-crossfade 0.25s
- scene: Wordmark, the runner-up promise, the command that starts it all, one first-person CTA
- beat: cta
- role: cta
- scene_type: logo-outro
- blueprint: prompt-type-submit-generate (Adapt)
- focal: the CTA "Submit my first job"
- roles: wordmark = logo · tagline = supporting · command line = URL slot · CTA = focal
- sfx: none
- asset_candidates:
- asset_note: typographic end card — no brand kit and no logo file exist (the wordmark is set in EB Garamond), and no URL exists, so the URL slot carries the README's own first command
- text: "Acme Jobs" @ 0.0-3.5
- text: "Three commands, no dashboard: / file in, JSON out." @ 0.4-3.5
- text: "acmejobs submit --file report.csv" @ 0.8-3.5
- cta: "Submit my first job" @ 0.8-3.5
- order: logo -> tagline -> URL
- stagger: 0.4s

Adapt: keep the signature (the closing invitation IS the typed command; the card holds with only the caret
blinking); change — the command sits in the URL slot under a coral CTA callout, because no public URL or package
exists (TODO(URL) — the README's `npm install -g acmejobs` is marked a placeholder and is never shown).
Scene 1 (0.0–0.4s): wordmark "Acme Jobs" (EB Garamond display, ink, centred) settles in (first logo of the video, at
41.5 s).
Scene 2 (0.4–0.8s): tagline "Three commands, no dashboard: / file in, JSON out." fades up beneath, two lines,
EB Garamond italic headline.
Scene 3 (0.8–1.4s): the CTA callout "Submit my first job" (coral, cream Inter button text — the one voltage) lands;
beneath it `acmejobs submit --file report.csv` types on in JetBrains Mono, ink, with a blinking caret.
Scene 4 (1.4–3.5s): held; only the caret blinks. The bed fades out under the last second.

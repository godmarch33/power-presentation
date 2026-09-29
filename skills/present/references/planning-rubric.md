# Planning rubric — nine questions and the essence test before the pitch round

Phase: MVP. Ported from brag v0.2.2 `references/step-1-inspect.md` (MIT, © 2026 Shunit Haviv Hakimi —
`THIRD_PARTY_NOTICES.md`; harvest the 9-question rubric with attribution,
Q2 → "most credible / valuable claim"). The rubric is the gate between Inspect and the pitch
round: the story director answers all nine from the artefacts on disk before it writes a single
concept, and the orchestrator copies the answers into `BRIEF.md` `## Notes` under "Planning rubric" so the
frame workers and the critics read the same premises. An answer without evidence is written as `TODO` with
what is missing ("show the gaps"), never invented.

Inputs: `intake.json`, `product-profile.json` (`surface`, `scenes`, `mode`), `story-extraction.yaml`
(`product` — definition, category, app URL, feature list, the page's own product films and steps — `hero_feature`,
`promise.stated`, `cta`, `user_flow`, `proof.*` with sources), `claims-index.json`,
the capture manifest (`evidence tier`, `autozoom.json` segments, `screens.jsonl`) and `prospect.json` / `--metrics`
for the mode flags.

## Source precedence — the product first, the landing last (owner decision 2026-09-28)

What the product **is and does** — its definition, features, screens, flow and the numbers it produces — is read from
three sources, in this order:

1. **The working product.** What its own screens show when it runs: the recorded app (`.media/capture/` —
   `footage.mp4` and `screens.jsonl`: the title, navigation, headings, buttons and text of each flow step), a user
   recording (`--recording`), the product's own screenshots.
2. **The repository.** Its code and its own docs: the app's routes and screens (`source-plan.json`
   `options.apps`), the e2e tests (the flows the team asserts), README / docs usage, CHANGELOG, the package
   description.
3. **The landing.** The product's selling site. It owns the **message** — promise, hook, CTA, tone, brand
— and is a source of facts only where the product and the repository are silent.

A higher source wins a conflict: a capability the landing advertises that neither the product nor the repository
shows is a line of copy at most, never a product beat; a number only the landing states is the seller's claim
(`source_kind: hero-page`) and ranks below one the product demonstrates or the repository states. A landing-only run
(nothing runs, no repository product) uses the landing for facts too — and says so in the answers below.
For facts the order is product → repository → landing (the landing is the product's selling site); the message stays
landing-first.

| # | Question (brag wording → plugin wording) | Where the answer comes from | Rule it feeds |
|---|---|---|---|
| Q1 | **What is the product?** One sentence in the form *"<Name> is a <category> for <who>: you <do X> in it, it <gives Y> back"* — what it actually does, not what the headline promises. | by source precedence: what the running product calls itself and its parts (`screens.jsonl` titles and navigation) → the repository (`story-extraction.yaml` `product.definition` from the package description / README, the app's routes) → the landing (`product.definition` from its subhead / JSON-LD, `product.features`); `product-profile.json` `surface`. The H1 (`promise.stated`) is the promise — often a tagline — never the definition | BRIEF `message` (rewrite comes next); the essence test E1 |
| Q2 | **What is the most credible / valuable claim?** *(brag: "funniest or most impressive")* — the one sourced line that earns the reaction, by source precedence: an outcome the product demonstrates on screen (tier A/B, `claim_type: demonstrated`) → a number the repository states (`file:line`) → a number or verbatim quote the landing states (the seller's claim — say so). | `claims-index.json` (`status: verified` only; `claim_type`, `source_kind`), `proof.*` | STAR beat; hook copy; QA-12 |
| Q3 | **What is the visual hook?** The strongest real visual: a product state change, a captured screen, a terminal result, a chart from `--metrics`. | capture (`footage.mp4`, `autozoom.json` clusters), scene plan | first product frame (QA-04); C1 hook clarity |
| Q4 | **What must be shown from the actual product?** Which screens of the *product itself* (the app, the terminal, the endpoint) carry the core action and its result, and their evidence tier. The landing is not the product: its sections, its hero and its interactive demo widgets are marketing (a "try it" widget on a landing is a simulation the landing runs), never a product beat. | `product-profile.json` `scenes`, capture manifest tier; `product.app_url` (`differs_from_page: true` = the page is a landing); the product's own screenshots the page publishes | ≥ 1 real-product scene (checklist 3); C2 credibility; labels; the essence test E2/E3 |
| Q5 | **What is the shortest satisfying video?** The minimum length inside the QA-01 band for the destination that still lands the claim and the CTA. | `intake.json` `duration`, `references/length-bands.md` | QA-01; archetype by length |
| Q6 | **Which register and preset fit?** *(brag: "tone")* — audience register (marketing kinetic / sales direct / investors restrained) and the `frame.md` preset; a user-declared `--preset` or brand kit wins. | `intake.json` (`--preset`, `--brand`, mode), `references/audiences/*.md` | `register`, `style_preset` in BRIEF; QA-11 `back.out` rule; C5 brand |
| Q7 | **What should the audio feel like?** Role of the bed (warm / sparse / cinematic support / intentional silence), VO on or off per mode, where the beat locks land; investors: quiet bed under speech. | mode defaults, the fetched media-pack tracks the orchestrator passes (`media-packs.mjs list`), `assets/cue-presets`, `references/loudness.md` | beat lock; QA-08 target; restraint |
| Q8 | **What does the share caption say?** One sentence, the promise first, every number sourced — the seed of `share-copy.txt` `[caption]`. | Q1 + Q2 | `references/share-copy.md`; stop-list |
| Q9 | **What is the user flow worth showing?** The beats of *using* the product: entry → the core action → the result → what it changes — not the landing page's section list. A product with several primary modes (a design tool's canvas and handoff, an accounting app's reconciliation and close, a CLI's `init` and `deploy`) shows as many as the length holds. Each step names the product screen that shows it. Products without UI: the equivalent chain (command → output → effect; request → response → status). | by source precedence: the recorded flow of the running product (`.media/flow.json` + `screens.jsonl`, VHS tape, a live API call) → the repository (`story-extraction.yaml` `user_flow` from e2e tests or the README example, `openapi.yaml`, the app's routes) → the landing (`user_flow.steps` from its numbered steps or a product film, `product.steps`, `product.videos[].parts`) | centrepiece scenes (brag's rule kept: the middle shows the flow, not a diagram of it); non-UI scenes; the essence test E2–E4 |

## The essence test (after the nine, before any concept)

A viewer who watches the product frames with the sound off must be able to answer four questions. Write each answer
from Q1 / Q4 / Q9, naming the product screen that carries it:

| # | The viewer can say | Carried by |
|---|---|---|
| E1 | **What it is and who it is for** | the definition (Q1) — a card, a kicker or the first product screen |
| E2 | **What I do in it** — the core action, on the product's own screen | Q9 steps on Q4 screens |
| E3 | **What it gives me back** — the product's own output of that action (the diagnosis, the report, the result) | Q4 screens |
| E4 | **What changes for me** — the outcome the product is for: a result, time or money saved, progress over time | Q9's last steps; a sourced number (Q2) |

The pitch round is filtered by it: every concept must carry E2 and E3 on product screens; a device (one button, one
number, one metaphor) lives *inside* that spine and never replaces it (a brief about one feature — a feature launch, a
teaser ≤ 30 s — may keep the spine to that feature), and the recommendation goes to the concept that answers E1–E4
best, freshness second. The test says *what* a viewer must be able to tell, never *how* the film is built: order,
beats, pacing and look come from this product and this brief, not from any reference video. The storyboard is checked by it again (story director checklist; each frame declares the items it answers as
`- essence: E2, E3`, and `wowprobe.py` warns `essence-gap` when one is missing): a product
frame that answers none of E1–E4 is decoration, and a type-only card is there for the hook, the promise, the CTA, a
sourced number or the archetype's own card beats, not to state what a product screen could show. A product film on the product's own page
(`product.videos`) is one more source of how the owner explains the product, next to its steps and feature list —
read its `parts` as evidence of what matters, not as a structure to copy (the film itself is never this run's
footage).

Gate: all nine have an answer or an explicit `TODO(<what is missing>)`. Two or more `TODO`s among Q2, Q4
and Q9 mean the material is too thin for the pitch round — the orchestrator asks for a source or a
capture before dispatching it (slot permitting; otherwise `--yes` proceeds with tier C and the
`reconstructed` label).

## Output block (copied verbatim into `BRIEF.md` `## Notes`)

```markdown
### Planning rubric (skills/present/references/planning-rubric.md)
- Q1 product: <one sentence> — source: <file:line | URL>
- Q2 most credible claim: "<value>" — claim <id>, source <file:line | URL> (tier <A|B|C>)
- Q3 visual hook: <what> — <capture segment | scene>
- Q4 show from the product: <screen / command / endpoint> — tier <A|B|C>
- Q5 shortest satisfying length: <n> s — band <destination> (QA-01)
- Q6 register / preset: <register> / <preset> — <declared | derived: reason>
- Q7 audio: <role>; VO <on|off> (<mode default | --voice>); bed <track | none>; target <n> LUFS
- Q8 share caption: "<one sentence>"
- Q9 user flow: <entry> → <key action (per primary mode the length holds)> → <result> → <what it changes> — source: <file:line | flow.json | page steps>
- Essence: E1 <what it is, for whom> · E2 <what I do in it — screen> · E3 <what it gives back — screen> · E4 <what changes> — tier <A|B|C> per screen
```

## What brag's rubric had that is dropped here

Q2 "funniest" and the comedic tone presets (the plugin's registers are marketing / sales / investors
no parody, no `chaotic`); "would 15 seconds work?" (the plugin's bands start at 10 s and the working zone is
45–90 s, QA-01); colour / font extraction from CSS (HyperFrames `capture` and `frame.md` presets own the
design tokens).

The essence test E1–E4 turns three goals into checks: at least one scene with the product's real UI and zero abstract
filler, the real product as the hero, every beat a visible state change (added after a run showed the product's landing
and slogans instead of the product).
